/* =========================================================================
   MERGE —— 合并版新增功能（原版为体、新版为魂）
   包含：分组黑色侧边栏、待办四栏看板 + 书评影评编辑器、
   TOPIK 备考计划（5 页签）、护肤打卡（每日护肤 routine 打卡）、
   每日打卡页、首页挂件（完成度圆环 + 学习时长柱）。
   本文件只新增/覆盖，不修改 app.js / life.js / korean.js 原有函数。
   ========================================================================= */
"use strict";
/* ---------- 合并版自包含默认函数（原在 app.js 内联，现移入本文件，避免污染基础 app.js） ---------- */
function defaultTodoBoard() {
  const mk = (id, kind, title) => ({ id, kind, title, sortOrder: 0, items: [] });
  const cols = [
    mk("col-books", "book", "书籍"),
    mk("col-movies", "movie", "电影"),
    mk("col-korean", "korean", "韩语"),
    mk("col-custom", "custom", "自定义")
  ];
  cols.forEach((c, i) => (c.sortOrder = i));
  return { columns: cols };
}
function defaultTopikPlan() {
  const weeks = [];
  const phases = ["打地基", "打地基", "打地基", "专项突破", "专项突破", "专项突破", "专项突破", "模考冲刺", "模考冲刺", "模考冲刺", "保温收尾", "保温收尾"];
  const tasksByPhase = {
    "打地基": ["延世韩国语 2 册：精读 2 课", "TOPIK 初级词汇 100 个", "基础语法 10 条整理进笔记", "听力精听 3 篇（跟读）"],
    "专项突破": ["阅读真题 1 套（限时）", "听力真题 1 套（限时）", "写作小作文 1 篇", "错题整理：语法 + 词汇"],
    "模考冲刺": ["完整模考 1 套（全真计时）", "模考复盘：听力/阅读/写作分项", "高频词汇 200 个过一遍", "写作模板默写 1 次"],
    "保温收尾": ["错题本全过一遍", "模考 1 套保持手感", "报名信息 + 准考证核对", "早睡 + 证件文具打包"]
  };
  let d = new Date("2026-10-19T00:00:00");
  const fmt = (x) => `${x.getMonth() + 1}-${String(x.getDate()).padStart(2, "0")}`;
  for (let w = 1; w <= 12; w++) {
    const s = new Date(d), e = new Date(d); e.setDate(e.getDate() + 6);
    const phase = phases[w - 1];
    weeks.push({
      id: "w" + w, label: "第 " + w + " 周", range: fmt(s) + " ~ " + fmt(e), phase,
      tasks: tasksByPhase[phase].map((t, i) => ({ id: "w" + w + "-t" + (i + 1), text: t, done: false }))
    });
    d.setDate(d.getDate() + 7);
  }
  return {
    examDate: "2027-01-10", examLabel: "TOPIK 考试（第 110 届）", startDate: "2026-10-19",
    weeks, dayHours: {}, dayNotes: {}, daysDone: {},
    vocab: [], mocks: [],
    signup: [
      { id: "su1", text: "报名期 2026-12-08 ~ 12-14：完成网上报名并缴费", done: false },
      { id: "su2", text: "确认报名信息与考场（韩国考场）", done: false },
      { id: "su3", text: "打印准考证", done: false },
      { id: "su4", text: "准备证件（护照/身份证）与文具", done: false },
      { id: "su5", text: "2027-01-10 参加考试", done: false },
      { id: "su6", text: "2027-02-11 查成绩", done: false }
    ]
  };
}
function defaultSkincareDaily() {
  const r = (icon, label) => ({ id: uid(), icon, label });
  return {
    routines: [
      r("🧖", "面膜"),
      r("💋", "唇膜"),
      r("👁️", "眼霜"),
      r("💆", "面部提升"),
      r("🧼", "面部清洁"),
      r("🧴", "身体乳"),
      r("🤲", "手膜")
    ],
    log: {}
  };
}
/* ---------- 合并保障：新 state 键默认值 + 种子导入 + 老待办迁移 ---------- */
function ensureMerged() {
  if (!state.todoBoard || !state.todoBoard.columns) state.todoBoard = defaultTodoBoard();
  if (!state.topikPlan || !state.topikPlan.weeks) state.topikPlan = defaultTopikPlan();
  if (!state.checkins) state.checkins = {};
  if (!state.skincareDaily || !state.skincareDaily.routines) state.skincareDaily = defaultSkincareDaily();
  if (!state._seedV2) applySeed();
}
function isFreshState() {
  const hasTodos = Object.values(state.todoLists || {}).some(a => (a || []).length);
  const life = state.life || {};
  return !(state.countdowns || []).length && !hasTodos && !(state.secondBrain || []).length
    && !(life.weight || []).length && !(life.fitness || []).length
    && !(life.diet || []).length && !(state.inspiration || []).length
    && !(state.gratitude || []).length && !(state.expense || []).length;
}
function migrateOldTodos() {
  const board = state.todoBoard; if (!board) return;
  if (board.columns.some(c => (c.items || []).length)) return;
  const map = { read: "col-books", movie: "col-movies", drama: "col-custom", custom: "col-custom" };
  const lists = state.todoLists || {};
  Object.keys(map).forEach(cat => {
    const col = board.columns.find(c => c.id === map[cat]);
    if (!col) return;
    (lists[cat] || []).forEach(it => {
      col.items.push({ id: uid(), columnId: col.id, title: cat === "drama" ? "韩剧：" + it.text : it.text, done: !!it.done, rating: 0, review: "", sortOrder: col.items.length });
    });
  });
}
let _seedRunning = false;
async function applySeed() {
  if (state._seedV2 || _seedRunning) return;
  _seedRunning = true;
  try {
    const get = async (p) => { try { const r = await fetch(p); return r.ok ? await r.json() : null; } catch (e) { return null; } };
    const seed = await get("./seed-vivian2.json");
    if (seed && seed.columns && !(state.todoBoard.columns || []).length) {
      state.todoBoard.columns = seed.columns;
      if (seed.countdown && !(state.countdowns || []).some(c => c.date === seed.countdown.date)) {
        state.countdowns.push({ id: uid(), title: seed.countdown.label, date: seed.countdown.date, time: "" });
      }
    }
    state._seedV2 = true;
    save();
    renderSidebar();
    switchTab(currentRoute.tab, currentRoute.sub);
  } catch (e) { console.warn("种子导入失败", e); }
  _seedRunning = false;
}

