/* =========================================================================
   Vivian 的工作台  —  纯前端单页应用
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
const ACCENTS = ["#ff8fb1", "#ff6f91", "#ffa3c4", "#f78fb3", "#ff5d8f", "#ffb3c6", "#e98aaa", "#ff9ec4"];

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
  // 已学到 延世2-1：延世1 全册 + 延世2-1 完成
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
    settings: { accent: "#ff8fb1", bgColor: "#fff5f8", bgImage: null, showSub: "记录生活 · 韩语学习 · 申请进度" },
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
    countdowns: []
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
  // 去重 & 过滤无效
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
  // 旧版「每天 To Do」为扁平结构 {id,text,date,done} → 按日期分组
  if (state.todo.length && state.todo[0].tasks === undefined) {
    const map = {};
    state.todo.forEach(t => { (map[t.date] = map[t.date] || []).push({ id: t.id || uid(), text: t.text, done: !!t.done }); });
    state.todo = Object.entries(map).map(([date, tasks]) => ({ date, tasks }));
  }
  // 旧版「健身运动」为扁平结构 {id,text,date} → 按日期分组
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
  const sub = document.getElementById("brand-sub");
  if (sub) sub.textContent = state.settings.showSub || "";
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
   顶部可视化总栏
   ========================================================================= */
function currentLessonLabel() {
  const ls = state.vocabPractice.lessons;
  const firstUndone = ls.find(l => !l.done);
  return firstUndone ? firstUndone.label : (ls.length ? ls[ls.length - 1].label : "—");
}
function renderTopbar() {
  const w = document.getElementById("topbar-widgets");
  const mk = monthKey();

  const monthExp = state.expense.filter(e => e.date && e.date.startsWith(mk));
  const totalExp = monthExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const byCat = {};
  monthExp.forEach(e => { byCat[e.category || "其他"] = (byCat[e.category || "其他"] || 0) + (Number(e.amount) || 0); });
  const catArr = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const maxCat = catArr.length ? catArr[0][1] : 1;
  const expHTML = catArr.map(([c, v]) =>
    `<div class="cat"><span style="width:36px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c)}</span>
     <span class="track"><i style="width:${(v / maxCat * 100).toFixed(0)}%"></i></span>
     <span style="width:44px;text-align:right;">${money(v)}</span></div>`).join("") || `<div class="w-sub">本月还没记录～</div>`;

  const vocabTotal = state.vocab.length;
  const vocabWeek = state.vocab.filter(v => v.date >= daysAgoStr(7)).length;
  const vpDone = state.vocabPractice.lessons.filter(l => l.done).length;

  let totalCh = 0, learnedCh = 0;
  state.grammar.books.forEach(b => b.chapters.forEach(c => { totalCh++; if (c.learned) learnedCh++; }));
  const gPct = totalCh ? Math.round(learnedCh / totalCh * 100) : 0;

  const apps = state.applications;
  const appPrepared = apps.filter(a => a.status && a.status !== "未准备").length;
  const appDone = apps.filter(a => a.status === "已完成").length;

  const wArr = [...state.life.weight].sort((a, b) => a.date.localeCompare(b.date));
  const latestW = wArr.length ? wArr[wArr.length - 1].weight : null;
  const fitWeek = state.life.fitness.filter(g => g.date >= daysAgoStr(7)).reduce((s, g) => s + (g.tasks ? g.tasks.length : 1), 0);
  const spark = sparkline(wArr.slice(-8).map(x => Number(x.weight)));

  // 护肤：本周打卡天数（doneDates 落在近 7 天内的去重天数）
  const skinDates = new Set();
  (state.skincare.cats || []).forEach(cat => (cat.doneDates || []).forEach(d => { if (d >= daysAgoStr(7)) skinDates.add(d); }));
  const skinWeek = skinDates.size;

  const ringCirc = (2 * Math.PI * 19).toFixed(1);
  const ringOff = (2 * Math.PI * 19 * (1 - gPct / 100)).toFixed(1);

  w.innerHTML = `
    <div class="widget">
      <div class="w-label">💰 本月开销</div>
      <div class="w-value">${money(totalExp)}</div>
      <div class="w-sub">${monthExp.length} 笔</div>
      <div class="w-bars">${expHTML}</div>
    </div>
    <div class="widget">
      <div class="w-label">📝 韩语单词</div>
      <div class="w-value">${vocabTotal}</div>
      <div class="w-sub">本周 +${vocabWeek} · 带练至 ${esc(currentLessonLabel())}</div>
    </div>
    <div class="widget">
      <div class="w-label">📚 语法进度</div>
      <div class="ring-wrap">
        <svg class="ring" width="46" height="46" viewBox="0 0 46 46">
          <circle cx="23" cy="23" r="19" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="6"/>
          <circle cx="23" cy="23" r="19" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"
            stroke-dasharray="${ringCirc}" stroke-dashoffset="${ringOff}"/>
          <text x="23" y="23" text-anchor="middle" dominant-baseline="central">${gPct}%</text>
        </svg>
        <div class="w-sub" style="margin:0">${learnedCh}/${totalCh} 课</div>
      </div>
    </div>
    <div class="widget">
      <div class="w-label">📄 文书申请</div>
      <div class="w-value" style="font-size:18px">${appPrepared}/${apps.length || 0}</div>
      <div class="w-sub">已准备 · 完成 ${appDone}</div>
      <div class="w-bar"><i style="width:${apps.length ? (appPrepared / apps.length * 100) : 0}%"></i></div>
    </div>
    <div class="widget">
      <div class="w-label">💪 生活区</div>
      <div class="w-value" style="font-size:18px">${latestW != null ? latestW + " kg" : "—"}</div>
      <div class="w-sub">本周健身 ${fitWeek} 次 · 带练 ${vpDone}/50</div>
      <div style="margin-top:4px">${spark}</div>
    </div>
    <div class="widget">
      <div class="w-label">🧴 护肤概览</div>
      <div class="w-value" style="font-size:18px">${skinWeek}<small> 天</small></div>
      <div class="w-sub">本周护肤打卡</div>
      <div class="w-bar"><i style="width:${Math.min(100, Math.round(skinWeek / 7 * 100))}%"></i></div>
    </div>`;
}

