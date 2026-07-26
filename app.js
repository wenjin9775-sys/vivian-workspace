/* =========================================================================
   Vivian 的工作台  —  纯前端单页应用（绿色版 / 底部导航 / 第二大脑）
   数据：localStorage(结构化) + IndexedDB(图片)
   ========================================================================= */
"use strict";

const LS_KEY = "vivian_workspace_v1";
const TOKEN_KEY = "vivian_token";
const USER_KEY = "vivian_user";

/* ---------- 账号 / 云端同步 ---------- */
let authToken = null, authUser = null;
try { authToken = localStorage.getItem(TOKEN_KEY); authUser = localStorage.getItem(USER_KEY); } catch (e) {}

async function api(path, opts) {
  const r = await fetch(path, Object.assign({
    headers: Object.assign({ "Content-Type": "application/json" }, authToken ? { "Authorization": "Bearer " + authToken } : {})
  }, opts || {}));
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error((j && j.error) || ("HTTP " + r.status));
  return j;
}
async function apiSaveState() {
  if (!authToken) return;
  try { await api("/api/state", { method: "PUT", body: JSON.stringify({ state }) }); } catch (e) { console.warn("状态同步失败", e); }
}
async function apiUploadImage(id, data) {
  if (!authToken) return;
  try { await api("/api/image", { method: "POST", body: JSON.stringify({ id, data }) }); } catch (e) { console.warn("图片上传失败", e); }
}
async function apiGetImage(id) {
  if (!authToken) return null;
  try {
    const r = await fetch("/api/image/" + encodeURIComponent(id), { headers: { "Authorization": "Bearer " + authToken } });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; }
}
async function getImg(id) {
  const local = await idb.get(id);
  if (local) return local;
  if (authToken) { const d = await apiGetImage(id); if (d) { await idb.put(id, d); return d; } }
  return null;
}
const ACCENTS = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#ef4444", "#14b8a6"];

/* ---------- 工具 ---------- */
const uid = () => {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return "id" + Math.random().toString(36).slice(2) + Date.now();
};
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function todayStr() {
  const d = new Date(); const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function daysAgoStr(n) {
  const d = new Date(Date.now() - n * 86400000); const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function monthKey() { return todayStr().slice(0, 7); }
function money(n) { return "¥" + (Number(n) || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }); }
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1800);
}
function formatDate(d) {
  return new Date(d).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
function weekDay(d) {
  return ["日","一","二","三","四","五","六"][new Date(d).getDay()];
}

/* ---------- IndexedDB（图片） ---------- */
const idb = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("vivian_imgs", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("images");
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  put(id, data) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction("images", "readwrite");
      tx.objectStore("images").put(data, id);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  },
  get(id) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction("images", "readonly");
      const rq = tx.objectStore("images").get(id);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
  },
  del(id) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction("images", "readwrite");
      tx.objectStore("images").delete(id);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }
};

function uploadImage(cb) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { const id = uid(); idb.put(id, r.result).then(() => { apiUploadImage(id, r.result); cb(id); }); };
    r.readAsDataURL(f);
  };
  inp.click();
}

async function hydrateImages(root) {
  const nodes = root.querySelectorAll("[data-img]");
  for (const n of nodes) {
    const id = n.getAttribute("data-img");
    if (!id) continue;
    const data = await getImg(id);
    if (data) {
      const img = document.createElement("img");
      img.src = data; img.className = "thumb"; img.alt = ""; img.title = "点击查看大图";
      img.style.cursor = "pointer"; img.onclick = () => openImage(data);
      n.replaceWith(img);
    }
  }
}
function openImage(src) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-backdrop" data-close><img src="${src}" style="max-width:92vw;max-height:88vh;border-radius:14px;" /></div>`;
  root.querySelector("[data-close]").onclick = () => (root.innerHTML = "");
}

/* ---------- 状态 ---------- */
function defaultGrammar() {
  const books = [];
  for (let i = 1; i <= 5; i++) {
    const chapters = [];
    for (let c = 1; c <= 10; c++) chapters.push({ id: uid(), title: `第 ${c} 课`, learned: false, checkins: [] });
    books.push({ id: uid(), name: `延世韩国语 ${i}`, chapters });
  }
  return { books };
}
function defaultVocabPractice() {
  const lessons = [];
  for (let b = 1; b <= 5; b++) for (let l = 1; l <= 10; l++) lessons.push({ id: uid(), label: `延世${b}-${l}`, done: false });
  lessons.forEach(x => { if (x.label.startsWith("延世1") || x.label === "延世2-1") x.done = true; });
  return {
    videoUrl: "https://b23.tv/GVpiVeB",
    videoTitle: "韩语单词边睡边记 · 每天一遍轻松掌握6000词（B站）",
    lessons
  };
}
const SKINCARE_CATS = ["面膜", "唇膜", "眼霜", "面部提升", "面部清洁", "身体乳", "手膜"];
const SKIN_EMOJI = { "面膜": "🧖‍♀️", "唇膜": "💋", "眼霜": "👁️", "面部提升": "✨", "面部清洁": "🫧", "身体乳": "🧴", "手膜": "🤲" };
function defaultSkincare() {
  return { cats: SKINCARE_CATS.map(n => ({ id: uid(), name: n, doneDates: [], entries: [] })) };
}
function defaultState() {
  return {
    settings: { accent: "#ec4899", bgColor: "#fff5f9", bgImage: null, showSub: "记录生活 · 韩语学习 · 申请进度", userName: "Vivian" },
    layout: { col1: ["countdown", "grammar", "vocabpractice", "todo", "life", "expense"], col2: ["inspiration", "gratitude", "skincare", "applications", "visa"] },
    expense: [],
    vocab: [],
    grammar: defaultGrammar(),
    vocabPractice: defaultVocabPractice(),
    todo: [],
    life: { weight: [], fitness: [], diet: [] },
    inspiration: [],
    gratitude: [],
    applications: [],
    visa: [],
    skincare: defaultSkincare(),
    countdowns: [],
    secondBrain: []
  };
}
let state = loadState();
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    const d = defaultState();
    const merged = Object.assign(d, s, { settings: Object.assign(d.settings, s.settings || {}) });
    return merged;
  } catch (e) { return defaultState(); }
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { console.warn("保存数据失败", e); }
  apiSaveState();
}

function ensureLayout() {
  const all = MODULES.map(m => m.id);
  const present = new Set([...state.layout.col1, ...state.layout.col2]);
  all.forEach(id => { if (!present.has(id)) state.layout.col1.push(id); });
  state.layout.col1 = [...new Set(state.layout.col1)].filter(id => all.includes(id));
  state.layout.col2 = [...new Set(state.layout.col2)].filter(id => all.includes(id));
}
function ensureVocabPractice() {
  if (!state.vocabPractice || !state.vocabPractice.lessons) state.vocabPractice = defaultVocabPractice();
}
function ensureSkincare() {
  if (!state.skincare || !state.skincare.cats || !state.skincare.cats.length) state.skincare = defaultSkincare();
}
function migrate() {
  if (state.todo.length && state.todo[0].tasks === undefined) {
    const map = {};
    state.todo.forEach(t => { (map[t.date] = map[t.date] || []).push({ id: t.id || uid(), text: t.text, done: !!t.done }); });
    state.todo = Object.entries(map).map(([date, tasks]) => ({ date, tasks }));
  }
  if (state.life.fitness.length && state.life.fitness[0].tasks === undefined) {
    const map = {};
    state.life.fitness.forEach(f => { (map[f.date] = map[f.date] || []).push({ id: f.id || uid(), text: f.text, done: false }); });
    state.life.fitness = Object.entries(map).map(([date, tasks]) => ({ date, tasks }));
  }
}

