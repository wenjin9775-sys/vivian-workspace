'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../planning-model');
test('unknown effort stays unknown; explicit deadline differs from planned date',()=>{
  const s={planner:{capacityMinutes:120,today:[{id:'a',date:'2026-10-29',estimateMinutes:240,progress:25},{id:'b',date:'2026-10-29'},{id:'c',date:'2026-10-27'},{id:'d',deadline:'2026-10-28',done:true},{id:'e',deadline:'2026-10-28',status:'blocked'}]}};
  const r=P.report(s,'2026-10-29');assert.equal(r.days[0].minutes,180);assert.equal(r.days[0].over,60);assert.equal(r.days[0].unknown,1);assert.equal(r.unknown,3);assert.deepEqual(r.overdue.map(t=>t.id),['e']);assert.deepEqual(r.pastPlanned.map(t=>t.id),['c']);assert.equal(r.weightedProgress,25);assert.equal(r.counts.blocked,1);assert.equal(r.days.length,14);
  delete s.planner.capacityMinutes;assert.equal(P.report(s,'2026-10-29').capacity,null);
});
test('legacy times supply effort; malformed and missing times do not become zero',()=>{
  assert.equal(P.estimate({startTime:'09:00',endTime:'10:30'}),90);assert.equal(P.estimate({startTime:'25:00',endTime:'26:00'}),null);assert.equal(P.remaining({}),null);assert.equal(P.remaining({done:true}),0);assert.equal(P.status({done:false,status:'done'}),'todo');assert.equal(P.time('12:60'),null);
});
test('status transitions close only the matching timer and reopening clears completion',()=>{
  const s={planner:{today:[{id:'a',progress:40},{id:'b'}]},dashboard:{activeFocus:{id:'f',taskId:'a',start:1000},focusSessions:[]}};
  P.setStatus(s,'b','done',2000);assert.ok(s.dashboard.activeFocus);P.setStatus(s,'a','doing',2000);assert.ok(s.dashboard.activeFocus);P.setStatus(s,'a','blocked',61000);assert.equal(s.dashboard.activeFocus,null);assert.equal(P.spent(s,'a',61000),1);P.setStatus(s,'a','done',62000);assert.equal(P.progress(s.planner.today[0]),100);P.setStatus(s,'a','todo',63000);assert.equal(s.planner.today[0].completedAt,null);assert.equal(s.planner.today[0].progress,0);assert.equal(s.dashboard.focusSessions.length,1);
});
test('routine overlap respects weekday and adjacent endpoints, excludes completed tasks',()=>{
  const s={planner:{today:[{id:'a',date:'2026-10-29',text:'a',startTime:'09:30',endTime:'10:00'},{id:'b',date:'2026-10-29',text:'b',startTime:'10:00',endTime:'11:00'},{id:'c',date:'2026-10-29',done:true,startTime:'09:00',endTime:'10:00'}],routines:[{id:'r',title:'r',days:[1,2,3,4,5],startTime:'09:00',endTime:'10:00'}]}};
  assert.equal(P.conflicts(s,'2026-10-29').length,1);assert.equal(P.routines(s,'2026-10-31').length,0);assert.equal(P.add('2026-12-31',1),'2027-01-01');
});
