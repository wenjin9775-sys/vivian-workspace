// app.js —— 全局状态 & 与后端通信
// 已绑定域名 vivian.works（部署后确保该域名 https 可用，并在微信后台加为 request 合法域名）
const BASE_URL = "https://vivian.works";

App({
  globalData: {
    BASE_URL,
    token: "",
    username: "",
    state: null
  },

  onLaunch() {
    const token = wx.getStorageSync("token");
    const username = wx.getStorageSync("username");
    if (token) {
      this.globalData.token = token;
      this.globalData.username = username;
      this.fetchState();
    }
  },

  // 通用请求
  request(path, method, data) {
    return new Promise((resolve, reject) => {
      const header = { "Content-Type": "application/json" };
      if (this.globalData.token) header["Authorization"] = "Bearer " + this.globalData.token;
      wx.request({
        url: this.globalData.BASE_URL + path,
        method,
        data,
        header,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
          else reject(res.data && res.data.error ? res.data.error : ("HTTP " + res.statusCode));
        },
        fail: (err) => reject(err.errMsg || "网络错误")
      });
    });
  },

  async login(username, password) {
    const d = await this.request("/api/login", "POST", { username, password });
    this.globalData.token = d.token;
    this.globalData.username = d.username;
    wx.setStorageSync("token", d.token);
    wx.setStorageSync("username", d.username);
    await this.fetchState();
    return d;
  },

  async register(username, password) {
    const d = await this.request("/api/register", "POST", { username, password });
    this.globalData.token = d.token;
    this.globalData.username = d.username;
    wx.setStorageSync("token", d.token);
    wx.setStorageSync("username", d.username);
    // 新账号给一份默认结构
    const def = this.defaultState();
    await this.request("/api/state", "PUT", { state: def });
    this.globalData.state = def;
    return d;
  },

  async fetchState() {
    const d = await this.request("/api/state", "GET");
    this.globalData.state = d.state || this.defaultState();
    return this.globalData.state;
  },

  async saveState() {
    await this.request("/api/state", "PUT", { state: this.globalData.state });
  },

  logout() {
    this.globalData.token = "";
    this.globalData.username = "";
    this.globalData.state = null;
    wx.removeStorageSync("token");
    wx.removeStorageSync("username");
  },

  // 与网页端一致的默认结构（新账号用）
  defaultState() {
    const books = [];
    for (let i = 1; i <= 5; i++) {
      const chapters = [];
      for (let c = 1; c <= 10; c++) chapters.push({ id: "b" + i + "c" + c, title: "第 " + c + " 课", learned: false, checkins: [] });
      books.push({ id: "b" + i, name: "延世韩国语 " + i, chapters });
    }
    const skincareCats = ["面膜", "唇膜", "眼霜", "面部提升", "面部清洁", "身体乳", "手膜"].map((n, i) => ({
      id: "sk" + i, name: n, doneDates: [], entries: []
    }));
    return {
      settings: { accent: "#ff8fb1" },
      layout: { col1: [], col2: [] },
      expense: [], vocab: [], grammar: { books },
      todo: [], life: { weight: [], fitness: [], diet: [] },
      inspiration: [], gratitude: [], applications: [], visa: [], countdowns: [],
      vocabPractice: { videoUrl: "https://b23.tv/GVpiVeB", videoTitle: "", lessons: [] },
      skincare: { cats: skincareCats }
    };
  }
});
