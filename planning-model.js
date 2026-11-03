(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.VivianPlanning=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const statuses={todo:'待办',doing:'进行中',blocked:'暂时卡住',done:'已完成'};
  const stages={seed:'灵感闪现',draft:'正在琢磨',active:'正在实践',done:'已经实现'};
  const add=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const time=t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t||'')?Number(t.slice(0,2))*60+Number(t.slice(3)):null;
  const status=t=>t.done?'done':['doing','blocked'].includes(t.status)?t.status:'todo';
  const progress=t=>t.done?100:Math.max(0,Math.min(99,Number(t.progress)||0));
  function estimate(t){if(Number(t.estimateMinutes)>0)return Number(t.estimateMinutes);const a=time(t.startTime),b=time(t.endTime);return a!==null&&b!==null&&b>a?b-a:null;}
  function remaining(t){if(t.done)return 0;const n=estimate(t);return n==null?null:n*(1-progress(t)/100);}
  function spent(state,id,now=Date.now()){const d=state.dashboard||{};return [...(d.focusSessions||[]),...(d.activeFocus?[{...d.activeFocus,end:now}]:[])].filter(s=>s.taskId===id).reduce((n,s)=>n+Math.max(0,(Math.min(Number(s.end),now)-Number(s.start))/60000||0),0);}
  function routines(state,date){const day=new Date(date+'T12:00:00Z').getUTCDay();return (state.planner?.routines||[]).filter(r=>(r.days||[]).includes(day));}
  function conflicts(state,date){
    const tasks=(state.planner?.today||[]).filter(t=>t.date===date&&!t.done),slots=[...tasks.map(t=>({id:'task-'+t.id,title:t.text,start:t.startTime,end:t.endTime,taskId:t.id})),...routines(state,date).map(r=>({id:'routine-'+r.id,title:r.title,start:r.startTime,end:r.endTime,routineId:r.id}))].filter(s=>time(s.start)!==null&&time(s.end)>time(s.start));
    const pairs=[];for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++)if(time(slots[i].start)<time(slots[j].end)&&time(slots[j].start)<time(slots[i].end))pairs.push([slots[i],slots[j]]);return pairs;
  }
  function report(state,today){
    const tasks=state.planner?.today||[],open=tasks.filter(t=>!t.done),capacity=Number(state.planner?.capacityMinutes)>0?Number(state.planner.capacityMinutes):null;
    const days=Array.from({length:14},(_,i)=>{const date=add(today,i),list=open.filter(t=>t.date===date),minutes=list.reduce((s,t)=>s+(remaining(t)||0),0);return {date,tasks:list,minutes,unknown:list.filter(t=>remaining(t)===null).length,over:capacity?Math.max(0,minutes-capacity):0};});
    const overdue=open.filter(t=>t.deadline&&t.deadline<today),soon=open.filter(t=>t.deadline&&t.deadline>=today&&t.deadline<=add(today,2)),blocked=open.filter(t=>status(t)==='blocked');
    const counts=Object.fromEntries(Object.keys(statuses).map(s=>[s,tasks.filter(t=>status(t)===s).length]));
    const known=tasks.filter(t=>estimate(t)!=null),totalEstimate=known.reduce((s,t)=>s+estimate(t),0);
    return {tasks,open,capacity,days,overdue,soon,blocked,counts,remaining:open.reduce((s,t)=>s+(remaining(t)||0),0),unknown:open.filter(t=>remaining(t)===null).length,undated:open.filter(t=>!t.date),pastPlanned:open.filter(t=>t.date&&t.date<today),conflicts:conflicts(state,today),weightedProgress:totalEstimate?known.reduce((s,t)=>s+estimate(t)*progress(t),0)/totalEstimate:null,completion:tasks.length?counts.done/tasks.length*100:0};
  }
  function setStatus(state,id,next,now=Date.now()){
    if(!statuses[next])throw Error('任务状态无效');const t=(state.planner?.today||[]).find(t=>t.id===id);if(!t)throw Error('任务已不存在');
    if(state.dashboard?.activeFocus?.taskId===id&&next!=='doing'){state.dashboard.focusSessions||=[];state.dashboard.focusSessions.push({...state.dashboard.activeFocus,end:now});state.dashboard.activeFocus=null;}
    const wasDone=!!t.done;t.status=next;t.done=next==='done';t.completedAt=t.done?(t.completedAt||new Date(now).toISOString()):null;
    if(!t.done&&wasDone)t.progress=0;
    return t;
  }
  return {statuses,stages,add,time,status,progress,estimate,remaining,spent,routines,conflicts,report,setStatus};
});
