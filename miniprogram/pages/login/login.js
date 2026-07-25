const app = getApp();
Page({
  data: { username: "", password: "", loading: false, error: "" },
  onUser(e) { this.setData({ username: e.detail.value }); },
  onPwd(e) { this.setData({ password: e.detail.value }); },
  async onLogin() {
    const { username, password } = this.data;
    if (username.length < 2 || password.length < 4) return this.setData({ error: "用户名至少2位，密码至少4位" });
    this.setData({ loading: true, error: "" });
    try {
      await app.login(username, password);
      wx.redirectTo({ url: "/pages/index/index" });
    } catch (e) {
      this.setData({ error: String(e), loading: false });
    }
  },
  async onRegister() {
    const { username, password } = this.data;
    if (username.length < 2 || password.length < 4) return this.setData({ error: "用户名至少2位，密码至少4位" });
    this.setData({ loading: true, error: "" });
    try {
      await app.register(username, password);
      wx.redirectTo({ url: "/pages/index/index" });
    } catch (e) {
      this.setData({ error: String(e), loading: false });
    }
  }
});
