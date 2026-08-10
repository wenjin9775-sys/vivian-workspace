/* =========================================================================
   Vivian 工作台 · 生活模块扩展 (life.js)
   依赖全局：state / save() / uid() / esc() / todayStr() / toast() /
            renderModules() / switchTab() / getImg() / speakKO()(korean.js)
   Chart.js 通过 index.html 的 CDN 引入，使用 window.Chart。
   主题变量沿用 styles.css 的 --accent 粉白体系。
   ========================================================================= */
(function () {
  "use strict";

  /* ---------------- 通用小工具 ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function lm_save() { if (typeof save === "function") save(); }
  function lm_toast(m) { if (typeof toast === "function") toast(m); else alert(m); }
  function lm_today() { return (typeof todayStr === "function") ? todayStr() : new Date().toISOString().slice(0, 10); }
  function lm_esc(s) { return (typeof esc === "function") ? esc(s) : String(s == null ? "" : s); }
  function lm_uid() { return (typeof uid === "function") ? uid() : ("id" + Date.now() + Math.random().toString(36).slice(2, 7)); }
  function lm_dateAdd(ds, n) { const d = new Date(ds + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function lm_weekStart(ds) { const d = new Date(ds + "T00:00:00"); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d.toISOString().slice(0, 10); }
  function lm_monthMatrix(y, m) {
    const first = new Date(y, m, 1);
    const startWd = (first.getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWd; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(`${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }
  function lm_lastDays(n, end) {
    const e = end || lm_today();
    const arr = [];
    for (let i = n - 1; i >= 0; i--) arr.push(lm_dateAdd(e, -i));
    return arr;
  }
  function lm_monthKey(ds) { return ds.slice(0, 7); }

  /* ---------------- Chart.js 助手 ---------------- */
  const lm_charts = {};
  function lm_chart(id, type, data, options) {
    const c = document.getElementById(id);
    if (!c || !window.Chart) return;
    try {
      if (lm_charts[id]) lm_charts[id].destroy();
      lm_charts[id] = new window.Chart(c.getContext("2d"), { type, data, options: Object.assign({ responsive: true, maintainAspectRatio: false }, options || {}) });
    } catch (e) { console.warn("chart err", e); }
  }
  function lm_color(alpha) {
    const a = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ec4899";
    return hexA(a, alpha);
  }
  function hexA(hex, a) {
    const m = (hex || "#ec4899").replace("#", "");
    const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  const LM_PALETTE = ["#ec4899", "#f9a8d4", "#c084fc", "#fb7185", "#fda4af", "#f472b6", "#e879f9", "#a78bfa", "#f0abfc", "#f9a8d4", "#fb607f", "#d946ef"];

  /* ---------------- 简单模态 ---------------- */
  function lm_modal(html, onMount) {
    const root = document.getElementById("modal-root");
    if (!root) return;
    root.innerHTML = `<div class="lm-mask" id="lm-mask"><div class="lm-sheet">${html}</div></div>`;
    const mask = $("#lm-mask", root);
    mask.onclick = (e) => { if (e.target === mask) lm_closeModal(); };
    if (typeof onMount === "function") onMount($(".lm-sheet", root), root);
  }
  function lm_closeModal() { const r = document.getElementById("modal-root"); if (r) r.innerHTML = ""; }

  /* =======================================================================
     1. 每日计划 planner
     ======================================================================= */
  let plannerView = "today";
  function lm_planner(body) {
    const tabs = [["today", "今日清单"], ["week", "本周计划"], ["goals", "长期目标"]];
    body.innerHTML = `
      <div class="lm-subtabs">${tabs.map(t => `<button class="lm-subtab ${plannerView === t[0] ? "active" : ""}" data-v="${t[0]}">${t[1]}</button>`).join("")}</div>
      <div id="planner-view"></div>`;
    $$(".lm-subtab", body).forEach(b => b.onclick = () => { plannerView = b.dataset.v; lm_planner(body); });
    const v = $("#planner-view", body);
    if (plannerView === "today") lm_plannerToday(v);
    else if (plannerView === "week") lm_plannerWeek(v);
    else lm_plannerGoals(v);
  }
  function lm_plannerToday(v) {
    const list = state.planner.today;
    const total = list.length, done = list.filter(t => t.done).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const ordered = [...list].sort((a, b) => (a.done - b.done) || (b.prio - a.prio));
    const PRIO = { 3: "🔴 高", 2: "🟡 中", 1: "🟢 低" };
    const allDone = total > 0 && done === total;
    const rewardedToday = state.planner.rewardDate === lm_today();
    v.innerHTML = `
      <div class="lm-progress"><div class="lm-progress-bar" style="width:${pct}%"></div><span>${done}/${total} · ${pct}%</span></div>
      <div class="lm-row">
        <select id="p-cat" class="lm-input" style="max-width:120px"><option>工作</option><option>学习</option><option>生活</option><option>健康</option><option>其他</option></select>
        <select id="p-prio" class="lm-input" style="max-width:90px"><option value="3">高</option><option value="2" selected>中</option><option value="1">低</option></select>
        <input id="p-text" class="lm-input" placeholder="今日任务…" />
        <button class="btn" id="p-add">＋</button>
      </div>
      <div class="lm-list">${ordered.map(t => `
        <div class="lm-task ${t.done ? "done" : ""}">
          <button class="lm-check" data-id="${t.id}">${t.done ? "✅" : "⬜"}</button>
          <div class="lm-task-main"><div class="lm-task-text">${lm_esc(t.text)}</div><div class="lm-task-meta"><span class="lm-chip">${lm_esc(t.cat || "其他")}</span><span class="lm-chip prio${t.prio}">${PRIO[t.prio] || "中"}</span></div></div>
          <button class="lm-del" data-id="${t.id}">🗑</button>
        </div>`).join("") || `<div class="empty">还没有今日任务</div>`}</div>
      ${allDone ? `<div class="lm-reward">${rewardedToday ? "🪙 今日金币已领取 +10" : `<button class="btn gold" id="p-reward">🎉 全部完成！领取金币 +10</button>`}</div>` : ""}`;
    $("#p-add", v).onclick = () => {
      const text = $("#p-text", v).value.trim(); if (!text) return lm_toast("请输入内容");
      list.push({ id: lm_uid(), text, cat: $("#p-cat", v).value, prio: +$("#p-prio", v).value, done: false });
      lm_save(); lm_planner(body_ref());
    };
    $("#p-text", v).addEventListener("keydown", e => { if (e.key === "Enter") $("#p-add", v).click(); });
    if ($("#p-reward", v)) $("#p-reward", v).onclick = () => { state.coins = (state.coins || 0) + 10; state.planner.rewardDate = lm_today(); lm_save(); lm_planner(body_ref()); lm_toast("🪙 +10 金币到账！"); };
    $$(".lm-check", v).forEach(b => b.onclick = () => { const t = list.find(x => x.id === b.dataset.id); if (t) { t.done = !t.done; lm_save(); lm_planner(body_ref()); } });
    $$(".lm-del", v).forEach(b => b.onclick = () => { const i = list.findIndex(x => x.id === b.dataset.id); if (i >= 0) { list.splice(i, 1); lm_save(); lm_planner(body_ref()); } });
  }
  function lm_plannerWeek(v) {
    const list = state.planner.week;
    const done = list.filter(t => t.done).length;
    v.innerHTML = `
      <p class="lm-hint">轻量化短期事务统筹 · ${done}/${list.length} 完成</p>
      <div class="lm-row"><input id="w-text" class="lm-input" placeholder="本周待办…" /><button class="btn" id="w-add">＋</button></div>
      <div class="lm-list">${list.map(t => `
        <div class="lm-task ${t.done ? "done" : ""}">
          <button class="lm-check" data-id="${t.id}">${t.done ? "✅" : "⬜"}</button>
          <div class="lm-task-text">${lm_esc(t.text)}</div>
          <button class="lm-del" data-id="${t.id}">🗑</button>
        </div>`).join("") || `<div class="empty">本周暂无安排</div>`}</div>`;
    $("#w-add", v).onclick = () => { const t = $("#w-text", v).value.trim(); if (!t) return; list.push({ id: lm_uid(), text: t, done: false }); lm_save(); lm_planner(body_ref()); };
    $("#w-text", v).addEventListener("keydown", e => { if (e.key === "Enter") $("#w-add", v).click(); });
    $$(".lm-check", v).forEach(b => b.onclick = () => { const t = list.find(x => x.id === b.dataset.id); if (t) { t.done = !t.done; lm_save(); lm_planner(body_ref()); } });
    $$(".lm-del", v).forEach(b => b.onclick = () => { const i = list.findIndex(x => x.id === b.dataset.id); if (i >= 0) { list.splice(i, 1); lm_save(); lm_planner(body_ref()); } });
  }
  function lm_plannerGoals(v) {
    const list = state.planner.goals;
    const total = list.length;
    const avg = total ? Math.round(list.reduce((s, g) => s + (g.progress || 0), 0) / total) : 0;
    const rate = total ? Math.round(list.filter(g => (g.progress || 0) >= 100).length / total * 100) : 0;
    v.innerHTML = `
      <div class="lm-stat-row">
        <div class="lm-mini"><b>${avg}%</b><span>总进度</span></div>
        <div class="lm-mini"><b>${rate}%</b><span>完成率</span></div>
        <div class="lm-mini"><b>${total}</b><span>目标数</span></div>
      </div>
      <button class="btn ghost sm" id="g-add">＋ 添加长期目标</button>
      <div class="lm-goals">${list.map(g => `
        <div class="lm-goal">
          <div class="lm-goal-top"><span class="lm-goal-title">${lm_esc(g.title)}</span><button class="lm-del" data-id="${g.id}">🗑</button></div>
          <input type="range" min="0" max="100" value="${g.progress || 0}" class="lm-range" data-id="${g.id}" />
          <div class="lm-goal-bar"><div style="width:${g.progress || 0}%"></div><span>${g.progress || 0}%</span></div>
        </div>`).join("") || `<div class="empty">还没有长期目标</div>`}</div>`;
    $("#g-add", v).onclick = () => lm_modal(`<h3>新长期目标</h3><input id="g-title" class="lm-input" placeholder="目标名称…" /><div class="lm-modal-actions"><button class="btn ghost" id="g-cancel">取消</button><button class="btn" id="g-ok">保存</button></div>`, (sheet) => {
      $("#g-cancel", sheet).onclick = lm_closeModal;
      $("#g-ok", sheet).onclick = () => { const t = $("#g-title", sheet).value.trim(); if (!t) return; list.push({ id: lm_uid(), title: t, progress: 0 }); lm_save(); lm_closeModal(); lm_planner(body_ref()); };
    });
    $$(".lm-range", v).forEach(r => r.oninput = () => { const g = list.find(x => x.id === r.dataset.id); if (g) { g.progress = +r.value; const bar = r.nextElementSibling; bar.firstElementChild.style.width = r.value + "%"; bar.querySelector("span").textContent = r.value + "%"; } });
    $$(".lm-range", v).forEach(r => r.onchange = () => lm_save());
    $$(".lm-del", v).forEach(b => b.onclick = () => { const i = list.findIndex(x => x.id === b.dataset.id); if (i >= 0) { list.splice(i, 1); lm_save(); lm_planner(body_ref()); } });
  }

  /* =======================================================================
     2. 我的记账 accounting
     ======================================================================= */
  const ACCT_CATS = ["餐饮", "交通", "购物", "娱乐", "住房", "教育", "工资", "理财", "医疗", "旅行", "人情", "其他"];
  function lm_accounting(body) {
    const recs = state.accounting.records;
    const mk = lm_monthKey(lm_today());
    const cur = recs.filter(r => lm_monthKey(r.date) === mk);
    const income = cur.filter(r => r.type === "in").reduce((s, r) => s + r.amount, 0);
    const expense = cur.filter(r => r.type === "out").reduce((s, r) => s + r.amount, 0);
    const byCat = {};
    cur.filter(r => r.type === "out").forEach(r => { byCat[r.cat] = (byCat[r.cat] || 0) + r.amount; });
    const cats = Object.keys(byCat);
    body.innerHTML = `
      <div class="lm-stat-row">
        <div class="lm-mini in"><b>¥${income.toFixed(0)}</b><span>本月收入</span></div>
        <div class="lm-mini out"><b>¥${expense.toFixed(0)}</b><span>本月支出</span></div>
        <div class="lm-mini"><b>¥${(income - expense).toFixed(0)}</b><span>结余</span></div>
      </div>
      <div class="lm-card"><div class="lm-card-title">支出分类占比</div><div class="lm-chart-box"><canvas id="acct-pie"></canvas></div>${cats.length ? "" : '<div class="empty">本月暂无支出</div>'}</div>
      <div class="lm-row">
        <select id="a-type" class="lm-input" style="max-width:90px"><option value="out">支出</option><option value="in">收入</option></select>
        <select id="a-cat" class="lm-input" style="max-width:110px">${ACCT_CATS.map(c => `<option>${c}</option>`).join("")}</select>
        <input id="a-amt" type="number" class="lm-input" placeholder="金额" style="max-width:90px" />
        <input id="a-note" class="lm-input" placeholder="备注" />
        <button class="btn" id="a-add">＋</button>
      </div>
      <div class="lm-list">${[...recs].reverse().slice(0, 40).map(r => `
        <div class="lm-task">
          <span class="lm-chip ${r.type === "in" ? "in" : "out"}">${r.type === "in" ? "收" : "支"}</span>
          <div class="lm-task-main"><div class="lm-task-text">${lm_esc(r.cat)} · ${lm_esc(r.note || "")}</div><div class="lm-task-meta"><span>${r.date}</span></div></div>
          <b class="${r.type === "in" ? "pos" : "neg"}">${r.type === "in" ? "+" : "-"}¥${r.amount.toFixed(0)}</b>
          <button class="lm-del" data-id="${r.id}">🗑</button>
        </div>`).join("") || `<div class="empty">还没有记账</div>`}</div>`;
    if (cats.length) {
      lm_chart("acct-pie", "pie", {
        labels: cats,
        datasets: [{ data: cats.map(c => byCat[c]), backgroundColor: LM_PALETTE, borderColor: "#fff", borderWidth: 2 }]
      }, { plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } } });
    }
    $("#a-add", body).onclick = () => {
      const amt = parseFloat($("#a-amt", body).value); if (!amt || amt <= 0) return lm_toast("请输入金额");
      recs.push({ id: lm_uid(), type: $("#a-type", body).value, cat: $("#a-cat", body).value, amount: amt, note: $("#a-note", body).value.trim(), date: lm_today() });
      lm_save(); lm_accounting(body_ref());
    };
    $$(".lm-del", body).forEach(b => b.onclick = () => { const i = recs.findIndex(x => x.id === b.dataset.id); if (i >= 0) { recs.splice(i, 1); lm_save(); lm_accounting(body_ref()); } });
  }

  /* =======================================================================
     3. 运动打卡 exercise
     ======================================================================= */
  const EX_SPORTS = ["跑步", "八段锦", "体态", "骑行", "瑜伽", "散步"];
  function lm_exercise(body) {
    const logs = state.exercise.logs;
    // 连续打卡天数
    let streak = 0; const set = new Set(logs.map(l => l.date));
    let d = new Date();
    for (;;) {
      const ds = d.toISOString().slice(0, 10);
      if (set.has(ds)) { streak++; d.setDate(d.getDate() - 1); } else break;
    }
    const wk = lm_weekStart(lm_today());
    const wkDates = lm_lastDays(7, lm_dateAdd(wk, 6));
    const heat = wkDates.map(ds => logs.filter(l => l.date === ds).reduce((s, l) => s + (l.duration || 0), 0));
    const maxH = Math.max(1, ...heat);
    body.innerHTML = `
      <div class="lm-stat-row">
        <div class="lm-mini"><b>🔥 ${streak}</b><span>连续打卡(天)</span></div>
        <div class="lm-mini"><b>${logs.length}</b><span>总记录</span></div>
        <div class="lm-mini"><b>${logs.filter(l => l.date === lm_today()).length}</b><span>今日次数</span></div>
      </div>
      <div class="lm-card"><div class="lm-card-title">本周打卡热力图</div>
        <div class="ex-heat">${wkDates.map((ds, i) => `<div class="ex-cell" style="background:${hexA(lm_color(1), 0.12 + 0.88 * heat[i] / maxH)}" title="${ds}: ${heat[i]}分钟"><span>${["一","二","三","四","五","六","日"][i]}</span></div>`).join("")}</div>
      </div>
      <div class="lm-row">
        <select id="e-type" class="lm-input" style="max-width:110px">${EX_SPORTS.map(s => `<option>${s}</option>`).join("")}</select>
        <input id="e-min" type="number" class="lm-input" placeholder="时长(分)" style="max-width:90px" />
        <input id="e-hr" type="number" class="lm-input" placeholder="心率" style="max-width:80px" />
        <button class="btn" id="e-add">打卡</button>
      </div>
      <div class="lm-list">${[...logs].reverse().slice(0, 30).map(l => `
        <div class="lm-task">
          <span class="lm-chip">${lm_esc(l.type)}</span>
          <div class="lm-task-main"><div class="lm-task-text">${l.duration} 分钟${l.hr ? " · 心率 " + l.hr : ""}</div><div class="lm-task-meta"><span>${l.date}</span></div></div>
          <button class="lm-del" data-id="${l.id}">🗑</button>
        </div>`).join("") || `<div class="empty">还没有运动记录</div>`}</div>`;
    $("#e-add", body).onclick = () => {
      const dur = parseInt($("#e-min", body).value); if (!dur || dur <= 0) return lm_toast("请输入时长");
      logs.push({ id: lm_uid(), type: $("#e-type", body).value, duration: dur, hr: parseInt($("#e-hr", body).value) || null, date: lm_today() });
      lm_save(); lm_exercise(body_ref());
    };
    $$(".lm-del", body).forEach(b => b.onclick = () => { const i = logs.findIndex(x => x.id === b.dataset.id); if (i >= 0) { logs.splice(i, 1); lm_save(); lm_exercise(body_ref()); } });
  }

  /* =======================================================================
     4. 心情日记 mood
     ======================================================================= */
  const MOODS = [{ e: "😀", s: 6, c: "#34d399", t: "愉悦" }, { e: "😊", s: 5, c: "#a3e635", t: "不错" }, { e: "😐", s: 4, c: "#fbbf24", t: "平淡" }, { e: "😟", s: 3, c: "#fb923c", t: "低落" }, { e: "😢", s: 2, c: "#f87171", t: "难过" }, { e: "😡", s: 1, c: "#ef4444", t: "生气" }];
  function lm_mood(body) {
    const logs = state.mood.logs;
    const map = {}; logs.forEach(l => map[l.date] = l);
    const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
    const weeks = lm_monthMatrix(y, m);
    const wd = lm_lastDays(7);
    const trend = wd.map(ds => map[ds] ? map[ds].moodScore : null);
    const energy = wd.map(ds => map[ds] ? map[ds].energy : null);
    body.innerHTML = `
      <div class="lm-stat-row">
        <div class="lm-mini"><b>${map[lm_today()] ? MOODS.find(x => x.s === map[lm_today()].moodScore).e : "—"}</b><span>今日心情</span></div>
        <div class="lm-mini"><b>${map[lm_today()] ? map[lm_today()].energy + "/10" : "—"}</b><span>精力值</span></div>
        <div class="lm-mini"><b>${map[lm_today()] ? map[lm_today()].sleep + "h" : "—"}</b><span>睡眠</span></div>
      </div>
      <div class="lm-card"><div class="lm-card-title">本月日历（心情 + 精力）</div>
        <div class="mood-cal">
          <div class="mood-wd">${["一","二","三","四","五","六","日"].map(w => `<span>${w}</span>`).join("")}</div>
          ${weeks.map(w => `<div class="mood-wrow">${w.map(ds => {
            if (!ds) return `<span class="mood-cell empty"></span>`;
            const l = map[ds];
            if (!l) return `<span class="mood-cell"><b>${+ds.slice(8)}</b></span>`;
            const mo = MOODS.find(x => x.s === l.moodScore) || MOODS[2];
            return `<span class="mood-cell" style="border-color:${mo.c}" title="${ds}"><b>${+ds.slice(8)}</b><span class="mood-e">${mo.e}</span><span class="mood-en" style="background:${hexA('#8b5cf6', 0.15 + 0.85 * (l.energy / 10))}">${l.energy}</span></span>`;
          }).join("")}</div>`).join("")}
        </div>
      </div>
      <div class="lm-card"><div class="lm-card-title">本周趋势</div><div class="lm-chart-box"><canvas id="mood-line"></canvas></div></div>
      <div class="lm-row">
        <select id="m-mood" class="lm-input" style="max-width:120px">${MOODS.map(x => `<option value="${x.s}">${x.e} ${x.t}</option>`).join("")}</select>
        <input id="m-sleep" type="number" step="0.5" class="lm-input" placeholder="睡眠(h)" style="max-width:90px" />
        <input id="m-energy" type="number" class="lm-input" placeholder="精力1-10" style="max-width:90px" />
        <button class="btn" id="m-add">记录</button>
      </div>
      <textarea id="m-text" class="lm-input" placeholder="今天怎么了…（可选）" style="min-height:60px;margin-top:8px"></textarea>`;
    lm_chart("mood-line", "line", {
      labels: wd.map(d => +d.slice(8) + "日"),
      datasets: [
        { label: "心情", data: trend, borderColor: lm_color(1), backgroundColor: hexA(lm_color(1), 0.15), tension: 0.3, spanGaps: true },
        { label: "精力", data: energy, borderColor: "#8b5cf6", backgroundColor: hexA("#8b5cf6", 0.15), tension: 0.3, spanGaps: true, yAxisID: "y1" }
      ]
    }, {
      scales: { y: { min: 1, max: 6, ticks: { stepSize: 1 } }, y1: { min: 0, max: 10, position: "right", grid: { drawOnChartArea: false } } },
      plugins: { legend: { position: "bottom" } }
    });
    $("#m-add", body).onclick = () => {
      const sleep = parseFloat($("#m-sleep", body).value) || 0;
      const en = parseInt($("#m-energy", body).value) || 0;
      if (!sleep || !en) return lm_toast("请填写睡眠和精力");
      const ex = logs.find(l => l.date === lm_today());
      const rec = { id: lm_uid(), date: lm_today(), moodScore: +$("#m-mood", body).value, sleep, energy: en, text: $("#m-text", body).value.trim() };
      if (ex) Object.assign(ex, rec); else logs.push(rec);
      lm_save(); lm_mood(body_ref());
    };
  }

  /* =======================================================================
     5. 读书收获 reading
     ======================================================================= */
  const BOOK_RECS = [
    { title: "始于极限", author: "上野千鹤子 / 铃木凉美", rating: 9.0, tip: "女性主义书信集，关于爱、工作与自由的坦诚对话。" },
    { title: "一间自己的房间", author: "弗吉尼亚·伍尔夫", rating: 8.7, tip: "独立空间与经济自主，是女性创作的起点。" },
    { title: "你当像鸟飞往你的山", author: "塔拉·韦斯特弗", rating: 8.8, tip: "教育与自我重塑的真实成长故事。" },
    { title: "第二性", author: "西蒙娜·德·波伏瓦", rating: 9.2, tip: "女性作为「他者」的经典存在主义剖析。" },
    { title: "82年生的金智英", author: "赵南柱", rating: 8.4, tip: "普通韩国女性的日常，映射普遍的性别困境。" },
    { title: "醒来的女性", author: "玛丽莲·弗伦奇", rating: 8.6, tip: "婚姻与自我觉醒，一代女性的缩影。" },
    { title: "我的天才女友", author: "埃莱娜·费兰特", rating: 8.9, tip: "女性友谊与成长，那不勒斯四部曲开篇。" },
    { title: "看不见的女性", author: "卡罗琳·克里亚多·佩雷斯", rating: 9.1, tip: "用数据揭示「默认男性」世界中的女性盲区。" }
  ];
  function lm_reading(body) {
    const r = state.reading;
    const done = r.books.filter(b => b.status === "done");
    const pct = r.goal ? Math.round(done.length / r.goal * 100) : 0;
    const months = {};
    done.forEach(b => { if (b.end) { const mk = b.end.slice(0, 7); months[mk] = (months[mk] || 0) + 1; } });
    const mkList = Object.keys(months).sort().slice(-8);
    const recPool = BOOK_RECS;
    const rec = recPool[(r.recIdx || 0) % recPool.length];
    body.innerHTML = `
      <div class="lm-stat-row">
        <div class="lm-mini"><b>${done.length}/${r.goal}</b><span>年度目标</span></div>
        <div class="lm-mini"><b>${r.books.filter(b => b.status === "reading").length}</b><span>在读</span></div>
        <div class="lm-mini"><b>${done.length ? (done.reduce((s, b) => s + (b.rating || 0), 0) / done.length).toFixed(1) : "—"}</b><span>均分</span></div>
      </div>
      <div class="lm-progress"><div class="lm-progress-bar" style="width:${pct}%"></div><span>年度目标完成度 ${pct}%</span></div>
      <div class="lm-card"><div class="lm-card-title">每月读完数量</div><div class="lm-chart-box"><canvas id="read-bar"></canvas></div></div>
      <div class="lm-card rec-card">
        <div class="lm-card-title">📚 本月女性成长推荐</div>
        <div class="rec-book"><b>${lm_esc(rec.title)}</b><span>${lm_esc(rec.author)} · 豆瓣 ${rec.rating}</span><p>${lm_esc(rec.tip)}</p></div>
        <div class="lm-row" style="justify-content:flex-start;gap:8px">
          <button class="btn sm" id="r-addrec">＋ 加入在读</button>
          <button class="btn ghost sm" id="r-refresh">🔄 换一本</button>
        </div>
      </div>
      <div class="lm-row">
        <input id="b-title" class="lm-input" placeholder="书名" />
        <input id="b-author" class="lm-input" placeholder="作者" style="max-width:110px" />
        <button class="btn" id="b-add">＋ 添加</button>
      </div>
      <div class="lm-list">${[...r.books].reverse().map(b => `
        <div class="lm-task ${b.status === "done" ? "done" : ""}">
          <button class="lm-check" data-id="${b.id}">${b.status === "done" ? "✅" : "📖"}</button>
          <div class="lm-task-main"><div class="lm-task-text">${lm_esc(b.title)} <small>${lm_esc(b.author || "")}</small></div>
          <div class="lm-task-meta"><span>${b.status === "done" ? "已读 · " + (b.rating || "-") + "分" : "在读"} · ${b.start || ""}${b.end ? " → " + b.end : ""}</span></div>
          ${b.review ? `<div class="lm-review">“${lm_esc(b.review)}”</div>` : ""}</div>
          <button class="lm-del" data-id="${b.id}">🗑</button>
        </div>`).join("") || `<div class="empty">还没有书</div>`}</div>`;
    lm_chart("read-bar", "bar", {
      labels: mkList.length ? mkList : ["暂无"],
      datasets: [{ label: "读完(本)", data: mkList.map(m => months[m]), backgroundColor: lm_color(0.85), borderRadius: 8 }]
    }, { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } });
    $("#r-addrec", body).onclick = () => { r.books.push({ id: lm_uid(), title: rec.title, author: rec.author, start: lm_today(), status: "reading" }); lm_save(); lm_reading(body_ref()); lm_toast("已加入在读列表"); };
    $("#r-refresh", body).onclick = () => { r.recIdx = ((r.recIdx || 0) + 1) % recPool.length; lm_save(); lm_reading(body_ref()); };
    $("#b-add", body).onclick = () => {
      const t = $("#b-title", body).value.trim(); if (!t) return lm_toast("请输入书名");
      r.books.push({ id: lm_uid(), title: t, author: $("#b-author", body).value.trim(), start: lm_today(), status: "reading" });
      lm_save(); lm_reading(body_ref());
    };
    $$(".lm-check", body).forEach(b => b.onclick = () => {
      const bk = r.books.find(x => x.id === b.dataset.id); if (!bk) return;
      if (bk.status === "done") { bk.status = "reading"; bk.end = null; bk.rating = null; }
      else lm_modal(`<h3>读完《${lm_esc(bk.title)}》</h3>
        <label>结束日期</label><input id="bk-end" class="lm-input" type="date" value="${lm_today()}" />
        <label>评分(1-10)</label><input id="bk-rate" class="lm-input" type="number" min="1" max="10" placeholder="8" />
        <label>短评</label><textarea id="bk-review" class="lm-input" placeholder="一句话感想…"></textarea>
        <div class="lm-modal-actions"><button class="btn ghost" id="bk-cancel">取消</button><button class="btn" id="bk-ok">标记读完</button></div>`,
        (sheet) => { $("#bk-cancel", sheet).onclick = lm_closeModal; $("#bk-ok", sheet).onclick = () => { bk.status = "done"; bk.end = $("#bk-end", sheet).value; bk.rating = parseInt($("#bk-rate", sheet).value) || null; bk.review = $("#bk-review", sheet).value.trim(); lm_save(); lm_closeModal(); lm_reading(body_ref()); }; });
      lm_save(); lm_reading(body_ref());
    });
    $$(".lm-del", body).forEach(b => b.onclick = () => { const i = r.books.findIndex(x => x.id === b.dataset.id); if (i >= 0) { r.books.splice(i, 1); lm_save(); lm_reading(body_ref()); } });
  }

  /* =======================================================================
     6. 旅行计划 travel
     ======================================================================= */
  function lm_travel(body) {
    const plans = state.travel.plans;
    body.innerHTML = `
      <button class="btn ghost sm" id="t-add">＋ 新建旅行计划</button>
      <div class="lm-travel">${plans.map(p => `
        <div class="lm-trip">
          <div class="lm-trip-head"><span class="lm-trip-name">${lm_esc(p.name)}</span><button class="lm-del" data-id="${p.id}">🗑</button></div>
          <div class="lm-trip-meta">📍 ${lm_esc(p.dest)} · ${lm_esc(p.start)}${p.end ? " → " + lm_esc(p.end) : ""}</div>
          <div class="lm-trip-sec"><b>行程安排</b><button class="btn ghost xs" data-add-it="${p.id}">＋</button></div>
          <div class="lm-list sm">${p.itinerary.map(it => `<div class="lm-task ${it.done ? "done" : ""}"><button class="lm-check" data-it="${it.id}" data-p="${p.id}">${it.done ? "✅" : "⬜"}</button><div class="lm-task-main"><div class="lm-task-text">${lm_esc(it.note)}</div><div class="lm-task-meta"><span>${lm_esc(it.date || "")}</span></div></div><button class="lm-del" data-del-it="${it.id}" data-p="${p.id}">🗑</button></div>`).join("") || `<div class="empty">暂无行程</div>`}</div>
          <div class="lm-trip-sec"><b>🧳 打包清单</b><button class="btn ghost xs" data-add-pk="${p.id}">＋</button></div>
          <div class="lm-list sm">${p.packing.map(pk => `<div class="lm-task ${pk.done ? "done" : ""}"><button class="lm-check" data-pk="${pk.id}" data-p="${p.id}">${pk.done ? "✅" : "⬜"}</button><div class="lm-task-text">${lm_esc(pk.text)}</div><button class="lm-del" data-del-pk="${pk.id}" data-p="${p.id}">🗑</button></div>`).join("") || `<div class="empty">暂无物品</div>`}</div>
        </div>`).join("") || `<div class="empty">还没有旅行计划</div>`}</div>`;
    $("#t-add", body).onclick = () => lm_modal(`<h3>新建旅行计划</h3>
      <input id="tp-name" class="lm-input" placeholder="计划名称，如：东京5日" />
      <input id="tp-dest" class="lm-input" placeholder="目的地" />
      <input id="tp-start" class="lm-input" type="date" />
      <input id="tp-end" class="lm-input" type="date" />
      <div class="lm-modal-actions"><button class="btn ghost" id="tp-cancel">取消</button><button class="btn" id="tp-ok">创建</button></div>`,
      (sheet) => { $("#tp-cancel", sheet).onclick = lm_closeModal; $("#tp-ok", sheet).onclick = () => { const n = $("#tp-name", sheet).value.trim() || "未命名旅行"; plans.push({ id: lm_uid(), name: n, dest: $("#tp-dest", sheet).value.trim(), start: $("#tp-start", sheet).value, end: $("#tp-end", sheet).value, itinerary: [], packing: [] }); lm_save(); lm_closeModal(); lm_travel(body_ref()); }; });
    $$("[data-add-it]", body).forEach(b => b.onclick = () => { const p = plans.find(x => x.id === b.dataset.addIt); lm_modal(`<h3>添加行程</h3><input id="it-date" class="lm-input" type="date" value="${lm_today()}" /><input id="it-note" class="lm-input" placeholder="安排内容…" /><div class="lm-modal-actions"><button class="btn ghost" id="it-c">取消</button><button class="btn" id="it-ok">添加</button></div>`, (s) => { $("#it-c", s).onclick = lm_closeModal; $("#it-ok", s).onclick = () => { const t = $("#it-note", s).value.trim(); if (!t) return; p.itinerary.push({ id: lm_uid(), date: $("#it-date", s).value, note: t, done: false }); lm_save(); lm_closeModal(); lm_travel(body_ref()); }; }); });
    $$("[data-add-pk]", body).forEach(b => b.onclick = () => { const p = plans.find(x => x.id === b.dataset.addPk); lm_modal(`<h3>添加打包物品</h3><input id="pk-text" class="lm-input" placeholder="物品名称…" /><div class="lm-modal-actions"><button class="btn ghost" id="pk-c">取消</button><button class="btn" id="pk-ok">添加</button></div>`, (s) => { $("#pk-c", s).onclick = lm_closeModal; $("#pk-ok", s).onclick = () => { const t = $("#pk-text", s).value.trim(); if (!t) return; p.packing.push({ id: lm_uid(), text: t, done: false }); lm_save(); lm_closeModal(); lm_travel(body_ref()); }; }); });
    $$("[data-it]", body).forEach(b => b.onclick = () => { const p = plans.find(x => x.id === b.dataset.p); const it = p.itinerary.find(i => i.id === b.dataset.it); if (it) { it.done = !it.done; lm_save(); lm_travel(body_ref()); } });
    $$("[data-pk]", body).forEach(b => b.onclick = () => { const p = plans.find(x => x.id === b.dataset.p); const pk = p.packing.find(i => i.id === b.dataset.pk); if (pk) { pk.done = !pk.done; lm_save(); lm_travel(body_ref()); } });
    $$("[data-del-it]", body).forEach(b => b.onclick = () => { const p = plans.find(x => x.id === b.dataset.p); const i = p.itinerary.findIndex(x => x.id === b.dataset.delIt); if (i >= 0) { p.itinerary.splice(i, 1); lm_save(); lm_travel(body_ref()); } });
    $$("[data-del-pk]", body).forEach(b => b.onclick = () => { const p = plans.find(x => x.id === b.dataset.p); const i = p.packing.findIndex(x => x.id === b.dataset.delPk); if (i >= 0) { p.packing.splice(i, 1); lm_save(); lm_travel(body_ref()); } });
    $$(".lm-del", body).forEach(b => b.onclick = () => { const i = plans.findIndex(x => x.id === b.dataset.id); if (i >= 0) { plans.splice(i, 1); lm_save(); lm_travel(body_ref()); } });
  }

  /* =======================================================================
     7. 自媒体创作 media
     ======================================================================= */
  const MEDIA_PLATFORMS = ["抖音", "小红书", "视频号", "B站", "快手", "其他"];
  const MEDIA_STATUS = ["待创作", "创作中", "待发布", "已发布"];
  let mediaFilter = { platform: "", status: "" };
  function lm_media(body) {
    const list = state.media.topics;
    const filtered = list.filter(t => (!mediaFilter.platform || t.platform === mediaFilter.platform) && (!mediaFilter.status || t.status === mediaFilter.status));
    const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
    const weeks = lm_monthMatrix(y, m);
    const map = {}; list.forEach(t => { if (t.deadline) (map[t.deadline] = map[t.deadline] || []).push(t); });
    body.innerHTML = `
      <p class="lm-hint">选题管理 · 发布日历（绿=已发布，黄=计划）</p>
      <div class="lm-filters">
        <select id="mf-plat" class="lm-input sm"><option value="">全部平台</option>${MEDIA_PLATFORMS.map(p => `<option ${mediaFilter.platform === p ? "selected" : ""}>${p}</option>`).join("")}</select>
        <select id="mf-stat" class="lm-input sm"><option value="">全部状态</option>${MEDIA_STATUS.map(s => `<option ${mediaFilter.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      </div>
      <div class="lm-row">
        <input id="m-title" class="lm-input" placeholder="选题标题" />
        <select id="m-plat" class="lm-input sm">${MEDIA_PLATFORMS.map(p => `<option>${p}</option>`).join("")}</select>
        <select id="m-stat" class="lm-input sm">${MEDIA_STATUS.map(s => `<option ${s === "待创作" ? "selected" : ""}>${s}</option>`).join("")}</select>
        <input id="m-dead" class="lm-input sm" type="date" />
        <button class="btn" id="m-add">＋</button>
      </div>
      <div class="lm-card"><div class="lm-card-title">发布日历 ${y}年${m + 1}月</div>
        <div class="mood-cal"><div class="mood-wd">${["一","二","三","四","五","六","日"].map(w => `<span>${w}</span>`).join("")}</div>
        ${weeks.map(w => `<div class="mood-wrow">${w.map(ds => {
          if (!ds) return `<span class="mood-cell empty"></span>`;
          const ts = map[ds] || [];
          const dot = ts.some(t => t.status === "已发布") ? "dot-green" : (ts.length ? "dot-yellow" : "");
          return `<span class="mood-cell ${dot ? "has-dot" : ""}" title="${ts.map(t => t.title + "·" + t.status).join("; ")}"><b>${+ds.slice(8)}</b>${dot ? `<span class="cal-dot ${dot}"></span>` : ""}</span>`;
        }).join("")}</div>`).join("")}</div>
      </div>
      <div class="lm-list">${filtered.map(t => `
        <div class="lm-task" data-edit="${t.id}">
          <span class="lm-chip">${lm_esc(t.platform)}</span>
          <div class="lm-task-main"><div class="lm-task-text">${lm_esc(t.title)}</div><div class="lm-task-meta"><span class="lm-status s-${MEDIA_STATUS.indexOf(t.status)}">${lm_esc(t.status)}</span>${t.deadline ? " · " + lm_esc(t.deadline) : ""}</div></div>
          <button class="lm-del" data-id="${t.id}">🗑</button>
        </div>`).join("") || `<div class="empty">暂无选题</div>`}</div>
      <div class="lm-card"><div class="lm-card-title">🔥 爆款灵感参考</div>
        <p class="lm-hint">说明：自动每日 9:00 采集各平台赛道爆款，需要后端接入平台开放 API（含密钥与合规授权）。当前为手动录入版——把你看到的爆款逐条填进来，系统帮你拆解火爆原因并生成原创思路。</p>
        <button class="btn ghost sm" id="m-addhot">＋ 添加爆款参考</button>
        <div class="lm-list sm">${state.media.hot.map(h => `
          <div class="lm-hot">
            <div class="lm-hot-head"><b>${lm_esc(h.title)}</b>${h.link ? `<a href="${lm_esc(h.link)}" target="_blank" rel="noopener" class="lm-link">原视频↗</a>` : ""}</div>
            <div class="lm-hot-why"><b>火爆原因：</b>${lm_esc(h.why)}</div>
            <div class="lm-hot-idea"><b>原创思路：</b>${lm_esc(h.idea)}</div>
            <button class="lm-del" data-hot="${h.id}">🗑</button>
          </div>`).join("") || `<div class="empty">还没有爆款参考</div>`}</div>
      </div>`;
    $("#mf-plat", body).onchange = () => { mediaFilter.platform = $("#mf-plat", body).value; lm_media(body_ref()); };
    $("#mf-stat", body).onchange = () => { mediaFilter.status = $("#mf-stat", body).value; lm_media(body_ref()); };
    $("#m-add", body).onclick = () => { const t = $("#m-title", body).value.trim(); if (!t) return lm_toast("请输入标题"); list.push({ id: lm_uid(), title: t, platform: $("#m-plat", body).value, status: $("#m-stat", body).value, deadline: $("#m-dead", body).value || null, note: "" }); lm_save(); lm_media(body_ref()); };
    $$("[data-edit]", body).forEach(el => el.onclick = (e) => { if (e.target.closest(".lm-del")) return; const t = list.find(x => x.id === el.dataset.edit); if (!t) return; lm_modal(`<h3>编辑选题</h3>
      <input id="ed-title" class="lm-input" value="${lm_esc(t.title)}" />
      <select id="ed-plat" class="lm-input">${MEDIA_PLATFORMS.map(p => `<option ${p === t.platform ? "selected" : ""}>${p}</option>`).join("")}</select>
      <select id="ed-stat" class="lm-input">${MEDIA_STATUS.map(s => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select>
      <input id="ed-dead" class="lm-input" type="date" value="${t.deadline || ""}" />
      <textarea id="ed-note" class="lm-input" placeholder="备注/脚本要点">${lm_esc(t.note || "")}</textarea>
      <div class="lm-modal-actions"><button class="btn ghost" id="ed-c">取消</button><button class="btn" id="ed-ok">保存</button></div>`,
      (s) => { $("#ed-c", s).onclick = lm_closeModal; $("#ed-ok", s).onclick = () => { t.title = $("#ed-title", s).value.trim(); t.platform = $("#ed-plat", s).value; t.status = $("#ed-stat", s).value; t.deadline = $("#ed-dead", s).value || null; t.note = $("#ed-note", s).value.trim(); lm_save(); lm_closeModal(); lm_media(body_ref()); }; });
    });
    $("#m-addhot", body).onclick = () => lm_modal(`<h3>添加爆款参考</h3>
      <input id="h-title" class="lm-input" placeholder="视频/话题标题" />
      <input id="h-link" class="lm-input" placeholder="原视频链接(可选)" />
      <textarea id="h-why" class="lm-input" placeholder="它为什么火？（核心原因）"></textarea>
      <textarea id="h-idea" class="lm-input" placeholder="我的原创创作思路"></textarea>
      <div class="lm-modal-actions"><button class="btn ghost" id="h-c">取消</button><button class="btn" id="h-ok">保存</button></div>`,
      (s) => { $("#h-c", s).onclick = lm_closeModal; $("#h-ok", s).onclick = () => { const t = $("#h-title", s).value.trim(); if (!t) return; state.media.hot.unshift({ id: lm_uid(), title: t, link: $("#h-link", s).value.trim(), why: $("#h-why", s).value.trim(), idea: $("#h-idea", s).value.trim() }); lm_save(); lm_closeModal(); lm_media(body_ref()); }; });
    $$("[data-hot]", body).forEach(b => b.onclick = () => { const i = state.media.hot.findIndex(x => x.id === b.dataset.hot); if (i >= 0) { state.media.hot.splice(i, 1); lm_save(); lm_media(body_ref()); } });
    $$(".lm-del", body).forEach(b => b.onclick = () => { const i = list.findIndex(x => x.id === b.dataset.id); if (i >= 0) { list.splice(i, 1); lm_save(); lm_media(body_ref()); } });
  }

  /* =======================================================================
     8. 灵感积累 inspo
     ======================================================================= */
  const INSPO_TAGS = ["工作", "生活", "创作"];
  const INSPO_CATS = ["文案", "视觉", "观点", "案例"];
  let inspoView = "notes";
  function lm_inspo(body) {
    const tabs = [["notes", "闪念笔记"], ["mat", "创作素材"], ["board", "灵感看板"]];
    body.innerHTML = `<div class="lm-subtabs">${tabs.map(t => `<button class="lm-subtab ${inspoView === t[0] ? "active" : ""}" data-v="${t[0]}">${t[1]}</button>`).join("")}</div><div id="inspo-view"></div>`;
    $$(".lm-subtab", body).forEach(b => b.onclick = () => { inspoView = b.dataset.v; lm_inspo(body); });
    const v = $("#inspo-view", body);
    if (inspoView === "notes") lm_inspoNotes(v);
    else if (inspoView === "mat") lm_inspoMat(v);
    else lm_inspoBoard(v);
  }
  function lm_inspoNotes(v) {
    const notes = state.inspo.notes;
    v.innerHTML = `
      <div class="lm-row">
        <select id="n-tag" class="lm-input sm">${INSPO_TAGS.map(t => `<option>${t}</option>`).join("")}</select>
        <button class="btn ghost sm" id="n-voice">🎤 语音</button>
        <button class="btn sm" id="n-add">＋ 记录</button>
      </div>
      <textarea id="n-text" class="lm-input" placeholder="闪过的念头…（自动打时间戳）" style="min-height:64px"></textarea>
      <div class="lm-filters" id="n-filter">${INSPO_TAGS.map(t => `<button class="lm-chip ${state.inspo.noteFilter === t ? "active" : ""}" data-ft="${t}">${t}</button>`).join("")}${state.inspo.noteFilter ? `<button class="lm-chip" data-ft="">全部</button>` : ""}</div>
      <div class="lm-list">${(state.inspo.noteFilter ? notes.filter(n => n.tag === state.inspo.noteFilter) : notes).map(n => `
        <div class="lm-task"><span class="lm-chip">${lm_esc(n.tag)}</span><div class="lm-task-main"><div class="lm-task-text">${lm_esc(n.text)}</div><div class="lm-task-meta"><span>${lm_esc(n.time)}</span></div></div><button class="lm-del" data-id="${n.id}">🗑</button></div>`).join("") || `<div class="empty">还没有闪念</div>`}</div>`;
    $$("[data-ft]", v).forEach(b => b.onclick = () => { state.inspo.noteFilter = b.dataset.ft || ""; lm_save(); lm_inspoNotes($("#inspo-view", body_ref())); });
    $("#n-add", v).onclick = () => { const t = $("#n-text", v).value.trim(); if (!t) return; notes.unshift({ id: lm_uid(), text: t, tag: $("#n-tag", v).value, time: new Date().toLocaleString("zh-CN", { hour12: false }) }); lm_save(); lm_inspo(body_ref()); };
    $("#n-voice", v).onclick = () => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return lm_toast("当前浏览器不支持语音输入");
      const rec = new SR(); rec.lang = "zh-CN"; rec.interimResults = false;
      rec.onresult = (e) => { const txt = e.results[0][0].transcript; $("#n-text", v).value = ($("#n-text", v).value + txt).trim(); };
      rec.onerror = () => lm_toast("语音识别失败");
      try { rec.start(); lm_toast("请说话…"); } catch (e) { lm_toast("无法启动语音"); }
    };
    $$(".lm-del", v).forEach(b => b.onclick = () => { const i = notes.findIndex(x => x.id === b.dataset.id); if (i >= 0) { notes.splice(i, 1); lm_save(); lm_inspo(body_ref()); } });
  }
  function lm_inspoMat(v) {
    const mats = state.inspo.materials;
    v.innerHTML = `
      <div class="lm-row">
        <select id="m-cat" class="lm-input sm">${INSPO_CATS.map(c => `<option>${c}</option>`).join("")}</select>
        <input id="m-link" class="lm-input sm" placeholder="链接/图片URL" />
        <button class="btn sm" id="m-add">＋ 添加</button>
      </div>
      <input id="m-sum" class="lm-input" placeholder="摘要" style="margin:6px 0" />
      <input id="m-src" class="lm-input" placeholder="来源" style="margin-bottom:8px" />
      <div class="lm-list">${mats.map(m => `
        <div class="lm-task"><span class="lm-chip">${lm_esc(m.cat)}</span><div class="lm-task-main"><div class="lm-task-text">${lm_esc(m.summary)}</div><div class="lm-task-meta"><span>${lm_esc(m.source || "")}</span>${m.link ? ` · <a href="${lm_esc(m.link)}" target="_blank" rel="noopener" class="lm-link">查看↗</a>` : ""}</div></div><button class="lm-del" data-id="${m.id}">🗑</button></div>`).join("") || `<div class="empty">还没有素材</div>`}</div>`;
    $("#m-add", v).onclick = () => { const s = $("#m-sum", v).value.trim(); if (!s) return lm_toast("请输入摘要"); mats.unshift({ id: lm_uid(), cat: $("#m-cat", v).value, link: $("#m-link", v).value.trim(), summary: s, source: $("#m-src", v).value.trim() }); lm_save(); lm_inspo(body_ref()); };
    $$(".lm-del", v).forEach(b => b.onclick = () => { const i = mats.findIndex(x => x.id === b.dataset.id); if (i >= 0) { mats.splice(i, 1); lm_save(); lm_inspo(body_ref()); } });
  }
  function lm_inspoBoard(v) {
    const notes = state.inspo.notes, mats = state.inspo.materials;
    const countOf = (ds) => notes.filter(n => (n.ds || n.time.slice(0, 10)) === ds).length + mats.filter(m => (m.ds || (m.time || "").slice(0, 10)) === ds).length;
    const days = lm_lastDays(30);
    const counts = days.map(countOf);
    const maxC = Math.max(1, ...counts);
    const now = new Date(); const weeks = lm_monthMatrix(now.getFullYear(), now.getMonth());
    const byDate = {}; days.forEach((ds, i) => byDate[ds] = counts[i]);
    v.innerHTML = `
      <div class="lm-card"><div class="lm-card-title">灵感日历（每日数量）</div>
        <div class="mood-cal"><div class="mood-wd">${["一","二","三","四","五","六","日"].map(w => `<span>${w}</span>`).join("")}</div>
        ${weeks.map(w => `<div class="mood-wrow">${w.map(ds => {
          if (!ds) return `<span class="mood-cell empty"></span>`;
          const c = byDate[ds] || 0;
          return `<span class="mood-cell ${c ? "has-dot" : ""}" data-date="${ds}" title="${ds}: ${c}条"><b>${+ds.slice(8)}</b>${c ? `<span class="cal-count" style="background:${hexA(lm_color(1), 0.85)}">${c}</span>` : ""}</span>`;
        }).join("")}</div>`).join("")}</div>
      </div>
      <div class="lm-card"><div class="lm-card-title">最近 7 天灵感趋势</div><div class="lm-chart-box"><canvas id="inspo-trend"></canvas></div></div>`;
    lm_chart("inspo-trend", "bar", { labels: lm_lastDays(7).map(d => +d.slice(8) + "日"), datasets: [{ label: "灵感数", data: lm_lastDays(7).map(d => byDate[d] || 0), backgroundColor: lm_color(0.8), borderRadius: 6 }] }, { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } });
    $$(".mood-cell[data-date]", v).forEach(c => c.onclick = () => {
      const ds = c.dataset.date;
      const items = [...notes.filter(n => (n.ds || n.time.slice(0, 10)) === ds).map(n => "💡 " + n.text), ...mats.filter(m => (m.ds || (m.time || "").slice(0, 10)) === ds).map(m => "📎 " + m.summary)];
      lm_modal(`<h3>${ds} 的灵感（${items.length}）</h3><div class="lm-list">${items.map(i => `<div class="lm-task-text">${lm_esc(i)}</div>`).join("") || "<div class='empty'>当天无记录</div>"}</div><div class="lm-modal-actions"><button class='btn' onclick='document.getElementById(\"modal-root\").innerHTML=\"\"'>关闭</button></div>`);
    });
  }

  /* =======================================================================
     9. 习惯打卡 habit
     ======================================================================= */
  function lm_habitStreak(h) {
    if (h.freq === "weekly") {
      let wk = 0; let d = new Date();
      for (;;) {
        const ws = lm_weekStart(d.toISOString().slice(0, 10));
        const we = lm_dateAdd(ws, 6);
        const any = Object.keys(h.done).some(dt => dt >= ws && dt <= we);
        if (any) { wk++; d = new Date(ws + "T00:00:00"); d.setDate(d.getDate() - 1); } else break;
      }
      return wk + "周";
    }
    let st = 0; let d = new Date();
    for (;;) { const ds = d.toISOString().slice(0, 10); if (h.done[ds]) { st++; d.setDate(d.getDate() - 1); } else break; }
    return st + "天";
  }
  function lm_habit(body) {
    const list = state.habit.habits;
    const today = lm_today();
    body.innerHTML = `
      <button class="btn ghost sm" id="h-add">＋ 添加习惯</button>
      <div class="lm-habits">${list.map(h => {
        const on = !!h.done[today];
        return `<div class="lm-habit ${on ? "on" : ""}" data-id="${h.id}">
          <div class="lm-habit-emoji">${lm_esc(h.emoji || "⭐")}</div>
          <div class="lm-habit-main"><div class="lm-habit-name">${lm_esc(h.name)}</div><div class="lm-habit-meta">${h.freq === "weekly" ? "每周" : "每日"} · 连续 <b>${lm_habitStreak(h)}</b></div></div>
          <button class="lm-habit-btn">${on ? "✓" : "○"}</button>
        </div>`;
      }).join("") || `<div class="empty">还没有习惯</div>`}</div>
      <div class="lm-card"><div class="lm-card-title">月度热力图</div>
        <div class="habit-heat">${lm_lastDays(35).map(ds => {
          const cnt = list.filter(h => h.done[ds]).length;
          const lvl = cnt === 0 ? 0 : Math.min(4, Math.ceil(cnt / Math.max(1, list.length) * 4));
          return `<span class="hh-cell" style="background:${lvl ? hexA(lm_color(1), 0.25 + 0.75 * lvl / 4) : hexA(lm_color(1), 0.08)}" title="${ds}: ${cnt}个习惯"></span>`;
        }).join("")}</div>
        <div class="hh-legend"><span>少</span>${[0,1,2,3,4].map(l => `<span class="hh-cell" style="background:${l ? hexA(lm_color(1), 0.25 + 0.75 * l / 4) : hexA(lm_color(1), 0.08)}"></span>`).join("")}<span>多</span></div>
      </div>`;
    $("#h-add", body).onclick = () => lm_modal(`<h3>新习惯</h3>
      <input id="hb-emoji" class="lm-input" placeholder="Emoji，如 🏃" style="max-width:90px" />
      <input id="hb-name" class="lm-input" placeholder="习惯名称" />
      <select id="hb-freq" class="lm-input"><option value="daily">每日</option><option value="weekly">每周</option></select>
      <div class="lm-modal-actions"><button class="btn ghost" id="hb-c">取消</button><button class="btn" id="hb-ok">创建</button></div>`,
      (s) => { $("#hb-c", s).onclick = lm_closeModal; $("#hb-ok", s).onclick = () => { const n = $("#hb-name", s).value.trim(); if (!n) return; list.push({ id: lm_uid(), name: n, emoji: $("#hb-emoji", s).value.trim() || "⭐", freq: $("#hb-freq", s).value, done: {} }); lm_save(); lm_closeModal(); lm_habit(body_ref()); }; });
    $$(".lm-habit", body).forEach(el => el.onclick = () => { const h = list.find(x => x.id === el.dataset.id); if (!h) return; const t = lm_today(); if (h.done[t]) delete h.done[t]; else h.done[t] = true; lm_save(); lm_habit(body_ref()); });
    $$(".lm-del", body).forEach(b => b.onclick = () => { const i = list.findIndex(x => x.id === b.dataset.id); if (i >= 0) { list.splice(i, 1); lm_save(); lm_habit(body_ref()); } });
  }

  /* ---------------- body 引用（模态/重渲染时定位 main） ---------------- */
  function body_ref() { return document.getElementById("app-main"); }

  /* ---------------- 注册到模块表 ---------------- */
  window.LIFE_MODULES = [
    { id: "planner", title: "每日计划", icon: "🗓️", render: lm_planner },
    { id: "accounting", title: "我的记账", icon: "💰", render: lm_accounting },
    { id: "exercise", title: "运动打卡", icon: "🏃", render: lm_exercise },
    { id: "mood", title: "心情日记", icon: "🌈", render: lm_mood },
    { id: "reading", title: "读书收获", icon: "📚", render: lm_reading },
    { id: "travel", title: "旅行计划", icon: "✈️", render: lm_travel },
    { id: "media", title: "自媒体创作", icon: "🎬", render: lm_media },
    { id: "inspo", title: "灵感积累", icon: "💡", render: lm_inspo },
    { id: "habit", title: "习惯打卡", icon: "🔁", render: lm_habit }
  ];
  if (typeof MODULES !== "undefined") { window.LIFE_MODULES.forEach(m => MODULES.push(m)); }
  if (typeof state !== "undefined") {
    state.planner = state.planner || { today: [], week: [], goals: [], rewardDate: null };
    state.accounting = state.accounting || { records: [] };
    state.exercise = state.exercise || { logs: [] };
    state.mood = state.mood || { logs: [] };
    state.reading = state.reading || { goal: 12, books: [], recIdx: 0 };
    state.travel = state.travel || { plans: [] };
    state.media = state.media || { topics: [], hot: [] };
    state.inspo = state.inspo || { notes: [], materials: [], noteFilter: "" };
    state.habit = state.habit || { habits: [] };
    if (state.coins == null) state.coins = 0;
    // 预填示例
    if (!state.inspo.notes.length && !state.inspo._seeded) {
      const now = new Date();
      const t = (d) => new Date(now.getTime() - d * 86400000).toLocaleString("zh-CN", { hour12: false });
      state.inspo.notes = [
        { id: lm_uid(), text: "给读书账号做一个「女性成长书单」系列，连更 7 天。", tag: "创作", time: t(0), ds: lm_today() },
        { id: lm_uid(), text: "通勤时听韩语播客，比刷视频效率高。", tag: "生活", time: t(1), ds: lm_dateAdd(lm_today(), -1) },
        { id: lm_uid(), text: "周会材料提前一天准备，避免临时焦虑。", tag: "工作", time: t(2), ds: lm_dateAdd(lm_today(), -2) },
        { id: lm_uid(), text: "八段锦放在早起后，比晚上更容易坚持。", tag: "生活", time: t(3), ds: lm_dateAdd(lm_today(), -3) },
        { id: lm_uid(), text: "旅行 vlog 用「一天一座城」的叙事节奏。", tag: "创作", time: t(4), ds: lm_dateAdd(lm_today(), -4) }
      ];
      state.inspo.materials = [
        { id: lm_uid(), cat: "文案", summary: "「普通女孩的复利日常」人设 slogan。", source: "小红书", link: "", time: t(1) },
        { id: lm_uid(), cat: "视觉", summary: "粉白渐变 + 手写体的封面模板。", source: "自设计", link: "", time: t(2) },
        { id: lm_uid(), cat: "观点", summary: "「稳定输出」比「单条爆款」更值钱。", source: "行业文章", link: "", time: t(3) }
      ];
      state.inspo._seeded = true; lm_save();
    }
  }
})();