/* ---------- 主题 ---------- */
function applyTheme() {
  const r = document.documentElement.style;
  r.setProperty("--accent", state.settings.accent);
  r.setProperty("--accent-soft", lighten(state.settings.accent, 0.55));
  r.setProperty("--accent-deep", lighten(state.settings.accent, -0.18));
  document.body.style.background = state.settings.bgColor || "var(--bg)";
  if (state.settings.bgImage) {
    getImg(state.settings.bgImage).then(d => { if (d) document.body.style.backgroundImage = `url(${d})`; });
  } else {
    document.body.style.backgroundImage = "";
  }
}
function lighten(hex, amt) {
  const m = hex.replace("#", "");
  let r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  return `#${[f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

/* =========================================================================
   顶部动态头
   ========================================================================= */
function streakDays() {
  const days = [];
  for (let i = 0; i < 30; i++) days.push(daysAgoStr(i));
  let streak = 0;
  for (const d of days) {
    const active = state.todo.some(g => g.date === d && g.tasks.some(t => t.done)) ||
      state.life.fitness.some(g => g.date === d && g.tasks.some(t => t.done)) ||
      state.skincare.cats.some(c => c.doneDates.includes(d)) ||
      state.vocabPractice.lessons.some(l => l.done);
    if (active) streak++; else if (d !== todayStr()) break;
  }
  return streak;
}
function renderHeader() {
  const h = document.getElementById("app-header");
  const t = todayStr();
  const month = new Date().getMonth() + 1;
  const date = new Date().getDate();
  const wd = weekDay(t);
  const streak = streakDays();
  h.innerHTML = `
    <div class="header-top">
      <div class="header-greet">早安，${esc(state.settings.userName || "Vivian")}</div>
      <div class="header-streak">🔥 连续打卡 ${streak} 天</div>
    </div>
    <div class="header-main">
      <div class="header-date">
        <div class="day">${month}月${date}日</div>
        <div class="week">星期${wd}</div>
      </div>
      <div class="header-weather">
        <span class="w-icon">🌤️</span>
        <span class="w-temp">26°C</span>
      </div>
    </div>`;
}

/* =========================================================================
   模块注册表
   ========================================================================= */
const MODULES = [
  { id: "countdown", title: "倒计时", icon: "⏳", render: renderCountdown },
  { id: "grammar", title: "韩语语法", icon: "📚", render: renderGrammar },
  { id: "vocabpractice", title: "单词带练", icon: "🎧", render: renderVocabPractice },
  { id: "todo", title: "To Do", icon: "✅", render: renderTodo },
  { id: "life", title: "生活区", icon: "🌸", render: renderLife },
  { id: "expense", title: "花销", icon: "💸", render: renderExpense },
  { id: "inspiration", title: "创作灵感", icon: "💡", render: renderInspiration },
  { id: "gratitude", title: "感恩日记", icon: "🙏", render: renderGratitude },
  { id: "applications", title: "文书申请", icon: "📄", render: renderApplications },
  { id: "visa", title: "签证", icon: "🛂", render: renderVisa },
  { id: "skincare", title: "每日护肤", icon: "🧴", render: renderSkincare }
];

/* ---------- 倒计时计算工具 ---------- */
function cdTarget(d) { return new Date((d.date || "") + "T" + (d.time || "00:00:00")); }
function cdParts(ms) {
  const past = ms < 0, a = Math.abs(ms);
  const days = Math.floor(a / 86400000);
  const hours = Math.floor((a % 86400000) / 3600000);
  const minutes = Math.floor((a % 3600000) / 60000);
  const seconds = Math.floor((a % 60000) / 1000);
  return { past, days, hours, minutes, seconds };
}
function cdTimerHTML(ms) {
  const p = cdParts(ms), pad = n => String(n).padStart(2, "0");
  if (p.past) return `<span class="cd-big">已过去</span><span class="cd-sub">${p.days}天 ${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}</span>`;
  return `<span class="cd-big">${p.days}<small>天</small></span><span class="cd-sub">${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}</span>`;
}
function nearestCountdown() {
  const now = Date.now(); let best = null, bd = Infinity;
  (state.countdowns || []).forEach(d => { const diff = cdTarget(d).getTime() - now; if (diff < bd) { bd = diff; best = d; } });
  return best ? { d: best, diff: bd } : null;
}

/* ---------- 首页 ---------- */
function renderHome() {
  const main = document.getElementById("app-main");
  const today = todayStr();

  // 今日统计
  const fitToday = state.life.fitness.find(g => g.date === today);
  const fitCount = fitToday ? fitToday.tasks.length : 0;
  const dietToday = state.life.diet.find(d => d.date === today);
  const kcal = dietToday ? dietToday.items.reduce((s, i) => s + (Number(i.kcal) || 0), 0) : 0;
  const wtArr = [...state.life.weight].sort((a, b) => a.date.localeCompare(b.date));
  const latestW = wtArr.length ? wtArr[wtArr.length - 1].weight : null;

  const allTasks = state.todo.flatMap(g => g.tasks);
  const doneTasks = allTasks.filter(t => t.done).length;
  const totalTasks = allTasks.length;

  const weekCheck = new Set();
  for (let i = 0; i < 7; i++) {
    const d = daysAgoStr(i);
    if (state.todo.some(g => g.date === d && g.tasks.some(t => t.done)) ||
      state.life.fitness.some(g => g.date === d && g.tasks.some(t => t.done)) ||
      state.skincare.cats.some(c => c.doneDates.includes(d))) weekCheck.add(d);
  }

  const skinToday = state.skincare.cats.filter(c => c.doneDates.includes(today)).length;

  // 本周打卡条
  const weekDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = daysAgoStr(i);
    const active = state.todo.some(g => g.date === d && g.tasks.some(t => t.done)) ||
      state.life.fitness.some(g => g.date === d && g.tasks.some(t => t.done)) ||
      state.skincare.cats.some(c => c.doneDates.includes(d));
    weekDays.push({ d, dow: weekDay(d), dom: d.slice(8), active, isToday: d === today });
  }

  // 顶部可视化：倒计时（实时跳动，点它即可设置你自己的目标时间）
  const nn = nearestCountdown();
  let cdHeroHTML;
  if (nn) {
    cdHeroHTML = `<div class="cd-hero" data-module="countdown" id="cd-hero">
      <div class="cd-hero-label">⏳ ${esc(nn.d.title)}</div>
      <div class="cd-hero-time" id="cd-timer">${cdTimerHTML(nn.diff)}</div>
      <div class="cd-hero-hint">${nn.diff < 0 ? "已结束 · 点击修改" : "点击修改 / 添加更多"}</div>
    </div>`;
  } else {
    cdHeroHTML = `<div class="cd-hero empty" data-module="countdown" id="cd-hero">
      <div class="cd-hero-label">⏳ 倒计时</div>
      <div class="cd-hero-time" id="cd-timer">点击设置你的目标时间</div>
      <div class="cd-hero-hint">如：考试 / 出国 / 生日</div>
    </div>`;
  }

  main.innerHTML = cdHeroHTML + `
    <div class="stat-grid">
      <div class="stat-card" data-module="life"><div class="emoji">🏃</div><div class="value">${fitCount}<small>/${Math.max(3, fitCount)}</small></div><div class="label">今日运动</div></div>
      <div class="stat-card" data-module="life"><div class="emoji">🍱</div><div class="value">${kcal}</div><div class="label">摄入 kcal</div></div>
      <div class="stat-card" data-module="life"><div class="emoji">⚖️</div><div class="value">${latestW != null ? latestW : "--"}<small>${latestW != null ? "kg" : ""}</small></div><div class="label">最新 kg</div></div>
      <div class="stat-card" data-module="todo"><div class="emoji">✅</div><div class="value">${doneTasks}</div><div class="label">今日完成</div></div>
      <div class="stat-card" data-module="todo"><div class="emoji">📋</div><div class="value">${totalTasks}</div><div class="label">计划项目</div></div>
      <div class="stat-card" data-module="skincare"><div class="emoji">🔥</div><div class="value">${weekCheck.size}</div><div class="label">本周打卡</div></div>
    </div>

    <div class="section-title">📅 本周打卡</div>
    <div class="week-strip">
      ${weekDays.map(d => `<div class="week-day ${d.isToday ? "active" : ""}" data-day="${d.d}">
        <span class="dow">${d.dow}</span>
        <span class="dom">${d.dom}</span>
        <span class="dot">${d.active ? "●" : "·"}</span>
      </div>`).join("")}
    </div>

    <div class="section-title">⚡ 今日速览</div>
    <div class="quick-list">
      ${renderQuickRow("✅", "To Do", `${doneTasks}/${totalTasks} 完成`, "todo")}
      ${renderQuickRow("🧴", "每日护肤", `${skinToday}/${state.skincare.cats.length} 已做`, "skincare")}
      ${renderQuickRow("📚", "韩语语法", grammarProgressText(), "grammar")}
      ${renderQuickRow("💸", "本月花销", monthExpenseText(), "expense")}
    </div>
  `;

  main.querySelectorAll("[data-module]").forEach(el => el.onclick = () => openModuleModal(el.dataset.module));
  main.querySelectorAll("[data-day]").forEach(el => el.onclick = () => openDaySummary(el.dataset.day));

  // 顶部倒计时实时跳动（每秒刷新）
  if (homeTickTimer) { clearInterval(homeTickTimer); homeTickTimer = null; }
  if (nearestCountdown()) {
    homeTickTimer = setInterval(() => {
      const el = document.getElementById("cd-timer");
      if (!el) { clearInterval(homeTickTimer); homeTickTimer = null; return; }
      const n = nearestCountdown();
      if (n) el.innerHTML = cdTimerHTML(n.diff);
    }, 1000);
  }
}
function renderQuickRow(icon, title, sub, id) {
  return `<div class="quick-row" data-module="${id}">
    <span class="icon">${icon}</span>
    <div class="info"><b>${esc(title)}</b><span>${esc(sub)}</span></div>
    <button class="action">›</button>
  </div>`;
}
function openDaySummary(date) {
  const wd = weekDay(date);
  const todoGroup = state.todo.find(g => g.date === date);
  const todoTasks = todoGroup ? todoGroup.tasks : [];
  const fitGroup = state.life.fitness.find(g => g.date === date);
  const fitTasks = fitGroup ? fitGroup.tasks : [];
  const dietDay = state.life.diet.find(d => d.date === date);
  const dietItems = dietDay ? dietDay.items : [];
  const skinCats = state.skincare.cats.filter(c => c.doneDates.includes(date));

  const todoHTML = todoTasks.length
    ? todoTasks.map(t => `<div class="day-li ${t.done ? "done" : ""}"><span>${t.done ? "✓" : "○"}</span> ${esc(t.text)}</div>`).join("")
    : `<div class="empty" style="padding:8px 0">没有任务</div>`;
  const fitHTML = fitTasks.length
    ? fitTasks.map(t => `<div class="day-li ${t.done ? "done" : ""}"><span>${t.done ? "✓" : "○"}</span> ${esc(t.text)}</div>`).join("")
    : `<div class="empty" style="padding:8px 0">没有运动记录</div>`;
  const dietHTML = dietItems.length
    ? dietItems.map(i => `<div class="day-li"><span>🍱</span> ${esc(i.name)} ${Number(i.kcal) || 0} kcal</div>`).join("")
    : `<div class="empty" style="padding:8px 0">没有饮食记录</div>`;
  const skinHTML = skinCats.length
    ? skinCats.map(c => `<div class="day-li"><span>${SKIN_EMOJI[c.name] || "🧴"}</span> ${esc(c.name)}</div>`).join("")
    : `<div class="empty" style="padding:8px 0">没有护肤记录</div>`;

  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-backdrop" data-back>
    <div class="modal" style="max-height:84vh;width:min(480px,94%)">
      <div class="modal-head">${date} 星期${wd}<a class="modal-x" data-close>×</a></div>
      <div class="modal-body">
        <div class="day-sec"><b>✅ To Do</b>${todoHTML}</div>
        <div class="day-sec"><b>🏃 运动</b>${fitHTML}</div>
        <div class="day-sec"><b>🍱 饮食</b>${dietHTML}</div>
        <div class="day-sec"><b>🧴 护肤</b>${skinHTML}</div>
      </div>
      <div class="modal-foot"><button class="btn" data-close>关闭</button></div>
    </div>
  </div>`;
  const backdrop = root.querySelector(".modal-backdrop");
  backdrop.querySelector("[data-close]").onclick = () => (root.innerHTML = "");
  backdrop.onclick = (e) => { if (e.target === backdrop) root.innerHTML = ""; };
}
function grammarProgressText() {
  let total = 0, done = 0;
  state.grammar.books.forEach(b => b.chapters.forEach(c => { total++; if (c.learned) done++; }));
  return `${done}/${total} 章节`;
}
function monthExpenseText() {
  const mk = monthKey();
  const total = state.expense.filter(e => e.date && e.date.startsWith(mk)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return money(total);
}

/* ---------- 模块页 ---------- */
function renderModules() {
  const main = document.getElementById("app-main");

  // 本周打卡（最近 7 天，任一日完成 To Do / 运动 / 护肤即算打卡）
  const weekCheck = new Set();
  const weekDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = daysAgoStr(i);
    const on = state.todo.some(g => g.date === d && g.tasks.some(t => t.done)) ||
      state.life.fitness.some(g => g.date === d && g.tasks.some(t => t.done)) ||
      state.skincare.cats.some(c => c.doneDates.includes(d));
    if (on) weekCheck.add(d);
    weekDays.push({ d, dow: weekDay(d), on, isToday: d === todayStr() });
  }
  const checkCount = weekCheck.size;
  const pct = Math.round(checkCount / 7 * 100);
  const progressHTML = `
    <div class="card">
      <div class="card-head">
        <span class="card-icon">🔥</span>
        <span class="card-title">本周打卡进度</span>
        <span class="chip">${checkCount}/7 天</span>
      </div>
      <div class="card-body">
        <div class="wp-bar">
          ${weekDays.map(x => `<div class="wp-seg ${x.on ? "on" : ""} ${x.isToday ? "today" : ""}" title="${x.d} 周${x.dow}${x.on ? " · 已打卡" : ""}"><span>${x.dow}</span></div>`).join("")}
        </div>
        <div class="wp-foot">
          <div class="pbar"><i style="width:${pct}%"></i></div>
          <div class="wp-text">本周已打卡 ${checkCount} 天，完成度 ${pct}%</div>
        </div>
      </div>
    </div>`;

  main.innerHTML = progressHTML + `<div class="module-grid">
    ${MODULES.filter(m => m.id !== "brain").map(m => {
      const badge = moduleBadge(m.id);
      const prog = moduleProgress(m.id);
      return `<button class="module-tile" data-module="${m.id}" style="position:relative">
        ${badge ? `<span class="badge">${badge}</span>` : ""}
        <span class="icon">${m.icon}</span>
        <span class="name">${esc(m.title)}</span>
        <span class="mt-prog"><span class="mt-bar"><i style="width:${prog.pct}%"></i></span><span class="mt-text">${esc(prog.text)}</span></span>
      </button>`;
    }).join("")}
  </div>`;
  main.querySelectorAll("[data-module]").forEach(b => b.onclick = () => openModuleModal(b.dataset.module));
}
function moduleBadge(id) {
  const today = todayStr();
  if (id === "todo") {
    const undone = state.todo.flatMap(g => g.tasks).filter(t => !t.done).length;
    return undone || "";
  }
  if (id === "skincare") {
    const n = state.skincare.cats.filter(c => c.doneDates.includes(today)).length;
    return n || "";
  }
  if (id === "expense") return state.expense.filter(e => e.date === today).length || "";
  return "";
}
/* 每个小模块的进度（有每日打卡数据的按「本周 7 天」计算，其余按完成度计算） */
function weekDaysSet() {
  const s = new Set();
  for (let i = 0; i < 7; i++) s.add(daysAgoStr(i));
  return s;
}
function moduleProgress(id) {
  const last7 = weekDaysSet();
  switch (id) {
    case "todo": {
      const days = new Set();
      state.todo.forEach(g => { if (last7.has(g.date) && g.tasks.some(t => t.done)) days.add(g.date); });
      return { pct: Math.round(days.size / 7 * 100), text: `本周打卡 ${days.size}/7 天` };
    }
    case "life": {
      const days = new Set();
      state.life.fitness.forEach(g => { if (last7.has(g.date) && g.tasks.some(t => t.done)) days.add(g.date); });
      state.life.diet.forEach(g => { if (last7.has(g.date) && (g.items || []).length) days.add(g.date); });
      return { pct: Math.round(days.size / 7 * 100), text: `本周打卡 ${days.size}/7 天` };
    }
    case "skincare": {
      const days = new Set();
      state.skincare.cats.forEach(c => c.doneDates.forEach(d => { if (last7.has(d)) days.add(d); }));
      return { pct: Math.round(days.size / 7 * 100), text: `本周打卡 ${days.size}/7 天` };
    }
    case "grammar": {
      const days = new Set();
      state.grammar.books.forEach(b => b.chapters.forEach(c => (c.checkins || []).forEach(d => { if (last7.has(d)) days.add(d); })));
      return { pct: Math.round(days.size / 7 * 100), text: `本周打卡 ${days.size}/7 天` };
    }
    case "vocabpractice": {
      const total = state.vocabPractice.lessons.length;
      const done = state.vocabPractice.lessons.filter(l => l.done).length;
      return { pct: total ? Math.round(done / total * 100) : 0, text: `完成 ${done}/${total} 课` };
    }
    case "expense": {
      const n = state.expense.filter(e => e.date && e.date.slice(0, 7) === todayStr().slice(0, 7)).length;
      return { pct: Math.min(100, n * 20), text: `本月 ${n} 笔` };
    }
    case "inspiration": {
      const n = state.inspiration.length;
      return { pct: Math.min(100, n * 10), text: `${n} 条灵感` };
    }
    case "gratitude": {
      const n = state.gratitude.length;
      return { pct: Math.min(100, n * 10), text: `${n} 篇日记` };
    }
    case "applications": {
      const total = state.applications.length;
      const done = state.applications.filter(a => a.status === "已完成").length;
      return total ? { pct: Math.round(done / total * 100), text: `${done}/${total} 完成` } : { pct: 0, text: "未添加" };
    }
    case "visa": {
      const total = state.visa.length;
      const done = state.visa.filter(v => v.status === "已完成").length;
      return total ? { pct: Math.round(done / total * 100), text: `${done}/${total} 步` } : { pct: 0, text: "未添加" };
    }
    case "countdown": {
      const n = (state.countdowns || []).length;
      return { pct: n ? 100 : 0, text: n ? `${n} 个目标` : "未设置" };
    }
  }
  return { pct: 0, text: "" };
}

