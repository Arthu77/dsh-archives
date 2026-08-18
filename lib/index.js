// dsh-archives — archived-session manager for DeepSeek Harness.
// Host half: list / restore / delete archived sessions.
//
// Design notes
// ------------
// The built-in row menu can only ARCHIVE a session (hide it in the
// registry-global `archivedSessionIds` set). This plugin adds the missing
// counterparts:
//
//   restore — remove the id from `archivedSessionIds`. The workspace domain's
//   global object is mutated IN PLACE (the same object reference the
//   workspace registry cached at startup), then `global.set()` durably writes
//   it, so the sidebar refreshes immediately through the host's
//   `archived-sessions-changed` broadcast. No restart needed.
//
//   delete — remove the session log directory from disk (each session owns
//   `<sessions root>/<project>/<id>/`), drop the id from every workspace
//   record's `sessionIds`, and rebuild the registry's in-memory caches. The
//   id is deliberately LEFT in `archivedSessionIds`: the client's session
//   list / workspace caches cannot be told the session vanished (the
//   `host/session-removed` frame only fires from a real in-process session
//   disposal, which an archived session never is), so keeping it archived
//   guarantees the sidebar keeps filtering it out everywhere. The stale id is
//   harmless (registry validation never checks it) and the list endpoint
//   filters it out; a restore of a ghost is refused.
import { rm } from 'node:fs/promises'
import { dirname } from 'node:path'

export const inject = ['webServer', 'workspaceRegistry']

