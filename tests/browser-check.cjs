"use strict";
const { createLocalServer } = require('../local-server');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vivian-browser-test-'));
fs.mkdirSync(output, { recursive: true });
let browser, socket, server;
const failures = [];
async function main() {
  server = createLocalServer({ dataDir: path.join(temporary, 'data') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  console.log('Test server ready');
  browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + path.join(temporary, 'profile'), 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  const portFile = path.join(temporary, 'profile', 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(150);
  if (!fs.existsSync(portFile)) throw new Error('Browser did not start');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  console.log('Browser ready');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list', {signal:AbortSignal.timeout(10000)})).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { const timeout=setTimeout(()=>reject(new Error('WebSocket timeout')),10000); socket.onopen = ()=>{clearTimeout(timeout);resolve()}; socket.onerror = reject; });
  console.log('Browser connected');
  let next = 0; const waiting = new Map();
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && waiting.has(msg.id)) { const handlers = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? handlers.reject(msg.error) : handlers.resolve(msg.result); }
    if (msg.method === 'Runtime.exceptionThrown') failures.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next; const timeout=setTimeout(()=>reject(new Error('CDP timeout: '+method)),15000);
    waiting.set(id, { resolve:result=>{clearTimeout(timeout);resolve(result)}, reject:error=>{clearTimeout(timeout);reject(error)} }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  async function until(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(100); } throw new Error('Timed out: ' + expression); }
  const screenshot = async name => {
    const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(result.data, 'base64'));
  };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: base });
  await until('document.querySelector("#open-daily") && window.localSync?.statusText.includes("已保存")');
  console.log('App initialized');
  await evaluate('localSync.flush()');
  assert.equal(await evaluate('state.life.weight.length'), 0);
  assert.equal(await evaluate('state.life.diet.length'), 0);
  await screenshot('home');
  await evaluate('document.querySelector("[data-nav=daily]").click()');
  await screenshot('daily');
  await evaluate(`(() => {
    const form = document.querySelector('#daily-form');
    const values = { date:'2026-10-26', weight:'120', unit:'斤', breakfast:'测试早餐：鸡蛋', amount:'25', category:'餐饮', expenseNote:'自动测试', event:'测试事项，勿导入真实数据' };
    for (const [key,value] of Object.entries(values)) { form.elements[key].value=value; form.elements[key].dispatchEvent(new Event('input',{bubbles:true})); }
    form.requestSubmit();
  })()`);
  await until('document.querySelector("#daily-status").textContent.includes("4 项记录已保存")');
  console.log('Form saved');
  const saved = await (await fetch(base + '/api/local/state')).json();
  assert.equal(saved.state.life.weight[0].weight, 60);
  assert.equal(saved.state.life.diet[0].items[0].kcal, null);
  assert.equal(saved.state.expense[0].amount, 25);
  assert.equal(saved.state.dailyNotes.length, 1);
  await call('Page.reload');
  await until('document.querySelector("#open-daily") && window.localSync?.statusText.includes("已保存")');
  assert.equal(await evaluate('state.life.weight[0].weight'), 60);
  const current = await (await fetch(base + '/api/local/state')).json();
  const imported = await fetch(base + '/api/local/records', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ revision:current.revision,entries:[{id:'browser-import-1',type:'event',date:'2026-10-26',text:'从聊天追加的测试记录',source:'自动测试'}] }) });
  assert.equal(imported.status,200);
  await until('state.dailyNotes.length === 2');
  for (const tab of ['todo','checkin','skincareDaily','brain','modules','items','me','topik','korean','daily']) {
    await evaluate('switchTab(' + JSON.stringify(tab) + ')'); await sleep(80);
  }
  await evaluate('localSync.flush()');
  // Simulate a newer chat import arriving while the browser has an unsaved edit.
  const latest = await (await fetch(base + '/api/local/state')).json();
  const added = await fetch(base + '/api/local/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:latest.revision,entries:[{id:'browser-conflict-1',type:'event',date:'2026-10-26',text:'外部新记录',source:'自动测试'}]})});
  assert.equal(added.status,200);
  const conflict = await evaluate('(async()=>{state.settings.showSub="浏览器未合并草稿";save();try{await localSync.flush();return false}catch(e){return true}})()');
  assert.equal(conflict,true);
  assert.equal((await (await fetch(base+'/api/local/state')).json()).state.dailyNotes.length,3);
  await call('Page.reload');
  await until('document.querySelector("#sync-notice")?.textContent.includes("未保存草稿")');
  assert.notEqual(await evaluate('JSON.parse(localStorage.getItem("vivian_local_pending_v1")).revision'), (await (await fetch(base+'/api/local/state')).json()).revision);
  await evaluate('localStorage.removeItem("vivian_local_pending_v1")');
  await call('Page.reload');
  await until('document.querySelector("#open-daily") && window.localSync?.statusText.includes("已保存")');
  await evaluate('switchTab("daily")');
  await call('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await screenshot('daily-mobile');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= 390'), true);
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ ok:true, checks:['empty state','form save','jin to kg','unknown calories','refresh persistence','chat update polling','navigation','concurrent write protection','conflict survives reload','mobile layout'], screenshots:output }));
  await call('Browser.close').catch(()=>{});
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
  if(socket) socket.close();
  if(browser) browser.kill();
  if(server) {server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));}
  // Test files are isolated under a fresh OS temp directory; keep profile for failure diagnosis.
});