function sparkline(vals) {
  if (!vals.length || vals.some(v => isNaN(v))) return `<div class="muted" style="color:rgba(255,255,255,.85)">记录体重看趋势</div>`;
  const w = 130, h = 26, max = Math.max(...vals), min = Math.min(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - (v - min) / span * (h - 4) - 2).toFixed(1)}`).join(" ");
  return `<svg width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;
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

/* =========================================================================
   模块注册表
   ========================================================================= */
const MODULES = [
  { id: "countdown", title: "倒计时", icon: "⏳", render: renderCountdown },
  { id: "grammar", title: "韩语语法进度", icon: "📚", render: renderGrammar },
  { id: "vocabpractice", title: "韩语单词带练", icon: "🎧", render: renderVocabPractice },
  { id: "todo", title: "每天 To Do", icon: "✅", render: renderTodo },
  { id: "life", title: "生活区", icon: "🌸", render: renderLife },
  { id: "expense", title: "花销记录", icon: "💸", render: renderExpense },
  { id: "inspiration", title: "创作灵感", icon: "💡", render: renderInspiration },
  { id: "gratitude", title: "感恩日记", icon: "🙏", render: renderGratitude },
  { id: "applications", title: "文书申请", icon: "📄", render: renderApplications },
  { id: "visa", title: "签证办理", icon: "🛂", render: renderVisa },
  { id: "skincare", title: "每日护肤", icon: "🧴", render: renderSkincare }
];

