"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { applyEntries } = require("./record-model");
const { createFoodAI } = require('./food-ai');

const ROOT = __dirname;
const ASSETS = new Set([
  "planning.js", "planning.css", "planning-model.js",
  "index.html", "app.js", "styles.css", "life.js", "korean.js", "merge.js", "merge.css",
  "daily.js", "daily.css", "local-sync.js", "record-model.js", "sw.js", "icon.svg", "manifest.webmanifest",
  "seed-vivian2.json", "data/skincare-daily-plan.json", "data/mask-inventory.json", "data/skincare-inventory.json",
  "vendor/chart.umd.min.js", "dashboard.js", "dashboard.css", "dashboard-model.js", "jot.js", "jot.css", "jot-model.js", "food.js", "food.css", "food-model.js"
]);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

function error(status, message) { return Object.assign(new Error(message), { status }); }
function createLocalServer(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.VIVIAN_DATA_DIR || path.join(ROOT, "local-data"));
  const statePath = path.join(dataDir, "workspace.json");
  const backupDir = path.join(dataDir, "backups");
  const imagesDir = path.join(dataDir, "images");
  fs.mkdirSync(dataDir, { recursive: true });
  const foodAI = createFoodAI({dataDir, ...(options.foodAI || {})});
  function readState() {
    if (!fs.existsSync(statePath)) return { revision: 0, state: null, updatedAt: null };
    let data;
    try { data = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (_) { throw error(503, "本机数据文件无法读取，请从备份恢复；未覆盖原文件"); }
    if (!data || !Number.isSafeInteger(data.revision) || data.revision < 1 || !data.state || typeof data.state !== "object" || Array.isArray(data.state)) throw error(503, "本机数据文件格式损坏；未覆盖原文件");
    return data;
  }
  function atomicWrite(file, contents) {
    const temp = file + "." + process.pid + ".tmp";
    const fd = fs.openSync(temp, "w", 0o600);
    try { fs.writeFileSync(fd, contents, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  }
  function persist(current, state) {
    fs.mkdirSync(backupDir, { recursive: true });
    if (current.state !== null) atomicWrite(path.join(backupDir, "snapshot-" + String(current.revision).padStart(10, "0") + ".json"), JSON.stringify(current));
    const next = { revision: current.revision + 1, state, updatedAt: new Date().toISOString() };
    atomicWrite(statePath, JSON.stringify(next));
    const old = fs.readdirSync(backupDir).filter(name => /^snapshot-\d+\.json$/.test(name)).sort();
    // Only our own snapshots in the verified backup directory are pruned.
    for (const name of old.slice(0, Math.max(0, old.length - 30))) fs.unlinkSync(path.join(backupDir, name));
    return next;
  }
  function assertRevision(body, current) {
    if (!Number.isSafeInteger(body.revision) || body.revision !== current.revision) throw Object.assign(error(409, "记录已在其他窗口更新，请读取最新数据后重试"), { revision: current.revision });
  }
  function send(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(body));
  }
  async function bodyJson(req) {
    let length = 0; const chunks = [];
    for await (const chunk of req) { length += chunk.length; if (length > 32 * 1024 * 1024) throw error(413, "单次数据不能超过 32 MB"); chunks.push(chunk); }
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
      return body;
    } catch (_) { throw error(400, "请求需要有效的 JSON 对象"); }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const port = server.address().port;
      const hosts = new Set(["127.0.0.1:" + port, "localhost:" + port]);
      if (!hosts.has(req.headers.host)) throw error(403, "仅允许本机地址访问");
      if (req.headers.origin && !new Set([...hosts].map(host => "http://" + host)).has(req.headers.origin)) throw error(403, "拒绝其他网站访问本机记录");
      if (req.headers["sec-fetch-site"] === "cross-site") throw error(403, "拒绝跨站访问");
      const url = new URL(req.url, "http://" + req.headers.host);
      const route = url.pathname;
      if (route === '/api/local/food-ai/config') {
        const canConfigure = req.headers['x-vivian-phone'] !== '1';
        if (req.method === 'GET') return send(res, 200, {...foodAI.status(), canConfigure});
        if (req.method === 'PUT') { if (!canConfigure) throw error(403, '请在电脑上配置 API 密钥'); return send(res, 200, {...foodAI.configure(await bodyJson(req)),canConfigure}); }
      }
      if (route === '/api/local/food-ai/recognize' && req.method === 'POST') return send(res, 200, await foodAI.recognize(await bodyJson(req)));
      if (route === "/api/local/health" && req.method === "GET") return send(res, 200, { app: "vivian-local", version: 1, workspace: ROOT, dataDirectory: dataDir });
      if (route === "/api/local/state" && req.method === "GET") return send(res, 200, readState());
      if (route === "/api/local/export" && req.method === "GET") {
        const data = readState();
        res.setHeader("Content-Disposition", "attachment; filename=vivian-backup-" + new Date().toISOString().slice(0, 10) + ".json");
        return send(res, 200, { ...data, format: "vivian-local-backup-v1", includesImages: false });
      }
      if (route === "/api/local/state" && req.method === "PUT") {
        const body = await bodyJson(req); const current = readState(); assertRevision(body, current);
        if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) throw error(400, "state 必须是对象");
        if (JSON.stringify(current.state) === JSON.stringify(body.state)) return send(res, 200, { revision: current.revision, updatedAt: current.updatedAt });
        const next = persist(current, body.state); return send(res, 200, { revision: next.revision, updatedAt: next.updatedAt });
      }
      if (route === "/api/local/records" && req.method === "POST") {
        const body = await bodyJson(req); const current = readState(); assertRevision(body, current);
        if (!current.state) throw error(409, "请先打开工作台完成初始化，再导入记录");
        let nextState;
        try { nextState = applyEntries(current.state, body.entries); } catch (e) { throw error(400, e.message); }
        const applied = nextState.recordImports.length - (current.state.recordImports || []).length;
        if (!applied) return send(res, 200, { revision: current.revision, updatedAt: current.updatedAt, applied: 0 });
        const next = persist(current, nextState); return send(res, 200, { revision: next.revision, updatedAt: next.updatedAt, applied });
      }
      if (route === "/api/local/image" && req.method === "POST") {
        const body = await bodyJson(req);
        if (typeof body.id !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(body.id) || typeof body.data !== "string" || !/^data:image\/(png|jpeg|webp|gif|avif|bmp);base64,[A-Za-z0-9+/=\r\n]+$/.test(body.data)) throw error(400, "图片格式或 id 不正确");
        fs.mkdirSync(imagesDir, { recursive: true }); atomicWrite(path.join(imagesDir, body.id + ".json"), JSON.stringify(body.data)); return send(res, 200, { ok: true });
      }
      const image = route.match(/^\/api\/local\/image\/([A-Za-z0-9_-]{1,160})$/);
      if (image && req.method === "GET") {
        const file = path.join(imagesDir, image[1] + ".json");
        if (!fs.existsSync(file)) throw error(404, "找不到图片");
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); return res.end(JSON.parse(fs.readFileSync(file, "utf8")));
      }
      if (route.startsWith("/api/")) throw error(404, "找不到接口");
      if (req.method !== "GET" && req.method !== "HEAD") throw error(405, "不支持该方法");
      const asset = route === "/" ? "index.html" : route.slice(1);
      if (!ASSETS.has(asset)) throw error(404, "找不到页面");
      const file = path.join(ROOT, asset);
      if (!fs.existsSync(file)) throw error(404, "找不到文件");
      const content = fs.readFileSync(file);
      res.writeHead(200, { "Content-Type": MIME[path.extname(asset)] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (e) {
      if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : "保存失败，请检查本机磁盘空间与文件权限", ...(e.revision == null ? {} : { revision: e.revision }) });
      else res.end();
    }
  });
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8777);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 无效");
  const server = createLocalServer();
  server.on("error", e => { console.error(e.code === "EADDRINUSE" ? "端口已被占用：" + port : e.message); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log("Vivian 工作台：http://127.0.0.1:" + port + "（记录保存在本机 local-data）"));
}
module.exports = { createLocalServer };
