# dsh-archives

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![dsh-plugin](https://img.shields.io/badge/dsh-plugin-4b6bff.svg)](https://github.com/Arthu77/dsh-archives)

DeepSeek Harness 归档会话管理插件：在 **设置 → 归档管理** 里列出所有已归档会话，支持**恢复**（放回侧边栏）和**删除**（连同磁盘上的会话日志彻底删除）。

内置的会话行菜单只能「归档会话」（从列表隐藏，数据保留），本插件补上缺失的两个操作。

## 功能

- **列表**：显示每个归档会话的标题、所属工作区、创建时间和会话 id；支持按工作区下拉筛选。
- **恢复**：把会话从归档集合移除，立即回到侧边栏对应工作区（无需重启，走 harness 的 `archived-sessions-changed` 广播）。
- **删除**：删除磁盘上的会话日志目录（`<sessions root>/<project>/<id>/`），并同步清理 workspace 域里的 `sessionIds` 引用。删除需点击两次确认，删除后无法恢复。

## 安装

```sh
dsh plugin --profile web add github:Arthu77/dsh-archives
```

然后**重启 harness**（不是热更新）。插件自带 `dsh.bundle` 补丁，`dsh plugin add` 会自动把行加进组合，无需手工编辑 `cordis.patch.yml`。

## 实现要点

- Host 半（`lib/index.js`）注册 `/api/dsh-archives/{list,restore,delete}` 路由。
- 恢复直接修改 workspace 域全局对象（与 workspace registry 内存缓存为同一引用）后持久化，UI 即时刷新。
- 删除依赖 `sessionPersistence.locate()` 定位会话目录，删除后用 registry 的 `rebuildEntities()` / `replaceHeaderIndex()` 同步内存缓存；若这些私有方法不可用，重启后自会收敛。删除后的会话继续保留在归档集合里，确保客户端任何缓存都会被归档过滤隐藏，不会出现"未分类"幽灵行。

## License

MIT
