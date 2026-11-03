'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createFoodAI}=require('../food-ai'),{createLocalServer}=require('../local-server'),Food=require('../food-model'),Records=require('../record-model');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
const result={items:[{name:'测试餐',portion:'假设一小碗',notes:'用油不明',kcalMin:200,kcalMax:320,labelEnergy:null,labelUnit:null,labelBasisAmount:null,labelBasisUnit:null}],questions:['实际吃了多少？'],warnings:[]};
const response=data=>({ok:true,status:200,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]})});
const config={apiKey:'sk-test-not-a-real-key',model:'gpt-5.6-terra',dailyLimit:3};
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'vivian-food-test-'));
test('photo results remain estimates; labels use explicit units and consumed quantity',()=>{
  const rows=[{...result.items[0],selected:true}],date='2026-10-29';
  const entries=Food.entries({id:'photo-test',date,meal:'午餐',mode:'photo',items:rows,imageId:'image-test',note:'只吃了一半',model:'test'});
  const saved=Records.applyEntries({},entries);assert.equal(saved.life.diet[0].items[0].kcal,null);assert.equal(saved.life.diet[0].items[0].kcalEstimate.min,200);assert.equal(saved.life.diet[0].items[0].img,'image-test');
  assert.match(Food.calorieText(saved.life.diet[0].items[0]),/照片估算/);assert.deepEqual(Records.applyEntries(saved,entries),saved);
  assert.throws(()=>Records.normalizeEntry({...entries[0],kcal:260}),/不能当作已知/);
  const label={name:'测试标签',selected:true,labelEnergy:1000,labelUnit:'kJ',labelBasisAmount:100,labelBasisUnit:'g',consumed:50};
  assert.equal(Food.labelCalories(label),119.5);assert.throws(()=>Food.labelCalories({...label,consumed:null}),/实际吃/);
  const e=Food.entries({id:'label-test',date,mode:'label',items:[label],imageId:'image-test'})[0];assert.equal(e.kcal,119.5);assert.match(e.calorieNote,/50 克/);assert.equal(e.kcalEstimate,undefined);
  assert.throws(()=>Food.validateResult({...result,items:[{...result.items[0],kcalMin:400,kcalMax:100}]},'photo'),/范围/);
});
test('request caching prevents repeat calls, credentials remain server-only, cap limits attempts',async()=>{
  const dataDir=temp();let calls=0,payload;
  const ai=createFoodAI({dataDir,environmentKey:'',fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);await new Promise(r=>setTimeout(r,20));return response(result);}});
  const status=ai.configure(config);assert.equal(status.configured,true);assert.ok(!JSON.stringify(status).includes(config.apiKey));
  const request={id:'req-one',mode:'photo',image,note:'测试份量'};
  const [a,b]=await Promise.all([ai.recognize(request),ai.recognize(request)]);assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(payload.store,false);assert.equal(payload.input[0].content[1].image_url,image);
  await ai.recognize(request);assert.equal(calls,1);
  const restarted=createFoodAI({dataDir,environmentKey:'',fetchImpl:()=>{throw Error('must not call')}});assert.deepEqual(await restarted.recognize(request),a);
  await assert.rejects(ai.recognize({...request,note:'changed'}),/已改变/);
  await assert.rejects(ai.recognize({...request,id:'unsafe',image:'https://example.com/photo.png'}),/JPG/);
  ai.configure({...config,dailyLimit:1});await assert.rejects(ai.recognize({...request,id:'another'}),/上限/);
  ai.configure({disable:true});assert.equal(ai.status().configured,false);assert.ok(!fs.readFileSync(path.join(dataDir,'food-ai-settings.json'),'utf8').includes(config.apiKey));
});
test('upstream failures do not fabricate results or automatically retry',async()=>{
  let calls=0;const ai=createFoodAI({dataDir:temp(),environmentKey:'',fetchImpl:async()=>{calls++;return {ok:false,status:401}}});ai.configure(config);
  await assert.rejects(ai.recognize({id:'bad-key',mode:'photo',image,note:''}),/密钥无效/);assert.equal(calls,1);
  const malformed=createFoodAI({dataDir:temp(),environmentKey:'',fetchImpl:async()=>response({items:'wrong'})});malformed.configure(config);await assert.rejects(malformed.recognize({id:'bad-result',mode:'photo',image,note:''}),/未获得可用/);
});
test('configuration is not exported or exposed; phone may recognize but cannot set credentials',async()=>{
  const dataDir=temp(),server=createLocalServer({dataDir,foodAI:{environmentKey:'',fetchImpl:async()=>response(result)}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  try{
    const put=async(body,headers={})=>fetch(base+'/api/local/food-ai/config',{method:'PUT',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
    assert.equal((await put(config,{'x-vivian-phone':'1'})).status,403);assert.equal((await put(config)).status,200);
    const status=await(await fetch(base+'/api/local/food-ai/config',{headers:{'x-vivian-phone':'1'}})).json();assert.equal(status.canConfigure,false);assert.ok(!JSON.stringify(status).includes('sk-test'));
    assert.equal((await fetch(base+'/local-data/food-ai-settings.json')).status,404);assert.equal((await fetch(base+'/food-ai.js')).status,404);
    const exportText=await(await fetch(base+'/api/local/export')).text();assert.ok(!exportText.includes('apiKey'));
    const recognized=await fetch(base+'/api/local/food-ai/recognize',{method:'POST',headers:{'Content-Type':'application/json','x-vivian-phone':'1'},body:JSON.stringify({id:'mobile',mode:'label',image,note:''})});assert.equal(recognized.status,200);
    assert.equal((await recognized.json()).items[0].kcalMin,null,'label mode never uses inferred meal calories');
    assert.equal((await(await fetch(base+'/api/local/state')).json()).revision,0,'recognition does not write a diet record');
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
module.exports={image,result,response};