function openModuleModal(id) {
  const m = MODULES.find(x => x.id === id);
  if (!m) return;
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-backdrop" data-back>
    <div class="modal" style="max-height:86vh;width:min(520px,94%)">
      <div class="modal-head"><span>${m.icon} ${esc(m.title)}</span><a class="modal-x" data-close>×</a></div>
      <div class="modal-body" id="module-modal-body"></div>
    </div>
  </div>`;
  const backdrop = root.querySelector(".modal-backdrop");
  backdrop.querySelector("[data-close]").onclick = () => (root.innerHTML = "");
  backdrop.onclick = (e) => { if (e.target === backdrop) root.innerHTML = ""; };
  m.render(document.getElementById("module-modal-body"));
}

/* ---------- 第二大脑 ---------- */
function renderSecondBrainPage() {
  const main = document.getElementById("app-main");
  const tags = [...new Set(state.secondBrain.flatMap(n => n.tags || []))];
  main.innerHTML = `
    <div class="brain-search"><input id="brain-search" placeholder="搜索想法、笔记、灵感…" /></div>
    <div class="brain-tags" id="brain-tags">
      <button class="brain-tag active" data-tag="">全部</button>
      ${tags.map(t => `<button class="brain-tag" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}
    </div>
    <div id="brain-list"></div>
    <button class="brain-fab" id="brain-add">+</button>
  `;
  let activeTag = "";
  const searchEl = main.querySelector("#brain-search");
  function draw() {
    const q = (searchEl.value || "").trim().toLowerCase();
    const list = document.getElementById("brain-list");
    const filtered = state.secondBrain.filter(n => {
      if (activeTag && !(n.tags || []).includes(activeTag)) return false;
      if (!q) return true;
      return (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q) || (n.tags || []).some(t => t.toLowerCase().includes(q));
    }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    list.innerHTML = filtered.length ? filtered.map(n => `<div class="brain-note" data-id="${n.id}">
      <div class="ntitle">${esc(n.title || "未命名笔记")}</div>
      <div class="nbody">${esc(n.body || "")}</div>
      <div class="nmeta">
        ${(n.tags || []).map(t => `<span class="ntag">${esc(t)}</span>`).join("")}
        <span class="ndate">${esc(n.date || "")}</span>
      </div>
    </div>`).join("") : `<div class="empty">还没有笔记，点击右下角 + 添加</div>`;
    list.querySelectorAll(".brain-note").forEach(el => el.onclick = () => openBrainNote(el.dataset.id));
  }
  draw();
  searchEl.oninput = draw;
  main.querySelectorAll("#brain-tags .brain-tag").forEach(b => b.onclick = () => {
    activeTag = b.dataset.tag;
    main.querySelectorAll("#brain-tags .brain-tag").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    draw();
  });
  main.querySelector("#brain-add").onclick = () => openBrainNote(null);
}
function openBrainNote(id) {
  const note = id ? state.secondBrain.find(n => n.id === id) : null;
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-backdrop" data-back>
    <div class="modal">
      <div class="modal-head">${note ? "编辑笔记" : "新想法"}<a class="modal-x" data-close>×</a></div>
      <div class="modal-body">
        <input id="bn-title" placeholder="标题" value="${esc(note ? note.title : "")}" style="margin-bottom:10px" />
        <textarea id="bn-body" placeholder="写下你的想法、灵感、知识碎片…" style="min-height:120px;margin-bottom:10px">${esc(note ? note.body : "")}</textarea>
        <input id="bn-tags" placeholder="标签，用空格或逗号分隔，如 灵感 韩语 计划" value="${esc(note ? (note.tags || []).join(" ") : "")}" />
      </div>
      <div class="modal-foot">
        ${note ? '<button class="btn ghost" id="bn-del">删除</button>' : ""}
        <button class="btn" data-close>取消</button>
        <button class="btn" id="bn-save">保存</button>
      </div>
    </div>
  </div>`;
  const backdrop = root.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach(b => b.onclick = () => (root.innerHTML = ""));
  backdrop.onclick = (e) => { if (e.target === backdrop) root.innerHTML = ""; };
  const saveBtn = root.querySelector("#bn-save");
  saveBtn.onclick = () => {
    const title = root.querySelector("#bn-title").value.trim();
    const body = root.querySelector("#bn-body").value.trim();
    const tags = root.querySelector("#bn-tags").value.split(/[\s,，]+/).map(t => t.trim()).filter(Boolean);
    if (!title && !body) return toast("写点什么吧");
    if (note) {
      note.title = title; note.body = body; note.tags = tags;
    } else {
      state.secondBrain.push({ id: uid(), title, body, tags, date: todayStr() });
    }
    save(); renderSecondBrainPage(); root.innerHTML = ""; toast("已保存");
  };
  const delBtn = root.querySelector("#bn-del");
  if (delBtn) delBtn.onclick = () => {
    if (!confirm("删除这条笔记？")) return;
    state.secondBrain = state.secondBrain.filter(n => n.id !== id);
    save(); renderSecondBrainPage(); root.innerHTML = ""; toast("已删除");
  };
}

/* ---------- 我的 ---------- */
function renderMe() {
  const main = document.getElementById("app-main");
  main.innerHTML = `
    <div class="me-card">
      <div class="me-avatar">${esc((state.settings.userName || "V").slice(0, 1))}</div>
      <div class="me-name">${esc(state.settings.userName || "Vivian")}</div>
      <div class="me-status">${authToken ? "已登录 · 数据云端同步中" : "未登录 · 数据仅存在本机"}</div>
    </div>
    <div class="me-menu">
      <button class="me-item" id="me-auth"><span class="icon">${authToken ? "🚪" : "🔑"}</span><span class="text">${authToken ? "退出登录" : "登录 / 注册"}</span><span class="arrow">›</span></button>
      <button class="me-item" id="me-theme"><span class="icon">🎨</span><span class="text">主题色</span><span class="arrow">›</span></button>
      <button class="me-item" id="me-name"><span class="icon">✏️</span><span class="text">修改称呼</span><span class="arrow">›</span></button>
      <button class="me-item" id="me-clear"><span class="icon">🗑</span><span class="text">清空所有数据</span><span class="arrow">›</span></button>
    </div>
  `;
  main.querySelector("#me-auth").onclick = onAuthClick;
  main.querySelector("#me-theme").onclick = openThemePicker;
  main.querySelector("#me-name").onclick = () => {
    const n = prompt("怎么称呼你？", state.settings.userName || "Vivian");
    if (n && n.trim()) { state.settings.userName = n.trim(); save(); renderHeader(); renderMe(); toast("已更新"); }
  };
  main.querySelector("#me-clear").onclick = () => {
    if (!confirm("确定清空所有数据？此操作不可恢复。")) return;
    state = defaultState(); save(); applyTheme(); renderHeader(); renderMe(); toast("已清空");
  };
}
function openThemePicker() {
  const root = document.getElementById("modal-root");
  const swatches = ACCENTS.map(a => `<span class="swatch ${a === state.settings.accent ? "active" : ""}" data-accent="${a}" style="background:${a}"></span>`).join("");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal">
    <div class="modal-head">🎨 主题色<a class="modal-x" data-close>×</a></div>
    <div class="modal-body">
      <div class="swatch-row">${swatches}
        <input type="color" id="set-accent" value="${state.settings.accent}" style="width:40px;height:34px;padding:2px;cursor:pointer" />
      </div>
      <div class="muted" style="font-weight:700">背景颜色</div>
      <input type="color" id="set-bg" value="${state.settings.bgColor}" style="margin:6px 0 12px;width:100%;height:36px;padding:2px;cursor:pointer" />
      <div class="muted" style="font-weight:700">副标题</div>
      <input id="set-sub" value="${esc(state.settings.showSub)}" style="margin:6px 0 14px" />
    </div>
    <div class="modal-foot"><button class="btn" data-close>完成</button></div>
  </div></div>`;
  const backdrop = root.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach(b => b.onclick = () => (root.innerHTML = ""));
  root.querySelectorAll("[data-accent]").forEach(s => s.onclick = () => {
    state.settings.accent = s.dataset.accent;
    save(); applyTheme(); renderHeader();
    root.querySelectorAll("[data-accent]").forEach(x => x.classList.remove("active"));
    s.classList.add("active");
    root.querySelector("#set-accent").value = s.dataset.accent;
  });
  root.querySelector("#set-accent").oninput = e => { state.settings.accent = e.target.value; save(); applyTheme(); renderHeader(); };
  root.querySelector("#set-bg").oninput = e => { state.settings.bgColor = e.target.value; save(); applyTheme(); };
  root.querySelector("#set-sub").oninput = e => { state.settings.showSub = e.target.value; save(); };
}

/* =========================================================================
   标签切换
   ========================================================================= */
let currentTab = "home";
let homeTickTimer = null;
function switchTab(tab) {
  if (homeTickTimer) { clearInterval(homeTickTimer); homeTickTimer = null; }
  currentTab = tab;
  document.querySelectorAll(".tab-item").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  if (tab === "home") renderHome();
  else if (tab === "modules") renderModules();
  else if (tab === "brain") renderSecondBrainPage();
  else if (tab === "me") renderMe();
}
function setupTabs() {
  document.querySelectorAll(".tab-item").forEach(t => t.onclick = () => switchTab(t.dataset.tab));
}

/* =========================================================================
   以下保留原有模块渲染函数，仅做最小兼容调整
   ========================================================================= */

/* ---------- 倒计时 ---------- */
function renderCountdown(c) {
  c.innerHTML = `
    <div class="muted">设置你重要的日子，顶栏会实时倒计时。可添加多个，最近的显示在首页最上方。</div>
    <div class="form-grid">
      <input placeholder="事件名称，如 韩国入学" id="cd-title" />
      <input type="date" id="cd-date" />
      <input type="time" id="cd-time" />
      <button class="btn full" id="cd-add">+ 添加倒计时</button>
    </div>
    <div class="list" id="cd-list"></div>`;
  const listEl = c.querySelector("#cd-list");
  const pad = n => String(n).padStart(2, "0");
  function draw() {
    if (!state.countdowns.length) { listEl.innerHTML = `<div class="empty">添加一个重要的日子吧 ✨</div>`; return; }
    listEl.innerHTML = state.countdowns.slice().sort((a, b) => cdTarget(a) - cdTarget(b)).map(d => {
      const diff = cdTarget(d).getTime() - Date.now();
      const p = cdParts(diff);
      const rem = p.past
        ? `已过去 ${p.days}天 ${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`
        : `${p.days}天 ${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)} 后`;
      return `<div class="item"><button class="del" data-del="${d.id}">×</button>
        <div style="font-weight:700">${esc(d.title)}</div>
        <div class="muted">${esc(d.date)}${d.time ? (" " + esc(d.time)) : ""}</div>
        <div class="countdown-big" style="${p.past ? "color:var(--ink-soft)" : ""}">${rem}</div></div>`;
    }).join("");
    listEl.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      state.countdowns = state.countdowns.filter(x => x.id !== b.dataset.del); save(); draw();
    });
  }
  draw();
  c.querySelector("#cd-add").onclick = () => {
    const title = c.querySelector("#cd-title").value.trim();
    const date = c.querySelector("#cd-date").value;
    if (!title || !date) return toast("请填写名称和日期");
    const time = c.querySelector("#cd-time").value || "00:00";
    state.countdowns.push({ id: uid(), title, date, time });
    save(); c.querySelector("#cd-title").value = ""; c.querySelector("#cd-date").value = ""; c.querySelector("#cd-time").value = ""; draw(); renderHeader();
  };
}

/* ---------- 韩语语法进度 ---------- */
function renderGrammar(c) {
  const books = state.grammar.books;
  let totalCh = 0, learnedCh = 0;
  books.forEach(b => b.chapters.forEach(ch => { totalCh++; if (ch.learned) learnedCh++; }));
  const pct = totalCh ? Math.round(learnedCh / totalCh * 100) : 0;

  c.innerHTML = `
    <div class="muted">延世韩国语 5 册，点小框打开章节 → 写今天学的语法 + 上传打卡图。
      已掌握 <b style="color:var(--accent-deep)">${learnedCh}/${totalCh}</b> · ${pct}%
      <div class="pbar"><i style="width:${pct}%"></i></div></div>
    <div id="g-books"></div>`;
  const wrap = c.querySelector("#g-books");

  function findBook(chId) { return books.find(b => b.chapters.some(x => x.id === chId)); }
  function findCh(id) { for (const b of books) for (const ch of b.chapters) if (ch.id === id) return ch; return null; }

  function draw() {
    wrap.innerHTML = books.map((b, bi) => {
      const total = b.chapters.length;
      const done = b.chapters.filter(ch => ch.learned).length;
      const bpct = total ? Math.round(done / total * 100) : 0;
      const cells = b.chapters.map((ch, ci) => {
        ch.checkins = ch.checkins || [];
        const cls = ch.learned ? "done" : "open";
        const hasImg = ch.checkins.some(k => k.img);
        const cnt = ch.checkins.length;
        const label = (ch.title && ch.title.trim()) ? ch.title.trim() : `第 ${ci + 1} 课`;
        return `<button class="vp-cell ${cls}" data-ch="${ch.id}" title="${esc(b.name)} · ${esc(label)}（点开记录）">
          ${ch.learned ? '<span class="vp-check">✓</span>' : ''}
          <span class="vp-label">${esc(label)}</span>
          <small class="vp-pos">${bi + 1}-${ci + 1}</small>
          ${cnt ? `<i class="ci-dot">${cnt}</i>` : ''}
          ${hasImg ? '<span class="vp-cam">📷</span>' : ''}
        </button>`;
      }).join("");
      return `<div class="book">
        <div class="book-head">
          <span class="book-title">${esc(b.name)}</span>
          <span class="chip">${done}/${total} · ${bpct}%</span>
          <button class="btn ghost sm" data-addch="${b.id}" style="margin-left:auto">+ 章</button>
        </div>
        <div class="pbar"><i style="width:${bpct}%"></i></div>
        <div class="vp-grid">${cells}</div>
      </div>`;
    }).join("");
    wrap.querySelectorAll("[data-ch]").forEach(b => b.onclick = () => {
      const ch = findCh(b.dataset.ch);
      const bk = findBook(b.dataset.ch);
      if (ch && bk) openChapterModal(ch, bk, draw);
    });
    wrap.querySelectorAll("[data-addch]").forEach(b => b.onclick = () => {
      const bk = books.find(x => x.id === b.dataset.addch);
      if (bk) { bk.chapters.push({ id: uid(), title: `第 ${bk.chapters.length + 1} 课`, learned: false, checkins: [] }); save(); draw(); }
    });
  }

  function openChapterModal(ch, book, redraw) {
    ch.checkins = ch.checkins || [];
    const root = document.getElementById("modal-root");
    function paint() {
      root.innerHTML = `<div class="modal-backdrop" data-back>
        <div class="modal">
          <div class="modal-head">${esc(book.name)} · 章节<a class="modal-x" data-close>×</a></div>
          <div class="modal-body">
            <div class="muted" style="font-weight:700">章节名称</div>
            <input id="ch-title" value="${esc(ch.title)}" style="margin:6px 0 12px" />
            <div class="row" style="margin-bottom:12px">
              <button class="btn sm ${ch.learned ? "soft" : ""}" id="ch-learned">${ch.learned ? "✓ 已掌握" : "标记已掌握"}</button>
              <button class="btn ghost sm" id="ch-del">🗑 删除本章</button>
            </div>
            <div class="muted" style="font-weight:700">今天学了哪些语法</div>
            <textarea id="ch-note" placeholder="记录今天学习的语法点…" style="margin:6px 0"></textarea>
            <div class="row" style="margin-bottom:12px">
              <button class="btn full sm" id="ch-addnote">+ 添加文字记录</button>
              <button class="btn ghost full sm" id="ch-addpic">📷 上传打卡图</button>
            </div>
            <div class="muted" style="font-weight:700">打卡记录（${ch.checkins.length}）</div>
            <div class="list" id="ch-checkins"></div>
          </div>
          <div class="modal-foot"><button class="btn" data-close>完成</button></div>
        </div></div>`;
      const backdrop = root.querySelector(".modal-backdrop");
      backdrop.querySelectorAll("[data-close]").forEach(x => x.onclick = () => (root.innerHTML = ""));
      backdrop.onclick = (e) => { if (e.target === backdrop) root.innerHTML = ""; };
      root.querySelector("#ch-title").oninput = e => { ch.title = e.target.value; save(); redraw(); };
      root.querySelector("#ch-learned").onclick = () => { ch.learned = !ch.learned; save(); renderHeader(); redraw(); paint(); };
      root.querySelector("#ch-del").onclick = () => {
        if (!confirm("确定删除本章？")) return;
        book.chapters = book.chapters.filter(x => x.id !== ch.id);
        save(); renderHeader(); redraw(); root.innerHTML = "";
      };
      root.querySelector("#ch-addnote").onclick = () => {
        const t = root.querySelector("#ch-note").value.trim();
        if (!t) return toast("写点内容");
        ch.checkins.push({ date: todayStr(), note: t, img: null });
        root.querySelector("#ch-note").value = ""; save(); redraw(); renderCheckins();
      };
      root.querySelector("#ch-addpic").onclick = () => {
        uploadImage(id => { ch.checkins.push({ date: todayStr(), note: "", img: id }); save(); redraw(); renderCheckins(); });
      };
      renderCheckins();
    }
    function renderCheckins() {
      const el = root.querySelector("#ch-checkins");
      if (!ch.checkins.length) { el.innerHTML = `<div class="empty">还没有打卡记录</div>`; return; }
      el.innerHTML = ch.checkins.map((k, idx) => `
        <div class="item">
          <button class="del" data-delci="${idx}">×</button>
          <div style="font-size:13px;padding-right:16px">${k.note ? esc(k.note) : '<span class="muted">（仅图片打卡）</span>'}<br><span class="muted">${esc(k.date)}</span></div>
          ${k.img ? `<div class="thumbs"><span class="thumb" data-img="${k.img}"></span></div>` : ""}
        </div>`).join("");
      hydrateImages(el);
      el.querySelectorAll("[data-delci]").forEach(b => b.onclick = () => {
        ch.checkins.splice(+b.dataset.delci, 1); save(); redraw(); renderCheckins();
      });
    }
    paint();
  }
  draw();
}

/* ---------- 每日护肤 ---------- */
function renderSkincare(c) {
  const cats = state.skincare.cats;
  const today = todayStr();
  const doneToday = cats.filter(cat => cat.doneDates.includes(today)).length;
  const pct = cats.length ? Math.round(doneToday / cats.length * 100) : 0;

  c.innerHTML = `
    <div class="muted">点卡片记录今天做了什么、传图、写下感受和看法。今日完成 <b style="color:var(--accent-deep)">${doneToday}/${cats.length}</b></div>
    <div class="pbar" style="margin:6px 0 12px"><i style="width:${pct}%"></i></div>
    <div class="sk-grid" id="sk-grid"></div>
    <button class="btn soft sm" id="sk-addcat" style="margin-top:10px;width:100%">+ 添加分类</button>`;
  const grid = c.querySelector("#sk-grid");

  function draw() {
    grid.innerHTML = cats.map(cat => {
      const doneToday = cat.doneDates.includes(today);
      const eCnt = cat.entries.length;
      const hasImg = cat.entries.some(e => e.img);
      const cls = doneToday ? "done" : "open";
      return `<button class="sk-cell ${cls}" data-cat="${cat.id}" title="${esc(cat.name)}：点开记录">
        <span class="sk-emoji">${SKIN_EMOJI[cat.name] || "🧴"}</span>
        <small>${esc(cat.name)}</small>
        ${doneToday ? `<i class="ci-dot">✓</i>` : ""}
        ${eCnt ? `<span class="sk-cnt">${eCnt}</span>` : ""}
        ${hasImg ? `<span class="sk-cam">📷</span>` : ""}
      </button>`;
    }).join("");
    grid.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => {
      const cat = cats.find(x => x.id === b.dataset.cat);
      if (cat) openSkincareModal(cat, draw);
    });
  }
  draw();
  c.querySelector("#sk-addcat").onclick = () => {
    const name = prompt("新分类名称（如 颈膜、护手霜…）", "");
    if (!name) return;
    const t = name.trim();
    if (!t) return;
    if (state.skincare.cats.some(cat => cat.name === t)) return toast("已存在该分类");
    state.skincare.cats.push({ id: uid(), name: t, doneDates: [], entries: [] });
    save(); renderHeader(); draw();
  };
}

