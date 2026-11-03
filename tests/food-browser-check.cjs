'use strict';
const assert=require('node:assert/strict'),{createPhoneServer}=require('../phone-server');
let calls=0;
const fixture=label=>({items:[{name:label?'测试营养标签':'测试餐盘',portion:label?'每100克':'假设一小碗',notes:label?'请核对包装文字':'仅供界面测试的模拟估算',kcalMin:label?null:300,kcalMax:label?null:450,labelEnergy:label?1000:null,labelUnit:label?'kJ':null,labelBasisAmount:label?100:null,labelBasisUnit:label?'g':null}],questions:label?['实际吃了多少克？']:['请核对实际份量'],warnings:[]});
require('./browser-harness.cjs')(async({base,call,evaluate,until,screenshot,errors,sleep})=>{
  const choose=()=>evaluate(`(async()=>{const c=document.createElement('canvas');c.width=32;c.height=32;c.getContext('2d').fillRect(0,0,32,32);const blob=await new Promise(r=>c.toBlob(r,'image/png'));await foodChooseImage(new File([blob],'test.png',{type:'image/png'}));})()`);
  await evaluate('document.querySelector("[data-nav=food]").click()');await until('!!document.querySelector("#food-config-form")');
  assert.equal(await evaluate('document.querySelector("#food-recognize").disabled'),true);await screenshot('food-setup');
  await evaluate('document.querySelector("#food-api-key").value="sk-test-not-a-real-key";document.querySelector("#food-config-form").requestSubmit()');await until('foodUI.config?.configured && !document.querySelector("#food-api-key").value');
  await choose();await until('!!document.querySelector("#food-preview-image") && !foodUI.busy');
  await evaluate('document.querySelector("#food-recognize").click();document.querySelector("#food-recognize").click()');await until('!!foodUI.result && !foodUI.busy');assert.equal(calls,1);
  assert.equal(await evaluate('state.life.diet.length'),0);
  await call('Page.reload');await until('document.querySelector("#open-daily") && localSync.statusText.includes("已保存")');
  await evaluate('switchTab("food")');await until('!!document.querySelector("#food-review-form")');assert.ok(await evaluate('!!foodUI.image'));
  await evaluate('document.querySelector("#food-recognize").click()');await until('!!foodUI.result && !foodUI.busy');assert.equal(calls,1,'cached recognition must not call paid API again');
  await evaluate('document.querySelector("#food-confirm").click()');
  await call('Network.enable');await call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await evaluate('document.querySelector("#food-review-form").requestSubmit()');await until('!foodUI.busy && !!foodUI.pending');assert.equal(await evaluate('state.life.diet.length'),0,'failed image save must not create a record');
  await call('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await evaluate('document.querySelector("#food-review-form").requestSubmit()');await until('!foodUI.busy && !foodUI.pending && state.life.diet.length===1');
  assert.equal(await evaluate('state.life.diet[0].items[0].kcal'),null);assert.equal(await evaluate('state.life.diet[0].items[0].kcalEstimate.min'),300);
  await evaluate('switchTab("daily");dailyUI.type="diet";drawDailyHistory()');await until('!!document.querySelector("#daily-history img")');assert.ok(await evaluate('document.querySelector("#daily-history").textContent.includes("照片估算 300–450")'));
  await evaluate('switchTab("food")');await until('!!document.querySelector("[data-food-mode=label]")');await evaluate('document.querySelector("[data-food-mode=label]").click()');await choose();await until('!foodUI.busy && !!document.querySelector("#food-preview-image")');
  await evaluate('document.querySelector("#food-recognize").click()');await until('!!foodUI.result && !foodUI.busy');assert.equal(calls,2);
  assert.equal(await evaluate('document.querySelector("#food-review-form").checkValidity()'),false);
  await evaluate('const q=document.querySelector("[data-food-field=consumed]");q.value="50";q.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#food-confirm").click()');
  assert.ok(await evaluate('document.querySelector("[data-food-calculated]").textContent.includes("119.5")'));
  await screenshot('food-label-review');await evaluate('document.querySelector("#food-review-form").requestSubmit()');await until('!foodUI.busy && !foodUI.pending && state.life.diet[0].items.length===2');assert.equal(await evaluate('state.life.diet[0].items[1].kcal'),119.5);
  const key='c'.repeat(64),gateway=createPhoneServer({host:'127.0.0.1',key,upstreamPort:Number(new URL(base).port)});await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
  try{
    await call('Page.navigate',{url:'http://127.0.0.1:'+gateway.address().port+'/#'+key});await until('document.querySelector("#open-daily") && localSync.statusText.includes("已保存")');
    await evaluate('switchTab("food")');await until('!!document.querySelector("#food-file")');assert.equal(await evaluate('!!document.querySelector("#food-config-form")'),false);assert.equal(await evaluate('foodUI.config.configured'),true);
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});await sleep(300);await screenshot('food-mobile');
    assert.equal(await evaluate('document.querySelector(".app-main").scrollWidth<=document.querySelector(".app-main").clientWidth+1'),true);
    assert.deepEqual(errors,[]);console.log('Food photo UI passed: mocked recognition, caching, draft restore, offline retry, label calculation, image storage, mobile config isolation. No paid API calls.');
  }finally{gateway.closeAllConnections();await new Promise(r=>gateway.close(r));}
},{foodAI:{environmentKey:'',fetchImpl:async(url,options)=>{calls++;const payload=JSON.parse(options.body),data=fixture(payload.input[0].content[0].text.includes('营养标签'));return {ok:true,status:200,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]})};}}}).catch(e=>{console.error(e);process.exitCode=1;});
