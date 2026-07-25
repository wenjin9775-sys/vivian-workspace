const app = getApp();
function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function uid() { return "m" + Date.now() + Math.floor(Math.random() * 1000); }

Page({
  data: {
    username: "",
    summary: { monthExp: 0, vocab: 0, grammarPct: 0, skinWeek: 0 },
    todoToday: [], newTodo: "",
    expenses: [], newExp: { amount: "", category: "", note: "" },
    books: [], skincare: [], skinDone: 0, skinTotal: 0, skinPct: 0
  },

  onLoad() { this.refresh(); },
  onShow() { this.refresh(); },
  async onPullDownRefresh() { await this.reload(); wx.stopPullDownRefresh(); },
  onLogout() {
    app.logout();
    wx.redirectTo({ url: "/pages/login/login" });
  },

  async reload() {
    try { await app.fetchState(); } catch (e) { wx.showToast({ title: String(e), icon: "none" }); }
    this.refresh();
  },

  refresh() {
    const st = app.globalData.state;
    if (!st) { this.setData({ username: app.globalData.username }); return; }
    const today = todayStr();
    const month = today.slice(0, 7);

    // 概览
    const monthExp = (st.expense || []).filter(e => e.date && e.date.indexOf(month) === 0)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    let totalCh = 0, learnedCh = 0;
    (st.grammar.books || []).forEach(b => b.chapters.forEach(c => { totalCh++; if (c.learned) learnedCh++; }));
    const grammarPct = totalCh ? Math.round(learnedCh / totalCh * 100) : 0;
    const skinWeek = (st.skincare.cats || []).reduce((s, c) =>
      s + (c.doneDates || []).filter(d => d >= last7()).length, 0);

    // To Do 今日
    const grp = (st.todo || []).find(g => g.date === today);
    const todoToday = grp ? grp.tasks : [];

    // 花销最近 8 条
    const expenses = [...(st.expense || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
      .map(e => ({ ...e, id: e.id || uid() }));

    // 语法
    const books = (st.grammar.books || []).map(b => {
      const total = b.chapters.length;
      const done = b.chapters.filter(c => c.learned).length;
      return { id: b.id, name: b.name, total, done, pct: total ? Math.round(done / total * 100) : 0, chapters: b.chapters };
    });

    // 护肤
    const cats = (st.skincare.cats || []).map(c => ({ id: c.id, name: c.name, doneToday: (c.doneDates || []).includes(today) }));
    const skinDone = cats.filter(c => c.doneToday).length;
    const skinTotal = cats.length;
    const skinPct = skinTotal ? Math.round(skinDone / skinTotal * 100) : 0;

    this.setData({
      username: app.globalData.username,
      summary: { monthExp, vocab: (st.vocab || []).length, grammarPct, skinWeek },
      todoToday, expenses, books, skincare: cats, skinDone, skinTotal, skinPct
    });
  },

  /* ---- To Do ---- */
  onNewTodo(e) { this.setData({ newTodo: e.detail.value }); },
  async addTodo() {
    const text = this.data.newTodo.trim(); if (!text) return;
    const st = app.globalData.state; const today = todayStr();
    let grp = st.todo.find(g => g.date === today);
    if (!grp) { grp = { date: today, tasks: [] }; st.todo.push(grp); }
    grp.tasks.push({ id: uid(), text, done: false });
    this.setData({ newTodo: "" });
    await this.persist();
  },
  async toggleTodo(e) {
    const id = e.currentTarget.dataset.id; const st = app.globalData.state;
    st.todo.forEach(g => g.tasks.forEach(t => { if (t.id === id) t.done = !t.done; }));
    await this.persist();
  },
  async delTodo(e) {
    const id = e.currentTarget.dataset.id; const st = app.globalData.state;
    st.todo.forEach(g => { g.tasks = g.tasks.filter(t => t.id !== id); });
    st.todo = st.todo.filter(g => g.tasks.length);
    await this.persist();
  },

  /* ---- 花销 ---- */
  onExpAmount(e) { this.setData({ "newExp.amount": e.detail.value }); },
  onExpCat(e) { this.setData({ "newExp.category": e.detail.value }); },
  onExpNote(e) { this.setData({ "newExp.note": e.detail.value }); },
  async addExp() {
    const { amount, category, note } = this.data.newExp;
    if (!amount) return wx.showToast({ title: "填金额", icon: "none" });
    const st = app.globalData.state;
    st.expense.push({ id: uid(), date: todayStr(), category: category || "其他", note: note || "", amount: Number(amount) });
    this.setData({ newExp: { amount: "", category: "", note: "" } });
    await this.persist();
  },
  async delExp(e) {
    const id = e.currentTarget.dataset.id; const st = app.globalData.state;
    st.expense = st.expense.filter(x => (x.id || uid()) !== id);
    await this.persist();
  },

  /* ---- 语法 ---- */
  async toggleChapter(e) {
    const bid = e.currentTarget.dataset.bid, cid = e.currentTarget.dataset.cid;
    const st = app.globalData.state;
    const bk = st.grammar.books.find(b => b.id === bid);
    const ch = bk && bk.chapters.find(c => c.id === cid);
    if (ch) { ch.learned = !ch.learned; await this.persist(); }
  },

  /* ---- 护肤 ---- */
  async toggleSkin(e) {
    const id = e.currentTarget.dataset.id; const today = todayStr();
    const st = app.globalData.state;
    const cat = st.skincare.cats.find(c => c.id === id);
    if (!cat) return;
    if (cat.doneDates.includes(today)) cat.doneDates = cat.doneDates.filter(d => d !== today);
    else cat.doneDates.push(today);
    await this.persist();
  },

  async persist() {
    try { await app.saveState(); this.refresh(); }
    catch (e) { wx.showToast({ title: String(e), icon: "none" }); }
  }
});

function last7() {
  const d = new Date(Date.now() - 7 * 86400000);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