function openSkincareModal(cat, redraw) {
  const root = document.getElementById("modal-root");
  const today = todayStr();
  const doneToday = cat.doneDates.includes(today);
  root.innerHTML = `<div class="modal-backdrop"><div class="modal">
    <div class="modal-head">${SKIN_EMOJI[cat.name] || "🧴"} ${esc(cat.name)} · 护肤记录<a class="modal-x" data-close>×</a></div>
    <div class="modal-body">
      <div class="row" style="margin-bottom:12px">
        <button class="btn sm ${doneToday ? "soft" : ""}" id="sk-done">${doneToday ? "✓ 今天已做" : "标记今天做了"}</button>
        <button class="btn ghost sm" id="sk-delcat">🗑 删除分类</button>
      </div>
      <div class="muted" style="font-weight:700">我的意见和看法</div>
      <textarea id="sk-note" placeholder="写下今天用「${esc(cat.name)}」的感受、效果、心得…" style="margin:6px 0"></textarea>
      <div class="row" style="margin-bottom:12px">
        <button class="btn full sm" id="sk-addnote">+ 添加记录</button>
        <button class="btn ghost full sm" id="sk-addpic">📷 上传图片</button>
      </div>
      <div class="muted" style="font-weight:700">全部记录（${cat.entries.length}）</div>
      <div class="list" id="sk-entries"></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>完成</button></div>
  </div></div>`;
  const backdrop = root.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach(b => b.onclick = () => (root.innerHTML = ""));

  root.querySelector("#sk-done").onclick = () => {
    const i = cat.doneDates.indexOf(today);
    if (i >= 0) cat.doneDates.splice(i, 1); else cat.doneDates.push(today);
    save(); renderHeader(); redraw(); openSkincareModal(cat, redraw);
  };
  root.querySelector("#sk-delcat").onclick = () => {
    if (!confirm(`确定删除「${cat.name}」分类？所有记录会一并删除。`)) return;
    state.skincare.cats = state.skincare.cats.filter(x => x.id !== cat.id);
    save(); renderHeader(); redraw(); root.innerHTML = "";
  };
  root.querySelector("#sk-addnote").onclick = () => {
    const t = root.querySelector("#sk-note").value.trim();
    if (!t) return toast("写点内容吧～");
    cat.entries.push({ id: uid(), date: today, text: t, img: null });
    root.querySelector("#sk-note").value = ""; save(); redraw(); renderEntries();
  };
  root.querySelector("#sk-addpic").onclick = () => {
    uploadImage(id => { cat.entries.push({ id: uid(), date: today, text: "", img: id }); save(); redraw(); renderEntries(); });
  };
  function renderEntries() {
    const el = root.querySelector("#sk-entries");
    if (!cat.entries.length) { el.innerHTML = `<div class="empty">还没有记录，添加一条吧</div>`; return; }
    el.innerHTML = [...cat.entries].reverse().map((e, i) => {
      const realIdx = cat.entries.length - 1 - i;
      return `<div class="item sk-entry" data-entry="${realIdx}">
        <button class="del" data-delentry="${realIdx}">×</button>
        <div style="font-size:13px;padding-right:16px">${e.text ? esc(e.text) : '<span class="muted">（仅图片记录）</span>'}<br><span class="muted">${esc(e.date)}</span></div>
        ${e.img ? `<div class="thumbs"><span class="thumb" data-img="${e.img}"></span></div>` : ""}
        <span class="muted" style="font-size:11px;align-self:center">点开 ↗</span>
      </div>`;
    }).join("");
    hydrateImages(el);
    el.querySelectorAll("[data-delentry]").forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      cat.entries.splice(+b.dataset.delentry, 1); save(); redraw(); renderEntries();
    });
    el.querySelectorAll("[data-entry]").forEach(b => b.onclick = () => {
      const e = cat.entries[+b.dataset.entry];
      if (e) openSkincareEntryModal(cat, e, redraw, renderEntries);
    });
  }
  renderEntries();
}

