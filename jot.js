/* One journal, reviewed entries, shared existing ledgers. */
'use strict';
const JOT_DRAFT_KEY='vivian_jot_draft_v1';
const jotTypes={weight:'⚖️ 体重',diet:'🍱 饮食',exercise:'🏃 运动',expense:'💸 花销',event:'🌷 小事'};
let jotUI={date:'',text:'',id:'',rows:null,warnings:[],pending:null,busy:false,message:'',error:false};
try{const draft=JSON.parse(localStorage.getItem(JOT_DRAFT_KEY)||'null');if(draft&&typeof draft.text==='string'&&typeof draft.date==='string')Object.assign(jotUI,draft,{busy:false,message:'已恢复这台浏览器的草稿。',error:false});}catch(_){}
function jotCache(){
  try{localStorage.setItem(JOT_DRAFT_KEY,JSON.stringify({date:jotUI.date,text:jotUI.text,id:jotUI.id,rows:jotUI.rows,warnings:jotUI.warnings,pending:jotUI.pending}));}
  catch(_){jotStatus('浏览器草稿暂存失败，请先复制原文；确认归档后才会保存到本机文件。',true);}
}
function jotStatus(message,error=false){jotUI.message=message;jotUI.error=error;const el=document.getElementById('jot-status');if(el){el.textContent=message;el.classList.toggle('is-error',error);}}
function jotInput(label,key,value,type='text',attrs=''){return `<label>${label}<input data-field="${key}" type="${type}" value="${esc(value??'')}" ${attrs}></label>`;}
function jotArea(label,key,value){return `<label>${label}<textarea data-field="${key}" rows="2" maxlength="20000">${esc(value||'')}</textarea></label>`;}
function jotFields(r){
  if(r.type==='weight')return `<div class="jot-fields">${jotInput('数值','value',r.value,'number','min="0.01" step="any" required')}<label>单位<select data-field="unit" required><option value="">请选择单位</option><option value="kg" ${r.unit==='kg'?'selected':''}>公斤（kg）</option><option value="斤" ${r.unit==='斤'?'selected':''}>斤</option></select></label></div>`;
  if(r.type==='diet')return jotArea('吃了什么','name',r.name)+`<div class="jot-fields">${jotInput('餐次（可留空）','meal',r.meal)}${jotInput('已知热量 kcal（可留空）','kcal',r.kcal,'number','min="0" step="any"')}</div>`;
  if(r.type==='exercise')return `<div class="jot-fields">${jotInput('运动项目','sport',r.sport,'text','required maxlength="200"')}${jotInput('分钟数（可留空）','duration',r.duration,'number','min="0.01" step="any"')}</div>`+jotArea('运动内容 / 距离 / 其他说明','note',r.note);
  if(r.type==='expense')return `<div class="jot-fields">${jotInput('金额（元）','amount',r.amount,'number','min="0.01" step="any" required')}${jotInput('分类','category',r.category||'其他','text','maxlength="100"')}</div>`+jotArea('花在哪里','note',r.note);
  return jotArea('记录内容','text',r.text);
}
function renderJotPage(){
  jotUI.date ||= todayStr();jotUI.id ||= 'jot-'+uid();
  const history=(state.quickNotes||[]).slice().reverse();
  document.getElementById('app-main').innerHTML=`<div class="jot-page"><header class="jot-heading"><div><span class="daily-eyebrow">ONE NOTE · YOUR EVERYDAY</span><h1>随手记<span>✎</span></h1><p>先把一天写下来，再放进生活的各个角落。</p></div>${overviewSaveStatus()}</header>
    <div class="food-entry"><div><b>今天的饮食，也可以拍下来</b><p>上传餐盘或营养标签，核对后存入同一份饮食记录。</p></div><button type="button" class="ov-button" id="jot-food-photo">📷 拍照记饮食</button></div><div class="jot-steps"><span><b>1</b> 写下今天</span><i>→</i><span><b>2</b> 核对分类</span><i>→</i><span><b>3</b> 一次归档</span></div>
    <div class="jot-layout"><section class="daily-panel jot-compose"><div class="daily-section-head"><h3>今天过得怎么样？</h3><span class="daily-soft-tag">每天一篇，也可以随时补充</span></div><label class="jot-date">这篇记录属于哪一天<input id="jot-date" type="date" value="${esc(jotUI.date)}" required></label><label class="jot-editor-label" for="jot-text">体重、三餐、运动、花销，或任何想留下的小事</label><textarea id="jot-text" rows="10" maxlength="20000" placeholder="直接写自己的记录，每件事尽量分一句。&#10;体重请带上 kg 或斤；运动可以写项目和时长。&#10;例如格式：早餐吃了……；散步……分钟；今天完成了……">${esc(jotUI.text)}</textarea><p class="jot-help">按常见表达整理，可在下方修改分类和数值。没有提供的热量和运动时长留空；计划和没做的事仅保留为小事。</p><div class="jot-actions"><button class="daily-primary" id="jot-parse">整理到各个记录 ↓</button><button class="daily-small-button" id="jot-clear">清空草稿</button></div><p class="jot-help" id="jot-draft-status">输入暂存在这台浏览器；点击“确认归档”后才会写入工作台文件。</p><div id="jot-status" class="daily-status${jotUI.error?' is-error':''}" role="status">${esc(jotUI.message)}</div><div id="jot-preview"></div></section>
    <aside class="jot-aside"><section class="jot-destinations"><h3>一篇随手记，五个去处</h3><p>⚖️ 体重 → 体重记录与趋势</p><p>🍱 饮食 → 饮食记录</p><p>🏃 运动 → 运动打卡</p><p>💸 花销 → 生活记录与支出统计</p><p>🌷 小事 → 生活记录</p><span>原文也会保留，随时回来核对。</span></section><section class="daily-panel jot-history"><div class="daily-section-head"><h3>已归档随手记</h3><span class="daily-soft-tag">${history.length} 篇</span></div>${history.length?history.map(n=>`<details><summary><time>${esc(n.date)}</time><span>${n.entryIds.length} 项归档</span><p>${esc(n.text.slice(0,48))}${n.text.length>48?'…':''}</p></summary><p class="jot-original">${esc(n.text)}</p><button class="daily-small-button" data-jot-history="${esc(n.date)}">查看当天记录 ↗</button></details>`).join(''):'<div class="daily-empty"><span>✧</span><h4>留住第一篇日常</h4><p>确认归档后，原文会收在这里。</p></div>'}</section></aside></div></div>`;
  document.getElementById("jot-food-photo").onclick=()=>switchTab("food");
  const text=document.getElementById('jot-text'),date=document.getElementById('jot-date');
  const changed=()=>{jotUI.text=text.value;jotUI.date=date.value;jotUI.id='jot-'+uid();jotUI.rows=null;jotUI.warnings=[];jotUI.message='';jotCache();renderJotPreview();};
  text.oninput=changed;date.oninput=changed;
  document.getElementById('jot-parse').onclick=()=>{
    if(!date.reportValidity())return;
    const parsed=VivianJot.parse(jotUI.text,jotUI.date,todayStr());jotUI.rows=parsed.rows;jotUI.warnings=parsed.warnings;jotCache();jotStatus('请核对下方内容；可以修改分类，或取消不想归档的项目。');renderJotPreview();
    document.getElementById('jot-preview').scrollIntoView({behavior:'smooth',block:'start'});
  };
  document.getElementById('jot-clear').onclick=()=>{if(jotUI.text&&!confirm('清空尚未归档的草稿？'))return;jotUI={date:todayStr(),text:'',id:'jot-'+uid(),rows:null,warnings:[],pending:null,busy:false,message:'',error:false};jotCache();renderJotPage();};
  document.querySelectorAll('[data-jot-history]').forEach(b=>b.onclick=()=>{dailyUI.date=b.dataset.jotHistory;dailyUI.filterDate=b.dataset.jotHistory;dailyUI.type='all';switchTab('daily');});
  renderJotPreview();jotLock();
}
function jotLock(){const locked=jotUI.busy||!!jotUI.pending;document.querySelectorAll('#jot-text,#jot-date,#jot-parse,#jot-clear,#jot-preview input,#jot-preview select,#jot-preview textarea').forEach(el=>el.disabled=locked||(el.matches("[data-field]")&&!jotUI.rows[Number(el.closest("[data-row]").dataset.row)].selected));const b=document.getElementById('jot-save');if(b){b.disabled=jotUI.busy||jotUI.warnings.length>0;b.textContent=jotUI.busy?'正在保存到本机…':jotUI.pending?'重试归档':'确认归档到各个记录';}}
function renderJotPreview(){
  const root=document.getElementById('jot-preview');if(!root)return;
  if(!jotUI.rows){root.replaceChildren();return;}
  const oldWeight=state.life.weight.find(w=>w.date===jotUI.date);
  root.innerHTML=`<div class="jot-preview-heading"><h3>核对这次整理</h3><p>${esc(jotUI.date)} · 勾选的内容会归档；未勾选的仍保留在原文中。</p></div>${jotUI.warnings.map(w=>`<p class="jot-warning" role="alert">${esc(w)}</p>`).join('')}${oldWeight?`<p class="jot-warning">这一天已有 ${Number(oldWeight.weight)} kg；若归档新体重，会更新这一天的测量。取消体重勾选可保留旧值。</p>`:''}<form id="jot-review-form">${jotUI.rows.map((r,i)=>`<fieldset class="jot-row" data-row="${i}"><legend><label><input type="checkbox" data-selected ${r.selected?'checked':''}> 归档这一项</label></legend><label class="jot-kind">放入<select data-kind>${Object.entries(jotTypes).map(([k,v])=>`<option value="${k}" ${r.type===k?'selected':''}>${v}</option>`).join('')}</select></label>${r.hint?`<p class="jot-help">${esc(r.hint)}</p>`:''}<div class="jot-row-fields">${jotFields(r)}</div><details class="daily-original"><summary>对应原文</summary><p>${esc(r.sourceText)}</p></details></fieldset>`).join('')}<p class="jot-help">同一篇原文重复提交不会重复归档。修改内容另写一篇时，之前的记录会保留，请只补充新内容。</p><button type="submit" id="jot-save" class="daily-primary">确认归档到各个记录</button></form>`;
  root.querySelectorAll('[data-row]').forEach(el=>{
    const r=jotUI.rows[Number(el.dataset.row)];
    const updateDisabled=()=>el.querySelectorAll('[data-field]').forEach(input=>input.disabled=!r.selected);
    el.querySelector('[data-selected]').onchange=e=>{r.selected=e.target.checked;updateDisabled();jotCache();};
    el.querySelector('[data-kind]').onchange=e=>{r.type=e.target.value;r.hint='已手动调整，请核对字段。';r.name??=r.sourceText;r.text??=r.sourceText;r.note??=r.sourceText;jotCache();renderJotPreview();};
    el.querySelectorAll('[data-field]').forEach(input=>input.oninput=()=>{r[input.dataset.field]=input.value;jotCache();});updateDisabled();
  });
  root.querySelector('form').onsubmit=e=>{e.preventDefault();jotArchive();};jotLock();
  if(!jotUI.busy&&!jotUI.pending)root.querySelectorAll('[data-row]').forEach(el=>{if(!jotUI.rows[Number(el.dataset.row)].selected)el.querySelectorAll('[data-field]').forEach(input=>input.disabled=true);});
}
async function jotArchive(){
  if(jotUI.busy||jotUI.warnings.length)return;
  jotUI.busy=true;jotLock();
  try{
    await localSync.flush();
    const existing=(state.quickNotes||[]).find(n=>VivianJot.key(n.date,n.text)===VivianJot.key(jotUI.date,jotUI.text));
    if(!existing){
      if(!jotUI.pending){
        const entries=VivianJot.entries(jotUI.rows,jotUI.date,jotUI.id);entries.forEach(VivianRecords.normalizeEntry);
        jotUI.pending={entries,note:{id:jotUI.id,date:jotUI.date,text:jotUI.text,entryIds:entries.map(e=>e.id),savedAt:new Date().toISOString()}};jotCache();
      }
      const next=jotUI.pending.entries.length?VivianRecords.applyEntries(state,jotUI.pending.entries):JSON.parse(JSON.stringify(state));
      next.quickNotes ||= [];if(!next.quickNotes.some(n=>n.id===jotUI.pending.note.id))next.quickNotes.push(jotUI.pending.note);
      state=next;await dailyCommit();
    }
    const count=existing?existing.entryIds.length:jotUI.pending.entries.length,date=jotUI.date;
    jotUI={date,text:'',id:'jot-'+uid(),rows:null,warnings:[],pending:null,busy:false,message:existing?'这篇原文已经归档，没有重复添加。':`${date} 已归档 ${count} 项，原文已保留。可在生活记录和运动打卡中查看。`,error:false};
    jotCache();renderHeader();if(currentRoute.tab==='jot')renderJotPage();else toast(jotUI.message);
  }catch(e){jotStatus('尚未确认归档成功：'+e.message+'。原文和整理结果仍保留。',true);}
  finally{jotUI.busy=false;jotLock();}
}
