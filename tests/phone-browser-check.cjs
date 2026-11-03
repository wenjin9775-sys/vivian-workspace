'use strict';
const assert=require('node:assert/strict'),{createPhoneServer}=require('../phone-server');
require('./browser-harness.cjs')(async({base,call,evaluate,until,errors})=>{
  const key='b'.repeat(64),gateway=createPhoneServer({host:'127.0.0.1',key,upstreamPort:Number(new URL(base).port)});
  await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
  try{
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
    await call('Page.navigate',{url:'http://127.0.0.1:'+gateway.address().port+'/#'+key});
    await until('document.querySelector("#open-daily") && localSync.statusText.includes("已保存")');
    assert.equal(await evaluate('location.hash'),'');assert.equal(await evaluate('document.cookie.includes("vivian_phone")'),false);
    await evaluate('switchTab("jot")');assert.ok(await evaluate('!!document.querySelector("#jot-text")'));
    assert.deepEqual(errors,[]);console.log('Phone link automatically pairs, removes credential from address and opens workbench at mobile width.');
  }finally{gateway.closeAllConnections();await new Promise(r=>gateway.close(r));}
}).catch(e=>{console.error(e);process.exitCode=1;});
