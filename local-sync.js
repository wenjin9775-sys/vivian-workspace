/* The disk is authoritative. A revision check prevents a second tab or chat update being overwritten. */
"use strict";
(function () {
  const PENDING_KEY = "vivian_local_pending_v1";
  let revision = 0, ready = false, pending = null, running = null, timer = null;
  let blocked = false, lastError = null, editing = false;
  const sync = window.localSync = { statusText: "正在读取本机记录", initialize, schedule, flush, uploadImage, getImage };

  function normalize(s) {
    const defaults = defaultState();
    return Object.assign(defaults, s || {}, {
      settings: Object.assign({}, defaults.settings, s?.settings || {}),
      life: Object.assign({ weight: [], diet: [], fitness: [] }, s?.life || {})
    });
  }
  function status(text, error) {
    sync.statusText = text; sync.statusError = !!error;
    document.querySelectorAll(".sb-sync, [data-save-status]").forEach(el => { el.textContent = text; el.dataset.error = String(!!error); });
    let notice = document.getElementById("sync-notice");
    if (!notice) {
      notice = document.createElement("div"); notice.id = "sync-notice"; notice.setAttribute("role", "alert");
      notice.style.cssText = "position:fixed;bottom:14px;left:12px;right:12px;z-index:10000;padding:14px 18px;background:#fff7ed;color:#7c2d12;border:1px solid #fdba74;border-radius:14px;font-size:13px;box-shadow:0 4px 20px #0002;display:none";
      document.body.appendChild(notice);
    }
    notice.replaceChildren(); notice.style.display = error ? "block" : "none";
    if (error) {
      const label = document.createElement("span"); label.textContent = text + " "; notice.append(label);
      const button = document.createElement("button"); button.className = "btn sm";
      button.textContent = blocked ? "下载此页草稿并读取新记录" : "重试保存";
      button.onclick = blocked ? resolveConflict : () => flush().catch(() => {});
      notice.append(button);
    }
  }
  async function request(url, options = {}) {
    const response = await fetch(url, { cache: "no-store", ...options });
    let result = {}; try { result = await response.json(); } catch (_) {}
    if (!response.ok) { const e = new Error(result.error || "保存失败"); e.status = response.status; throw e; }
    return result;
  }
  function cachePending() {
    try {
      if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify({ revision, state: pending }));
      else localStorage.removeItem(PENDING_KEY);
    } catch (_) { /* Disk saving continues even if the browser cache is full. */ }
  }
  function cacheState() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) {} }

  async function initialize() {
    const envelope = await request("/api/local/state");
    revision = envelope.revision;
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); } catch (_) {}
    if (envelope.state) state = normalize(envelope.state);
    if (draft?.state) {
      state = normalize(draft.state); pending = structuredClone(state);
      blocked = draft.revision !== revision;
      if (blocked) {
        revision = draft.revision; // Keep the draft's base revision across reloads.
        lastError = new Error("本机记录已更新，当前草稿尚未合并");
        status("发现未保存草稿；本机已有更新，请先保存草稿再读取新记录", true);
      }
    }
    ready = true;
    if (!blocked) status("记录已从本机读取");
    cacheState();
  }
  function schedule() {
    if (!ready) return;
    pending = structuredClone(state); cachePending();
    if (blocked) return;
    status("正在保存到本机…");
    clearTimeout(timer); timer = setTimeout(() => pump(), 120);
  }
  function pump() {
    if (running) return running;
    if (!pending || blocked || !ready) return Promise.resolve();
    running = (async () => {
      while (pending && !blocked) {
        const snapshot = pending;
        try {
          const result = await request("/api/local/state", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ revision, state: snapshot })
          });
          revision = result.revision; lastError = null;
          if (pending === snapshot) pending = null;
          cachePending();
          if (!pending) { editing = false; status("✓ 已保存到本机"); }
        } catch (error) {
          lastError = error; blocked = error.status === 409;
          status(blocked ? "另一处更新了记录；本页草稿已保留，请先合并" : "尚未保存到文件；请保持工作台服务运行后重试", true);
          break;
        }
      }
    })().finally(() => { running = null; });
    return running;
  }
  async function flush() {
    clearTimeout(timer);
    await pump();
    if (blocked || pending || lastError) throw lastError || new Error("记录尚未保存，请重试");
  }
  function downloadDraft() {
    const blob = new Blob([JSON.stringify({ revision, state: pending || state, kind: "unsaved-draft" }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "Vivian-待合并草稿-" + todayStr() + ".json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function resolveConflict() {
    downloadDraft();
    try {
      const latest = await request("/api/local/state");
      state = normalize(latest.state); revision = latest.revision;
      pending = null; blocked = false; lastError = null; editing = false;
      cachePending(); cacheState(); applyTheme(); renderHeader(); switchTab(currentRoute.tab, currentRoute.sub);
      status("✓ 已读取最新记录；草稿已下载，可交给助手合并");
    } catch (_) { status("无法读取新记录，请启动工作台后再试", true); }
  }
  async function poll() {
    if (!ready || pending || running || blocked || editing || document.hidden) return;
    if (document.getElementById("modal-root")?.childElementCount) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
    // Avoid replacing an open module or resetting its selected date.
    if (!["home", "daily", "me", "review", "organize"].includes(currentRoute?.tab)) return;
    try {
      const latest = await request("/api/local/state");
      if (!pending && !running && !editing && latest.revision > revision && latest.state) {
        state = normalize(latest.state); revision = latest.revision; cacheState();
        applyTheme(); renderHeader(); switchTab(currentRoute.tab, currentRoute.sub);
        status("✓ 新记录已同步到页面");
      }
    } catch (_) { /* Saved data remains visible; write failures are reported separately. */ }
  }
  async function uploadImage(id, data) {
    try {
      await request("/api/local/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, data }) });
    } catch (e) { toast("图片只保存在浏览器，文件保存失败，请重试上传"); }
  }
  async function getImage(id) {
    try { const r = await fetch("/api/local/image/" + encodeURIComponent(id)); return r.ok ? await r.text() : null; } catch (_) { return null; }
  }
  document.addEventListener("input", () => { editing = true; });
  document.addEventListener("click", e => { if (e.target.closest(".sb-item")) editing = false; });
  window.addEventListener("focus", poll);
  window.addEventListener("beforeunload", e => { if (pending) { e.preventDefault(); e.returnValue = ""; } });
  setInterval(poll, 5000);
})();
