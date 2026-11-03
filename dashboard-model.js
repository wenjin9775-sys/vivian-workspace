(function(root, factory) {
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.VivianOverview = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const DAY = 86400000;
  function dateOf(time) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time)); }
  function add(date,n) { return new Date(Date.parse(date+'T00:00:00Z')+n*DAY).toISOString().slice(0,10); }
  function days(end,count) { return Array.from({length:count},(_,i)=>add(end,i-count+1)); }
  function focusForDay(state,date,now=Date.now()) {
    const start=Date.parse(date+'T00:00:00+08:00'), end=start+DAY;
    const data=state.dashboard || {};
    const sessions=[...(data.focusSessions || []),...(data.activeFocus ? [{...data.activeFocus,end:now,active:true}] : [])];
    return sessions.flatMap(s=>{
      const a=Math.max(start,Number(s.start)), b=Math.min(end,Number(s.end),now);
      return Number.isFinite(a)&&Number.isFinite(b)&&b>a ? [{...s,segmentStart:a,segmentEnd:b,minutes:(b-a)/60000}] : [];
    });
  }
  function expenses(state) {
    const combined=[...(state.expense || []),...(state.accounting?.records || []).filter(r=>r.type==='out')];
    const seen=new Set();
    return combined.filter(r=>{if(r.id&&seen.has(r.id))return false;if(r.id)seen.add(r.id);return Number.isFinite(Number(r.amount));}).map(r=>({...r,category:r.category || r.cat || '其他'}));
  }
  function summary(state,end,count=7,now=Date.now()) {
    const range=days(end,count), first=range[0], includes=d=>d>=first&&d<=end;
    const weights=(state.life?.weight || []).filter(w=>includes(w.date)&&Number.isFinite(Number(w.weight))).slice().sort((a,b)=>a.date.localeCompare(b.date));
    const diet=(state.life?.diet || []).filter(d=>includes(d.date)&&(d.items || []).length);
    const spending=expenses(state).filter(r=>includes(r.date));
    const byCategory={};spending.forEach(r=>{const key=r.category || '其他';byCategory[key]=(byCategory[key] || 0)+Number(r.amount);});
    const focus=range.map(date=>({date,minutes:focusForDay(state,date,now).reduce((s,r)=>s+r.minutes,0)}));
    const study=range.map(date=>({date,hours:Number(state.topikPlan?.dayHours?.[date]) || 0}));
    return {range,first,end,weights,diet,spending,byCategory,focus,study,
      weightDays:new Set(weights.map(w=>w.date)).size,dietDays:new Set(diet.map(d=>d.date)).size,
      weightChange:weights.length>1 ? Number((weights.at(-1).weight-weights[0].weight).toFixed(2)) : null,
      expense:spending.reduce((s,r)=>s+Number(r.amount),0),focusMinutes:focus.reduce((s,r)=>s+r.minutes,0),studyHours:study.reduce((s,r)=>s+r.hours,0),
      completedTasks:(state.planner?.today || []).filter(t=>t.done&&t.completedAt&&includes(dateOf(t.completedAt))).length};
  }
  function goalPercent(goal) { return Math.max(0,Math.min(100,Number(goal.target)>0 ? Number(goal.current || 0)/Number(goal.target)*100 : Number(goal.progress || 0))); }
  return {dateOf,add,days,focusForDay,expenses,summary,goalPercent};
});
