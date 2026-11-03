"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createLocalServer } = require("../local-server");

async function main() {
  const file = process.argv[2];
  if (file === "--help") { console.log("node scripts/record-entry.js <记录.json>\n或通过 stdin 提供 JSON。JSON 可为单条、数组或 {entries:[...]}。每条必须有稳定的 id、type、date。先在浏览器打开一次工作台完成初始化。"); return; }
  const content = file ? fs.readFileSync(path.resolve(file), "utf8") : fs.readFileSync(0, "utf8");
  const parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
  const entries = Array.isArray(parsed) ? parsed : parsed.entries || [parsed];
  const port = Number(process.env.PORT || 8777); const base = "http://127.0.0.1:" + port;
  let owned = null;
  try {
    let health;
    try { health = await fetch(base + "/api/local/health", { signal: AbortSignal.timeout(1500) }); } catch (e) {
      if (e.cause && e.cause.code !== "ECONNREFUSED") throw e;
      owned = createLocalServer();
      await new Promise((resolve, reject) => { owned.once("error", reject); owned.listen(port, "127.0.0.1", resolve); });
      health = await fetch(base + "/api/local/health");
    }
    const identity = await health.json();
    if (!health.ok || identity.app !== "vivian-local" || path.resolve(identity.workspace || "") !== path.resolve(__dirname, "..")) throw new Error("该端口不是这份 Vivian 本机工作台，未写入任何数据");
    const response = await fetch(base + "/api/local/state"); const current = await response.json();
    if (!response.ok) throw new Error(current.error);
    const saved = await fetch(base + "/api/local/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: current.revision, entries }) });
    const result = await saved.json(); if (!saved.ok) throw new Error(result.error);
    console.log(JSON.stringify({ ok: true, ...result, message: result.applied ? "记录已保存，工作台会同步显示" : "这些记录已经保存，未重复添加" }, null, 2));
  } finally {
    if (owned) { owned.closeAllConnections(); await new Promise(resolve => owned.close(resolve)); }
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
