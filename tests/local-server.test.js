"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { createLocalServer } = require("../local-server");
const { applyEntries } = require("../record-model");

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vivian-server-test-"));
  let server;
  async function start() { server = createLocalServer({ dataDir: dir }); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); return "http://127.0.0.1:" + server.address().port; }
  async function stop() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  t.after(async () => { if (server.listening) await stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, start, stop };
}
async function request(base, route, method = "GET", body, headers = {}) {
  const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
const sample = { id: "test-weight-2026-10-26", type: "weight", date: "2026-10-26", value: 120, unit: "斤", source: "测试夹具", sourceText: "测试数据" };

test("records survive restart; duplicate imports do not change revision; stale writes fail", async t => {
  const f = await fixture(t); let base = await f.start();
  const initial = await request(base, "/api/local/state"); assert.deepEqual(initial.body, { revision: 0, state: null, updatedAt: null });
  assert.equal((await request(base, "/api/local/state", "PUT", { revision: 0, state: { settings: { userName: "Test" }, life: { weight: [], diet: [] } } })).status, 200);
  const imported = await request(base, "/api/local/records", "POST", { revision: 1, entries: [sample] }); assert.equal(imported.body.applied, 1); assert.equal(imported.body.revision, 2);
  const dup = await request(base, "/api/local/records", "POST", { revision: 2, entries: [sample] }); assert.equal(dup.body.applied, 0); assert.equal(dup.body.revision, 2);
  const stale = await request(base, "/api/local/state", "PUT", { revision: 1, state: {} }); assert.equal(stale.status, 409);
  await f.stop(); base = await f.start();
  const restored = await request(base, "/api/local/state"); assert.equal(restored.body.state.life.weight[0].weight, 60); assert.equal(restored.body.state.settings.userName, "Test");
  assert.equal(fs.readdirSync(path.join(f.dir, "backups")).length, 1);
});

test("invalid batch is rejected without partially saving; unknown calories remain null", async t => {
  const f = await fixture(t); const base = await f.start();
  await request(base, "/api/local/state", "PUT", { revision: 0, state: {} });
  const bad = await request(base, "/api/local/records", "POST", { revision: 1, entries: [sample, { id: "bad-date", type: "diet", date: "2026-02-30", name: "测试" }] }); assert.equal(bad.status, 400);
  assert.deepEqual((await request(base, "/api/local/state")).body.state, {});
  const valid = applyEntries({}, [{ id: "diet-1", type: "diet", date: "2026-10-26", name: "测试餐", meal: "午餐" }]); assert.equal(valid.life.diet[0].items[0].kcal, null);
  assert.throws(() => applyEntries(valid, [{ id: "diet-1", type: "diet", date: "2026-10-26", name: "不同内容" }]), /id 已存在/);
});

test("private data and server code are never static assets; cross-site requests rejected", async t => {
  const f = await fixture(t); const base = await f.start();
  for (const route of ["/local-data/workspace.json", "/local-server.js", "/server-data/users.json", "/.git/config", "/data/../local-server.js"]) assert.equal((await request(base, route)).status, 404, route);
  assert.equal((await request(base, "/api/local/state", "GET", undefined, { Origin: "https://example.com" })).status, 403);
  const wrongHost = await new Promise((resolve, reject) => { http.get(base + "/api/local/state", { headers: { Host: "evil.example:8777" } }, res => { res.resume(); resolve(res.statusCode); }).on("error", reject); });
  assert.equal(wrongHost, 403);
  assert.equal((await fetch(base + "/")).status, 200);
});

test("corrupted state is retained and cannot be silently replaced", async t => {
  const f = await fixture(t); const base = await f.start(); const file = path.join(f.dir, "workspace.json");
  fs.writeFileSync(file, "{broken");
  assert.equal((await request(base, "/api/local/state")).status, 503);
  assert.equal((await request(base, "/api/local/state", "PUT", { revision: 0, state: {} })).status, 503);
  assert.equal(fs.readFileSync(file, "utf8"), "{broken");
});

test("photos persist independently; JSON export declares its scope", async t => {
  const f = await fixture(t); const base = await f.start(); const data = "data:image/png;base64,aGVsbG8=";
  assert.equal((await request(base, "/api/local/image", "POST", { id: "photo-1", data })).status, 200);
  assert.equal(await (await fetch(base + "/api/local/image/photo-1")).text(), data);
  assert.equal((await request(base, "/api/local/export")).body.includesImages, false);
});

test("chat importer starts a stopped server temporarily and does not duplicate entries", async t => {
  const f = await fixture(t); const base = await f.start();
  await request(base, "/api/local/state", "PUT", { revision: 0, state: {life:{weight:[],diet:[],fitness:[]}} });
  await f.stop();
  const input = path.join(f.dir,"chat-input.json"); fs.writeFileSync(input, JSON.stringify({entries:[sample]}));
  const options = {env:{...process.env,VIVIAN_DATA_DIR:f.dir,PORT:new URL(base).port},windowsHide:true};
  const cli = path.resolve(__dirname,"../scripts/record-entry.js");
  const first = await promisify(execFile)(process.execPath,[cli,input],options);
  assert.equal(JSON.parse(first.stdout).applied,1);
  const again = await promisify(execFile)(process.execPath,[cli,input],options);
  assert.equal(JSON.parse(again.stdout).applied,0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,"workspace.json"))).state.life.weight.length,1);
});
