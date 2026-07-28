/* =========================================================================
   Vivian 工作台 —— Node 后端
   功能：静态托管 + 账号(register/login) + 数据同步(state) + 图片同步(image)
   存储策略：
     - 若设置了环境变量 MONGODB_URI → 使用 MongoDB（推荐，云端持久化）
     - 否则 → 退回本地文件存储 server-data/（适合本机/隧道临时用）
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

/* ============ 存储抽象层 ============ */
const USE_MONGO = !!process.env.MONGODB_URI;
let db = null; // mongodb 句柄
const safeId = (id) => typeof id === "string" && /^[A-Za-z0-9._-]+$/.test(id);

async function initStorage() {
  if (!USE_MONGO) {
    console.log("ℹ️  未设置 MONGODB_URI，使用本地文件存储（server-data/）");
    return;
  }
  const { MongoClient } = require("mongodb");
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  db = client.db("vivian");
  await db.collection("users").createIndex({ username: 1 }, { unique: true });
  console.log("✅ 已连接 MongoDB");
  await migrateFromFiles();
}

// 首次连接且库为空时，把本机已有的数据迁进去，避免丢数据
async function migrateFromFiles() {
  let local = {};
  try { local = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch (e) {}
  if (!local || !Object.keys(local).length) return;
  const count = await db.collection("users").estimatedDocumentCount();
  if (count > 0) return; // 已有人，不覆盖
  for (const name in local) {
    await db.collection("users").updateOne(
      { username: name },
      { $set: { username: name, salt: local[name].salt, hash: local[name].hash, token: local[name].token } },
      { upsert: true }
    );
    const sf = path.join(DATA, name, "state.json");
    try { const st = JSON.parse(fs.readFileSync(sf, "utf8")); await db.collection("states").updateOne({ _id: name }, { $set: { _id: name, state: st } }, { upsert: true }); } catch (e) {}
    const imgDir = path.join(DATA, name, "images");
    try {
      for (const f of fs.readdirSync(imgDir)) {
        if (safeId(f)) {
          const d = fs.readFileSync(path.join(imgDir, f), "utf8");
          await db.collection("images").updateOne({ _id: name + ":" + f }, { $set: { _id: name + ":" + f, username: name, id: f, data: d } }, { upsert: true });
        }
      }
    } catch (e) {}
  }
  console.log("✅ 已从本地 server-data/ 迁移历史数据到 MongoDB");
}

/* ---- 用户 ---- */
function loadUsersSync() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch (e) { return {}; }
}
function saveUsersSync(u) { fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }
async function loadUsers() {
  if (USE_MONGO) {
    const arr = await db.collection("users").find({}).toArray();
    const map = {};
    for (const u of arr) map[u.username] = { salt: u.salt, hash: u.hash, token: u.token };
    return map;
  }
  return loadUsersSync();
}
async function saveUsers(u) {
  if (USE_MONGO) {
    for (const name in u) {
      await db.collection("users").updateOne(
        { username: name },
        { $set: { username: name, salt: u[name].salt, hash: u[name].hash, token: u[name].token } },
        { upsert: true }
      );
    }
    return;
  }
  saveUsersSync(u);
}
function userDir(name) {
  const d = path.join(DATA, name);
  fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(d, "images"), { recursive: true });
  return d;
}

/* ---- 状态 ---- */
async function loadState(name) {
  if (USE_MONGO) {
    const doc = await db.collection("states").findOne({ _id: name });
    return doc ? doc.state : {};
  }
  try { return JSON.parse(fs.readFileSync(path.join(userDir(name), "state.json"), "utf8")); } catch (e) { return {}; }
}
async function saveState(name, st) {
  if (USE_MONGO) {
    await db.collection("states").updateOne({ _id: name }, { $set: { _id: name, state: st } }, { upsert: true });
    return;
  }
  fs.writeFileSync(path.join(userDir(name), "state.json"), JSON.stringify(st, null, 0));
}

/* ---- 图片 ---- */
async function saveImage(name, id, data) {
  if (USE_MONGO) {
    await db.collection("images").updateOne({ _id: name + ":" + id }, { $set: { _id: name + ":" + id, username: name, id, data } }, { upsert: true });
    return;
  }
  fs.writeFileSync(path.join(userDir(name), "images", id), data);
}
async function loadImage(name, id) {
  if (USE_MONGO) {
    const doc = await db.collection("images").findOne({ _id: name + ":" + id });
    return doc ? doc.data : null;
  }
  try { return fs.readFileSync(path.join(userDir(name), "images", id), "utf8"); } catch (e) { return null; }
}

/* ============ 工具 ============ */
const hashPassword = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString("hex");
const newToken = () => crypto.randomBytes(24).toString("hex");

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
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
async function authUser(req) {
  const h = req.headers["authorization"] || "";
  const m = h.match(/^Bearer\s+(.+)$/);
  if (!m) return null;
  const token = m[1];
  const users = await loadUsers();
  for (const name in users) if (users[name].token === token) return name;
  return null;
}
const todayStr = () => {
  const d = new Date(); const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon"
};