/* ---------- 倒计时 ---------- */
function renderCountdown(c) {
  c.innerHTML = `
    <div class="form-grid">
      <input placeholder="事件名称，如 韩国入学" id="cd-title" />
      <input type="date" id="cd-date" />
      <button class="btn full" id="cd-add">+ 添加倒计时</button>
    </div>
    <div class="list" id="cd-list"></div>`;
  const listEl = c.querySelector("#cd-list");
  function draw() {
    if (!state.countdowns.length) { listEl.innerHTML = `<div class="empty">添加一个重要的日子吧 ✨</div>`; return; }
    listEl.innerHTML = state.countdowns.map(d => {
      const days = Math.ceil((new Date(d.date + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 86400000);
      const txt = days > 0 ? `<span class="countdown-big">${days}<small> 天后</small></span>`
        : days === 0 ? `<span class="countdown-big">就是<small> 今天</small></span>`
          : `<span class="countdown-big" style="color:var(--ink-soft)">已过去 ${-days}<small> 天</small></span>`;
      return `<div class="item"><button class="del" data-del="${d.id}">×</button>
        <div style="font-weight:700">${esc(d.title)}</div>
        <div class="muted">${esc(d.date)}</div>${txt}</div>`;
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
    state.countdowns.push({ id: uid(), title, date });
    save(); c.querySelector("#cd-title").value = ""; c.querySelector("#cd-date").value = ""; draw();
  };
}

/* ---------- 韩语语法进度（小框网格 + 点击打开详情） ---------- */
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
      // 关闭：× / 完成 / 点背景空白处（不会卡住）
      backdrop.querySelectorAll("[data-close]").forEach(x => x.onclick = () => (root.innerHTML = ""));
      backdrop.onclick = (e) => { if (e.target === backdrop) root.innerHTML = ""; };
      root.querySelector("#ch-title").oninput = e => { ch.title = e.target.value; save(); redraw(); };
      root.querySelector("#ch-learned").onclick = () => { ch.learned = !ch.learned; save(); renderTopbar(); redraw(); paint(); };
      root.querySelector("#ch-del").onclick = () => {
        if (!confirm("确定删除本章？")) return;
        book.chapters = book.chapters.filter(x => x.id !== ch.id);
        save(); renderTopbar(); redraw(); root.innerHTML = "";
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

/* ---------- 每日护肤（分类卡片 + 点击打开记录意见/图片） ---------- */
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
    save(); renderTopbar(); draw();
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
    save(); renderTopbar(); redraw(); openSkincareModal(cat, redraw);
  };
  root.querySelector("#sk-delcat").onclick = () => {
    if (!confirm(`确定删除「${cat.name}」分类？所有记录会一并删除。`)) return;
    state.skincare.cats = state.skincare.cats.filter(x => x.id !== cat.id);
    save(); renderTopbar(); redraw(); root.innerHTML = "";
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

/* ---------- 韩语单词带练（视频 + 解锁 + 生词本） ---------- */
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
      save(); renderTopbar(); drawGrid();
      const cur2 = currentLessonLabel();
      const dn = vp.lessons.filter(l => l.done).length;
      const pct2 = total ? Math.round(dn / total * 100) : 0;
      c.querySelectorAll(".muted")[1].innerHTML =
        `已学到 <b style="color:var(--accent-deep)">${esc(cur2)}</b> · 完成 ${dn}/${total}（${pct2}%）`;
    });
  }
  c.querySelector("#vp-open").onclick = () => window.open(vp.videoUrl, "_blank", "noopener");

  // 生词本
  const vbList = c.querySelector("#vb-list");
  function drawVocab() {
    vbList.innerHTML = state.vocab.length ? state.vocab.slice().reverse().map(v => `<div class="item">
      <button class="del" data-del="${v.id}">×</button>
      <div style="font-size:13px;padding-right:16px"><b>${esc(v.word)}</b> — ${esc(v.mean)}<br><span class="muted">${esc(v.date)}</span></div></div>`).join("")
      : `<div class="empty">生词本还是空的，记几个单词吧</div>`;
    vbList.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      state.vocab = state.vocab.filter(x => x.id !== b.dataset.del); save(); renderTopbar(); drawVocab();
    });
  }
  drawVocab();
  c.querySelector("#vb-add").onclick = () => {
    const word = c.querySelector("#vb-word").value.trim();
    const mean = c.querySelector("#vb-mean").value.trim();
    if (!word) return toast("请输入单词");
    state.vocab.push({ id: uid(), word, mean, date: todayStr() });
    save(); c.querySelector("#vb-word").value = ""; c.querySelector("#vb-mean").value = ""; renderTopbar(); drawVocab();
  };
  drawGrid();
}