function openSkincareEntryModal(cat, entry, redraw, parentRender) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal">
    <div class="modal-head">${SKIN_EMOJI[cat.name] || "🧴"} ${esc(cat.name)} · 记录详情<a class="modal-x" data-close>×</a></div>
    <div class="modal-body">
      <div class="muted" style="font-weight:700">图片</div>
      <div id="se-img" style="margin:6px 0"></div>
      <button class="btn ghost full sm" id="se-addpic" style="margin-bottom:12px">📷 换 / 加图片</button>
      <div class="muted" style="font-weight:700">我的意见和看法</div>
      <textarea id="se-text" style="margin:6px 0">${esc(entry.text)}</textarea>
      <div class="row">
        <button class="btn sm" id="se-save">保存</button>
        <button class="btn ghost sm" id="se-del">🗑 删除</button>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>返回</button></div>
  </div></div>`;
  const backdrop = root.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach(b => b.onclick = () => (root.innerHTML = ""));
  function drawImg() {
    const box = root.querySelector("#se-img");
    if (entry.img) {
      getImg(entry.img).then(d => {
        if (d) box.innerHTML = `<img src="${d}" style="max-width:100%;max-height:240px;border-radius:12px;cursor:pointer" onclick="(function(){var r=document.getElementById('modal-root');r.innerHTML='<div class=\\'modal-backdrop\\' data-close><img src=\\'${d}\\' style=\\'max-width:92vw;max-height:88vh;border-radius:14px\\'/></div>';r.querySelector('[data-close]').onclick=function(){r.innerHTML='';};})()" alt="" />`;
      });
    } else box.innerHTML = `<div class="empty">没有图片，点上面上传</div>`;
  }
  drawImg();
  root.querySelector("#se-addpic").onclick = () => {
    uploadImage(id => { entry.img = id; save(); redraw(); parentRender(); drawImg(); });
  };
  root.querySelector("#se-save").onclick = () => {
    entry.text = root.querySelector("#se-text").value.trim();
    save(); parentRender(); toast("已保存 💾");
  };
  root.querySelector("#se-del").onclick = () => {
    if (!confirm("删除这条记录？")) return;
    cat.entries = cat.entries.filter(x => x.id !== entry.id);
    save(); redraw(); parentRender(); root.innerHTML = "";
  };
}

/* ---------- 韩语单词带练 ---------- */
function renderVocabPractice(c) {
  const vp = state.vocabPractice;
  const total = vp.lessons.length;
  const done = vp.lessons.filter(l => l.done).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const cur = currentLessonLabel();

  c.innerHTML = `
    <div class="muted" style="font-weight:700">🎬 跟练视频</div>
    <div class="item" style="display:flex;gap:10px;align-items:center">
      <div style="flex:1;font-size:12px">${esc(vp.videoTitle)}</div>
      <button class="btn sm" id="vp-open">▶ 打开跟练</button>
    </div>
    <div class="muted" style="margin-top:8px">已学到 <b style="color:var(--accent-deep)">${esc(cur)}</b> · 完成 ${done}/${total}（<span id="vp-pct">${pct}%</span>）</div>
    <div class="pbar"><i style="width:${pct}%"></i></div>
    <div class="muted" style="margin:8px 0 4px;font-size:11px">点击已解锁的课节即可标记完成，完成后自动解锁下一课 🔓</div>
    <div id="vp-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px"></div>

    <div class="muted" style="font-weight:700;margin:16px 0 4px">📒 我的生词本（${state.vocab.length}）</div>
    <div class="form-grid">
      <input placeholder="韩语单词" id="vb-word" />
      <input placeholder="中文意思" id="vb-mean" />
      <button class="btn full" id="vb-add">+ 添加单词</button>
    </div>
    <div class="list" id="vb-list"></div>`;

  const grid = c.querySelector("#vp-grid");
  function drawGrid() {
    grid.innerHTML = vp.lessons.map((l, i) => {
      const unlocked = i === 0 || vp.lessons[i - 1].done;
      const cls = l.done ? "done" : (unlocked ? "open" : "lock");
      const label = l.done ? "✓" : (unlocked ? "" : "🔒");
      return `<button class="vp-cell ${cls}" data-i="${i}" title="${esc(l.label)}">${label}<small>${esc(l.label)}</small></button>`;
    }).join("");
    grid.querySelectorAll("[data-i]").forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      const unlocked = i === 0 || vp.lessons[i - 1].done;
      if (!unlocked && !vp.lessons[i].done) return toast("先完成前面的课节解锁哦 🔒");
      vp.lessons[i].done = !vp.lessons[i].done;
      save(); renderHeader(); drawGrid();
      const cur2 = currentLessonLabel();
      const dn = vp.lessons.filter(l => l.done).length;
      const pct2 = total ? Math.round(dn / total * 100) : 0;
      c.querySelectorAll(".muted")[1].innerHTML =
        `已学到 <b style="color:var(--accent-deep)">${esc(cur2)}</b> · 完成 ${dn}/${total}（${pct2}%）`;
    });
  }
  c.querySelector("#vp-open").onclick = () => window.open(vp.videoUrl, "_blank", "noopener");

  const vbList = c.querySelector("#vb-list");
  function drawVocab() {
    vbList.innerHTML = state.vocab.length ? state.vocab.slice().reverse().map(v => `<div class="item">
      <button class="del" data-del="${v.id}">×</button>
      <div style="font-size:13px;padding-right:16px"><b>${esc(v.word)}</b> — ${esc(v.mean)}<br><span class="muted">${esc(v.date)}</span></div></div>`).join("")
      : `<div class="empty">生词本还是空的，记几个单词吧</div>`;
    vbList.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      state.vocab = state.vocab.filter(x => x.id !== b.dataset.del); save(); renderHeader(); drawVocab();
    });
  }
  drawVocab();
  c.querySelector("#vb-add").onclick = () => {
    const word = c.querySelector("#vb-word").value.trim();
    const mean = c.querySelector("#vb-mean").value.trim();
    if (!word) return toast("请输入单词");
    state.vocab.push({ id: uid(), word, mean, date: todayStr() });
    save(); c.querySelector("#vb-word").value = ""; c.querySelector("#vb-mean").value = ""; renderHeader(); drawVocab();
  };
  drawGrid();
}
function currentLessonLabel() {
  const ls = state.vocabPractice.lessons;
  const firstUndone = ls.find(l => !l.done);
  return firstUndone ? firstUndone.label : (ls.length ? ls[ls.length - 1].label : "—");
}

/* ---------- To Do ---------- */
function renderTodo(c) {
  c.innerHTML = `
    <div class="form-grid">
      <input type="date" id="td-date" value="${todayStr()}" />
      <input placeholder="添加一项任务…" id="td-text" />
      <button class="btn full" id="td-add">+ 添加任务</button>
    </div>
    <div class="list" id="td-list"></div>`;
  const listEl = c.querySelector("#td-list");
  function findGroup(date) {
    let g = state.todo.find(x => x.date === date);
    if (!g) { g = { date, tasks: [] }; state.todo.push(g); }
    return g;
  }
  function draw() {
    if (!state.todo.length) { listEl.innerHTML = `<div class="empty">还没有任务，添加一条吧</div>`; return; }
    const groups = [...state.todo].sort((a, b) => b.date.localeCompare(a.date));
    listEl.innerHTML = groups.map(g => {
      const total = g.tasks.length;
      const done = g.tasks.filter(t => t.done).length;
      const pct = total ? Math.round(done / total * 100) : 0;
      const tasks = [...g.tasks].sort((a, b) => a.done - b.done).map(t => `<div class="item" style="padding:7px 10px;display:flex;gap:9px;align-items:flex-start">
        <input type="checkbox" data-task="${g.date}|${t.id}" ${t.done ? "checked" : ""} style="width:17px;height:17px;accent-color:var(--accent);margin-top:2px;flex:none"/>
        <span style="${t.done ? "text-decoration:line-through;color:var(--ink-soft)" : ""};font-size:13px;flex:1">${esc(t.text)}</span>
        <button class="del" data-deltask="${g.date}|${t.id}">×</button>
      </div>`).join("");
      return `<div class="item" style="border-left:3px solid var(--accent)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <b style="font-size:13px">📅 ${esc(g.date)}</b>
          <span class="chip">${done}/${total}</span>
          <button class="del" data-delgroup="${g.date}">×</button>
        </div>
        <div class="pbar" style="margin:6px 0"><i style="width:${pct}%"></i></div>
        ${tasks}
      </div>`;
    }).join("");
    listEl.querySelectorAll("[data-task]").forEach(b => b.onchange = () => {
      const [d, iid] = b.dataset.task.split("|");
      const g = state.todo.find(x => x.date === d); const t = g && g.tasks.find(x => x.id === iid);
      if (t) { t.done = b.checked; save(); draw(); renderHeader(); }
    });
    listEl.querySelectorAll("[data-deltask]").forEach(b => b.onclick = () => {
      const [d, iid] = b.dataset.deltask.split("|");
      const g = state.todo.find(x => x.date === d);
      if (g) { g.tasks = g.tasks.filter(x => x.id !== iid); if (!g.tasks.length) state.todo = state.todo.filter(x => x.date !== d); save(); draw(); renderHeader(); }
    });
    listEl.querySelectorAll("[data-delgroup]").forEach(b => b.onclick = () => {
      state.todo = state.todo.filter(x => x.date !== b.dataset.delgroup); save(); draw(); renderHeader();
    });
  }
  draw();
  c.querySelector("#td-add").onclick = () => {
    const date = c.querySelector("#td-date").value;
    const text = c.querySelector("#td-text").value.trim();
    if (!text) return toast("请输入任务");
    findGroup(date).tasks.push({ id: uid(), text, done: false });
    save(); c.querySelector("#td-text").value = ""; draw(); renderHeader();
  };
}

/* ---------- 生活区 ---------- */
function renderLife(c) {
  c.innerHTML = `
  <div class="muted" style="font-weight:700;margin-bottom:4px">🏃 健身运动（按日期，多项可勾选）</div>
  <div class="form-grid">
    <input type="date" id="fit-date" value="${todayStr()}" />
    <input placeholder="训练项目，如 跑步30分钟" id="fit-text" />
    <button class="btn full" id="fit-add">+ 添加项目</button>
  </div>
  <div class="list" id="fit-list"></div>

  <div class="muted" style="font-weight:700;margin:14px 0 4px">⚖️ 体重记录</div>
  <div class="form-grid">
    <input type="number" step="0.1" placeholder="体重 kg" id="wt-val" />
    <input type="date" id="wt-date" value="${todayStr()}" />
    <button class="btn full" id="wt-add">记录体重</button>
  </div>
  <div id="wt-chart" style="margin:8px 0"></div>
  <div class="list" id="wt-list"></div>

  <div class="muted" style="font-weight:700;margin:14px 0 4px">🍱 饮食记录（自动算卡路里）</div>
  <div class="form-grid">
    <input type="date" id="diet-date" value="${todayStr()}" />
    <input placeholder="食物名" id="diet-name" />
    <input type="number" placeholder="卡路里 kcal" id="diet-kcal" />
    <button class="btn full" id="diet-add">+ 添加食物</button>
    <button class="btn ghost full" id="diet-pic">📷 上传今日饮食图</button>
  </div>
  <div class="list" id="diet-list"></div>`;

  const fitList = c.querySelector("#fit-list");
  function findFitGroup(date) {
    let g = state.life.fitness.find(x => x.date === date);
    if (!g) { g = { date, tasks: [] }; state.life.fitness.push(g); }
    return g;
  }
  function drawFit() {
    if (!state.life.fitness.length) { fitList.innerHTML = `<div class="empty">还没有训练记录</div>`; return; }
    const groups = [...state.life.fitness].sort((a, b) => b.date.localeCompare(a.date));
    fitList.innerHTML = groups.map(g => {
      const total = g.tasks.length;
      const done = g.tasks.filter(t => t.done).length;
      const pct = total ? Math.round(done / total * 100) : 0;
      const tasks = [...g.tasks].sort((a, b) => a.done - b.done).map(t => `<div class="item" style="padding:7px 10px;display:flex;gap:9px;align-items:flex-start">
        <input type="checkbox" data-ftask="${g.date}|${t.id}" ${t.done ? "checked" : ""} style="width:17px;height:17px;accent-color:var(--accent);margin-top:2px;flex:none"/>
        <span style="${t.done ? "text-decoration:line-through;color:var(--ink-soft)" : ""};font-size:13px;flex:1">${esc(t.text)}</span>
        <button class="del" data-fdeltask="${g.date}|${t.id}">×</button>
      </div>`).join("");
      return `<div class="item" style="border-left:3px solid var(--accent)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <b style="font-size:13px">📅 ${esc(g.date)}</b>
          <span class="chip">${done}/${total}</span>
          <button class="del" data-fdelgroup="${g.date}">×</button>
        </div>
        <div class="pbar" style="margin:6px 0"><i style="width:${pct}%"></i></div>
        ${tasks}
      </div>`;
    }).join("");
    fitList.querySelectorAll("[data-ftask]").forEach(b => b.onchange = () => {
      const [d, iid] = b.dataset.ftask.split("|");
      const g = state.life.fitness.find(x => x.date === d); const t = g && g.tasks.find(x => x.id === iid);
      if (t) { t.done = b.checked; save(); renderHeader(); drawFit(); }
    });
    fitList.querySelectorAll("[data-fdeltask]").forEach(b => b.onclick = () => {
      const [d, iid] = b.dataset.fdeltask.split("|");
      const g = state.life.fitness.find(x => x.date === d);
      if (g) { g.tasks = g.tasks.filter(x => x.id !== iid); if (!g.tasks.length) state.life.fitness = state.life.fitness.filter(x => x.date !== d); save(); renderHeader(); drawFit(); }
    });
    fitList.querySelectorAll("[data-fdelgroup]").forEach(b => b.onclick = () => {
      state.life.fitness = state.life.fitness.filter(x => x.date !== b.dataset.fdelgroup); save(); renderHeader(); drawFit();
    });
  }
  drawFit();
  c.querySelector("#fit-add").onclick = () => {
    const date = c.querySelector("#fit-date").value;
    const text = c.querySelector("#fit-text").value.trim();
    if (!text) return toast("写点训练内容吧");
    findFitGroup(date).tasks.push({ id: uid(), text, done: false });
    save(); c.querySelector("#fit-text").value = ""; renderHeader(); drawFit();
  };

  const wtList = c.querySelector("#wt-list");
  const wtChart = c.querySelector("#wt-chart");
  function drawWt() {
    const arr = [...state.life.weight].sort((a, b) => a.date.localeCompare(b.date));
    wtChart.innerHTML = sparklineBig(arr.map(x => ({ d: x.date, v: Number(x.weight) })));
    wtList.innerHTML = arr.length ? arr.slice().reverse().slice(0, 6).map(w => `<div class="item" style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px">${esc(w.date)}</span><b>${w.weight} kg</b>
      <button class="del" data-del="${w.id}">×</button></div>`).join("")
      : `<div class="empty">记录体重看趋势</div>`;
    wtList.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      state.life.weight = state.life.weight.filter(x => x.id !== b.dataset.del); save(); renderHeader(); drawWt();
    });
  }
  drawWt();
  c.querySelector("#wt-add").onclick = () => {
    const v = parseFloat(c.querySelector("#wt-val").value); const date = c.querySelector("#wt-date").value;
    if (isNaN(v)) return toast("请输入体重");
    const ex = state.life.weight.find(x => x.date === date);
    if (ex) ex.weight = v; else state.life.weight.push({ id: uid(), weight: v, date });
    save(); c.querySelector("#wt-val").value = ""; renderHeader(); drawWt();
  };

  const dietList = c.querySelector("#diet-list");
  function findDay(date) { let d = state.life.diet.find(x => x.date === date); if (!d) { d = { id: uid(), date, items: [], img: null }; state.life.diet.push(d); } return d; }
  function drawDiet() {
    const arr = [...state.life.diet].sort((a, b) => b.date.localeCompare(a.date));
    if (!arr.length) { dietList.innerHTML = `<div class="empty">还没有饮食记录</div>`; return; }
    dietList.innerHTML = arr.map(day => {
      const total = day.items.reduce((s, i) => s + (Number(i.kcal) || 0), 0);
      const items = day.items.map(i => `<div class="item" style="padding:6px 10px;display:flex;align-items:center;gap:8px">
        <button class="del" data-delitem="${day.id}|${i.id}">×</button>
        <span style="flex:1;font-size:13px">${esc(i.name)} <b>${Number(i.kcal) || 0} kcal</b></span>
        ${i.img ? `<span class="thumb" data-img="${i.img}"></span>` : ""}</div>`).join("");
      return `<div class="item" style="border-left:3px solid var(--accent)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b style="font-size:13px">${esc(day.date)}</b>
          <span class="chip">${total} kcal</span>
          ${day.img ? `<span class="thumb" data-img="${day.img}" style="width:40px;height:40px"></span>` : ""}
          <button class="del" data-delday="${day.id}">×</button>
        </div>${items}</div>`;
    }).join("");
    hydrateImages(dietList);
    dietList.querySelectorAll("[data-delitem]").forEach(b => b.onclick = () => {
      const [did, iid] = b.dataset.delitem.split("|");
      const d = state.life.diet.find(x => x.id === did); if (d) d.items = d.items.filter(i => i.id !== iid);
      save(); drawDiet(); renderHeader();
    });
    dietList.querySelectorAll("[data-delday]").forEach(b => b.onclick = () => {
      state.life.diet = state.life.diet.filter(x => x.id !== b.dataset.delday); save(); drawDiet(); renderHeader();
    });
  }
  drawDiet();
  c.querySelector("#diet-add").onclick = () => {
    const date = c.querySelector("#diet-date").value;
    const name = c.querySelector("#diet-name").value.trim();
    const kcal = parseFloat(c.querySelector("#diet-kcal").value);
    if (!name) return toast("请输入食物名");
    findDay(date).items.push({ id: uid(), name, kcal: isNaN(kcal) ? 0 : kcal, img: null });
    save(); c.querySelector("#diet-name").value = ""; c.querySelector("#diet-kcal").value = ""; drawDiet(); renderHeader();
  };
  c.querySelector("#diet-pic").onclick = () => {
    const date = c.querySelector("#diet-date").value;
    uploadImage(id => { findDay(date).img = id; save(); drawDiet(); });
  };
}

function sparklineBig(arr) {
  if (!arr.length) return `<div class="muted">记录体重看趋势</div>`;
  const w = 280, h = 60, vals = arr.map(x => x.v), max = Math.max(...vals), min = Math.min(...vals), span = max - min || 1;
  const pts = arr.map((x, i) => `${(i / (arr.length - 1) * w).toFixed(1)},${(h - (x.v - min) / span * (h - 8) - 4).toFixed(1)}`).join(" ");
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="max-width:${w}px">
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
    <text x="4" y="12" font-size="10" fill="var(--ink-soft)">${max}</text>
    <text x="4" y="${h - 3}" font-size="10" fill="var(--ink-soft)">${min}</text></svg>`;
}

