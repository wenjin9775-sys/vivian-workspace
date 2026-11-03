'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLocalServer}=require('../local-server'),{createPhoneServer,privateIPv4}=require('../phone-server');
test('phone access requires pairing, rejects foreign origins and persists to the shared backend',async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'vivian-phone-test-')),upstream=createLocalServer({dataDir});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const key='a'.repeat(64),gateway=createPhoneServer({host:'127.0.0.1',key,upstreamPort:upstream.address().port});
  await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+gateway.address().port;
  try{
    assert.equal((await fetch(base+'/api/local/state')).status,401);
    assert.match(await(await fetch(base+'/')).text(),/手机工作台/);
    assert.equal((await fetch(base+'/api/phone/pair',{method:'POST',headers:{Origin:'http://other.test','Content-Type':'application/json'},body:JSON.stringify({key})})).status,403);
    assert.equal((await fetch(base+'/api/phone/pair',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{"key":"wrong"}'})).status,401);
    const paired=await fetch(base+'/api/phone/pair',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({key})});
    assert.equal(paired.status,200);assert.match(paired.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    const cookie=paired.headers.get('set-cookie').split(';')[0],headers={Cookie:cookie,Origin:base,'Content-Type':'application/json'};
    assert.equal((await fetch(base+'/jot.js',{headers})).status,200);
    assert.equal((await fetch(base+'/local-data/workspace.json',{headers})).status,404);
    assert.equal((await fetch(base+'/api/local/state',{headers:{...headers,Origin:'http://other.test'}})).status,403);
    const badHost=await new Promise((resolve,reject)=>{require('node:http').get(base+'/api/local/state',{headers:{Host:'evil.test',Cookie:cookie}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(badHost,403);
    assert.equal((await fetch(base+'/api/local/state',{method:'PUT',headers,body:JSON.stringify({revision:0,state:{life:{weight:[],diet:[]}}})})).status,200);
    const local=await(await fetch('http://127.0.0.1:'+upstream.address().port+'/api/local/state')).json();assert.equal(local.revision,1);
    assert.equal((await fetch(base+'/api/local/state',{method:'PUT',headers,body:JSON.stringify({revision:0,state:{}})})).status,409);
    assert.equal(privateIPv4('192.168.10.8'),true);assert.equal(privateIPv4('26.26.26.1'),false);
  }finally{gateway.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>gateway.close(r)),new Promise(r=>upstream.close(r))]);}
});