/* ---------- To Do（按日期分组，多项可勾选） ---------- */
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
      if (t) { t.done = b.checked; save(); draw(); }
    });
    listEl.querySelectorAll("[data-deltask]").forEach(b => b.onclick = () => {
      const [d, iid] = b.dataset.deltask.split("|");
      const g = state.todo.find(x => x.date === d);
      if (g) { g.tasks = g.tasks.filter(x => x.id !== iid); if (!g.tasks.length) state.todo = state.todo.filter(x => x.date !== d); save(); draw(); }
    });
    listEl.querySelectorAll("[data-delgroup]").forEach(b => b.onclick = () => {
      state.todo = state.todo.filter(x => x.date !== b.dataset.delgroup); save(); draw();
    });
  }
  draw();
  c.querySelector("#td-add").onclick = () => {
    const date = c.querySelector("#td-date").value;
    const text = c.querySelector("#td-text").value.trim();
    if (!text) return toast("请输入任务");
    findGroup(date).tasks.push({ id: uid(), text, done: false });
    save(); c.querySelector("#td-text").value = ""; draw();
  };
}

/* ---------- 生活区（健身 / 体重 / 饮食卡路里） ---------- */
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
      if (t) { t.done = b.checked; save(); renderTopbar(); drawFit(); }
    });
    fitList.querySelectorAll("[data-fdeltask]").forEach(b => b.onclick = () => {
      const [d, iid] = b.dataset.fdeltask.split("|");
      const g = state.life.fitness.find(x => x.date === d);
      if (g) { g.tasks = g.tasks.filter(x => x.id !== iid); if (!g.tasks.length) state.life.fitness = state.life.fitness.filter(x => x.date !== d); save(); renderTopbar(); drawFit(); }
    });
    fitList.querySelectorAll("[data-fdelgroup]").forEach(b => b.onclick = () => {
      state.life.fitness = state.life.fitness.filter(x => x.date !== b.dataset.fdelgroup); save(); renderTopbar(); drawFit();
    });
  }
  drawFit();
  c.querySelector("#fit-add").onclick = () => {
    const date = c.querySelector("#fit-date").value;
    const text = c.querySelector("#fit-text").value.trim();
    if (!text) return toast("写点训练内容吧");
    findFitGroup(date).tasks.push({ id: uid(), text, done: false });
    save(); c.querySelector("#fit-text").value = ""; renderTopbar(); drawFit();
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
      state.life.weight = state.life.weight.filter(x => x.id !== b.dataset.del); save(); renderTopbar(); drawWt();
    });
  }
  drawWt();
  c.querySelector("#wt-add").onclick = () => {
    const v = parseFloat(c.querySelector("#wt-val").value); const date = c.querySelector("#wt-date").value;
    if (isNaN(v)) return toast("请输入体重");
    const ex = state.life.weight.find(x => x.date === date);
    if (ex) ex.weight = v; else state.life.weight.push({ id: uid(), weight: v, date });
    save(); c.querySelector("#wt-val").value = ""; renderTopbar(); drawWt();
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
      save(); drawDiet();
    });
    dietList.querySelectorAll("[data-delday]").forEach(b => b.onclick = () => {
      state.life.diet = state.life.diet.filter(x => x.id !== b.dataset.delday); save(); drawDiet();
    });
  }
  drawDiet();
  c.querySelector("#diet-add").onclick = () => {
    const date = c.querySelector("#diet-date").value;
    const name = c.querySelector("#diet-name").value.trim();
    const kcal = parseFloat(c.querySelector("#diet-kcal").value);
    if (!name) return toast("请输入食物名");
    findDay(date).items.push({ id: uid(), name, kcal: isNaN(kcal) ? 0 : kcal, img: null });
    save(); c.querySelector("#diet-name").value = ""; c.querySelector("#diet-kcal").value = ""; drawDiet();
  };
  c.querySelector("#diet-pic").onclick = () => {
    const date = c.querySelector("#diet-date").value;
    uploadImage(id => { findDay(date).img = id; save(); drawDiet(); });
  };
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
      state.expense = state.expense.filter(x => x.id !== b.dataset.del); save(); renderTopbar(); draw();
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
    save(); c.querySelector("#ex-amt").value = ""; c.querySelector("#ex-note").value = ""; c.querySelector("#ex-cat").value = "";
    renderTopbar(); draw();
  };
  c.querySelector("#ex-pic").onclick = () => {
    uploadImage(id => { pendingImg = id; toast("凭证图已附加，点记录即可保存"); c.querySelector("#ex-pic").textContent = "📷 已选图"; });
  };
}