/* ============ 服务器 ============ */
const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const u = new URL(req.url, "http://localhost");
  const p = u.pathname;

  if (p.startsWith("/api/")) {
    try {
      const body = (req.method === "POST" || req.method === "PUT") ? await readBody(req).catch(() => "{}") : null;
      const json = body ? JSON.parse(body || "{}") : {};

      if (p === "/api/register" && req.method === "POST") {
        const name = (json.username || "").trim();
        const pw = json.password || "";
        if (name.length < 2 || pw.length < 4) return send(res, 400, { error: "用户名至少 2 位，密码至少 4 位" });
        const users = await loadUsers();
        if (users[name]) return send(res, 409, { error: "用户名已存在" });
        const salt = crypto.randomBytes(16).toString("hex");
        users[name] = { salt, hash: hashPassword(pw, salt), token: newToken() };
        await saveUsers(users);
        if (!USE_MONGO) userDir(name);
        return send(res, 200, { token: users[name].token, username: name });
      }

      if (p === "/api/login" && req.method === "POST") {
        const name = (json.username || "").trim();
        const pw = json.password || "";
        const users = await loadUsers();
        const uu = users[name];
        if (!uu || uu.hash !== hashPassword(pw, uu.salt)) return send(res, 401, { error: "用户名或密码错误" });
        uu.token = newToken(); users[name] = uu; await saveUsers(users);
        return send(res, 200, { token: uu.token, username: name });
      }

      if (p === "/api/state" && req.method === "GET") {
        const un = await authUser(req); if (!un) return send(res, 401, { error: "未登录" });
        return send(res, 200, { state: await loadState(un) });
      }

      if (p === "/api/state" && req.method === "PUT") {
        const un = await authUser(req); if (!un) return send(res, 401, { error: "未登录" });
        await saveState(un, json.state || {});
        return send(res, 200, { ok: true });
      }

      if (p === "/api/image" && req.method === "POST") {
        const un = await authUser(req); if (!un) return send(res, 401, { error: "未登录" });
        const id = json.id; const data = json.data;
        if (!safeId(id) || typeof data !== "string") return send(res, 400, { error: "invalid" });
        await saveImage(un, id, data);
        return send(res, 200, { ok: true });
      }

      const m = p.match(/^\/api\/image\/(.+)$/);
      if (m && req.method === "GET") {
        const un = await authUser(req); if (!un) return send(res, 401, { error: "未登录" });
        const id = m[1]; if (!safeId(id)) return send(res, 400, { error: "invalid" });
        const d = await loadImage(un, id);
        if (d == null) { res.writeHead(404); return res.end("not found"); }
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }); return res.end(d);
      }

      /* 健康数据同步（来自 iOS 快捷指令 / Apple 健康） */
      if (p === "/api/health" && req.method === "POST") {
        const un = await authUser(req); if (!un) return send(res, 401, { error: "未登录" });
        const st = await loadState(un);
        st.health = st.health || {};
        const num = (v) => (typeof v === "number" && !isNaN(v)) ? v : undefined;
        const mergeDay = (day) => {
          if (!day || typeof day !== "object") return;
          const date = typeof day.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? day.date : todayStr();
          const cur = st.health[date] || {};
          if (num(day.steps) != null) cur.steps = Math.round(day.steps);
          if (num(day.activeCalories) != null) cur.activeCalories = Math.round(day.activeCalories);
          if (num(day.restingCalories) != null) cur.restingCalories = Math.round(day.restingCalories);
          if (num(day.distanceKm) != null) cur.distanceKm = Number(day.distanceKm);
          if (Array.isArray(day.workouts)) {
            cur.workouts = day.workouts.map(w => ({
              name: String(w && w.name || "运动"),
              calories: num(w && w.calories),
              durationMin: num(w && w.durationMin)
            })).filter(w => w.name);
          }
          cur.syncedAt = Date.now();
          st.health[date] = cur;
        };
        if (Array.isArray(json.days)) json.days.forEach(mergeDay);
        else mergeDay(json);
        await saveState(un, st);
        return send(res, 200, { ok: true, health: st.health });
      }

      return send(res, 404, { error: "not found" });
    } catch (e) {
      return send(res, 500, { error: String((e && e.message) || e) });
    }
  }

  /* ---- 静态文件 ---- */
  let rel = p === "/" ? "/index.html" : p;
  const fp = path.normalize(path.join(ROOT, rel));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("404 Not Found"); }
    const ext = path.extname(fp).toLowerCase();
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    // HTML / Service Worker / manifest 禁止缓存，保证 PWA 永远拿到最新壳；带版本号的 CSS/JS 可长期缓存
    if (ext === ".html" || ext === ".webmanifest" || rel === "/sw.js") {
      headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
    } else if ([".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".woff2"].includes(ext)) {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

initStorage().then(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log("✅ Vivian 工作台后端已启动，监听 0.0.0.0:" + PORT + "（对外可访问）");
    console.log("   存储：" + (USE_MONGO ? "MongoDB" : "本地文件") + " | 本地：http://127.0.0.1:" + PORT);
  });
}).catch((e) => {
  console.error("❌ 存储初始化失败：", e && e.message);
  process.exit(1);
});