export function apply(ctx, config) {
  const cfg = { ...(config || {}) }

  // ── workspace domain (already opened by the registry) ────────────────────
  function workspaceDomain() {
    const sd = ctx.get('storageDomain')
    if (!sd || typeof sd.get !== 'function') {
      throw new Error('storageDomain 服务不可用')
    }
    const domain = sd.get('workspace')
    if (!domain) {
      throw new Error('workspace 域尚未打开')
    }
    return domain
  }

  // ── ids that still exist on disk (null when persistence is unavailable) ──
  async function existingSessionIds() {
    const sp = ctx.get('sessionPersistence')
    if (!sp || typeof sp.list !== 'function') return null
    try {
      const headers = await sp.list()
      return new Set(headers.map((h) => h.id))
    } catch (err) {
      ctx.logger.warn(`[dsh-archives] sessionPersistence.list failed: ${err && err.message ? err.message : err}`)
      return null
    }
  }

  // ── list ─────────────────────────────────────────────────────────────────
  // Returns JSON-safe items: id, title, createdAt (ms), workspace title, cwd.
  // Ghost ids (archived but gone from disk) are filtered out.
  async function listArchived() {
    const reg = ctx.workspaceRegistry
    const ids = Array.from(reg.archivedSessionIds || [])
    if (!ids.length) return []

    let existing = null
    try { existing = await existingSessionIds() } catch { existing = null }
    let liveIds = ids
    if (existing !== null) {
      liveIds = ids.filter((id) => existing.has(id))
      if (!liveIds.length) return []
    }

    // Session display data (title + createdAt) via the session-query corpus.
    const sq = ctx.get('sessionQuery')
    const metaById = new Map()
    if (sq && typeof sq.readTitleSnapshots === 'function') {
      try {
        const results = await sq.readTitleSnapshots(liveIds)
        for (const result of results) {
          if (result.status !== 'fulfilled') continue
          const value = result.value
          metaById.set(result.sessionId, {
            title: value.title && value.title.title ? String(value.title.title) : '',
            createdAt: value.session && typeof value.session.createdAt === 'number'
              ? value.session.createdAt
              : 0,
            cwd: value.session && typeof value.session.cwd === 'string' ? value.session.cwd : '',
          })
        }
      } catch (err) {
        ctx.logger.warn(`[dsh-archives] readTitleSnapshots failed: ${err && err.message ? err.message : err}`)
      }
    }

    // Workspace ownership from the durable table records (unfiltered by the
    // header index, unlike entity.sessionIds).
    const domain = workspaceDomain()
    const table = domain.table('workspaces')
    const wsBySession = new Map()
    const wsInfoById = new Map()
    for (const [wsId, record] of table.entries()) {
      wsInfoById.set(wsId, { title: record.title, path: record.path })
      for (const sid of record.sessionIds || []) {
        if (!wsBySession.has(sid)) wsBySession.set(sid, wsId)
      }
    }

    return liveIds.map((id) => {
      const meta = metaById.get(id) || {}
      const wsId = wsBySession.get(id)
      const wsInfo = wsId !== undefined ? wsInfoById.get(wsId) : undefined
      return {
        id: String(id),
        title: meta.title || '',
        createdAt: meta.createdAt || 0,
        cwd: meta.cwd || '',
        workspace: wsInfo ? { title: wsInfo.title || '', path: wsInfo.path || '' } : null,
      }
    })
  }

  // ── restore (unarchive) ──────────────────────────────────────────────────
  async function restoreSession(id) {
    const existing = await existingSessionIds()
    if (existing !== null && !existing.has(id)) {
      throw new Error('该会话在磁盘上已不存在（可能已被删除），无法恢复')
    }
    const domain = workspaceDomain()
    const g = domain.global.get()
    if (!g || !Array.isArray(g.archivedSessionIds)) {
      throw new Error('workspace 域状态异常：缺少 archivedSessionIds')
    }
    if (!g.archivedSessionIds.includes(id)) {
      throw new Error('该会话不在归档列表中')
    }
    // Mutate the shared object in place, then persist: the registry's cached
    // `state` IS this object, so the sidebar refreshes via the broadcast.
    g.archivedSessionIds = g.archivedSessionIds.filter((x) => x !== id)
    await domain.global.set(g)
    return true
  }

  // ── delete (remove from disk + all references) ───────────────────────────
  async function deleteSession(id) {
    const sp = ctx.get('sessionPersistence')
    if (!sp || typeof sp.locate !== 'function') {
      throw new Error('sessionPersistence 服务不可用')
    }
    // Refuse only when the attached agent is actually RUNNING a turn. An
    // agent instance stays attached to every opened session (idle after its
    // work finishes), so instance presence — whether via the session store or
    // `agents.get(id)` — does not mean "in use"; only `status === 'running'`
    // means a driver is actively executing.
    const agentsSvc = ctx.get('agents')
    const agent = agentsSvc && typeof agentsSvc.get === 'function' ? agentsSvc.get(id) : undefined
    if (agent && agent.status === 'running') {
      throw new Error('该会话正在运行任务，请等待完成后再删除')
    }

    // Locate and remove the on-disk session directory.
    let meta
    try {
      const inspection = await sp.load(id)
      meta = inspection.meta
    } catch (err) {
      throw new Error(`会话不存在：${err && err.message ? err.message : err}`)
    }
    const location = sp.locate(meta)
    if (!location || !location.path) {
      throw new Error('无法定位会话的磁盘文件')
    }
    const sessionDir = dirname(location.path)
    await rm(sessionDir, { recursive: true, force: true })

    // Drop the id from every workspace record. archivedSessionIds keeps the
    // id (see design notes) so every client-side cache keeps filtering it.
    const domain = workspaceDomain()
    const table = domain.table('workspaces')
    const touched = []
    for (const [wsId, record] of table.entries()) {
      if (record.sessionIds && record.sessionIds.includes(id)) {
        await table.update(wsId, (cur) => ({
          ...cur,
          sessionIds: (cur.sessionIds || []).filter((x) => x !== id),
        }))
        touched.push(wsId)
      }
    }

    // Rebuild registry in-memory caches. Private-but-runtime-reachable;
    // failures are non-fatal (a restart converges everything from the
    // durable state).
    try {
      const reg = ctx.workspaceRegistry
      if (typeof reg.rebuildEntities === 'function') reg.rebuildEntities()
      if (typeof reg.replaceHeaderIndex === 'function') {
        const headers = await sp.list()
        await reg.replaceHeaderIndex(headers)
      }
    } catch (err) {
      ctx.logger.warn(`[dsh-archives] registry cache refresh failed: ${err && err.message ? err.message : err}`)
    }

    return { ok: true, touched }
  }

  // ── HTTP routes for the settings page ────────────────────────────────────
  async function readJsonBody(req) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const text = Buffer.concat(chunks).toString('utf8')
    try { return JSON.parse(text || '{}') } catch { return {} }
  }
  function writeJson(res, status, data) {
    const text = JSON.stringify(data)
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(text),
      'cache-control': 'no-store',
    })
    res.end(text)
  }

  const routes = [
    { kind: 'exact', path: '/api/dsh-archives/list', handler: async (req, res) => {
      try {
        const items = await listArchived()
        writeJson(res, 200, { items })
      } catch (err) {
        writeJson(res, 500, { error: String(err && err.message ? err.message : err) })
      }
    } },
    { kind: 'exact', path: '/api/dsh-archives/restore', handler: async (req, res) => {
      try {
        const body = await readJsonBody(req)
        const id = String(body.id || '')
        if (!id) return writeJson(res, 400, { error: 'id 不能为空' })
        await restoreSession(id)
        writeJson(res, 200, { ok: true })
      } catch (err) {
        writeJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    } },
    { kind: 'exact', path: '/api/dsh-archives/delete', handler: async (req, res) => {
      try {
        const body = await readJsonBody(req)
        const id = String(body.id || '')
        if (!id) return writeJson(res, 400, { error: 'id 不能为空' })
        await deleteSession(id)
        writeJson(res, 200, { ok: true })
      } catch (err) {
        writeJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    } },
  ]
  for (const route of routes) ctx.webServer.register(route)
}
