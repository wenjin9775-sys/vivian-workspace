'use strict';
const {createLocalServer}=require('../local-server');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async function withBrowser(run,options={}){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vivian-overview-test-'));
  const output=path.resolve(__dirname,'../test-results');fs.mkdirSync(output,{recursive:true});
  const server=createLocalServer({dataDir:path.join(temp,'data'),...options});let browser,socket,call;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
    browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(temp,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
    const file=path.join(temp,'profile/DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(file);i++)await sleep(150);
    if(!fs.existsSync(file))throw Error('Browser did not start');
    const port=fs.readFileSync(file,'utf8').split('\n')[0];const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(10000)})).json();
    socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Browser connection timed out')),10000);socket.onopen=()=>{clearTimeout(timeout);resolve()};socket.onerror=reject;});
    let next=0;const pending=new Map(),errors=[];
    socket.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(msg.error):p.resolve(msg.result);}if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);};
    call=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},15000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);return r.result.value;};
    const until=async expression=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await sleep(100);}throw Error('Timed out: '+expression)};
    const screenshot=async name=>{const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(r.data,'base64'));};
    await call('Runtime.enable');await call('Page.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:base});await until('document.querySelector("#open-daily") && localSync.statusText.includes("已保存")');
    console.log('Isolated overview browser ready');
    await run({base,call,evaluate,until,screenshot,errors,output,sleep});
  }finally{
    if(call)await call('Browser.close').catch(()=>{});if(socket)socket.close();if(browser)browser.kill();server.closeAllConnections();await new Promise(r=>server.close(r));
  }
};
