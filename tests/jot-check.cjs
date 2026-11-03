'use strict';
const assert=require('node:assert/strict');
require('./browser-harness.cjs')(async({base,call,evaluate,until,screenshot,errors,sleep})=>{
  const write=async text=>evaluate(`(()=>{const el=document.querySelector('#jot-text');el.value=${JSON.stringify(text)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const parse=()=>evaluate('document.querySelector("#jot-parse").click()');
  const save=()=>evaluate('document.querySelector("#jot-review-form").requestSubmit()');
  await evaluate('document.querySelector("[data-nav=jot]").click()');
  const original='今天体重63.8kg，早餐吃了鸡蛋和牛奶；午餐吃了米饭；散步30分钟；地铁6元；完成了韩语复习。';
  await write(original);await call('Page.reload');await until('document.querySelector("#open-daily") && localSync.statusText.includes("已保存")');
  await evaluate('switchTab("jot")');assert.equal(await evaluate('document.querySelector("#jot-text").value'),original);
  await parse();assert.equal(await evaluate('document.querySelectorAll("[data-row]").length'),6);
  await save();await until('!jotUI.busy && state.quickNotes?.length===1 && jotUI.text===""');
  assert.equal(await evaluate('state.life.weight[0].weight'),63.8);assert.equal(await evaluate('state.life.diet[0].items.length'),2);
  assert.equal(await evaluate('state.exercise.logs[0].duration'),30);assert.equal(await evaluate('state.expense[0].amount'),6);
  assert.equal(await evaluate('state.dailyNotes[0].text'),'完成了韩语复习');
  await write(original);await parse();await save();await until('!jotUI.busy && jotUI.text===""');
  assert.equal(await evaluate('state.life.diet[0].items.length'),2);assert.equal(await evaluate('state.quickNotes.length'),1);
  console.log('Draft recovery, five-way archive and duplicate prevention passed');
  await write('体重64.2；瑜伽；今天读完了一章书。');await parse();
  assert.equal(await evaluate('document.querySelector("#jot-review-form").checkValidity()'),false);
  // Excluding a unitless weight must not block the remaining entries or overwrite the old measurement.
  await evaluate('document.querySelector("[data-selected]").click()');
  assert.equal(await evaluate('document.querySelector("#jot-review-form").checkValidity()'),true);
  await save();await until('!jotUI.busy && state.quickNotes.length===2');
  assert.equal(await evaluate('state.life.weight[0].weight'),63.8);assert.equal(await evaluate('state.exercise.logs[1].duration'),null);
  await evaluate('switchTab("daily");document.querySelector("[data-daily-type=exercise]").click()');
  assert.equal(await evaluate('document.querySelectorAll(".daily-record").length'),2);
  assert.ok(await evaluate('document.querySelector("#daily-history").textContent.includes("时长未填写")'));
  await evaluate('renderModulePage("exercise",()=>switchTab("home"),"返回")');
  assert.ok(await evaluate('document.querySelector("#app-main").textContent.includes("时长未填写")'));
  await evaluate('switchTab("jot")');await write('昨天跑步30分钟');await parse();
  assert.equal(await evaluate('document.querySelector("#jot-save").disabled'),true);
  // Simulated connection failure must retain both the review and stable entry ids.
  await write('晚餐吃了鱼肉和青菜；散步20分钟');await parse();
  await call('Network.enable');await call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await save();await until('!jotUI.busy && !!jotUI.pending');
  assert.ok(await evaluate('document.querySelector("#jot-status").textContent.includes("尚未确认")'));
  assert.equal(await evaluate('document.querySelector("#jot-text").disabled'),true);
  await call('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await save();await until('!jotUI.busy && !jotUI.pending && jotUI.text===""');
  await call('Page.reload');await until('document.querySelector("#open-daily") && localSync.statusText.includes("已保存")');
  assert.equal(await evaluate('state.quickNotes.length'),3);assert.equal(await evaluate('state.exercise.logs.length'),3);
  assert.equal(await evaluate('state.life.diet[0].items.length'),3);
  const disk=await(await fetch(base+'/api/local/state')).json();assert.equal(disk.state.quickNotes.length,3);
  console.log('Missing values, existing exercise module and failure retry passed');
  await evaluate('switchTab("jot")');await write('今天体重64.1kg；早餐吃了牛奶和鸡蛋；骑行25分钟；地铁6元；完成了一次韩语听力练习。');await parse();
  await evaluate('document.querySelector(".app-main").scrollTop=0');await screenshot('jot-desktop');
  await evaluate('document.querySelector("#jot-preview").scrollIntoView()');await screenshot('jot-review');
  for(const width of [390,768,1024]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
    await sleep(500);await evaluate('document.activeElement.blur();window.scrollTo(0,0);document.querySelector(".app-main").scrollTop=0');await sleep(100);
    assert.equal(await evaluate('document.querySelector(".app-main").scrollWidth<=document.querySelector(".app-main").clientWidth+1'),true,'overflow at '+width);
    if(width===390)await screenshot('jot-mobile');
  }
  assert.deepEqual(errors,[]);console.log('Jot page browser checks passed (isolated data only)');
}).catch(e=>{console.error(e);process.exitCode=1});
