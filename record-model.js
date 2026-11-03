/* Shared by the browser and the local record importer. No inferred meals or calories. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VivianRecords = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const types = new Set(["weight", "diet", "exercise", "expense", "event"]);
  function text(value, key, required, max = 20000) {
    if (value == null && !required) return "";
    if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(key + " 格式不正确");
    return value.trim();
  }
  function number(value, key, positive) {
    if (typeof value !== "number" || !Number.isFinite(value) || (positive ? value <= 0 : value < 0)) throw new Error(key + " 必须是" + (positive ? "正数" : "非负数"));
    return value;
  }
  function normalizeEntry(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("记录必须是对象");
    const id = text(raw.id, "记录 id", true, 160);
    if (!/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error("记录 id 只允许英文、数字、点、横线、下划线和冒号");
    if (!types.has(raw.type)) throw new Error("不支持的记录类型");
    const date = text(raw.date, "日期", true, 10);
    const instant = new Date(date + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) throw new Error("日期应为有效的 YYYY-MM-DD");
    const e = { id, type: raw.type, date, source: text(raw.source, "来源", false, 500) || "用户记录", sourceText: text(raw.sourceText, "原始记录", false) };
    if (e.type === "weight") {
      e.value = number(raw.value, "体重", true);
      if (raw.unit !== "kg" && raw.unit !== "斤") throw new Error("体重单位请明确为 kg 或斤");
      e.unit = raw.unit;
    } else if (e.type === "diet") {
      e.meal = text(raw.meal, "餐次", false, 100);
      e.name = text(raw.name, "饮食内容", true);
      e.kcal = raw.kcal == null ? null : number(raw.kcal, "热量", false);
      if (raw.img != null) { if (typeof raw.img !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(raw.img)) throw Error('图片 id 无效'); e.img = raw.img; }
      if (raw.calorieBasis != null) { if (!['photo-estimate','label-calculation'].includes(raw.calorieBasis)) throw Error('热量来源无效'); e.calorieBasis = raw.calorieBasis; }
      if (raw.calorieNote != null) e.calorieNote = text(raw.calorieNote, '热量说明', false, 4000);
      if (raw.kcalEstimate != null) {
        const r = raw.kcalEstimate, min = number(r.min, '估算下限', false), max = number(r.max, '估算上限', false);
        if (min > max || max > 100000 || e.kcal != null || e.calorieBasis !== 'photo-estimate') throw Error('照片估算必须单独保存有效范围，不能当作已知热量');
        e.kcalEstimate = { min, max, portion: text(r.portion, '估算份量', false, 1000), note: text(r.note, '估算说明', false, 2000) };
      }
    } else if (e.type === "exercise") {
      e.sport = text(raw.sport, "运动项目", true, 200);
      e.duration = raw.duration == null ? null : number(raw.duration, "运动分钟数", true);
      e.note = text(raw.note, "运动备注", false);
    } else if (e.type === "expense") {
      e.amount = number(raw.amount, "金额", true);
      e.category = text(raw.category, "分类", false, 100) || "其他";
      e.note = text(raw.note, "备注", false);
    } else {
      e.title = text(raw.title, "标题", false, 500);
      e.text = text(raw.text, "内容", true);
    }
    return e;
  }
  function applyEntries(inputState, entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > 2000) throw new Error("entries 应为 1 至 2000 条记录");
    // Validate the whole batch before touching any state.
    const clean = entries.map(normalizeEntry);
    const state = JSON.parse(JSON.stringify(inputState || {}));
    state.life = state.life || {};
    for (const name of ["weight", "diet", "fitness"]) if (!Array.isArray(state.life[name])) state.life[name] = [];
    if (!Array.isArray(state.expense)) state.expense = [];
    if (!Array.isArray(state.dailyNotes)) state.dailyNotes = [];
    if (!Array.isArray(state.recordImports)) state.recordImports = [];
    state.exercise = state.exercise || {};
    if (!Array.isArray(state.exercise.logs)) state.exercise.logs = [];
    const seen = new Map(state.recordImports.map(record => [record.id, record.entry]));
    for (const e of clean) {
      if (seen.has(e.id)) {
        if (seen.get(e.id) && JSON.stringify(seen.get(e.id)) !== JSON.stringify(e)) throw new Error("记录 id 已存在且内容不同：" + e.id + "；请使用新的 id 记录更正");
        continue;
      }
      const provenance = { source: e.source, sourceText: e.sourceText, importId: e.id };
      if (e.type === "weight") {
        const record = { id: e.id, date: e.date, weight: e.unit === "斤" ? e.value / 2 : e.value, originalValue: e.value, originalUnit: e.unit, ...provenance };
        state.life.weight = state.life.weight.filter(item => item.date !== e.date);
        state.life.weight.push(record);
        state.life.weight.sort((a, b) => a.date.localeCompare(b.date));
      } else if (e.type === "diet") {
        let day = state.life.diet.find(item => item.date === e.date);
        if (!day) { day = { id: "diet-" + e.date, date: e.date, items: [], img: null }; state.life.diet.push(day); }
        if (!Array.isArray(day.items)) day.items = [];
        day.items.push({ id: e.id, name: e.name, meal: e.meal, kcal: e.kcal, img: e.img || null, ...(e.kcalEstimate ? {kcalEstimate:e.kcalEstimate} : {}), ...(e.calorieBasis ? {calorieBasis:e.calorieBasis} : {}), ...(e.calorieNote ? {calorieNote:e.calorieNote} : {}), ...provenance });
      } else if (e.type === "exercise") {
        state.exercise.logs.push({ id: e.id, date: e.date, type: e.sport, duration: e.duration, hr: null, note: e.note, ...provenance });
      } else if (e.type === "expense") {
        state.expense.push({ id: e.id, date: e.date, amount: e.amount, category: e.category, note: e.note, img: null, ...provenance });
      } else {
        state.dailyNotes.push({ id: e.id, date: e.date, title: e.title, text: e.text, ...provenance });
      }
      state.recordImports.push({ id: e.id, type: e.type, date: e.date, source: e.source, sourceText: e.sourceText, entry: e });
      seen.set(e.id, e);
    }
    return state;
  }
  return { applyEntries, normalizeEntry };
});
