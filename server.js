/* =========================================================================
   Vivian 工作台 —— 零依赖 Node 后端
   功能：静态托管 + 账号(register/login) + 数据同步(state) + 图片同步(image)
   仅使用 Node 内置模块，无需 npm install。
   运行：node server.js  （默认端口 8770，可用 PORT 环境变量覆盖）
   ========================================================================= */
"use strict";
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA = path.join(ROOT, "server-data");
const USERS_FILE = path.join(DATA, "users.json");
const PORT = process.env.PORT || 8770;

fs.mkdirSync(DATA, { recursive: true });

/* ---------- 用户存储 ---------- */
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch (e) { return {}; }
}
function saveUsers(u) { fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }
function userDir(name) {
  const d = path.join(DATA, name);
  fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(d, "images"), { recursive: true });
  return d;
}
const safeId = (id) => typeof id === "string" && /^[A-Za-z0-9._-]+$/.test(id);
const hashPassword = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString("hex");
const newToken = () => crypto.randomBytes(24).toString("hex");

/* ---------- 工具 ---------- */
function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
// 允许跨域（网页部署在别处 / 微信小程序通过域名调用都需要）
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}
function readBody(req) {
  return new Promise((res, rej) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > 60 * 1024 * 1024) req.destroy(); });
    req.on("end", () => res(b));
    req.on("error", rej);
  });
}
function authUser(req) {
  const h = req.headers["authorization"] || "";
  const m = h.match(/^Bearer\s+(.+)$/);
  if (!m) return null;
  const token = m[1];
  const users = loadUsers();
  for (const name in users) if (users[name].token === token) return name;
  return null;
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon"
};

/* ---------- 服务器 ---------- */
const server = http.createServer(async (req, res) => {
  cors(res);
  // 预检请求直接放行
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const u = new URL(req.url, "http://localhost");
  const p = u.pathname;

  /* ---- API ---- */
  if (p.startsWith("/api/")) {
    try {
      const body = (req.method === "POST" || req.method === "PUT") ? await readBody(req).catch(() => "{}") : null;
      const json = body ? JSON.parse(body || "{}") : {};

      if (p === "/api/register" && req.method === "POST") {
        const name = (json.username || "").trim();
        const pw = json.password || "";
        if (name.length < 2 || pw.length < 4) return send(res, 400, { error: "用户名至少 2 位，密码至少 4 位" });
        const users = loadUsers();
        if (users[name]) return send(res, 409, { error: "用户名已存在" });
        const salt = crypto.randomBytes(16).toString("hex");
        users[name] = { salt, hash: hashPassword(pw, salt), token: newToken() };
        saveUsers(users); userDir(name);
        return send(res, 200, { token: users[name].token, username: name });
      }

      if (p === "/api/login" && req.method === "POST") {
        const name = (json.username || "").trim();
        const pw = json.password || "";
        const users = loadUsers();
        const uu = users[name];
        if (!uu || uu.hash !== hashPassword(pw, uu.salt)) return send(res, 401, { error: "用户名或密码错误" });
        uu.token = newToken(); saveUsers(users);
        return send(res, 200, { token: uu.token, username: name });
      }

      if (p === "/api/state" && req.method === "GET") {
        const un = authUser(req); if (!un) return send(res, 401, { error: "未登录" });
        const f = path.join(userDir(un), "state.json");
        let st = {}; try { st = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
        return send(res, 200, { state: st });
      }

      if (p === "/api/state" && req.method === "PUT") {
        const un = authUser(req); if (!un) return send(res, 401, { error: "未登录" });
        fs.writeFileSync(path.join(userDir(un), "state.json"), JSON.stringify(json.state || {}, null, 0));
        return send(res, 200, { ok: true });
      }

      if (p === "/api/image" && req.method === "POST") {
        const un = authUser(req); if (!un) return send(res, 401, { error: "未登录" });
        const id = json.id; const data = json.data;
        if (!safeId(id) || typeof data !== "string") return send(res, 400, { error: "invalid" });
        fs.writeFileSync(path.join(userDir(un), "images", id), data);
        return send(res, 200, { ok: true });
      }

      const m = p.match(/^\/api\/image\/(.+)$/);
      if (m && req.method === "GET") {
        const un = authUser(req); if (!un) return send(res, 401, { error: "未登录" });
        const id = m[1]; if (!safeId(id)) return send(res, 400, { error: "invalid" });
        const f = path.join(userDir(un), "images", id);
        try { const d = fs.readFileSync(f, "utf8"); res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }); return res.end(d); }
        catch (e) { res.writeHead(404); return res.end("not found"); }
      }

      return send(res, 404, { error: "not found" });
    } catch (e) {
      return send(res, 500, { error: String(e && e.message || e) });
    }
  }

  /* ---- 静态文件 ---- */
  let rel = p === "/" ? "/index.html" : p;
  const fp = path.normalize(path.join(ROOT, rel));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("404 Not Found"); }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Vivian 工作台后端已启动，监听 0.0.0.0:" + PORT + "（对外可访问）");
  console.log("   本地：http://127.0.0.1:" + PORT + "  局域网：http://<本机IP>:" + PORT);
});