/* ---------- 创作灵感（小红书 / 小说） ---------- */
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
    save(); c.querySelector("#gr-text").value = ""; draw();
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
      state.applications = state.applications.filter(x => x.id !== b.dataset.del); save(); renderTopbar(); draw();
    });
    listEl.querySelectorAll("[data-status]").forEach(s => s.onchange = () => {
      const a = state.applications.find(x => x.id === s.dataset.status); if (a) { a.status = s.value; save(); renderTopbar(); }
    });
  }
  draw();
  c.querySelector("#ap-add").onclick = () => {
    const name = c.querySelector("#ap-name").value.trim();
    if (!name) return toast("请输入材料名称");
    state.applications.push({ id: uid(), name, status: "未准备" });
    save(); c.querySelector("#ap-name").value = ""; renderTopbar(); draw();
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
   看板渲染 + 拖拽排序
   ========================================================================= */
function renderBoard() {
  ["col1", "col2"].forEach(col => {
    const el = document.getElementById(col); el.innerHTML = "";
    state.layout[col].forEach(id => {
      const m = MODULES.find(x => x.id === id);
      if (m) el.appendChild(makeCard(m));
    });
  });
}
function makeCard(m) {
  const card = document.createElement("div");
  card.className = "card"; card.dataset.module = m.id;
  const head = document.createElement("div");
  head.className = "card-head";
  head.innerHTML = `<span class="card-icon">${m.icon}</span><span class="card-title">${esc(m.title)}</span><span class="drag-handle">⠿</span>`;
  const body = document.createElement("div");
  body.className = "card-body";
  card.appendChild(head); card.appendChild(body);
  m.render(body);
  makeDraggable(card);
  return card;
}

let dragEl = null;
function makeDraggable(card) {
  card.draggable = true;
  card.addEventListener("dragstart", () => { dragEl = card; card.classList.add("dragging"); });
  card.addEventListener("dragend", () => { card.classList.remove("dragging"); dragEl = null; saveLayoutFromDOM(); });
}
function getDragAfter(col, y) {
  const els = [...col.querySelectorAll(".card:not(.dragging)")];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity, element: null }).element;
}
function saveLayoutFromDOM() {
  ["col1", "col2"].forEach(col => {
    const el = document.getElementById(col);
    if (el) state.layout[col] = [...el.querySelectorAll(".card")].map(card => card.dataset.module);
  });
  save();
}
function setupColumnDnD() {
  ["col1", "col2"].forEach(col => {
    const el = document.getElementById(col);
    el.addEventListener("dragover", e => {
      e.preventDefault(); el.classList.add("drag-over");
      if (!dragEl) return;
      const after = getDragAfter(el, e.clientY);
      if (after == null) el.appendChild(dragEl); else el.insertBefore(dragEl, after);
    });
    el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
    el.addEventListener("drop", e => { e.preventDefault(); el.classList.remove("drag-over"); saveLayoutFromDOM(); });
  });
}

/* =========================================================================
   DIY 设置面板
   ========================================================================= */
