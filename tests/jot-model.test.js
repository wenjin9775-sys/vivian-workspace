'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const J=require('../jot-model'),R=require('../record-model');
const date='2026-10-28';
test('one daily note populates existing ledgers, preserves source and is idempotent',()=>{
  const text='今天体重63.8kg，早餐吃了鸡蛋和牛奶；午餐吃了米饭；散步30分钟；地铁6元；完成了韩语复习。';
  const parsed=J.parse(text,date,date);assert.deepEqual(parsed.warnings,[]);
  assert.deepEqual(parsed.rows.map(r=>r.type),['weight','diet','diet','exercise','expense','event']);
  const entries=J.entries(parsed.rows,date,'jot-test');
  const state=R.applyEntries({exercise:{logs:[{id:'old',type:'跑步',date,duration:10}]},life:{weight:[{id:'old-weight',date,weight:65}]}},entries);
  assert.equal(state.life.weight.length,1);assert.equal(state.life.weight[0].weight,63.8);
  assert.equal(state.life.diet[0].items[0].kcal,null);
  assert.equal(state.exercise.logs.length,2);assert.equal(state.exercise.logs[1].duration,30);
  assert.equal(state.expense[0].amount,6);assert.equal(state.dailyNotes[0].text,'完成了韩语复习');
  assert.deepEqual(R.applyEntries(state,entries),state);
});
test('missing units need review, missing duration and calories stay null',()=>{
  const p=J.parse('体重64.2；瑜伽；早餐吃了两块瑞士卷，每块164kcal',date,date);
  assert.throws(()=>R.applyEntries({},J.entries(p.rows,date,'missing')),/单位/);
  p.rows[0].unit='斤';const result=R.applyEntries({},J.entries(p.rows,date,'reviewed'));
  assert.equal(result.life.weight[0].weight,32.1);assert.equal(result.exercise.logs[0].duration,null);
  assert.equal(result.life.diet[0].items[0].kcal,null,'per-item calories must not be recorded as total meal calories');
});
test('future plans and negations stay events; food portions are not spending',()=>{
  const p=J.parse('明天打算跑步30分钟；今天没吃早餐；希望体重60kg；吃了3块瑞士卷；收到工资5000元',date,date);
  assert.deepEqual(p.rows.map(r=>r.type),['event','event','event','diet','event']);
});
test('date mismatch is surfaced and multiple weights cannot overwrite silently',()=>{
  assert.ok(J.parse('2026-10-27，体重64kg',date,date).warnings.length);
  assert.ok(J.parse('昨天散步30分钟',date,date).warnings.length);
  const p=J.parse('早上体重64kg；晚上体重65kg',date,date);
  assert.throws(()=>J.entries(p.rows,date,'two'),/只保留一条/);
  p.rows[1].selected=false;assert.equal(J.entries(p.rows,date,'one').length,1);
});
test('duration conversion and monetary ambiguity preserve explicit evidence',()=>{
  const p=J.parse('骑行1小时20分钟；散步半小时；午餐花费25元；买牛奶20元和面包10元',date,date);
  assert.equal(p.rows[0].duration,80);assert.equal(p.rows[1].duration,30);
  assert.ok(p.rows.some(r=>r.type==='expense'&&r.amount==='25'));
  assert.equal(p.rows.at(-1).type,'event');assert.match(p.rows.at(-1).hint,/多笔/);
  assert.throws(()=>R.applyEntries({},[{id:'ex',type:'exercise',date,sport:'跑步',duration:-1}]),/正数/);
});
