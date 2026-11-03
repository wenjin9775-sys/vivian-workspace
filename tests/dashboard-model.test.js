'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const m=require('../dashboard-model');
test('focus crossing midnight splits into Beijing calendar days',()=>{
  const start=Date.parse('2026-10-26T23:50:00+08:00'),end=Date.parse('2026-10-27T00:20:00+08:00');
  const state={dashboard:{focusSessions:[{id:'a',start,end,title:'复习'}]}};
  assert.equal(m.focusForDay(state,'2026-10-26',end)[0].minutes,10);
  assert.equal(m.focusForDay(state,'2026-10-27',end)[0].minutes,20);
  assert.equal(m.focusForDay(state,'2026-10-28',end).length,0);
});
test('running timers count only elapsed time and retain their stored start',()=>{
  const start=Date.parse('2026-10-27T09:00:00+08:00'),now=start+25*60000;
  const state={dashboard:{focusSessions:[],activeFocus:{id:'live',start,title:'阅读'}}};
  assert.equal(m.focusForDay(state,'2026-10-27',now)[0].minutes,25);
  assert.equal(state.dashboard.activeFocus.start,start);
});
test('summaries exclude dates outside range and do not invent missing food or weight days',()=>{
  const state={life:{weight:[{date:'2026-10-19',weight:65.15},{date:'2026-10-21',weight:64.9},{date:'2026-10-26',weight:63.8},{date:'2026-10-28',weight:60}],diet:[{date:'2026-10-22',items:[{kcal:null}]},{date:'2026-10-23',items:[]}]},topikPlan:{dayHours:{'2026-10-22':1.5,'2026-10-25':2,'2026-10-28':4}},planner:{today:[{done:true},{done:true,completedAt:'2026-10-22T10:00:00+08:00'}]}};
  const r=m.summary(state,'2026-10-27',7);
  assert.equal(r.weightDays,2);assert.equal(r.dietDays,1);assert.equal(r.weightChange,-1.1);assert.equal(r.studyHours,3.5);assert.equal(r.completedTasks,1);
  assert.equal(r.focusMinutes,0);assert.equal(r.expense,0);
});
test('spending combines both existing modules without double counting the same id or income',()=>{
  const state={expense:[{id:'a',date:'2026-10-27',amount:10,category:'餐饮'}],accounting:{records:[{id:'a',date:'2026-10-27',type:'out',amount:10},{id:'b',date:'2026-10-27',type:'out',amount:5,cat:'交通'},{id:'c',type:'in',date:'2026-10-27',amount:500}]}};
  const r=m.summary(state,'2026-10-27',7);assert.equal(r.expense,15);assert.equal(r.spending.length,2);assert.deepEqual(r.byCategory,{'餐饮':10,'交通':5});
});
test('numeric goals and legacy percentage goals use actual progress',()=>{
  assert.equal(m.goalPercent({current:3,target:12}),25);assert.equal(m.goalPercent({progress:60}),60);assert.equal(m.goalPercent({current:20,target:10}),100);
  assert.equal(m.dateOf('2026-10-26T16:01:00Z'),'2026-10-27');
});