/* ---------- 路由（包装原 switchTab，新增 tab 走新页面，其余走原逻辑） ---------- */
let currentRoute = { tab: "home", sub: null };
const __origSwitchTab = switchTab;
switchTab = function (tab, sub) {
  if (typeof homeTickTimer !== "undefined" && homeTickTimer) { clearInterval(homeTickTimer); homeTickTimer = null; }
  currentRoute = { tab, sub: sub || null };
  /* 自愈：打开合并版新页面前确保 state 键已初始化（避免与 app.js 异步 loadState 竞态） */
  if (["board", "topik", "checkin"].includes(tab)) { try { ensureMerged(); } catch (e) {} }
  if (tab === "board") { renderTodoBoardPage(); }
  else if (tab === "todo") { __origSwitchTab(tab); }
  else if (tab === "topik") { renderTopikPage(sub || "plan"); }
  else if (tab === "checkin") { renderCheckinPage(); }
  else { __origSwitchTab(tab); }
  markSidebarActive();
};
function markSidebarActive() {
  document.querySelectorAll(".sb-item").forEach(b => {
    const nav = b.dataset.nav, sub = b.dataset.sub || null;
    b.classList.toggle("active", nav === currentRoute.tab && sub === currentRoute.sub);
  });
  document.querySelectorAll(".tab-item").forEach(t => t.classList.toggle("active", t.dataset.tab === currentRoute.tab));
}

/* ---------- 分组黑色侧边栏 ---------- */
const SB_GROUPS = [
  { title: "核心功能", items: [
    { nav: "home", icon: "🏠", label: "首页总览" },
    { nav: "todo", icon: "🗒️", label: "可做事项", badge: "lists" },
    { nav: "board", icon: "✅", label: "影书评", badge: "board" },
    { nav: "checkin", icon: "📅", label: "每日打卡" },
    { nav: "brain", icon: "🧠", label: "第二大脑" },
    { nav: "modules", icon: "📦", label: "模块" },
    { nav: "items", icon: "🛍️", label: "待使用" },
    { nav: "me", icon: "👤", label: "我的" }
  ]},
  { title: "TOPIK 考试", items: [
    { nav: "topik", sub: "plan", icon: "📋", label: "备考周计划" },
    { nav: "topik", sub: "daily", icon: "✅", label: "每日打卡" },
    { nav: "topik", sub: "vocab", icon: "📖", label: "词汇语法" },
    { nav: "topik", sub: "mock", icon: "📝", label: "套卷分析" },
    { nav: "topik", sub: "signup", icon: "🧾", label: "报名清单" },
    { nav: "korean", icon: "🇰🇷", label: "韩语学习" }
  ]}
];
function todoUncheckedCount() {
  const cols = (state.todoBoard && state.todoBoard.columns) || [];
  return cols.reduce((s, c) => s + (c.items || []).filter(i => !i.done).length, 0);
}
function topikDDay() {
  const exam = (state.topikPlan && state.topikPlan.examDate) || "2027-01-10";
  const t = new Date(exam + "T00:00:00").getTime();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const n = Math.ceil((t - now.getTime()) / 86400000);
  return n > 0 ? "D-" + n : n === 0 ? "D-Day" : "D+" + (-n);
}
const __origRenderSidebar = renderSidebar;
renderSidebar = function () {
  const sb = document.getElementById("app-sidebar");
  if (!sb) return;
  const groups = SB_GROUPS.map(g => `
    <div class="sb-group">
      <div class="sb-group-title">${g.title}</div>
      ${g.items.map(it => {
        const badge = it.badge === "board" ? todoUncheckedCount() : it.badge === "lists" ? (typeof todoUnchecked === "function" ? todoUnchecked() : 0) : 0;
        return `<button class="sb-item" data-nav="${it.nav}"${it.sub ? ` data-sub="${it.sub}"` : ""}>
          <span class="sb-ico">${it.icon}</span><span class="sb-label">${it.label}</span>
          ${badge ? `<span class="sb-badge">${badge}</span>` : ""}
        </button>`;
      }).join("")}
    </div>`).join("");
  sb.innerHTML = `<div class="sb-brand">V</div>
    <div class="sb-sync">☁️ 服务端同步中</div>
    <div class="sb-groups">${groups}</div>
    <div class="sb-dday" id="sb-dday"><span>TOPIK 考试</span><b>${topikDDay()}</b></div>
    <div class="sb-footer">VIVIAN</div>`;
  sb.querySelectorAll(".sb-item").forEach(b => b.onclick = () => switchTab(b.dataset.nav, b.dataset.sub || null));
  const dd = sb.querySelector("#sb-dday"); if (dd) dd.onclick = () => switchTab("topik", "plan");
  markSidebarActive();
};

