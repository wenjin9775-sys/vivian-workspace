/* Overview enhancement. Existing records and module schemas are retained. */
'use strict';
const overviewUI={range:30,reviewRange:7,note:'',busy:false,renderedDate:null};
const OV=VivianOverview;
function overviewData() {
  state.dashboard ||= {focusSessions:[],activeFocus:null,reminders:[]};
  state.dashboard.focusSessions ||= [];state.dashboard.reminders ||= [];
  state.planner ||= {today:[],week:[],goals:[]};state.planner.today ||= [];state.planner.goals ||= [];
  state.habit ||= {habits:[]};state.habit.habits ||= [];
  return state.dashboard;
}
function overviewEmpty(text,action='') { return `<div class="ov-empty"><span>✧</span><p>${text}</p>${action}</div>`; }
function overviewButton(text,attrs='',primary=false) { return `<button class="ov-button${primary?' ov-primary':''}" ${attrs}>${text}</button>`; }
function overviewSection(title,subtitle='',actions='') { return `<div class="ov-section-head"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${actions}</div>`; }
function overviewSaveStatus() {return `<span class="ov-save-status" data-save-status role="status" aria-live="polite" data-error="${!!localSync.statusError}">${esc(localSync.statusText)}</span>`;}
function overviewMetric(label,value,unit,detail,color='pink') { return `<div class="ov-metric ${color}"><span>${label}</span><strong>${value}<small>${unit}</small></strong><p>${detail}</p></div>`; }
function overviewDate(date) { return date ? date.slice(5).replace('-','/') : '未设日期'; }
function overviewMinutes(n) { return n<1 ? (n>0?'不足 1 分钟':'0 分钟') : `${Math.floor(n)} 分钟`; }
function overviewTasks() { return state.planner.today.filter(t=>t.date===todayStr()||!t.date).slice().sort((a,b)=>Number(a.done)-Number(b.done)||(b.prio || 2)-(a.prio || 2)); }
function overviewRefresh() { renderHeader(); if(currentRoute.tab==='review')renderOverviewReview();else if(currentRoute.tab==='home')renderHome(); }
async function overviewCommit(mutate) {
  if(overviewUI.busy) return false;
  overviewUI.busy=true;
  try { await localSync.flush();mutate();save();await localSync.flush();overviewRefresh();return true; }
  catch(e) {toast('尚未保存：'+e.message);return false;}
  finally{overviewUI.busy=false;}
}
function overviewWeightChart(weights) {
  if(!weights.length) return overviewEmpty('这段时间还没有体重记录',overviewButton('记录体重','data-ov="daily"'));
  const w=660,h=172,left=42,right=20,top=18,bottom=30;
  const vals=weights.map(r=>Number(r.weight)),low=Math.min(...vals),high=Math.max(...vals),pad=Math.max(.25,(high-low)*.2);
  const min=low-pad,max=high+pad,first=Date.parse(weights[0].date),last=Date.parse(weights.at(-1).date);
  const x=r=>weights.length===1?(w+left-right)/2:left+(Date.parse(r.date)-first)/Math.max(1,last-first)*(w-left-right);
  const y=r=>top+(max-Number(r.weight))/(max-min)*(h-top-bottom);
  const grid=Array.from({length:3},(_,i)=>{const v=min+(max-min)*i/2,yy=top+(max-v)/(max-min)*(h-top-bottom);return `<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#eae5e0" stroke-dasharray="4 5"/><text x="${left-7}" y="${yy+4}" text-anchor="end">${v.toFixed(1)}</text>`;}).join('');
  const points=weights.map(r=>`${x(r)},${y(r)}`).join(' ');
  return `<svg class="ov-weight-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="体重趋势，${weights.length}条测量记录，单位公斤"><defs><linearGradient id="ov-weight-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e398b3" stop-opacity=".25"/><stop offset="1" stop-color="#e398b3" stop-opacity="0"/></linearGradient></defs>${grid}${weights.length>1?`<polygon points="${x(weights[0])},${h-bottom} ${points} ${x(weights.at(-1))},${h-bottom}" fill="url(#ov-weight-fill)"/><polyline points="${points}" fill="none" stroke="#c85f87" stroke-width="3" stroke-linejoin="round"/>`:''}${weights.map((r,i)=>`<circle cx="${x(r)}" cy="${y(r)}" r="${i===weights.length-1?5:3}" fill="#c85f87" stroke="#fff" stroke-width="2"><title>${r.date}：${r.weight} kg</title></circle>`).join('')}<text x="${left}" y="${h-5}">${overviewDate(weights[0].date)}</text>${weights.length>1?`<text x="${w-right}" y="${h-5}" text-anchor="end">${overviewDate(weights.at(-1).date)}</text>`:''}</svg><details class="ov-chart-detail"><summary>查看 ${weights.length} 条原始记录 · 连线仅帮助观察趋势</summary><div>${weights.map(r=>`<span>${esc(r.date)} <b>${Number(r.weight)} kg</b></span>`).join('')}</div></details>`;
}
function overviewCountdowns() {
  const list=(state.countdowns || []).slice().sort((a,b)=>a.date.localeCompare(b.date));
  return `<section>${overviewSection('值得期待的日子','',overviewButton('＋ 倒计时','data-ov="add-countdown"'))}<div class="ov-countdowns">${list.map(c=>{
    const n=Math.round((Date.parse(c.date+'T00:00:00Z')-Date.parse(todayStr()+'T00:00:00Z'))/86400000);
    return `<button class="ov-countdown" data-edit-countdown="${esc(c.id)}"><span class="ov-countdown-icon">◷</span><div><span>${esc(c.title)}</span><strong>${Math.abs(n)}<small>${n>0?'天后':n<0?'天前':' · 就是今天'}</small></strong></div><time>${esc(c.date)}</time></button>`;
  }).join('')||overviewEmpty('给下一个重要日子留个位置。')}</div></section>`;
}
function overviewGoals() {
  const weeks=state.topikPlan?.weeks || [],tasks=weeks.flatMap(w=>w.tasks || []),done=tasks.filter(t=>t.done).length;
  return `<section>${overviewSection('把目标变成进度','每一点进展，都看得见。',overviewButton('＋ 添加目标','data-ov="add-goal"'))}<div class="ov-goals">
    <button class="ov-goal ov-goal-topik" data-ov="topik"><span class="ov-goal-label">🇰🇷 TOPIK 备考任务 <span>↗</span></span><strong>${done}<small> / ${tasks.length} 项</small></strong><div class="ov-progress"><i style="width:${tasks.length?done/tasks.length*100:0}%"></i></div><p>按已勾选周任务统计 · ${esc(state.topikPlan?.examDate || '')}</p></button>
    ${state.planner.goals.map(g=>`<button class="ov-goal" data-edit-goal="${esc(g.id)}"><span class="ov-goal-label">${esc(g.title)}<span>↗</span></span><strong>${g.target?esc(g.current || 0):Math.round(OV.goalPercent(g))}<small>${g.target?' / '+esc(g.target)+' '+esc(g.unit || ''):' %'}</small></strong><div class="ov-progress"><i style="width:${OV.goalPercent(g)}%"></i></div><p>${Math.round(OV.goalPercent(g))}% 已完成${g.deadline?' · 截止 '+esc(g.deadline):' · 点击更新进度'}</p></button>`).join('')}
    ${!state.planner.goals.length?`<button class="ov-goal ov-goal-add" data-ov="add-goal"><b>＋</b><span>读完一本书、完成一段学习</span><small>给自己的目标一个开始</small></button>`:''}</div></section>`;
}
function overviewTasksHTML() {
  const list=overviewTasks(),done=list.filter(t=>t.done).length,active=overviewData().activeFocus;
  return `<section class="ov-panel" id="ov-tasks">${overviewSection('今日任务',`${done} / ${list.length} 已完成`,overviewButton('＋ 任务','data-ov="add-task"'))}<div class="ov-progress"><i style="width:${list.length?done/list.length*100:0}%"></i></div><div class="ov-task-list">${list.map(t=>`<div class="ov-task ${t.done?'is-done':''}"><button class="ov-checkbox" data-toggle-task="${esc(t.id)}" aria-label="${t.done?'取消完成':'完成'} ${esc(t.text)}" aria-pressed="${!!t.done}">${t.done?'✓':''}</button><button class="ov-task-content" data-edit-task="${esc(t.id)}"><b>${esc(t.text)}</b><span>${esc(t.cat || '其他')} · ${t.startTime?esc(t.startTime)+'–'+esc(t.endTime):'未设时间'}${!t.date?' · 未安排日期':''}<em class="prio-${t.prio || 2}">${({1:'低',2:'中',3:'高'})[t.prio || 2]}优先</em></span></button>${!t.done?`<button class="ov-start${active?.taskId===t.id?' running':''}" data-focus-task="${esc(t.id)}" ${active&&active.taskId!==t.id?'disabled':''}>${active?.taskId===t.id?'■ 结束':'▶ 专注'}</button>`:''}</div>`).join('')||overviewEmpty('今天先安排一件重要的小事。',overviewButton('创建第一个任务','data-ov="add-task"'))}</div><p class="ov-footnote">日期任务与阅读／电影待办分别管理。${state.planner.today.filter(t=>!t.done&&t.date&&t.date<todayStr()).length?'有过去未完成的任务，可在下方查看。':''}</p>${state.planner.today.some(t=>t.date&&t.date!==todayStr())?`<details class="ov-chart-detail"><summary>其他日期的任务</summary><div class="ov-other-tasks">${state.planner.today.filter(t=>t.date&&t.date!==todayStr()).map(t=>`<button data-edit-task="${esc(t.id)}">${t.done?'✓':'○'} ${esc(t.date)} · ${esc(t.text)}</button>`).join('')}</div></details>`:''}</section>`;
}
function overviewHabitHTML() {
  const list=state.habit.habits;
  return `<section class="ov-panel ov-small">${overviewSection('今日习惯','',overviewButton('＋','data-ov="add-habit" aria-label="添加习惯"'))}<div class="ov-habits">${list.map(h=>`<div class="ov-habit"><button class="ov-checkbox" data-toggle-habit="${esc(h.id)}" aria-label="打卡 ${esc(h.name)}" aria-pressed="${!!h.done?.[todayStr()]}">${h.done?.[todayStr()]?'✓':''}</button><button data-edit-habit="${esc(h.id)}">${esc(h.emoji || '🌱')} ${esc(h.name)}<small>${h.freq==='weekly'?'每周习惯 · 今日可打卡':'每日习惯'}</small></button></div>`).join('')||overviewEmpty('从一个容易做到的习惯开始。')}</div></section>`;
}
function overviewFocusHTML() {
  const active=overviewData().activeFocus,rows=OV.focusForDay(state,todayStr()),total=rows.reduce((s,r)=>s+r.minutes,0);
  return `<section class="ov-panel ov-small">${overviewSection('今日专注','',overviewButton('记录','data-ov="focus-history"'))}<div class="ov-focus-total"><strong id="ov-focus-total">${Math.floor(total)}</strong><span>分钟 · ${rows.length} 次</span></div>${active?`<div class="ov-focus-active"><span class="ov-live-dot"></span>${esc(active.title)}<b id="ov-focus-clock"></b></div>`:'<p class="ov-footnote">从任务开始计时，结束后保存实际时段。</p>'}<button class="ov-button ${active?'ov-stop':'ov-primary'}" data-ov="${active?'stop-focus':'start-focus'}">${active?'■ 结束并保存':'▶ 开始自由专注'}</button><div class="ov-focus-history">${rows.slice(-3).reverse().map(r=>`<div><span>${esc(r.title)}</span><small>${overviewMinutes(r.minutes)}</small></div>`).join('')}</div></section>`;
}
function overviewRemindersHTML() {
  return `<section class="ov-panel ov-small">${overviewSection('小提醒','',overviewButton('＋','data-ov="add-reminder" aria-label="添加提醒"'))}<div class="ov-reminders">${overviewData().reminders.map(r=>`<div><span>${esc(r.text)}</span><button data-delete-reminder="${esc(r.id)}" aria-label="删除提醒 ${esc(r.text)}">×</button></div>`).join('')||overviewEmpty('留一句想提醒自己的话。')}</div><p class="ov-footnote">打开工作台时查看，不会发送系统通知。</p></section>`;
}
function overviewNotesHTML() {
  return `<section class="ov-panel ov-small">${overviewSection('随手记')}<form id="ov-note-form"><label class="ov-sr" for="ov-note">今天的小事</label><textarea id="ov-note" maxlength="10000" placeholder="今天发生了什么？先记下来…">${esc(overviewUI.note)}</textarea><button class="ov-button ov-primary" type="submit">保存到生活记录</button></form><button class="ov-button" data-ov="jot">按体重 / 饮食 / 运动分类整理 ↗</button><button class="ov-text-button" data-ov="copy-prompt">复制 GPT 每日汇总指令 ↗</button><p id="ov-note-status" class="ov-footnote" role="status"></p></section>`;
}
function overviewTimelineHTML() {
  const today=todayStr(),startDay=Date.parse(today+'T00:00:00+08:00'),planned=overviewTasks().filter(t=>t.startTime&&t.endTime&&t.date===today).map(t=>({title:t.text,a:Number(t.startTime.slice(0,2))*60+Number(t.startTime.slice(3)),b:Number(t.endTime.slice(0,2))*60+Number(t.endTime.slice(3)),done:t.done}));
  const actual=OV.focusForDay(state,today).map(r=>({title:r.title,a:(r.segmentStart-startDay)/60000,b:(r.segmentEnd-startDay)/60000,active:r.active}));
  if(!planned.length&&!actual.length)return `<section class="ov-panel">${overviewSection('计划与实际','左侧是安排，右侧是专注计时。')}${overviewEmpty('给任务设置开始和结束时间，再开始一次专注，就能看到对照。')}</section>`;
  const both=[...planned,...actual],from=Math.floor(Math.min(480,...both.map(r=>r.a))/60)*60,to=Math.min(1440,Math.ceil(Math.max(1200,...both.map(r=>r.b))/60)*60),span=to-from;
  function lane(items) {
    const ends=[],assigned=items.slice().sort((a,b)=>a.a-b.a).map(r=>{let n=ends.findIndex(e=>e<=r.a);if(n<0)n=ends.length;ends[n]=r.b;return {...r,lane:n};});
    const count=Math.max(1,ends.length);
    return assigned.map(r=>`<div class="ov-time-event ${r.active?'active':''}" style="top:${(r.a-from)/span*100}%;height:max(27px,${(r.b-r.a)/span*100}%);left:${r.lane/count*100}%;width:calc(${100/count}% - 4px)" title="${esc(r.title)}"><b>${esc(r.title)}</b><small>${overviewClock(r.a)}–${overviewClock(r.b)}${r.active?' · 进行中':''}</small></div>`).join('');
  }
  const ticks=[];for(let m=from;m<=to;m+=120)ticks.push(`<div class="ov-time-tick" style="top:${(m-from)/span*100}%">${overviewClock(m)}</div>`);
  return `<section class="ov-panel">${overviewSection('计划与实际','实际时段来自专注计时；跨日记录按当天拆分。')}<div class="ov-timeline-head"><span>● 计划</span><span>● 实际</span></div><div class="ov-timeline"><div class="ov-time-axis">${ticks.join('')}</div><div class="ov-time-lane planned">${lane(planned)}</div><div class="ov-time-lane actual">${lane(actual)}</div></div></section>`;
}
function overviewClock(minutes) {const n=Math.floor(minutes);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function overviewCoverageHTML(report) {
  return `<div class="ov-coverage">${report.range.map(d=>{const w=(state.life.weight || []).some(r=>r.date===d),food=(state.life.diet || []).some(r=>r.date===d&&r.items?.length);return `<button data-open-date="${d}" title="${d}：${w?'有体重':'未记体重'}，${food?'有饮食':'未记饮食'}"><span>${overviewDate(d)}</span><i class="${w?'weight':''}"></i><i class="${food?'food':''}"></i></button>`;}).join('')}</div><p class="ov-footnote"><i class="ov-legend pink"></i>体重 <i class="ov-legend green"></i>饮食 · 灰色表示未记录，不代表没有进食。</p>`;
}
renderHome = function() {
  overviewData();document.body.classList.add('is-overview');
  const today=todayStr();overviewUI.renderedDate=today;const allWeights=state.life.weight.slice().sort((a,b)=>a.date.localeCompare(b.date)),latest=allWeights.filter(w=>w.date<=today).at(-1),report=OV.summary(state,today,overviewUI.range),week=OV.summary(state,today,7),tasks=overviewTasks();
  const monthly=OV.expenses(state).filter(e=>e.date?.startsWith(today.slice(0,7))&&e.date<=today),total=monthly.reduce((s,e)=>s+Number(e.amount),0);
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  const greeting=hour<6?'夜深了':hour<12?'早上好':hour<18?'下午好':'晚上好';
  document.getElementById('app-main').innerHTML=`<div class="ov-page"><header class="ov-hero"><div><span class="ov-eyebrow">${today.replaceAll('-',' / ')} · 星期${weekDay(today)}</span><h1>${greeting}，<em>${esc(state.settings.userName || 'Vivian')}</em><span>✦</span></h1><p>把日子过清楚，把喜欢的事慢慢做好。</p></div><div class="ov-hero-actions">${overviewSaveStatus()}${overviewButton('查看复盘 ↗','data-ov="review"')}${overviewButton('＋ 记一笔','id="open-daily" data-ov="daily"',true)}</div></header>
    ${overviewCountdowns()}
    <section><div class="ov-section-head"><h2>生活，一眼看清</h2><span class="ov-caption">缺失记录保持空白，不补算热量</span></div><div class="ov-metrics">${overviewMetric('最近体重',latest?Number(latest.weight):'—',latest?'kg':'',latest?`${latest.date} 的测量`:'等待第一条记录')}${overviewMetric('本月已记支出',monthly.length?'¥'+total.toFixed(2):'—','',monthly.length?`${monthly.length} 笔 · ${today.slice(0,7)}`:'本月尚无花销记录','yellow')}${overviewMetric('近 7 天韩语学习',week.studyHours?Number(week.studyHours.toFixed(1)):'—',week.studyHours?'小时':'','来自 TOPIK 每日学习记录','green')}${overviewMetric('今日任务',tasks.filter(t=>t.done).length,` / ${tasks.length}`,tasks.length?'一步一步，完成自己的安排':'还没有安排任务','blue')}</div></section>
    <div class="ov-two-col"><section class="ov-panel">${overviewSection('体重变化',report.weights.length?`${report.first} — ${today} · ${report.weightDays} 天有记录`:'记录之后，变化会在这里出现',`<div class="ov-segments" aria-label="趋势时间范围">${[7,30,90].map(n=>`<button data-range="${n}" aria-pressed="${n===overviewUI.range}">${n}天</button>`).join('')}</div>`)}<div class="ov-trend-number">${latest?Number(latest.weight):'—'}<small>kg</small>${report.weightChange!=null?`<span>区间变化 ${report.weightChange>0?'+':''}${report.weightChange.toFixed(2)} kg</span>`:'<span>至少两次测量后显示变化</span>'}</div>${overviewWeightChart(report.weights)}</section>${overviewTasksHTML()}</div>
    ${overviewGoals()}
    <div class="ov-four-col">${overviewHabitHTML()}${overviewFocusHTML()}${overviewRemindersHTML()}${overviewNotesHTML()}</div>
    <div class="ov-two-col ov-bottom">${overviewTimelineHTML()}<section class="ov-panel">${overviewSection('最近 7 天，记录了什么','点击日期查看当天生活记录。',overviewButton('详细复盘','data-ov="review"'))}${overviewCoverageHTML(week)}<div class="ov-week-stats"><div><b>${week.weightDays}<small>/ 7 天</small></b><span>记录体重</span></div><div><b>${week.dietDays}<small>/ 7 天</small></b><span>记录饮食</span></div><div><b>${Math.floor(week.focusMinutes)}<small>分钟</small></b><span>累计专注</span></div></div><div class="ov-next-step"><b>今天给自己留一点进展</b><p>${!state.life.weight.some(w=>w.date===today)?'今天还没有体重记录。 ':''}${!state.life.diet.some(d=>d.date===today&&d.items?.length)?'饮食可以随时补记。 ':''}已完成的护肤和学习，也记得打卡。</p><div>${overviewButton('🌸 护肤打卡','data-ov="skincareDaily"')}${overviewButton('🇰🇷 韩语打卡','data-ov="study"')}</div></div></section></div>
    <footer class="ov-footer"><span>VIVIAN · MY EVERYDAY</span><span>真实记录，慢慢积累。保存状态见页面顶部。</span></footer></div>`;
  bindOverview();overviewTick();
};
function renderOverviewReview() {
  overviewData();overviewUI.renderedDate=todayStr();const r=OV.summary(state,todayStr(),overviewUI.reviewRange),maxSpend=Math.max(1,...Object.values(r.byCategory)),maxFocus=Math.max(1,...r.focus.map(d=>d.minutes));
  document.getElementById('app-main').innerHTML=`<div class="ov-page"><header class="ov-hero"><div><span class="ov-eyebrow">LOOK BACK, MOVE FORWARD</span><h1>把变化，看清楚</h1><p>${r.first} — ${r.end} · 只统计实际记录</p></div><div class="ov-hero-actions">${overviewSaveStatus()}<div class="ov-segments">${[7,30].map(n=>`<button data-review-range="${n}" aria-pressed="${n===overviewUI.reviewRange}">最近 ${n} 天</button>`).join('')}</div></div></header><div class="ov-metrics">${overviewMetric('区间体重变化',r.weightChange==null?'—':(r.weightChange>0?'+':'')+r.weightChange.toFixed(2),'kg',`${r.weightDays} 天有测量记录`)}${overviewMetric('已记录花销',r.spending.length?'¥'+r.expense.toFixed(2):'—','',`${r.spending.length} 笔 · 含生活记录与记账模块`,'yellow')}${overviewMetric('韩语学习',Number(r.studyHours.toFixed(1)),'小时','来自 TOPIK 学习时长','green')}${overviewMetric('专注时间',Math.floor(r.focusMinutes),'分钟','来自专注计时，跨日拆分','blue')}</div><div class="ov-two-col"><section class="ov-panel">${overviewSection('体重趋势')}${overviewWeightChart(r.weights)}</section><section class="ov-panel">${overviewSection('钱花在哪里')}<div class="ov-category-bars">${Object.entries(r.byCategory).sort((a,b)=>b[1]-a[1]).map(([cat,value])=>`<div><span>${esc(cat)}</span><i><b style="width:${value/maxSpend*100}%"></b></i><strong>¥${value.toFixed(2)}</strong></div>`).join('')||overviewEmpty('还没有花销记录。')}</div></section></div><div class="ov-two-col"><section class="ov-panel">${overviewSection('每天的专注','单位：分钟；没有计时的日期显示 0。')}<div class="ov-focus-bars">${r.focus.map(d=>`<div title="${d.date}：${overviewMinutes(d.minutes)}"><b>${Math.floor(d.minutes)||''}</b><i style="height:${Math.max(2,d.minutes/maxFocus*100)}px"></i><small>${d.date.slice(8)}</small></div>`).join('')}</div></section><section class="ov-panel">${overviewSection('记录完整度','未记录的日期不参与饮食或体重推算。')}${overviewCoverageHTML(r)}<p class="ov-review-copy">${r.dietDays} / ${overviewUI.reviewRange} 天有饮食记录；${r.weightDays} / ${overviewUI.reviewRange} 天有体重记录。<br>已记录热量只覆盖填写过热量的食物，不能当作完整日摄入。</p></section></div><section class="ov-panel">${overviewSection('给下一周留一个方向','先观察，再决定要调整什么。')}<div class="ov-review-actions">${overviewButton('＋ 设置一个目标','data-ov="add-goal"')}${overviewButton('＋ 安排一项任务','data-ov="add-task"')}${overviewButton('复制本次复盘摘要','data-ov="copy-review"')}</div><p class="ov-footnote">复制后可带回 GPT 讨论。摘要不包含自动生成的健康结论。</p></section></div>`;
  bindOverview();
}
function overviewField(label,name,value='',type='text',extra='') {return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function overviewModal(title,fields,submit,onDelete) {
  const root=document.getElementById('modal-root');
  root.innerHTML=`<div class="modal-backdrop"><section class="modal ov-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head">${title}<button class="ov-close" data-close aria-label="关闭">×</button></div><form id="ov-modal-form"><div class="modal-body">${fields}<p class="ov-form-error" role="alert"></p></div><div class="modal-foot">${onDelete?'<button type="button" class="ov-button ov-danger" id="ov-modal-delete">删除</button>':''}<button type="button" class="ov-button" data-close>取消</button><button class="ov-button ov-primary" type="submit">保存</button></div></form></section></div>`;
  const close=()=>root.replaceChildren();root.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  root.querySelector('.modal-backdrop').onclick=e=>{if(e.target===e.currentTarget)close();};
  root.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;try{const mutate=submit(Object.fromEntries(new FormData(e.target)));if(await overviewCommit(mutate))close();else root.querySelector('.ov-form-error').textContent='尚未保存成功，请处理页面的保存提示后重试。';}catch(error){root.querySelector('.ov-form-error').textContent=error.message;}finally{b.disabled=false;}};
  if(onDelete) root.querySelector('#ov-modal-delete').onclick=async()=>{if(confirm('确定删除这一项？')){try{if(await overviewCommit(onDelete))close();}catch(e){root.querySelector('.ov-form-error').textContent=e.message;}}};
  root.querySelector('input,textarea')?.focus();
}
function overviewEditTask(id) {
  const t=state.planner.today.find(t=>t.id===id);
  overviewModal(t?'编辑任务':'安排一项任务',overviewField('任务名称','text',t?.text || '','text','required maxlength="200"')+`<div class="ov-form-row">${overviewField('日期','date',t?.date || todayStr(),'date','required')}<label>优先级<select name="prio">${[[3,'高'],[2,'中'],[1,'低']].map(([n,label])=>`<option value="${n}" ${n===(t?.prio || 2)?'selected':''}>${label}</option>`).join('')}</select></label></div>`+overviewField('分类','cat',t?.cat || '学习','text','maxlength="40"')+`<div class="ov-form-row">${overviewField('计划开始（可选）','startTime',t?.startTime || '','time')}${overviewField('计划结束（可选）','endTime',t?.endTime || '','time')}</div><p class="ov-footnote">时段按北京时间记录；跨午夜的计划请分成两天。</p>`,f=>{
    if(!f.text.trim())throw Error('请填写任务名称');
    if(!!f.startTime!==!!f.endTime || f.startTime&&f.endTime<=f.startTime)throw Error('请填写同一天内有效的开始和结束时间');
    return ()=>{const data={text:f.text.trim(),date:f.date,cat:f.cat.trim() || '其他',prio:Number(f.prio),startTime:f.startTime,endTime:f.endTime};if(t)Object.assign(t,data);else state.planner.today.push({id:uid(),done:false,...data});};
  },t?()=>{if(state.dashboard.activeFocus?.taskId===t.id)throw Error('请先结束这个任务的专注计时');state.planner.today=state.planner.today.filter(x=>x.id!==t.id);}:null);
}
function overviewEditGoal(id) {
  const g=state.planner.goals.find(g=>g.id===id);
  overviewModal(g?'更新目标进度':'给自己一个目标',overviewField('目标名称','title',g?.title || '','text','required maxlength="200"')+`<div class="ov-form-row">${overviewField('当前完成','current',g?.current ?? g?.progress ?? 0,'number','min="0" step="any" required')}${overviewField('目标总量','target',g?.target || 100,'number','min="0.01" step="any" required')}</div>`+overviewField('单位','unit',g?.unit || (g?'%':'次'),'text','maxlength="20"')+overviewField('截止日期（可选）','deadline',g?.deadline || '','date'),f=>{const current=Number(f.current),target=Number(f.target);if(!f.title.trim()||!Number.isFinite(current)||!Number.isFinite(target)||current<0||target<=0)throw Error('请填写名称和有效目标数值');return ()=>{const data={title:f.title.trim(),current,target,unit:f.unit,deadline:f.deadline,progress:Math.min(100,current/target*100)};if(g)Object.assign(g,data);else state.planner.goals.push({id:uid(),...data});};},g?()=>{state.planner.goals=state.planner.goals.filter(x=>x.id!==g.id);}:null);
}
function overviewEditCountdown(id) {
  const c=(state.countdowns || []).find(c=>c.id===id);
  overviewModal(c?'编辑倒计时':'添加期待的日子',overviewField('名称','title',c?.title || '','text','required maxlength="200"')+overviewField('日期','date',c?.date || '','date','required'),f=>{if(!f.title.trim())throw Error('请填写名称');return ()=>{if(c)Object.assign(c,{title:f.title.trim(),date:f.date});else state.countdowns.push({id:uid(),title:f.title.trim(),date:f.date,time:''});};},c?()=>{state.countdowns=state.countdowns.filter(x=>x.id!==c.id);}:null);
}
function overviewEditHabit(id) {
  const h=state.habit.habits.find(h=>h.id===id);
  overviewModal(h?'编辑习惯':'添加一个习惯',overviewField('习惯名称','name',h?.name || '','text','required maxlength="100"')+overviewField('图标','emoji',h?.emoji || '🌱','text','maxlength="8"')+`<label>频率<select name="freq"><option value="daily" ${h?.freq!=='weekly'?'selected':''}>每天</option><option value="weekly" ${h?.freq==='weekly'?'selected':''}>每周</option></select></label>`,f=>{if(!f.name.trim())throw Error('请填写习惯名称');return ()=>{if(h)Object.assign(h,{name:f.name.trim(),emoji:f.emoji,freq:f.freq});else state.habit.habits.push({id:uid(),name:f.name.trim(),emoji:f.emoji,freq:f.freq,done:{}});};},h?()=>{state.habit.habits=state.habit.habits.filter(x=>x.id!==h.id);}:null);
}
function overviewStopFocus() {const d=overviewData();if(d.activeFocus){d.focusSessions.push({...d.activeFocus,end:Date.now()});d.activeFocus=null;}}
function overviewFocusDateTime(value) {return new Date(Number(value)+8*3600000).toISOString().slice(0,19);}
function overviewFocusHistory() {
  const rows=overviewData().focusSessions.slice().sort((a,b)=>b.start-a.start);
  overviewModal('专注记录',`<p class="ov-footnote">忘记结束计时？点击记录，按实际情况修正。时间均为北京时间。</p><div class="ov-session-list">${rows.map(r=>`<button type="button" data-edit-focus="${esc(r.id)}"><b>${esc(r.title)}</b><span>${overviewFocusDateTime(r.start).replace('T',' ')} → ${overviewFocusDateTime(r.end).replace('T',' ')}</span><small>${overviewMinutes((r.end-r.start)/60000)} · 编辑</small></button>`).join('')||overviewEmpty('还没有已结束的专注记录。')}</div>`,()=>()=>{});
  const root=document.getElementById('modal-root');root.querySelector('[type=submit]').hidden=true;
  root.querySelector('.modal-foot [data-close]').textContent='关闭';
  root.querySelectorAll('[data-edit-focus]').forEach(b=>b.onclick=()=>overviewEditFocus(b.dataset.editFocus));
}
function overviewEditFocus(id) {
  const session=overviewData().focusSessions.find(r=>r.id===id);if(!session)return;
  overviewModal('修正专注记录',overviewField('专注内容','title',session.title,'text','required maxlength="200"')+overviewField('实际开始（北京时间）','start',overviewFocusDateTime(session.start),'datetime-local','required step="1"')+overviewField('实际结束（北京时间）','end',overviewFocusDateTime(session.end),'datetime-local','required step="1"')+'<p class="ov-footnote">保存后，今日专注、复盘与实际时间轴会一起更新；不会改变任务的完成状态。</p>',f=>{
    const start=Date.parse(f.start+'+08:00'),end=Date.parse(f.end+'+08:00');
    if(!f.title.trim()||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('请填写内容；结束时间必须晚于开始时间。');
    if(end>Date.now())throw Error('已完成的专注不能结束在未来。');
    return ()=>{
      const d=overviewData(),current=d.focusSessions.find(r=>r.id===id);
      if(!current)throw Error('这条记录已不存在，请重新查看。');
      if(d.focusSessions.some(r=>r.id!==id&&start<r.end&&end>r.start)||(d.activeFocus&&end>d.activeFocus.start))throw Error('时间与另一段专注重叠，请核对实际起止时间。');
      Object.assign(current,{title:f.title.trim(),start,end});
    };
  },()=>{overviewData().focusSessions=overviewData().focusSessions.filter(r=>r.id!==id);});
}
async function overviewCopy(text) {try{await navigator.clipboard.writeText(text);toast('已复制');}catch(_){overviewModal('复制文字',`<textarea rows="9" readonly>${esc(text)}</textarea>`,()=>()=>{});}}
function bindOverview() {
  const root=document.getElementById('app-main');
  const actions={jot:()=>{if(overviewUI.note.trim()&&!jotUI.pending){if(jotUI.text.trim()&&jotUI.text!==overviewUI.note&&!confirm('随手记中已有草稿，要用首页这段文字替换吗？')){switchTab('jot');return;}jotUI.text=overviewUI.note;jotUI.date=todayStr();jotUI.id='jot-'+uid();jotUI.rows=null;jotUI.warnings=[];jotCache();}switchTab('jot');},daily:()=>switchTab('daily'),review:()=>switchTab('review'),topik:()=>switchTab('topik','plan'),study:()=>switchTab('topik','daily'),skincareDaily:()=>switchTab('skincareDaily'),'add-task':()=>overviewEditTask(),'add-goal':()=>overviewEditGoal(),'add-countdown':()=>overviewEditCountdown(),'add-habit':()=>overviewEditHabit(),
    'add-reminder':()=>overviewModal('给自己一个提醒',overviewField('提醒内容','text','','text','required maxlength="200"'),f=>{if(!f.text.trim())throw Error('请输入提醒内容');return ()=>overviewData().reminders.push({id:uid(),text:f.text.trim(),date:todayStr()});}),
    'start-focus':()=>overviewCommit(()=>{if(overviewData().activeFocus)throw Error('已有计时正在进行');state.dashboard.activeFocus={id:uid(),title:'自由专注',taskId:null,start:Date.now()};}),
    'stop-focus':()=>overviewCommit(overviewStopFocus),
    'focus-history':()=>overviewFocusHistory(),
    'copy-prompt':()=>overviewCopy('请把本聊天中今天的生活记录整理成可交给个人工作台的汇总，注明具体年月日，包括体重及单位、饮食及份量、花销及用途、学习、护肤、重要事情和待办。只整理我实际说过的内容；实际发生、未来计划和你的建议分开。热量区分已知值与估算值，缺失内容标注未提供，不补造。'),
    'copy-review':()=>{const r=OV.summary(state,todayStr(),overviewUI.reviewRange);overviewCopy(`Vivian 工作台复盘 ${r.first} 至 ${r.end}\n体重记录 ${r.weightDays} 天；区间变化 ${r.weightChange==null?'不足两条记录':r.weightChange+' kg'}。\n饮食记录 ${r.dietDays} 天（热量不完整，不代表完整摄入）。\n已记支出 ${r.expense.toFixed(2)} 元，共 ${r.spending.length} 笔。\n韩语学习 ${r.studyHours.toFixed(1)} 小时；专注计时 ${Math.floor(r.focusMinutes)} 分钟。\n请结合以上记录帮我复盘，不推测未记录的内容。`);}
  };
  root.querySelectorAll('[data-ov]').forEach(b=>b.onclick=()=>actions[b.dataset.ov]?.());
  root.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{overviewUI.range=Number(b.dataset.range);renderHome();});
  root.querySelectorAll('[data-review-range]').forEach(b=>b.onclick=()=>{overviewUI.reviewRange=Number(b.dataset.reviewRange);renderOverviewReview();});
  root.querySelectorAll('[data-edit-task]').forEach(b=>b.onclick=()=>overviewEditTask(b.dataset.editTask));
  root.querySelectorAll('[data-edit-goal]').forEach(b=>b.onclick=()=>overviewEditGoal(b.dataset.editGoal));
  root.querySelectorAll('[data-edit-countdown]').forEach(b=>b.onclick=()=>overviewEditCountdown(b.dataset.editCountdown));
  root.querySelectorAll('[data-edit-habit]').forEach(b=>b.onclick=()=>overviewEditHabit(b.dataset.editHabit));
  root.querySelectorAll('[data-toggle-task]').forEach(b=>b.onclick=()=>overviewCommit(()=>{const t=state.planner.today.find(t=>t.id===b.dataset.toggleTask);if(t)VivianPlanning.setStatus(state,t.id,t.done?'todo':'done');}));
  root.querySelectorAll('[data-focus-task]').forEach(b=>b.onclick=()=>overviewCommit(()=>{const t=state.planner.today.find(t=>t.id===b.dataset.focusTask);if(!t)return;const d=overviewData();if(d.activeFocus?.taskId===t.id)overviewStopFocus();else if(!d.activeFocus){VivianPlanning.setStatus(state,t.id,'doing');d.activeFocus={id:uid(),title:t.text,taskId:t.id,start:Date.now()};}}));
  root.querySelectorAll('[data-toggle-habit]').forEach(b=>b.onclick=()=>overviewCommit(()=>{const h=state.habit.habits.find(h=>h.id===b.dataset.toggleHabit);h.done ||= {};if(h.done[todayStr()])delete h.done[todayStr()];else h.done[todayStr()]=true;}));
  root.querySelectorAll('[data-delete-reminder]').forEach(b=>b.onclick=()=>overviewCommit(()=>{state.dashboard.reminders=state.dashboard.reminders.filter(r=>r.id!==b.dataset.deleteReminder);}));
  root.querySelectorAll('[data-open-date]').forEach(b=>b.onclick=()=>{dailyUI.date=b.dataset.openDate;dailyUI.filterDate=b.dataset.openDate;switchTab('daily');});
  const note=root.querySelector('#ov-note');if(note)note.oninput=()=>{overviewUI.note=note.value;};
  const form=root.querySelector('#ov-note-form');if(form)form.onsubmit=async e=>{e.preventDefault();const text=note.value.trim();if(!text)return;const entry={id:uid(),type:'event',date:todayStr(),title:'随手记',text,source:'首页随手记',sourceText:text};if(await overviewCommit(()=>{state=VivianRecords.applyEntries(state,[entry]);})){overviewUI.note='';renderHome();document.getElementById('ov-note-status').textContent='已保存，可在生活记录中查看。';}};
}
function overviewTick() {
  if(!state)return;
  const overviewVisible=document.body.classList.contains('is-overview');
  if(overviewVisible&&overviewUI.renderedDate!==todayStr()&&!overviewUI.busy&&!document.hidden&&!document.querySelector('#modal-root .modal')&&!document.activeElement?.matches('input,textarea,select,[contenteditable=true]')){
    const main=document.getElementById('app-main'),scroll=main.scrollTop;
    overviewRefresh();main.scrollTop=scroll;
  }
  const active=state.dashboard?.activeFocus,clock=document.getElementById('ov-focus-clock');
  const sec=active?Math.max(0,Math.floor((Date.now()-active.start)/1000)):0;
  const elapsed=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
  if(active&&clock)clock.textContent=elapsed;
  const total=document.getElementById('ov-focus-total');if(total)total.textContent=Math.floor(OV.focusForDay(state,todayStr()).reduce((s,r)=>s+r.minutes,0));
  let indicator=document.getElementById('ov-global-focus');
  if(active&&!document.querySelector('#ov-focus-clock')){
    if(!indicator){indicator=document.createElement('button');indicator.id='ov-global-focus';indicator.onclick=()=>switchTab('home');document.body.append(indicator);}
    indicator.textContent='● 专注中 · '+active.title+' · '+elapsed+' · 返回查看';
  }else indicator?.remove();
}
const overviewOriginalSwitch=switchTab;
switchTab=function(tab,sub){document.body.classList.toggle('is-food',tab==='food');document.body.classList.toggle('is-jot',tab==='jot');document.body.classList.toggle('is-overview',tab==='home'||tab==='review');if(tab==='review'){if(homeTickTimer){clearInterval(homeTickTimer);homeTickTimer=null;}currentRoute={tab,sub:null};currentTab=tab;renderOverviewReview();markSidebarActive();}else overviewOriginalSwitch(tab,sub);overviewTick();};
const overviewOriginalModule=renderModulePage;
renderModulePage=function(...args){document.body.classList.remove('is-overview','is-jot','is-food');overviewOriginalModule(...args);};
setInterval(overviewTick,1000);