function openSettings() {
  const root = document.getElementById("modal-root");
  const swatches = ACCENTS.map(a => `<span class="swatch ${a === state.settings.accent ? "active" : ""}" data-accent="${a}" style="background:${a}"></span>`).join("");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-head">💖 DIY 定制工作台<a class="modal-x" data-close>×</a></div>
        <div class="modal-body">
          <div class="muted" style="font-weight:700">主题色</div>
          <div class="swatch-row">${swatches}
            <input type="color" id="set-accent" value="${state.settings.accent}" style="width:40px;height:34px;padding:2px;cursor:pointer" />
          </div>
          <div class="muted" style="font-weight:700">背景颜色</div>
          <input type="color" id="set-bg" value="${state.settings.bgColor}" style="margin:6px 0 12px;width:100%;height:36px;padding:2px;cursor:pointer" />
          <div class="muted" style="font-weight:700">背景图片（可上传）</div>
          <div class="row" style="margin:6px 0 12px">
            <button class="btn soft sm" id="set-bgimg">📷 上传背景图</button>
            <button class="btn ghost sm" id="set-bgimg-del">移除背景图</button>
          </div>
          <div class="muted" style="font-weight:700">副标题文字</div>
          <input id="set-sub" value="${esc(state.settings.showSub)}" style="margin:6px 0 14px" />
          <button class="btn ghost full" id="set-reset" style="color:#d9534f;border-color:#f3c2c2">🗑 清空所有数据（不可恢复）</button>
        </div>
        <div class="modal-foot"><button class="btn" data-close>完成</button></div>
      </div>
    </div>`;
  const backdrop = root.querySelector(".modal-backdrop");
  backdrop.querySelectorAll("[data-close]").forEach(b => b.onclick = () => (root.innerHTML = ""));

  root.querySelectorAll("[data-accent]").forEach(s => s.onclick = () => {
    state.settings.accent = s.dataset.accent;
    root.querySelectorAll("[data-accent]").forEach(x => x.classList.remove("active"));
    s.classList.add("active");
    document.getElementById("set-accent").value = s.dataset.accent;
    save(); applyTheme();
  });
  root.querySelector("#set-accent").oninput = e => {
    state.settings.accent = e.target.value; save(); applyTheme();
    root.querySelectorAll("[data-accent]").forEach(x => x.classList.remove("active"));
  };
  root.querySelector("#set-bg").oninput = e => { state.settings.bgColor = e.target.value; save(); applyTheme(); };
  root.querySelector("#set-sub").oninput = e => { state.settings.showSub = e.target.value; save(); applyTheme(); };
  root.querySelector("#set-bgimg").onclick = () => uploadImage(id => {
    if (state.settings.bgImage) idb.del(state.settings.bgImage).catch(() => {});
    state.settings.bgImage = id; save(); applyTheme();
  });
  root.querySelector("#set-bgimg-del").onclick = () => {
    if (state.settings.bgImage) idb.del(state.settings.bgImage).catch(() => {});
    state.settings.bgImage = null; save(); applyTheme();
  };
  root.querySelector("#set-reset").onclick = () => {
    if (!confirm("确定清空所有数据？此操作不可恢复。")) return;
    state = defaultState(); save(); applyTheme(); renderTopbar(); renderBoard(); root.innerHTML = ""; toast("已清空");
  };
}

/* =========================================================================
   初始化
   ========================================================================= */
/* ---------- 账号 UI ---------- */
function refreshAuthBtn() {
  const b = document.getElementById("auth-btn");
  if (!b) return;
  if (authToken) { b.textContent = "👤 " + (authUser || "我"); b.title = "已登录 · 点击退出"; }
  else { b.textContent = "登录"; b.title = "登录后可多端同步"; }
}
function onAuthClick() {
  if (authToken) {
    if (confirm("退出登录？本机数据会保留，云端数据仍在你的账号里。")) {
      authToken = null; authUser = null;
      try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (_) {}
      refreshAuthBtn(); toast("已退出登录");
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
      save(); applyTheme(); renderTopbar(); renderBoard(); setupColumnDnD();
      refreshAuthBtn();
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
    // 已登录：先拉取云端数据覆盖本地（多端同步）
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
    renderTopbar();
    renderBoard();
    setupColumnDnD();
    document.getElementById("settings-btn").onclick = openSettings;
    refreshAuthBtn();
    const ab = document.getElementById("auth-btn");
    if (ab) ab.onclick = onAuthClick;
    registerSW();
  } catch (err) {
    console.error("init failed", err);
    if (window.onerror) window.onerror(String(err), "app.js", 0, 0, err);
  }
}
init();