/* ---------- 首页挂件：完成度圆环 + 近7天学习时长 ---------- */
function ringSVG(pct, color, size) {
  const r = 26, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="#f0e8ee" stroke-width="8"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 32 32)"/><text x="32" y="36" text-anchor="middle" font-size="15" font-weight="800" fill="#1f2937">${Math.round(pct * 100)}%</text></svg>`;
}
const __origRenderHome = renderHome;
renderHome = function () {
  __origRenderHome();
  const main = document.getElementById("app-main"); if (!main) return;
  const tp = state.topikPlan || {};
  const cols = (state.todoBoard && state.todoBoard.columns) || [];
  const allItems = cols.flatMap(c => c.items || []);
  const todoPct = allItems.length ? allItems.filter(i => i.done).length / allItems.length : 0;
  const weekTasks = (tp.weeks || []).flatMap(w => w.tasks || []);
  const topikDone = weekTasks.filter(t => t.done).length + Object.keys(tp.daysDone || {}).length;
  const topikTotal = weekTasks.length + 83;
  const topikPct = topikTotal ? topikDone / topikTotal : 0;
  const today = todayStr();
  const days7 = last7Days(today);
  const maxH = Math.max(1, ...days7.map(d => Number((tp.dayHours || {})[d]) || 0));
  const bars = days7.map(d => {
    const h = Number((tp.dayHours || {})[d]) || 0;
    return `<div class="mg-bar-col"><div class="mg-bar" style="height:${Math.round(h / maxH * 76)}px" title="${d} ${h}小时"></div><span>${d.slice(5)}</span></div>`;
  }).join("");
  const sec = document.createElement("div");
  sec.innerHTML = `
    <div class="section-title">📊 完成度总览</div>
    <div class="mg-rings card">
      <div class="mg-ring-item" data-goto="board">${ringSVG(todoPct, "#ec4899", 64)}<span>影书评</span></div>
      <div class="mg-ring-item" data-goto="topik">${ringSVG(topikPct, "#f59e0b", 64)}<span>TOPIK 备考</span></div>
    </div>
    <div class="section-title">📚 近7天学习时长</div>
    <div class="card"><div class="mg-bars">${bars}</div><div class="muted" style="margin-top:8px">在 TOPIK 每日打卡里记录每天学习时长</div></div>`;
  main.appendChild(sec);
  sec.querySelectorAll("[data-goto]").forEach(el => el.onclick = () => switchTab(el.dataset.goto));
};

/* ---------- 待办事项：四栏并排看板 + 书评影评编辑器 ---------- */
function boardColumns() {
  const cols = (state.todoBoard && state.todoBoard.columns) || [];
  return cols.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}