/* ---------- 花销记录 ---------- */
function renderExpense(c) {
  c.innerHTML = `
    <div class="form-grid">
      <input type="date" id="ex-date" value="${todayStr()}" />
      <input placeholder="类别，如 餐饮" id="ex-cat" />
      <input type="number" step="0.01" placeholder="金额" id="ex-amt" />
      <input placeholder="备注" id="ex-note" />
      <button class="btn full" id="ex-add">+ 记录花销</button>
      <button class="btn ghost full" id="ex-pic">📷 上传凭证图</button>
    </div>
    <div class="list" id="ex-list"></div>`;
  const listEl = c.querySelector("#ex-list");
  let pendingImg = null;
  function draw() {
    const arr = [...state.expense].sort((a, b) => b.date.localeCompare(a.date));
    if (!arr.length) { listEl.innerHTML = `<div class="empty">还没有花销记录</div>`; return; }
    listEl.innerHTML = arr.map(e => `<div class="item">
      <button class="del" data-del="${e.id}">×</button>
      <div style="display:flex;justify-content:space-between;gap:8px;padding-right:16px">
        <div style="font-size:13px"><b>${esc(e.category || "其他")}</b> · ${esc(e.note || "")}<br><span class="muted">${esc(e.date)}</span></div>
        <b style="color:var(--accent-deep);white-space:nowrap">${money(e.amount)}</b>
      </div>
      ${e.img ? `<div class="thumbs"><span class="thumb" data-img="${e.img}"></span></div>` : ""}</div>`).join("");
    hydrateImages(listEl);
    listEl.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      state.expense = state.expense.filter(x => x.id !== b.dataset.del); save(); renderHeader(); draw();
    });
  }
  draw();
  c.querySelector("#ex-add").onclick = () => {
    const date = c.querySelector("#ex-date").value;
    const category = c.querySelector("#ex-cat").value.trim();
    const amount = parseFloat(c.querySelector("#ex-amt").value);
    const note = c.querySelector("#ex-note").value.trim();
    if (isNaN(amount)) return toast("请输入金额");
    state.expense.push({ id: uid(), date, category, amount, note, img: pendingImg });
    pendingImg = null;
    save(); c.querySelector("#ex-amt").value = ""; c.querySelector("#ex-note").value = ""; c.querySelector("#ex-cat").value = ""; c.querySelector("#ex-pic").textContent = "📷 上传凭证图";
    renderHeader(); draw();
  };
  c.querySelector("#ex-pic").onclick = () => {
    uploadImage(id => { pendingImg = id; toast("凭证图已附加，点记录即可保存"); c.querySelector("#ex-pic").textContent = "📷 已选图"; });
  };
}

