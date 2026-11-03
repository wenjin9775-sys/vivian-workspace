'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dataDir=path.join(root,'local-data');
const {privateIPv4}=require('../phone-server');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const interfaces=Object.entries(os.networkInterfaces()).sort(([a],[b])=>Number(/WLAN|Wi-Fi|Wireless/i.test(b))-Number(/WLAN|Wi-Fi|Wireless/i.test(a)));
  const host=interfaces.flatMap(([,rows])=>rows).find(r=>!r.internal&&r.family==='IPv4'&&privateIPv4(r.address))?.address;
  if(!host)throw Error('Connect this computer and phone to the same Wi-Fi first.');
  const base='http://'+host+':8778',config=path.join(dataDir,'phone-access.json');
  async function ready(){try{if(!fs.existsSync(config))return false;const key=JSON.parse(fs.readFileSync(config,'utf8')).key;const result=await fetch(base+'/api/local/health',{headers:{Cookie:'vivian_phone='+key},signal:AbortSignal.timeout(1200)});const health=await result.json();return result.ok&&health.workspace===root;}catch(_){return false;}}
  if(!await ready()){
    const out=fs.openSync(path.join(dataDir,'phone.out.log'),'a'),err=fs.openSync(path.join(dataDir,'phone.err.log'),'a');
    const child=spawn(process.execPath,[path.join(root,'phone-server.js')],{cwd:root,env:{...process.env,VIVIAN_PHONE_HOST:host},windowsHide:true,detached:true,stdio:['ignore',out,err]});
    fs.closeSync(out);fs.closeSync(err);child.unref();
    let started=false;for(let i=0;i<30;i++){await sleep(200);if(await ready()){started=true;break;}}
    if(!started)throw Error('Could not start phone access. Check local-data/phone.err.log.');
    fs.writeFileSync(path.join(dataDir,'phone-server.pid'),String(child.pid));
  }
  const key=JSON.parse(fs.readFileSync(config,'utf8')).key;
  const url=base+'/#'+key;fs.writeFileSync(path.join(dataDir,'phone-url.txt'),url);
  console.log('Open this link on your phone (same Wi-Fi):\n'+url);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