function renderTodoBoardPage() {
  const main = document.getElementById("app-main"); if (!main) return;
  const cols = boardColumns();
  const total = cols.reduce((s, c) => s + (c.items || []).length, 0);
  const done = cols.reduce((s, c) => s + (c.items || []).filter(i => i.done).length, 0);
  const pastel = { book: "pink", movie: "blue", korean: "green", custom: "yellow" };
  main.innerHTML = `
    <div class="page-head">
      <h2>✅ 待办事项</h2>
      <span class="muted">${done} / ${total} 已完成</span>
    </div>
    <div class="mg-board card" id="mg-board">
      ${cols.map(c => {
        const items = (c.items || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const cd = items.filter(i => i.done).length;
        return `<div class="mg-col ${pastel[c.kind] || "pink"}" data-col="${c.id}">
          <div class="mg-col-head"><b>${esc(c.title)}</b><span class="muted">${cd}/${items.length}</span></div>
          <div class="mg-col-list">
            ${items.map(it => `<div class="mg-item ${it.done ? "done" : ""}" data-item="${it.id}" data-col="${c.id}">
              <button class="mg-cb ${it.done ? "on" : ""}" data-cb="${it.id}" data-col="${c.id}">${it.done ? "✓" : ""}</button>
              <div class="mg-item-main">
                <div class="mg-item-title">${esc(it.title)}</div>
                ${it.review ? `<div class="mg-item-review-badge">★ ${it.rating || 0} · 已写${c.kind === "book" ? "书评" : c.kind === "movie" ? "影评" : "笔记"}</div>` : ""}
              </div>
              <button class="mg-del" data-del="${it.id}" data-col="${c.id}">×</button>
            </div>`).join("") || `<div class="mg-empty">暂无事项</div>`}
          </div>
          <button class="btn ghost" data-add="${c.id}">+ 添加事项</button>
        </div>`;
      }).join("")}
    </div>
    <div class="mg-board-foot">
      <input id="mg-new-col" placeholder="新栏目名称，如：旅行" />
      <button class="btn" id="mg-add-col">+ 新建栏目</button>
      <button class="btn ghost" id="mg-rename-col">改名当前栏目</button>
    </div>`;
  bindTodoBoard(main);
}
function bindTodoBoard(root) {
  root.querySelectorAll("[data-cb]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const col = boardColumns().find(c => c.id === b.dataset.col);
    const it = (col && col.items || []).find(i => i.id === b.dataset.cb);
    if (!it) return;
    it.done = !it.done; save(); renderTodoBoardPage(); renderSidebar();
  });
  root.querySelectorAll("[data-del]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const col = boardColumns().find(c => c.id === b.dataset.col);
    if (!col) return;
    col.items = (col.items || []).filter(i => i.id !== b.dataset.del);
    save(); renderTodoBoardPage(); renderSidebar();
  });
  root.querySelectorAll(".mg-item").forEach(el => el.onclick = (e) => {
    if (e.target.closest("[data-cb]") || e.target.closest("[data-del]")) return;
    const col = boardColumns().find(c => c.id === el.dataset.col);
    const it = (col && col.items || []).find(i => i.id === el.dataset.item);
    if (it) openTodoEditor(col, it);
  });
  root.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
    const title = prompt("新事项名称："); if (!title) return;
    const col = boardColumns().find(c => c.id === b.dataset.add);
    if (!col) return;
    col.items.push({ id: uid(), columnId: col.id, title: title.trim(), done: false, rating: 0, review: "", sortOrder: col.items.length });
    save(); renderTodoBoardPage(); renderSidebar();
  });
  const addCol = root.querySelector("#mg-add-col");
  if (addCol) addCol.onclick = () => {
    const input = root.querySelector("#mg-new-col");
    const name = (input.value || "").trim(); if (!name) return;
    const cols = state.todoBoard.columns;
    cols.push({ id: uid(), kind: "custom", title: name, sortOrder: cols.length, items: [] });
    save(); renderTodoBoardPage(); renderSidebar();
  };
  const rename = root.querySelector("#mg-rename-col");
  if (rename) rename.onclick = () => {
    const cols = boardColumns(); if (!cols.length) return;
    const name = prompt("栏目改名（当前：" + cols.map(c => c.title).join(" / ") + "）：输入“原名=新名”", "");
    if (!name || !name.includes("=")) return;
    const [oldN, newN] = name.split("=").map(s => s.trim());
    const col = cols.find(c => c.title === oldN);
    if (col) { col.title = newN; save(); renderTodoBoardPage(); }
  };
}
function openTodoEditor(col, it) {
  const isBook = col.kind === "book", isMovie = col.kind === "movie";
  const noteLabel = isBook ? "书评" : isMovie ? "影评" : "学习笔记";
  const root = document.getElementById("modal-root"); if (!root) return;
  root.innerHTML = `<div class="modal-backdrop"><div class="modal" style="max-width:520px">
    <div class="modal-head"><b>📝 ${esc(it.title)}</b><button class="modal-x" data-close>×</button></div>
    <div class="modal-body">
      <div class="muted" style="margin-bottom:8px">${esc(col.title)} · ${noteLabel}</div>
      <div class="mg-stars" id="mg-stars">
        ${[1, 2, 3, 4, 5].map(n => `<span class="mg-star ${n <= (it.rating || 0) ? "on" : ""}" data-star="${n}">★</span>`).join("")}
        <span class="muted" id="mg-star-text">${it.rating ? it.rating + " / 5" : "未评分"}</span>
      </div>
      <textarea id="mg-review" rows="8" placeholder="写下你的${noteLabel}……" style="width:100%;margin-top:10px;padding:10px;border:1.5px solid var(--line);border-radius:12px;font-size:14px;line-height:1.7">${esc(it.review || "")}</textarea>
    </div>
    <div class="modal-foot">
      <button class="btn ghost" id="mg-download">下载成文本</button>
      <button class="btn" id="mg-save-review">保存</button>
    </div></div></div>`;
  let rating = it.rating || 0;
  root.querySelectorAll("[data-star]").forEach(s => s.onclick = () => {
    rating = Number(s.dataset.star);
    root.querySelectorAll("[data-star]").forEach(x => x.classList.toggle("on", Number(x.dataset.star) <= rating));
    root.querySelector("#mg-star-text").textContent = rating + " / 5";
  });
  root.querySelector("#mg-save-review").onclick = () => {
    it.rating = rating;
    it.review = root.querySelector("#mg-review").value;
    save(); root.innerHTML = ""; renderTodoBoardPage(); toast("已保存 ✓");
  };
  root.querySelector("#mg-download").onclick = () => {
    const txt = `${it.title}\n${col.title} · ${noteLabel}\n评分：${rating ? rating + " / 5" : "未评分"}\n\n${root.querySelector("#mg-review").value || it.review || ""}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain;charset=utf-8" }));
    a.download = it.title.replace(/[\\/:*?"<>|]/g, "_") + "·" + noteLabel + ".txt";
    a.click(); URL.revokeObjectURL(a.href);
  };
  root.querySelector("[data-close]").onclick = () => { root.innerHTML = ""; };
  root.querySelector(".modal-backdrop").onclick = (e) => { if (e.target.classList.contains("modal-backdrop")) root.innerHTML = ""; };
}

/* ---------- TOPIK 备考计划：5 页签（周计划 / 每日打卡 / 词汇语法 / 模考记录 / 报名清单） ---------- */
let topikTab = "plan";
function topikProgress() {
  const tp = state.topikPlan || {};
  const weekTasks = (tp.weeks || []).flatMap(w => w.tasks || []);
  const done = weekTasks.filter(t => t.done).length + Object.keys(tp.daysDone || {}).length;
  return { done, total: weekTasks.length + 83, pct: (weekTasks.length + 83) ? done / (weekTasks.length + 83) : 0 };
}
function renderTopikPage(tab) {
  topikTab = tab || topikTab;
  const main = document.getElementById("app-main"); if (!main) return;
  const tp = state.topikPlan || {};
  const p = topikProgress();
  const tabs = [["plan", "📋 周计划"], ["daily", "✅ 每日打卡"], ["vocab", "📖 词汇语法"], ["mock", "📝 模考记录"], ["signup", "🧾 报名清单"]];
  let body = "";
  if (topikTab === "plan") {
    body = `<div class="mg-weeks">${(tp.weeks || []).map(w => {
      const d = (w.tasks || []).filter(t => t.done).length, t = (w.tasks || []).length;
      return `<div class="card mg-week">
        <div class="mg-week-head"><b>${esc(w.label)}</b><span class="muted">${esc(w.range)} · ${esc(w.phase)} · ${d}/${t}</span></div>
        <div class="mg-checklist">${(w.tasks || []).map(task => `<label class="mg-check-row"><input type="checkbox" data-week="${w.id}" data-task="${task.id}" ${task.done ? "checked" : ""} /><span>${esc(task.text)}</span></label>`).join("")}</div>
      </div>`;
    }).join("")}</div>`;
  } else if (topikTab === "daily") {
    const today = todayStr();
    const hours = (tp.dayHours || {})[today] || "";
    const note = (tp.dayNotes || {})[today] || "";
    const doneToday = !!(tp.daysDone || {})[today];
    const streak = (() => {
      let n = 0, d = today;
      while ((tp.daysDone || {})[d]) { n++; d = dateAddStr(d, -1); }
      return n;
    })();
    const days7 = last7Days(today);
    body = `<div class="card">
      <div class="mg-week-head"><b>今天 ${today}（${weekDay(today)}）</b><span class="muted">连续打卡 ${streak} 天</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0">
        <label class="muted">学习时长（小时）<input id="tp-hours" type="number" min="0" step="0.5" value="${hours}" style="width:90px;padding:8px;border:1.5px solid var(--line);border-radius:10px;margin-left:6px" /></label>
        <label class="mg-check-row" style="border:none;padding:0"><input type="checkbox" id="tp-done" ${doneToday ? "checked" : ""} /><span>今日已完成打卡</span></label>
      </div>
      <textarea id="tp-note" rows="4" placeholder="今天学了什么？写一句小结……" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:12px;line-height:1.7">${esc(note)}</textarea>
      <button class="btn" id="tp-save" style="margin-top:10px">保存今日打卡</button>
      <div class="section-title" style="margin-top:18px">近7天</div>
      <div>${days7.map(d => `<div class="mg-check-row"><span class="muted" style="width:110px">${d}（${weekDay(d)}）</span><span>${(tp.dayHours || {})[d] ? (tp.dayHours || {})[d] + " 小时" : "—"}</span><span class="muted" style="margin-left:auto">${(tp.daysDone || {})[d] ? "✓ 已打卡" : ""}</span></div>`).join("")}</div>
    </div>`;
  } else if (topikTab === "vocab") {
    body = `<div class="card">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <input id="tp-v-word" placeholder="单词 / 语法点" style="flex:1;min-width:120px;padding:10px;border:1.5px solid var(--line);border-radius:12px" />
        <input id="tp-v-mean" placeholder="释义" style="flex:1;min-width:120px;padding:10px;border:1.5px solid var(--line);border-radius:12px" />
        <button class="btn" id="tp-v-add">+ 添加</button>
      </div>
      <div>${(tp.vocab || []).map(v => `<div class="mg-check-row"><span><b>${esc(v.word)}</b> <span class="muted">${esc(v.mean || "")}</span></span><button class="mg-del" data-vdel="${v.id}">×</button></div>`).join("") || `<div class="mg-empty">还没添加词汇或语法</div>`}</div>
    </div>`;
  } else if (topikTab === "mock") {
    const mocks = tp.mocks || [];
    const trend = mocks.map(m => m.total).join(" → ");
    body = `<div class="card">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <input id="tp-m-date" type="date" value="${todayStr()}" style="padding:10px;border:1.5px solid var(--line);border-radius:12px" />
        <input id="tp-m-l" type="number" min="0" placeholder="听力" style="width:80px;padding:10px;border:1.5px solid var(--line);border-radius:12px" />
        <input id="tp-m-r" type="number" min="0" placeholder="阅读" style="width:80px;padding:10px;border:1.5px solid var(--line);border-radius:12px" />
        <input id="tp-m-w" type="number" min="0" placeholder="写作" style="width:80px;padding:10px;border:1.5px solid var(--line);border-radius:12px" />
        <button class="btn" id="tp-m-add">+ 记录模考</button>
      </div>
      ${mocks.length ? `<div class="muted" style="margin-bottom:10px">总分趋势：${trend}</div>
      <div>${mocks.map(m => `<div class="mg-check-row"><span><b>${esc(m.date)}</b> · 听力 ${m.listen} / 阅读 ${m.read} / 写作 ${m.write}</span><b>总分 ${m.total}</b><button class="mg-del" data-mdel="${m.id}">×</button></div>`).join("")}</div>` : `<div class="mg-empty">还没有模考记录</div>`}
    </div>`;
  } else if (topikTab === "signup") {
    body = `<div class="card">
      <div class="muted" style="margin-bottom:12px">目标：${esc(tp.examLabel || "TOPIK 考试")} · ${esc(tp.examDate || "2027-01-10")} · 报名期 2026-12-08 ~ 12-14 · 成绩公布 2027-02-11</div>
      <div class="mg-checklist">${(tp.signup || []).map(s => `<label class="mg-check-row"><input type="checkbox" data-signup="${s.id}" ${s.done ? "checked" : ""} /><span>${esc(s.text)}</span></label>`).join("")}</div>
    </div>`;
  }
  main.innerHTML = `
    <div class="page-head">
      <h2>🎯 TOPIK 备考计划</h2>
      <span class="muted">${esc(tp.examLabel || "")} ${esc(tp.examDate || "")} · ${topikDDay()}</span>
    </div>
    <div class="mg-rings card" style="margin-bottom:14px">
      <div class="mg-ring-item">${ringSVG(p.pct, "#ec4899", 64)}<span>总体进度</span></div>
      <div class="mg-ring-item" style="flex:1;text-align:left"><div><b>${p.done} / ${p.total}</b> <span class="muted">（周任务 + 83 天打卡）</span></div><div class="muted" style="margin-top:4px">目标 5 级 · 保底 4 级 · 延世 2 册在读</div></div>
    </div>
    <div class="mg-tabs">${tabs.map(t => `<button class="mg-tab ${topikTab === t[0] ? "on" : ""}" data-toptab="${t[0]}">${t[1]}</button>`).join("")}</div>
    ${body}`;
  bindTopikPage(main);
}
function bindTopikPage(root) {
  root.querySelectorAll("[data-toptab]").forEach(b => b.onclick = () => switchTab("topik", b.dataset.toptab));
  root.querySelectorAll("[data-week]").forEach(cb => cb.onchange = () => {
    const w = (state.topikPlan.weeks || []).find(x => x.id === cb.dataset.week);
    const t = (w && w.tasks || []).find(x => x.id === cb.dataset.task);
    if (t) { t.done = cb.checked; save(); renderTopikPage("plan"); }
  });
  root.querySelectorAll("[data-signup]").forEach(cb => cb.onchange = () => {
    const s = (state.topikPlan.signup || []).find(x => x.id === cb.dataset.signup);
    if (s) { s.done = cb.checked; save(); renderTopikPage("signup"); }
  });
  const saveBtn = root.querySelector("#tp-save");
  if (saveBtn) saveBtn.onclick = () => {
    const tp = state.topikPlan, today = todayStr();
    tp.dayHours[today] = Number(root.querySelector("#tp-hours").value) || 0;
    tp.dayNotes[today] = root.querySelector("#tp-note").value;
    if (root.querySelector("#tp-done").checked) tp.daysDone[today] = true; else delete tp.daysDone[today];
    save(); renderTopikPage("daily"); toast("今日打卡已保存 ✓");
  };
  const vAdd = root.querySelector("#tp-v-add");
  if (vAdd) vAdd.onclick = () => {
    const w = (root.querySelector("#tp-v-word").value || "").trim();
    const m = (root.querySelector("#tp-v-mean").value || "").trim();
    if (!w) return;
    state.topikPlan.vocab.push({ id: uid(), word: w, mean: m });
    save(); renderTopikPage("vocab");
  };
  root.querySelectorAll("[data-vdel]").forEach(b => b.onclick = () => {
    state.topikPlan.vocab = (state.topikPlan.vocab || []).filter(v => v.id !== b.dataset.vdel);
    save(); renderTopikPage("vocab");
  });
  const mAdd = root.querySelector("#tp-m-add");
  if (mAdd) mAdd.onclick = () => {
    const l = Number(root.querySelector("#tp-m-l").value) || 0;
    const r = Number(root.querySelector("#tp-m-r").value) || 0;
    const w = Number(root.querySelector("#tp-m-w").value) || 0;
    state.topikPlan.mocks.push({ id: uid(), date: root.querySelector("#tp-m-date").value || todayStr(), listen: l, read: r, write: w, total: l + r + w });
    save(); renderTopikPage("mock");
  };
  root.querySelectorAll("[data-mdel]").forEach(b => b.onclick = () => {
    state.topikPlan.mocks = (state.topikPlan.mocks || []).filter(m => m.id !== b.dataset.mdel);
    save(); renderTopikPage("mock");
  });
}

/* ---------- 每日打卡页：整月日历 + 连续打卡 ---------- */
let calYM = null;
function renderCheckinPage() {
  const main = document.getElementById("app-main"); if (!main) return;
  const today = todayStr();
  if (!calYM) calYM = today.slice(0, 7);
  const [y, m] = calYM.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const startWd = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m, 0).getDate();
  let streak = 0, d = today;
  while ((state.checkins || {})[d]) { streak++; d = dateAddStr(d, -1); }
  const total = Object.keys(state.checkins || {}).filter(k => state.checkins[k]).length;
  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(`<div class="mg-cal-cell empty"></div>`);
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const done = !!(state.checkins || {})[ds];
    cells.push(`<div class="mg-cal-cell ${done ? "done" : ""} ${ds === today ? "today" : ""}" data-cal="${ds}"><span>${day}</span>${done ? "<b>✓</b>" : ""}</div>`);
  }
  main.innerHTML = `
    <div class="page-head">
      <h2>📅 每日打卡</h2>
      <span class="muted">连续 ${streak} 天 · 累计 ${total} 天</span>
    </div>
    <div class="card">
      <div class="mg-cal-head">
        <button class="btn ghost" id="cal-prev">‹</button>
        <b>${y} 年 ${m} 月</b>
        <button class="btn ghost" id="cal-next">›</button>
        <button class="btn ghost" id="cal-today">回到今天</button>
      </div>
      <div class="mg-cal-week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
      <div class="mg-cal-grid">${cells.join("")}</div>
      <div class="muted" style="margin-top:10px">点日期打勾/取消打卡；TOPIK 打卡在各自模块里记录</div>
    </div>
    <div class="mg-quick card">
      <button class="btn" data-quick="todo">去待办事项</button>
      <button class="btn" data-quick="topik">去 TOPIK 每日打卡</button>
    </div>`;
  rootBindCheckin(main);
}
function rootBindCheckin(root) {
  const shiftYM = (ym, delta) => { let [y, m] = ym.split("-").map(Number); m += delta; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + "-" + String(m).padStart(2, "0"); };
  root.querySelector("#cal-prev").onclick = () => { calYM = shiftYM(calYM, -1); renderCheckinPage(); };
  root.querySelector("#cal-next").onclick = () => { calYM = shiftYM(calYM, 1); renderCheckinPage(); };
  root.querySelector("#cal-today").onclick = () => { calYM = todayStr().slice(0, 7); renderCheckinPage(); };
  root.querySelectorAll("[data-cal]").forEach(c => c.onclick = () => {
    const ds = c.dataset.cal;
    if (!state.checkins) state.checkins = {};
    if (state.checkins[ds]) delete state.checkins[ds]; else state.checkins[ds] = true;
    save(); renderCheckinPage();
  });
  root.querySelectorAll("[data-quick]").forEach(b => b.onclick = () => switchTab(b.dataset.quick, b.dataset.quick === "topik" ? "daily" : null));
}

/* ---------- 每日护肤：routine 卡片打卡 + 记录 ---------- */
function renderSkincareDailyPage() {
  const main = document.getElementById("app-main"); if (!main) return;
  const sd = state.skincareDaily || (state.skincareDaily = defaultSkincareDaily());
  const today = todayStr();
  const entry = sd.log[today] || (sd.log[today] = { done: [], note: "", photos: [] });
  const total = sd.routines.length;
  const doneCount = (entry.done || []).length;
  const pct = total ? doneCount / total : 0;
  main.innerHTML = `
    <div class="page-head">
      <button class="btn ghost" data-back>‹ 首页</button>
      <h2 style="flex:1;text-align:center">🧴 每日护肤</h2>
      <button class="btn" data-rec>📋 记录</button>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="muted">点卡片记录今天做了什么、传图、写下感受和看法。今日完成 <b>${doneCount}/${total}</b></div>
      <div class="mg-rings" style="margin-top:12px;justify-content:flex-start">
        ${ringSVG(pct, "#db2777", 64)}
        <span class="muted">今日护肤进度</span>
      </div>
    </div>
    <div class="sk-grid">
      ${sd.routines.map(r => {
        const on = (entry.done || []).includes(r.id);
        return `<button class="sk-card ${on ? "on" : ""}" data-routine="${r.id}">
          <span class="sk-ico">${r.icon}</span>
          <span class="sk-label">${esc(r.label)}</span>
          <span class="sk-check">${on ? "✓" : ""}</span>
        </button>`;
      }).join("")}
    </div>
    <button class="btn ghost" id="sk-add" style="margin-top:14px">+ 添加分类</button>`;
  bindSkincareDaily(main);
}
function bindSkincareDaily(root) {
  const sd = () => state.skincareDaily;
  root.querySelector("[data-back]").onclick = () => switchTab("home");
  root.querySelectorAll("[data-routine]").forEach(b => b.onclick = () => {
    const s = sd();
    const today = todayStr();
    const entry = s.log[today] || (s.log[today] = { done: [], note: "", photos: [] });
    if (!entry.done) entry.done = [];
    const i = entry.done.indexOf(b.dataset.routine);
    if (i >= 0) entry.done.splice(i, 1); else entry.done.push(b.dataset.routine);
    save(); renderSkincareDailyPage();
  });
  const rec = root.querySelector("[data-rec]");
  if (rec) rec.onclick = () => openSkincareRecord();
  const add = root.querySelector("#sk-add");
  if (add) add.onclick = () => {
    const label = prompt("新护肤分类名称："); if (!label) return;
    sd().routines.push({ id: uid(), icon: "✨", label: label.trim() });
    save(); renderSkincareDailyPage();
  };
}
function openSkincareRecord() {
  const s = state.skincareDaily;
  const today = todayStr();
  const entry = s.log[today] || (s.log[today] = { done: [], note: "", photos: [] });
  const root = document.getElementById("modal-root"); if (!root) return;
  root.innerHTML = `<div class="modal-backdrop"><div class="modal" style="max-width:520px">
    <div class="modal-head"><b>📋 今日护肤记录</b><button class="modal-x" data-close>×</button></div>
    <div class="modal-body">
      <div class="muted" style="margin-bottom:8px">${today} · 今日完成 ${((entry.done || []).length)} / ${(s.routines || []).length}</div>
      <textarea id="sk-note" rows="6" placeholder="今天用了什么？皮肤状态、感受和看法……" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:12px;line-height:1.7">${esc(entry.note || "")}</textarea>
    </div>
    <div class="modal-foot">
      <button class="btn" id="sk-save-note">保存</button>
    </div></div></div>`;
  root.querySelector("#sk-save-note").onclick = () => {
    entry.note = root.querySelector("#sk-note").value;
    save(); root.innerHTML = ""; renderSkincareDailyPage(); toast("已保存 ✓");
  };
  root.querySelector("[data-close]").onclick = () => { root.innerHTML = ""; };
  root.querySelector(".modal-backdrop").onclick = (e) => { if (e.target.classList.contains("modal-backdrop")) root.innerHTML = ""; };
}

/* 自初始化：合并版脚本加载即激活，不依赖 app.js 内联钩子 */
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureMerged);
else ensureMerged();