/* ---------- 创作灵感 ---------- */
function renderInspiration(c) {
  c.innerHTML = `
  <div class="muted" style="font-weight:700;margin-bottom:4px">📕 小红书灵感</div>
  <div class="form-grid">
    <input placeholder="标题" id="ins-x-title" />
    <input type="date" id="ins-x-date" value="${todayStr()}" />
    <textarea placeholder="内容 / 文案点子" id="ins-x-body" class="full"></textarea>
    <button class="btn full" data-type="小红书" id="ins-x-add">+ 添加小红书灵感</button>
  </div>
  <div class="list" id="ins-x-list"></div>

  <div class="muted" style="font-weight:700;margin:14px 0 4px">📖 小说创作</div>
  <div class="form-grid">
    <input placeholder="章节 / 标题" id="ins-n-title" />
    <input type="date" id="ins-n-date" value="${todayStr()}" />
    <textarea placeholder="情节 / 人物 / 灵感" id="ins-n-body" class="full"></textarea>
    <button class="btn full" data-type="小说" id="ins-n-add">+ 添加小说灵感</button>
  </div>
  <div class="list" id="ins-n-list"></div>`;

  function drawOne(type, listId) {
    const el = c.querySelector("#" + listId);
    const arr = state.inspiration.filter(i => i.type === type).sort((a, b) => b.date.localeCompare(a.date));
    el.innerHTML = arr.length ? arr.map(i => `<div class="item">
      <button class="del" data-del="${i.id}">×</button>
      <div style="font-size:13px;padding-right:16px"><b>${esc(i.title)}</b> <span class="muted">· ${esc(i.date)}</span><br>${esc(i.body)}</div></div>`).join("")
      : `<div class="empty">还没有${type}灵感</div>`;
    el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      state.inspiration = state.inspiration.filter(x => x.id !== b.dataset.del); save(); drawOne(type, listId);
    });
  }
  drawOne("小红书", "ins-x-list"); drawOne("小说", "ins-n-list");

  function wire(type, titleId, bodyId, addId, listId) {
    c.querySelector("#" + addId).onclick = () => {
      const title = c.querySelector("#" + titleId).value.trim();
      const body = c.querySelector("#" + bodyId).value.trim();
      if (!title && !body) return toast("写点内容吧");
      state.inspiration.push({ id: uid(), type, title, body, date: c.querySelector("#" + (type === "小红书" ? "ins-x-date" : "ins-n-date")).value });
      save(); c.querySelector("#" + titleId).value = ""; c.querySelector("#" + bodyId).value = ""; drawOne(type, listId);
    };
  }
  wire("小红书", "ins-x-title", "ins-x-body", "ins-x-add", "ins-x-list");
  wire("小说", "ins-n-title", "ins-n-body", "ins-n-add", "ins-n-list");
}

