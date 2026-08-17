window.__ModuleLoader__.load({
  id: "dsh-archives",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

    var STYLE_ID = "dsh-archives/style.css";

    function injectCss() {
      if (typeof document === "undefined") return;
      if (document.getElementById(STYLE_ID)) return;
      var tag = document.createElement("style");
      tag.id = STYLE_ID;
      tag.textContent = [
        ".dsh-archives-page{box-sizing:border-box;padding:6px 2px;max-width:760px;color-scheme:light dark}",
        ".dsh-archives-page h2{margin:0 0 6px;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}",
        ".dsh-archives-page .da-hint{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary,inherit);margin:0 0 16px}",
        ".dsh-archives-error{border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-alias-interactive-bg-hover-danger,rgba(216,97,97,.14));color:var(--dsw-alias-state-error-primary,#d86161);border-radius:8px;padding:7px 10px;font-size:13px;margin-bottom:12px}",
        ".da-item{border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-alias-surface-2,rgba(127,127,127,.04));border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;flex-direction:column;gap:6px}",
        ".da-item .da-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);word-break:break-word}",
        ".da-item .da-meta{font-size:11px;color:var(--dsw-alias-label-tertiary,inherit);display:flex;flex-wrap:wrap;gap:4px 12px}",
        ".da-item .da-id{font-family:ui-monospace,Consolas,monospace;opacity:.75}",
        ".da-item .da-actions{display:flex;gap:8px;margin-top:2px}",
        ".da-btn{border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-alias-surface-2,rgba(127,127,127,.08));color:var(--dsw-alias-label-primary,inherit);border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer;font-family:inherit}",
        ".da-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}",
        ".da-btn.primary{background:var(--dsw-alias-brand-primary,#4b6bff);border-color:transparent;color:#fff;font-weight:500}",
        ".da-btn.primary:hover:not(:disabled){opacity:.9}",
        ".da-btn.restore{background:transparent;border-color:var(--dsw-alias-brand-primary,#4b6bff);color:var(--dsw-alias-brand-primary,#4b6bff)}",
        ".da-btn.restore:hover:not(:disabled){background:var(--dsw-alias-brand-soft,rgba(75,107,255,.12))}",
        ".da-btn.danger{background:transparent;border-color:var(--dsw-alias-state-error-primary,#d86161);color:var(--dsw-alias-state-error-primary,#d86161)}",
        ".da-btn.danger.confirm{background:var(--dsw-alias-state-error-primary,#d86161);border-color:transparent;color:#fff;font-weight:500}",
        ".da-btn:disabled{opacity:.5;cursor:default}",
        ".da-empty{font-size:13px;color:var(--dsw-alias-label-tertiary,inherit);padding:10px 0}",
        ".da-filter{display:flex;align-items:center;gap:8px;margin-bottom:14px}",
        ".da-filter-label{font-size:13px;color:var(--dsw-alias-label-secondary,inherit)}",
        ".da-select{appearance:none;-webkit-appearance:none;max-width:100%;border:1px solid var(--dsw-alias-border-l2-darkmode-thin,rgba(127,127,127,.22));background:var(--dsw-specific-input-major,var(--dsw-alias-surface-2,rgba(127,127,127,.08)));color:var(--dsw-alias-label-primary,inherit);border-radius:8px;padding:6px 28px 6px 10px;font-size:13px;font-family:inherit;cursor:pointer;outline:none;background-image:linear-gradient(45deg,transparent 50%,var(--dsw-alias-label-tertiary,#999) 50%),linear-gradient(135deg,var(--dsw-alias-label-tertiary,#999) 50%,transparent 50%);background-position:calc(100% - 15px) 55%,calc(100% - 10px) 55%;background-size:5px 5px;background-repeat:no-repeat}",
        ".da-select:focus{border-color:var(--dsw-alias-brand-primary,#4b6bff)}"
      ].join("\n");
      document.head.appendChild(tag);
    }

    function api(path, body) {
      return fetch(path, body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : { method: "POST" }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
          return data;
        });
      });
    }

    function formatTime(ts) {
      if (!ts) return "";
      try { return new Date(ts).toLocaleString(); } catch (e) { return ""; }
    }

    function ArchivesPage() {
      var itemsState = React.useState(null); // null = loading
      var items = itemsState[0], setItems = itemsState[1];
      var errState = React.useState("");
      var err = errState[0], setErr = errState[1];
      var busyState = React.useState(false);
      var busy = busyState[0], setBusy = busyState[1];
      var confirmIdState = React.useState(null); // delete second-step per row
      var confirmId = confirmIdState[0], setConfirmId = confirmIdState[1];
      var selectedWsState = React.useState(""); // "" = 全部工作区
      var selectedWs = selectedWsState[0], setSelectedWs = selectedWsState[1];

      function refresh() {
        api("/api/dsh-archives/list").then(function (data) {
          setItems(data.items || []);
        }).catch(function (e) { setErr(String(e.message || e)); setItems([]); });
      }
      React.useEffect(function () {
        var alive = true;
        api("/api/dsh-archives/list").then(function (data) {
          if (!alive) return;
          setItems(data.items || []);
        }).catch(function (e) { if (alive) { setErr(String(e.message || e)); setItems([]); } });
        return function () { alive = false; };
      }, []);

      function run(method, id) {
        if (busy) return;
        setBusy(true);
        setErr("");
        api(method, { id: id }).then(function () {
          setConfirmId(null);
          refresh();
        }).catch(function (e) { setErr(String(e.message || e)); })
          .then(function () { setBusy(false); });
      }

      var rows = null;
      if (items === null) {
        rows = React.createElement("div", { className: "da-empty" }, "加载中…");
      } else if (items.length === 0) {
        rows = React.createElement("div", { className: "da-empty" }, "暂无归档会话。在会话列表行菜单里选择「归档会话」后，会话会隐藏并出现在这里。");
      } else {
        var filtered = selectedWs === ""
          ? items
          : items.filter(function (item) {
              var key = item.workspace ? (item.workspace.title || item.workspace.path || "未分组") : "未分组";
              return key === selectedWs;
            });
        if (filtered.length === 0) {
          rows = React.createElement("div", { className: "da-empty" }, "该工作区暂无归档会话。");
        } else {
          rows = filtered.map(function (item) {
            var confirming = confirmId === item.id;
            return React.createElement("div", { key: item.id, className: "da-item" },
              React.createElement("div", { className: "da-title" },
                item.title || "(无标题)"),
              React.createElement("div", { className: "da-meta" },
                item.createdAt ? React.createElement("span", null, "创建于 ", formatTime(item.createdAt)) : null,
                React.createElement("span", { className: "da-id" }, item.id)),
              React.createElement("div", { className: "da-actions" },
                React.createElement("button", { className: "da-btn restore", disabled: busy, onClick: function () { run("/api/dsh-archives/restore", item.id); } },
                  "恢复"),
                React.createElement("button", {
                  className: "da-btn danger" + (confirming ? " confirm" : ""),
                  disabled: busy,
                  onClick: function () {
                    if (confirming) { run("/api/dsh-archives/delete", item.id); }
                    else { setConfirmId(item.id); }
                  }
                }, confirming ? "确认彻底删除？" : "删除")));
          });
        }
      }

      // Workspace options for the filter dropdown (derived from items).
      var wsOptions = [];
      if (items !== null) {
        var wsSeen = {};
        items.forEach(function (item) {
          var ws = item.workspace;
          var key = ws ? (ws.title || ws.path || "未分组") : "未分组";
          if (wsSeen[key]) return;
          wsSeen[key] = true;
          wsOptions.push({ key: key, title: ws ? (ws.title || "未分组") : "未分组", path: ws ? ws.path : "" });
        });
      }

      return React.createElement("div", { className: "dsh-archives-page" },
        React.createElement("h2", null, "归档管理"),
        React.createElement("p", { className: "da-hint" },
          "归档的会话只是从侧边栏隐藏，数据仍在磁盘上。「恢复」把它放回侧边栏；「删除」会连同磁盘上的会话日志彻底删除，无法找回。"),
        err ? React.createElement("div", { className: "dsh-archives-error" }, err) : null,
        React.createElement("div", { className: "da-filter" },
          React.createElement("label", { className: "da-filter-label" }, "工作区"),
          React.createElement("select", {
            className: "da-select",
            value: selectedWs,
            onChange: function (e) { setSelectedWs(e.target.value); }
          },
            React.createElement("option", { value: "" }, "全部工作区（" + (items ? items.length : 0) + "）"),
            wsOptions.map(function (opt) {
              return React.createElement("option", { key: opt.key, value: opt.key },
                opt.title + (opt.path ? " · " + opt.path : ""));
            }))),
        rows);
    }

    exports.inject = ["slots"];
    exports.apply = function apply(ctx) {
      ctx.effect(function () {
        injectCss();
        return function () {
          var el = document.getElementById(STYLE_ID);
          if (el && el.parentNode) el.parentNode.removeChild(el);
        };
      });
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register(
          { name: "settings.section", id: "archives", order: 65, label: "归档管理" },
          ArchivesPage
        );
      });
    };
    return module.exports;
  }
});
