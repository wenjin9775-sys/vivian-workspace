/* 生活记录：使用工作台同一份数据；只有本机文件写入成功才报告保存成功。 */
"use strict";

const dailyUI = { date: null, filterDate: "", type: "all", allDates: false, message: "", error: false, draft: {}, pendingSubmit: null };

function dailyRecords() {
  const life = state.life || {};
  return [
    ...(life.weight || []).map(r => ({ ...r, type: "weight" })),
    ...(life.diet || []).flatMap(d => (d.items || []).map(r => ({ ...r, type: "diet", date: d.date, dayId: d.id }))),
    ...(state.exercise?.logs || []).map(r => ({ ...r, sport: r.type, type: "exercise" })),
    ...(state.expense || []).map(r => ({ ...r, type: "expense" })),
    ...(state.dailyNotes || []).map(r => ({ ...r, type: "event" }))
  ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function dailySetMessage(message, error = false) {
  dailyUI.message = message; dailyUI.error = error;
  const el = document.getElementById("daily-status");
  if (el) { el.textContent = message; el.classList.toggle("is-error", error); }
}

async function dailyCommit() {
  if (!window.localSync || typeof window.localSync.flush !== "function") throw new Error("本机保存服务尚未连接。请通过“打开工作台”启动后重试。");
  save();
  const result = await window.localSync.flush();
  if (result === false) throw new Error("记录尚未写入本机，请检查连接或刷新后重试。");
}

function dailyFailure(error) {
  dailySetMessage("尚未确认保存成功：" + (error && error.message || "连接失败") + "。填写内容仍保留；如提示版本冲突，请先导出待保存内容，再载入最新记录。", true);
}

function renderDailyPage() {
  const main = document.getElementById("app-main");
  if (!main) return;
  dailyUI.date = dailyUI.date || todayStr();
  const draft = dailyUI.draft;
  const value = key => esc(draft[key] || "");
  main.innerHTML = `<section class="daily-page">
    <div class="daily-heading"><div><span class="daily-eyebrow">VIVIAN · MY EVERYDAY</span><h2>把日子，一点点记下来</h2><p>体重、三餐、花销，还有值得留下的小事。</p></div><span class="daily-heading-icon" aria-hidden="true">✿</span></div>
    <div class="food-entry"><div><b>拍照也能记录这一餐</b><p>餐盘估算范围，营养标签按食用量计算。</p></div><button type="button" class="ov-button" id="daily-food-photo">📷 拍照记饮食</button></div><div id="daily-stats" class="daily-stats"></div>
    <div class="daily-layout">
      <section class="daily-panel daily-compose" aria-labelledby="daily-compose-heading">
        <div class="daily-section-head"><h3 id="daily-compose-heading">写下这一天</h3><span class="daily-soft-tag">可以补记</span></div>
        <p class="daily-help">只填想记录的项目，留空的不会添加。同一天的体重会更新，其他内容会追加。</p>
        <form id="daily-form">
          <label class="daily-date">记录日期<input id="daily-date" name="date" type="date" required value="${esc(dailyUI.date)}"></label>
          <fieldset><legend><span aria-hidden="true">⚖️</span> 体重</legend><div class="daily-weight-fields"><label>数值<input name="weight" type="number" inputmode="decimal" step="0.01" min="0.01" value="${value("weight")}" placeholder="输入测量值"></label><label>单位<select name="unit"><option value="kg"${draft.unit !== "斤" ? " selected" : ""}>公斤（kg）</option><option value="斤"${draft.unit === "斤" ? " selected" : ""}>斤</option></select></label></div><p class="daily-help">1 公斤 = 2 斤，趋势图统一显示公斤。</p></fieldset>
          <fieldset><legend><span aria-hidden="true">🍱</span> 饮食</legend><div class="daily-meals">${[["breakfast", "早餐"], ["lunch", "午餐"], ["dinner", "晚餐"], ["snack", "加餐"]].map(([key, label]) => `<label>${label}<textarea name="${key}" rows="2" maxlength="5000" placeholder="吃了什么、份量大概多少">${value(key)}</textarea></label>`).join("")}</div><p class="daily-help">按你提供的内容记录，热量未填写时保持空白。</p></fieldset>
          <fieldset><legend><span aria-hidden="true">💸</span> 花销</legend><div class="daily-expense-fields"><label>金额（元）<input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" value="${value("amount")}" placeholder="0.00"></label><label>分类<input name="category" maxlength="100" value="${value("category")}" placeholder="如：餐饮、交通" list="daily-categories"></label></div><datalist id="daily-categories"><option value="餐饮"><option value="交通"><option value="购物"><option value="学习"><option value="生活"><option value="其他"></datalist><label>备注<input name="expenseNote" maxlength="2000" value="${value("expenseNote")}" placeholder="这笔钱花在哪里了"></label></fieldset>
          <fieldset><legend><span aria-hidden="true">🌷</span> 今天的小事</legend><label>随手记<textarea name="event" rows="3" maxlength="10000" placeholder="发生的事情、心情或想留住的片刻…">${value("event")}</textarea></label></fieldset>
          <button type="submit" class="daily-primary" id="daily-save">保存这一天的记录 <span aria-hidden="true">↗</span></button>
        </form>
        <div id="daily-status" role="status" aria-live="polite" class="daily-status${dailyUI.error ? " is-error" : ""}">${esc(dailyUI.message || "记录会保存在这台电脑的工作台文件夹中。")}</div>
      </section>
      <section class="daily-panel daily-history-panel" aria-labelledby="daily-history-heading">
        <div class="daily-section-head"><h3 id="daily-history-heading">生活的足迹</h3><span class="daily-soft-tag" id="daily-history-count"></span></div>
        <div class="daily-filters"><label>筛选日期<input id="daily-filter-date" type="date" value="${esc(dailyUI.filterDate)}"></label><button type="button" class="daily-small-button" id="daily-filter-reset">清除日期</button></div>
        <div class="daily-filter-types" role="group" aria-label="记录类型">${[["all", "全部"], ["weight", "体重"], ["diet", "饮食"], ["expense", "花销"], ["exercise", "运动"], ["event", "小事"]].map(([type, label]) => `<button type="button" data-daily-type="${type}" aria-pressed="${dailyUI.type === type}">${label}</button>`).join("")}</div>
        <label class="daily-all-dates"><input type="checkbox" id="daily-all-dates"${dailyUI.allDates ? " checked" : ""}> 查看全部日期<span>默认显示最近 30 天</span></label>
        <div id="daily-history"></div>
      </section>
    </div>
    <section class="daily-panel daily-backup"><div><h3>给记录留一份备份</h3><p>导出整个工作台的结构化记录；图片不包含在 JSON 中。完整备份请复制整个工作台文件夹。</p></div><div class="daily-backup-buttons"><button type="button" class="daily-small-button" id="daily-export">导出记录</button><button type="button" class="daily-small-button" id="daily-restore">恢复备份</button><input id="daily-import-file" type="file" accept=".json,application/json" hidden></div></section>
  </section>`;

  main.querySelector("#daily-food-photo").onclick=()=>switchTab("food");
  const form = main.querySelector("#daily-form");
  form.addEventListener("input", () => {
    const data = new FormData(form); dailyUI.date = data.get("date");
    dailyUI.draft = Object.fromEntries(data.entries()); drawDailyStats();
  });
  form.onsubmit = async event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(form).entries());
    dailyUI.draft = fields; dailyUI.date = fields.date;
    let entries = [];
    const base = (type, sourceText) => ({ id: uid(), type, date: fields.date, source: "工作台手动记录", sourceText });
    if (fields.weight.trim()) entries.push({ ...base("weight", fields.weight + fields.unit), value: Number(fields.weight), unit: fields.unit });
    for (const [key, meal] of [["breakfast", "早餐"], ["lunch", "午餐"], ["dinner", "晚餐"], ["snack", "加餐"]]) {
      if (fields[key].trim()) entries.push({ ...base("diet", meal + "：" + fields[key].trim()), meal, name: fields[key].trim(), kcal: null });
    }
    if (fields.amount.trim()) entries.push({ ...base("expense", [fields.category || "其他", fields.amount + "元", fields.expenseNote].filter(Boolean).join(" · ")), amount: Number(fields.amount), category: fields.category.trim() || "其他", note: fields.expenseNote.trim() });
    else if (fields.expenseNote.trim() || fields.category.trim()) { dailySetMessage("请填写这笔花销的金额，或清空花销分类和备注后保存其他记录。", true); return; }
    if (fields.event.trim()) entries.push({ ...base("event", fields.event.trim()), title: "今天的小事", text: fields.event.trim() });
    if (!entries.length) { dailySetMessage("先写下至少一项内容，再保存。", true); return; }
    const key = JSON.stringify(fields);
    if (dailyUI.pendingSubmit?.key === key) entries = dailyUI.pendingSubmit.entries;
    else dailyUI.pendingSubmit = { key, entries };
    const button = form.querySelector("#daily-save"); button.disabled = true; button.textContent = "正在保存…";
    try {
      await window.localSync.flush();
      state = VivianRecords.applyEntries(state, entries);
      await dailyCommit();
      dailyUI.draft = { unit: fields.unit };
      dailyUI.pendingSubmit = null;
      dailyUI.filterDate = fields.date;
      dailySetMessage(`${fields.date} 的 ${entries.length} 项记录已保存到本机。`);
      renderHeader(); renderDailyPage();
    } catch (error) { dailyFailure(error); }
    finally { if (button.isConnected) { button.disabled = false; button.innerHTML = '保存这一天的记录 <span aria-hidden="true">↗</span>'; } }
  };
  main.querySelector("#daily-filter-date").onchange = event => { dailyUI.filterDate = event.target.value; drawDailyHistory(); };
  main.querySelector("#daily-filter-reset").onclick = () => { dailyUI.filterDate = ""; main.querySelector("#daily-filter-date").value = ""; drawDailyHistory(); };
  main.querySelector("#daily-all-dates").onchange = event => { dailyUI.allDates = event.target.checked; drawDailyHistory(); };
  main.querySelectorAll("[data-daily-type]").forEach(button => button.onclick = () => {
    dailyUI.type = button.dataset.dailyType;
    main.querySelectorAll("[data-daily-type]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    drawDailyHistory();
  });
  main.querySelector("#daily-export").onclick = dailyExport;
  main.querySelector("#daily-restore").onclick = () => main.querySelector("#daily-import-file").click();
  main.querySelector("#daily-import-file").onchange = event => dailyRestore(event.target.files && event.target.files[0]);
  drawDailyStats(); drawDailyHistory();
}

function drawDailyStats() {
  const element = document.getElementById("daily-stats"); if (!element) return;
  const weights = [...((state.life || {}).weight || [])].sort((a, b) => b.date.localeCompare(a.date));
  const latest = weights[0];
  const diet = ((state.life || {}).diet || []).find(d => d.date === dailyUI.date);
  const total = (state.expense || []).filter(r => String(r.date || "").startsWith(todayStr().slice(0, 7))).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const notes = (state.dailyNotes || []).filter(n => n.date === dailyUI.date);
  element.innerHTML = [
    ["⚖️", "最新体重", latest ? `${Number(latest.weight).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}<small> kg</small>` : "—", latest ? latest.date : "等待第一条记录"],
    ["🍱", "所选日饮食", `${diet ? (diet.items || []).length : 0}<small> 条</small>`, dailyUI.date],
    ["💸", "本月花销", `<small>¥ </small>${total.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, todayStr().slice(0, 7)],
    ["🌷", "当日小事", `${notes.length}<small> 件</small>`, dailyUI.date]
  ].map(([icon, label, number, subtitle]) => `<div class="daily-stat"><div class="daily-stat-label"><span>${label}</span><span aria-hidden="true">${icon}</span></div><strong>${number}</strong><span class="daily-stat-sub">${esc(subtitle)}</span></div>`).join("");
}

function drawDailyHistory() {
  const element = document.getElementById("daily-history"); if (!element) return;
  const lower = dateAddStr(todayStr(), -29);
  const records = dailyRecords().filter(r => (!dailyUI.filterDate || r.date === dailyUI.filterDate) && (dailyUI.filterDate || dailyUI.allDates || (r.date >= lower && r.date <= todayStr())) && (dailyUI.type === "all" || r.type === dailyUI.type));
  document.getElementById("daily-history-count").textContent = records.length + " 条";
  if (!records.length) {
    element.innerHTML = `<div class="daily-empty"><span aria-hidden="true">✿</span><h4>${dailyRecords().length ? "这个范围还没有记录" : "尚未提供最近记录"}</h4><p>${dailyRecords().length ? "换个日期或分类，也可以勾选查看全部日期。" : "把日期、体重、饮食或花销告诉我，或在左侧填下第一条。记录会在这里慢慢积累。"}</p></div>`;
    return;
  }
  const names = { weight: ["⚖️", "体重"], diet: ["🍱", "饮食"], expense: ["💸", "花销"], exercise: ["🏃", "运动"], event: ["🌷", "小事"] };
  element.innerHTML = records.map((r, index) => {
    let text = "";
    if (r.type === "weight") text = `${Number(r.weight)} kg` + (r.originalUnit === "斤" ? ` · 原记录 ${r.originalValue} 斤` : "");
    if (r.type === "diet") text = `${r.meal ? r.meal + " · " : ""}${r.name || "饮食图片"}`;
    if (r.type === "expense") text = `¥${Number(r.amount).toFixed(2)} · ${r.category || "其他"}${r.note ? " · " + r.note : ""}`;
    if (r.type === "exercise") text = `${r.sport} · ${r.duration == null ? "时长未填写" : r.duration + " 分钟"}${r.note ? " · " + r.note : ""}`;
    if (r.type === "event") text = r.text || r.body || r.title || "";
    const source = typeof r.source === "string" ? r.source : r.source && r.source.label || "原工作台记录";
    return `<article class="daily-record daily-record-${r.type}"><div class="daily-record-top"><span><span aria-hidden="true">${names[r.type][0]}</span> ${names[r.type][1]}</span><time datetime="${esc(r.date)}">${esc(r.date)}</time><button type="button" class="daily-delete" data-daily-delete="${index}" aria-label="删除 ${esc(r.date)} 的${names[r.type][1]}记录">删除</button></div><p class="daily-record-content">${esc(text)}</p>${r.type === "diet" ? `<div class="daily-record-detail">热量：${esc(VivianFood.calorieText(r))}${r.calorieNote?`<p>${esc(r.calorieNote)}</p>`:""}</div>` : ""}${r.type==="diet"&&r.img?`<span class="thumb" data-img="${esc(r.img)}"></span>`:""}<div class="daily-source">来源：${esc(source)}</div>${r.sourceText ? `<details class="daily-original"><summary>查看原始内容</summary><p>${esc(r.sourceText)}</p></details>` : ""}</article>`;
  }).join("");
  hydrateImages(element);
  element.querySelectorAll("[data-daily-delete]").forEach(button => button.onclick = async () => {
    const record = records[Number(button.dataset.dailyDelete)];
    if (!confirm(`删除 ${record.date} 的这条${names[record.type][1]}记录？`)) return;
    button.disabled = true;
    try {
      await window.localSync.flush();
      if (record.type === "weight") state.life.weight = state.life.weight.filter(r => r.id !== record.id);
      if (record.type === "diet") { const day = state.life.diet.find(d => d.id === record.dayId); if (day) day.items = day.items.filter(r => r.id !== record.id); }
      if (record.type === "expense") state.expense = state.expense.filter(r => r.id !== record.id);
      if (record.type === "exercise") state.exercise.logs = state.exercise.logs.filter(r => r.id !== record.id);
      if (record.type === "event") state.dailyNotes = state.dailyNotes.filter(r => r.id !== record.id);
      await dailyCommit(); dailySetMessage("该记录已删除并保存到本机。"); renderHeader(); drawDailyStats(); drawDailyHistory();
    } catch (error) { dailyFailure(error); button.disabled = false; }
  });
}

async function dailyExport() {
  const button = document.getElementById("daily-export"); if (button) button.disabled = true;
  try {
    await window.localSync.flush();
    const response = await fetch("/api/local/export", { cache: "no-store" });
    if (!response.ok) throw new Error("备份导出失败，请确认本机服务已启动");
    const backup = await response.json();
    if (!backup.state || typeof backup.state !== "object") throw new Error("没有可导出的工作台记录");
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `Vivian-工作台记录-${todayStr()}.json`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    dailySetMessage("已生成结构化记录备份，请在浏览器下载列表中查看。图片需另外备份工作台文件夹。");
  } catch (error) { dailySetMessage("未导出备份：" + error.message + "。请先处理待保存的记录。", true); }
  finally { if (button && button.isConnected) button.disabled = false; }
}

function dailyValidateBackup(backup) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup) || !backup.state || typeof backup.state !== "object" || Array.isArray(backup.state)) throw new Error("请选择工作台导出的 JSON 备份文件");
  function check(value, depth = 0) {
    if (depth > 60) throw new Error("备份结构过于复杂");
    if (!value || typeof value !== "object") return;
    for (const key of Object.keys(value)) { if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("备份包含不支持的字段"); check(value[key], depth + 1); }
  }
  check(backup.state);
  const defaults = defaultState();
  for (const [key, value] of Object.entries(defaults)) {
    if (backup.state[key] === undefined) continue;
    if (Array.isArray(value) && !Array.isArray(backup.state[key])) throw new Error("备份中 " + key + " 的格式无效");
    if (value && typeof value === "object" && !Array.isArray(value) && (!backup.state[key] || typeof backup.state[key] !== "object" || Array.isArray(backup.state[key]))) throw new Error("备份中 " + key + " 的格式无效");
  }
  const life = backup.state.life || {};
  for (const key of ["weight", "diet", "fitness"]) if (life[key] !== undefined && !Array.isArray(life[key])) throw new Error("备份中的生活记录格式无效");
  for (const day of life.diet || []) if (!day || !Array.isArray(day.items) || typeof day.date !== "string") throw new Error("备份中的饮食记录格式无效");
  for (const item of life.weight || []) if (!item || typeof item.date !== "string" || !Number.isFinite(Number(item.weight)) || Number(item.weight) <= 0) throw new Error("备份中的体重记录格式无效");
  for (const item of backup.state.expense || []) if (!item || typeof item.date !== "string" || !Number.isFinite(Number(item.amount))) throw new Error("备份中的花销记录格式无效");
  if (backup.state.dailyNotes !== undefined && !Array.isArray(backup.state.dailyNotes)) throw new Error("备份中的日常事项格式无效");
  return Object.assign(defaults, backup.state, { settings: Object.assign({}, defaults.settings, backup.state.settings || {}), life: Object.assign({ weight: [], diet: [], fitness: [] }, life), dailyNotes: backup.state.dailyNotes || [] });
}

async function dailyRestore(file) {
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error("备份超过 20 MB，暂不支持直接恢复");
    const restored = dailyValidateBackup(JSON.parse(await file.text()));
    if (!confirm(`恢复“${file.name}”将覆盖当前工作台的全部结构化记录。图片不会从此文件恢复。确认继续？`)) return;
    await window.localSync.flush();
    state = restored;
    await dailyCommit();
    if (typeof applyTheme === "function") applyTheme();
    dailySetMessage("备份已恢复并保存到本机。"); renderHeader(); renderDailyPage();
  } catch (error) { dailySetMessage("未完成恢复：" + error.message, true); }
  finally { const input = document.getElementById("daily-import-file"); if (input) input.value = ""; }
}