/* ---------- 感恩日记 ---------- */
function renderGratitude(c) {
  c.innerHTML = `
    <div class="form-grid">
      <input type="date" id="gr-date" value="${todayStr()}" />
      <textarea placeholder="今天感恩的一件小事…" id="gr-text" class="full"></textarea>
      <button class="btn full" id="gr-add">+ 写下感恩</button>
    </div>
    <div class="list" id="gr-list"></div>`;
  const listEl = c.querySelector("#gr-list");
  function draw() {
    const arr = [...state.gratitude].sort((a, b) => b.date.localeCompare(a.date));
    listEl.innerHTML = arr.length ? arr.map(g => `<div class="item">
      <button class="del" data-del="${g.id}">×</button>
      <div style="font-size:13px;padding-right:16px">${esc(g.text)}<br><span class="muted">🙏 ${esc(g.date)}</span></div></div>`).join("")
      : `<div class="empty">记下今天值得感恩的事</div>`;
    listEl.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      state.gratitude = state.gratitude.filter(x => x.id !== b.dataset.del); save(); draw();
    });
  }
  draw();
  c.querySelector("#gr-add").onclick = () => {
    const text = c.querySelector("#gr-text").value.trim();
    const date = c.querySelector("#gr-date").value;
    if (!text) return toast("写点感恩的事吧");
    state.gratitude.push({ id: uid(), text, date });
    save(); c.querySelector("#gr-text").value = ""; draw(); renderHeader();
  };
}

/* ---------- 文书申请 ---------- */
function renderApplications(c) {
  c.innerHTML = `
    <div class="form-grid">
      <input placeholder="材料名称，如 个人陈述 PS" id="ap-name" />
      <button class="btn full" id="ap-add">+ 添加材料</button>
    </div>
    <div class="list" id="ap-list"></div>`;
  const listEl = c.querySelector("#ap-list");
  const STATUS = ["未准备", "已准备", "已完成"];
  function draw() {
    if (!state.applications.length) { listEl.innerHTML = `<div class="empty">还没添加申请材料</div>`; return; }
    listEl.innerHTML = state.applications.map(a => `<div class="item">
      <button class="del" data-del="${a.id}">×</button>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding-right:16px">
        <b style="font-size:13px">${esc(a.name)}</b>
        <select data-status="${a.id}" style="width:auto">
          ${STATUS.map(s => `<option ${a.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div></div>`).join("");
    listEl.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      state.applications = state.applications.filter(x => x.id !== b.dataset.del); save(); draw();
    });
    listEl.querySelectorAll("[data-status]").forEach(s => s.onchange = () => {
      const a = state.applications.find(x => x.id === s.dataset.status); if (a) { a.status = s.value; save(); }
    });
  }
  draw();
  c.querySelector("#ap-add").onclick = () => {
    const name = c.querySelector("#ap-name").value.trim();
    if (!name) return toast("请输入材料名称");
    state.applications.push({ id: uid(), name, status: "未准备" });
    save(); c.querySelector("#ap-name").value = ""; draw();
  };
}

/* ---------- 签证办理 ---------- */
function renderVisa(c) {
  c.innerHTML = `
    <div class="form-grid">
      <input placeholder="步骤，如 预约递签" id="vs-name" />
      <button class="btn full" id="vs-add">+ 添加步骤</button>
    </div>
    <div class="list" id="vs-list"></div>`;
  const listEl = c.querySelector("#vs-list");
  const STATUS = ["未开始", "办理中", "已完成"];
  function draw() {
    if (!state.visa.length) { listEl.innerHTML = `<div class="empty">还没添加签证步骤</div>`; return; }
    listEl.innerHTML = state.visa.map(v => `<div class="item">
      <button class="del" data-del="${v.id}">×</button>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding-right:16px">
        <b style="font-size:13px">${esc(v.name)}</b>
        <select data-status="${v.id}" style="width:auto">
          ${STATUS.map(s => `<option ${v.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div></div>`).join("");
    listEl.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      state.visa = state.visa.filter(x => x.id !== b.dataset.del); save(); draw();
    });
    listEl.querySelectorAll("[data-status]").forEach(s => s.onchange = () => {
      const v = state.visa.find(x => x.id === s.dataset.status); if (v) { v.status = s.value; save(); }
    });
  }
  draw();
  c.querySelector("#vs-add").onclick = () => {
    const name = c.querySelector("#vs-name").value.trim();
    if (!name) return toast("请输入步骤名称");
    state.visa.push({ id: uid(), name, status: "未开始" });
    save(); c.querySelector("#vs-name").value = ""; draw();
  };
}

/* =========================================================================
   账号 UI
   ========================================================================= */
function refreshAuthBtn() {}
function onAuthClick() {
  if (authToken) {
    if (confirm("退出登录？本机数据会保留，云端数据仍在你的账号里。")) {
      authToken = null; authUser = null;
      try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (_) {}
      toast("已退出登录"); renderMe();
    }
  } else openAuth();
}
function openAuth() {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-backdrop" data-back><div class="modal">
    <div class="modal-head">登录 / 注册<a class="modal-x" data-close>×</a></div>
    <div class="modal-body">
      <div class="muted" style="font-weight:700">用户名</div>
      <input id="au-user" placeholder="给自己起个名字" style="margin:6px 0 12px" />
      <div class="muted" style="font-weight:700">密码</div>
      <input id="au-pw" type="password" placeholder="至少 4 位" style="margin:6px 0 14px" />
      <div class="row">
        <button class="btn full sm" id="au-login">登录</button>
        <button class="btn soft full sm" id="au-reg">注册并登录</button>
      </div>
      <div class="muted" id="au-msg" style="margin-top:10px"></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>稍后</button></div>
  </div></div>`;
  const backdrop = root.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach(b => b.onclick = () => (root.innerHTML = ""));
  backdrop.onclick = (e) => { if (e.target === backdrop) root.innerHTML = ""; };
  const msg = root.querySelector("#au-msg");
  async function doAuth(isReg) {
    const username = root.querySelector("#au-user").value.trim();
    const password = root.querySelector("#au-pw").value;
    if (!username || !password) return (msg.textContent = "请填写用户名和密码");
    try {
      const j = await api(isReg ? "/api/register" : "/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
      authToken = j.token; authUser = j.username;
      try { localStorage.setItem(TOKEN_KEY, authToken); localStorage.setItem(USER_KEY, authUser); } catch (_) {}
      try {
        const s = await api("/api/state");
        if (s && s.state) state = Object.assign(defaultState(), s.state, { settings: Object.assign(defaultState().settings, s.state.settings || {}) });
      } catch (_) {}
      ensureVocabPractice(); ensureSkincare(); ensureLayout(); migrate();
      save(); applyTheme(); renderHeader(); switchTab(currentTab);
      toast(isReg ? "注册成功，已登录 🎉" : "登录成功 🎉");
      root.innerHTML = "";
    } catch (e) { msg.textContent = (e.message || "出错了"); }
  }
  root.querySelector("#au-login").onclick = () => doAuth(false);
  root.querySelector("#au-reg").onclick = () => doAuth(true);
}
function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("./sw.js").catch(() => {}); });
  }
}

async function init() {
  try {
    try { await idb.open(); } catch (e) { console.warn("IndexedDB 不可用，图片功能将受限", e); }
    if (authToken) {
      try {
        const s = await api("/api/state");
        if (s && s.state) state = Object.assign(defaultState(), s.state, { settings: Object.assign(defaultState().settings, s.state.settings || {}) });
      } catch (e) {
        if (e.message && e.message.indexOf("401") >= 0) {
          authToken = null; authUser = null;
          try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (_) {}
        }
        console.warn("拉取云端数据失败，使用本地数据", e);
      }
    }
    ensureVocabPractice();
    ensureSkincare();
    ensureLayout();
    migrate();
    save();
    applyTheme();
    setupTabs();
    renderHeader();
    switchTab("home");
    registerSW();
  } catch (err) {
    console.error("init failed", err);
    if (window.onerror) window.onerror(String(err), "app.js", 0, 0, err);
  }
}
init();
