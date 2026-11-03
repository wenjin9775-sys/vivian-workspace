'use strict';
const FOOD_DRAFT_KEY='vivian_food_photo_draft_v1';
let foodUI={loaded:false,date:'',meal:'',mode:'photo',note:'',image:'',imageId:'',requestId:'',result:null,pending:null,busy:false,message:'',error:false,config:null};
async function foodRequest(route,body,method='POST'){
  const response=await fetch('/api/local/'+route,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();if(!response.ok)throw Error(value.error||'请求失败');return value;
}
async function foodCache(){try{const {loaded,busy,message,error,config,...draft}=foodUI;await idb.put(FOOD_DRAFT_KEY,draft);}catch(_){foodStatus('浏览器暂存失败，请在离开前完成保存。',true);}}
function foodStatus(text,error=false){foodUI.message=text;foodUI.error=error;const el=document.getElementById('food-status');if(el){el.textContent=text;el.classList.toggle('is-error',error);}}
function foodInvalidate(){foodUI.result=null;foodUI.requestId='food-'+uid();foodCache();renderFoodResult();}
async function renderFoodPage(){
  if(!foodUI.loaded){try{const draft=await idb.get(FOOD_DRAFT_KEY);if(draft&&typeof draft.image==='string')Object.assign(foodUI,draft);}catch(_){}foodUI.loaded=true;}
  foodUI.date ||= todayStr();
  try{foodUI.config=await foodRequest('food-ai/config',undefined,'GET');}catch(e){foodStatus(e.message,true);}
  if(currentRoute.tab!=='food')return;
  const cfg=foodUI.config;
  document.getElementById('app-main').innerHTML=`<div class="food-page"><header class="food-heading"><div><span class="daily-eyebrow">A PHOTO · A FOOD DIARY</span><h1>拍照记饮食 <span>◉</span></h1><p>拍下这一餐，核对份量，再留下记录。</p></div>${overviewSaveStatus()}</header><div class="food-layout"><section class="daily-panel food-compose"><div class="food-modes" role="group" aria-label="识别方式"><button data-food-mode="photo" aria-pressed="${foodUI.mode==='photo'}">🍱 餐盘照片估算</button><button data-food-mode="label" aria-pressed="${foodUI.mode==='label'}">🏷️ 营养标签计算</button></div><p class="food-help">${foodUI.mode==='photo'?'照片给出热量范围。补充实际吃了多少、食物重量和烹饪方式，可以减少不确定性。':'拍清能量一行及“每 100 克／每份”等基准；识别后填写实际吃的量，再计算热量。'}</p><div class="food-fields"><label>记录日期<input type="date" id="food-date" value="${esc(foodUI.date)}" required></label><label>餐次<select id="food-meal">${['','早餐','午餐','晚餐','加餐','下午茶','夜宵'].map(m=>`<option value="${m}" ${foodUI.meal===m?'selected':''}>${m||'暂不指定'}</option>`).join('')}</select></label></div><div class="food-upload">${foodUI.image?`<img src="${foodUI.image}" alt="待核对的饮食图片" id="food-preview-image">`:'<span class="food-camera">◎</span><h3>把这一餐拍下来</h3><p>也可以上传包装上的营养成分表</p>'}<div class="food-upload-actions"><button class="ov-button" id="food-album">${foodUI.image?'更换照片':'选择图片'}</button><button class="ov-button" id="food-camera">手机拍照</button></div></div><input type="file" accept="image/*" id="food-file" hidden><input type="file" accept="image/*" capture="environment" id="food-camera-file" hidden><label class="food-note">补充说明<textarea id="food-note" rows="3" maxlength="4000" placeholder="如：米饭称重 130g；鸡腿去皮；只吃了照片中一半的量；炒菜用了约 5g 油。">${esc(foodUI.note)}</textarea></label><p class="food-help">点击识别时，仅将这张图片和补充说明发送给 OpenAI，按 API 计费。选择图片不会自动调用。</p><button class="daily-primary" id="food-recognize">识别这张图片</button><p id="food-status" class="daily-status${foodUI.error?' is-error':''}" role="status">${esc(foodUI.message)}</p><div id="food-result"></div></section><aside><section class="food-guide"><h3>让记录更接近真实</h3><p>① 拍清完整餐盘或完整营养标签。</p><p>② 告诉我实际吃的份量，保留剩下的食物说明。</p><p>③ 核对食物名称和热量，再确认保存。</p><small>照片估算会单独标明，不混入已知热量。看不清的项目保持空白。</small></section><section class="daily-panel food-settings"><h3>识图服务</h3><p class="food-service-state">${cfg?.configured?'● 已配置':'○ 尚未配置'} · OpenAI</p><p class="food-help">${cfg?`今日识别请求 ${cfg.attemptsToday} / ${cfg.dailyLimit} 次<br>模型：${esc(cfg.model)}`:'未连接到电脑服务'}</p>${cfg?.canConfigure?`<details id="food-api-settings" ${cfg.configured?'':'open'}><summary>配置 API</summary><form id="food-config-form"><label>API 密钥<input id="food-api-key" type="password" autocomplete="off" placeholder="${cfg.configured?'已保存；留空保持不变':'粘贴你的 OpenAI API 密钥'}"></label><label>模型<input id="food-api-model" value="${esc(cfg.model)}" required maxlength="100"></label><label>每日识别请求上限<input id="food-api-limit" type="number" min="1" max="100" value="${cfg.dailyLimit}" required></label><p class="food-help">密钥只保存在电脑，不写入生活记录、浏览器草稿或记录 JSON 导出。保存配置本身不会调用付费识别。</p><button class="ov-button ov-primary" type="submit">保存配置</button>${cfg.configured?'<button class="ov-text-button" type="button" id="food-disable">移除密钥并停用</button>':''}</form><a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">打开 OpenAI 密钥页面 ↗</a></details>`:'<p class="food-help">请先在电脑上打开工作台，进入“拍照记饮食”配置 API；手机端不传输或修改密钥。</p>'}<p class="food-help" id="food-config-status" role="status"></p></section></aside></div></div>`;
  document.querySelectorAll('[data-food-mode]').forEach(b=>b.onclick=()=>{if(foodUI.busy||foodUI.pending)return;foodUI.mode=b.dataset.foodMode;foodInvalidate();renderFoodPage();});
  for(const key of ['date','meal','note'])document.getElementById('food-'+key).oninput=e=>{foodUI[key]=e.target.value;if(key==='note')foodInvalidate();else foodCache();};
  document.getElementById('food-album').onclick=()=>document.getElementById('food-file').click();document.getElementById('food-camera').onclick=()=>document.getElementById('food-camera-file').click();
  for(const key of ['food-file','food-camera-file'])document.getElementById(key).onchange=e=>foodChooseImage(e.target.files?.[0]);
  document.getElementById('food-recognize').onclick=foodRecognize;
  const form=document.getElementById('food-config-form');if(form)form.onsubmit=async e=>{
    e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;const input=document.getElementById('food-api-key');
    const body={apiKey:input.value.trim(),model:document.getElementById('food-api-model').value.trim(),dailyLimit:Number(document.getElementById('food-api-limit').value)};input.value='';
    try{foodUI.config=await foodRequest('food-ai/config',body,'PUT');foodStatus('配置已保存；可选择照片开始识别。');await renderFoodPage();}catch(error){document.getElementById('food-config-status').textContent=error.message;}finally{body.apiKey='';button.disabled=false;}
  };
  const disable=document.getElementById('food-disable');if(disable)disable.onclick=async()=>{if(!confirm('移除保存在电脑的密钥并停用识别？已有饮食记录会保留。'))return;try{await foodRequest('food-ai/config',{disable:true},'PUT');foodStatus('识图服务已停用。');renderFoodPage();}catch(e){foodStatus(e.message,true);}};
  renderFoodResult();foodLock();
}
async function foodChooseImage(file){
  if(!file||foodUI.busy||foodUI.pending)return;
  if(file.size>20*1024*1024){foodStatus('图片超过 20 MB，请选一张较小的图片。',true);return;}
  foodUI.busy=true;foodLock();
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
    const scale=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    foodUI.image=canvas.toDataURL('image/jpeg',.88);foodUI.imageId='foodimg-'+uid();foodUI.result=null;foodUI.requestId='food-'+uid();foodStatus('照片已选择。补充实际份量后，点击识别。');await foodCache();
  }catch(_){foodStatus('无法读取这张图片，请换成 JPG、PNG，或在手机中保存为 JPEG 后上传。',true);}
  finally{URL.revokeObjectURL(url);foodUI.busy=false;if(currentRoute.tab==='food')renderFoodPage();}
}
function foodLock(){
  const locked=foodUI.busy||!!foodUI.pending;
  document.querySelectorAll('#food-date,#food-meal,#food-note,#food-album,#food-camera,[data-food-mode],#food-result input,#food-result textarea,#food-result select').forEach(el=>el.disabled=locked||(el.matches('[data-food-field]')&&!foodUI.result.items[Number(el.closest('[data-food-row]').dataset.foodRow)].selected));
  const recognize=document.getElementById('food-recognize');if(recognize){recognize.disabled=locked||!foodUI.image||!foodUI.config?.configured;recognize.textContent=foodUI.busy?'正在处理，请稍候…':'识别这张图片';}
  const save=document.getElementById('food-save');if(save){save.disabled=foodUI.busy;save.textContent=foodUI.pending?'重试保存到饮食记录':'确认保存到饮食记录';}
}
async function foodRecognize(){
  if(foodUI.busy||foodUI.pending||!foodUI.image)return;
  foodUI.busy=true;foodLock();foodStatus('正在识别，一般需要稍等片刻；请保留此页面。');
  try{foodUI.result=await foodRequest('food-ai/recognize',{id:foodUI.requestId,image:foodUI.image,note:foodUI.note,mode:foodUI.mode});foodUI.result.items=foodUI.result.items.map(r=>({...r,selected:true,consumed:''}));await foodCache();foodStatus('识别完成，请核对下面的食物、份量与热量。尚未写入饮食记录。');}
  catch(e){foodStatus(e.message,true);}
  finally{foodUI.busy=false;if(currentRoute.tab==='food')await renderFoodPage();}
}
function foodField(label,key,value,type='text',attrs=''){return `<label>${label}<input data-food-field="${key}" type="${type}" value="${esc(value??'')}" ${attrs}></label>`;}
function renderFoodResult(){
  const root=document.getElementById('food-result');if(!root)return;if(!foodUI.result){root.replaceChildren();return;}
  const r=foodUI.result;
  root.innerHTML=`<div class="food-result-heading"><h2>先核对，再记录</h2><p>食物和用油可能识别有误，可直接修改。${foodUI.mode==='photo'?'以下均为估算。':'请逐项核对标签文字，食用量使用与标签相同的单位。'}</p></div>${[...r.questions,...r.warnings].map(t=>`<p class="food-warning">${esc(t)}</p>`).join('')}${!r.items.length?'<p class="food-warning">没有识别到可记录的食物。请补充说明或换一张图片。</p>':`<form id="food-review-form">${r.items.map((item,i)=>`<fieldset class="food-item" data-food-row="${i}"><legend><label><input type="checkbox" data-food-selected ${item.selected?'checked':''}> 保存此项</label></legend>${foodField('食物名称','name',item.name,'text','required maxlength="500"')}${foodField('份量说明（可修改）','portion',item.portion)}${foodUI.mode==='photo'?`<div class="food-fields">${foodField('估算下限 kcal','kcalMin',item.kcalMin,'number','min="0" max="100000" step="any"')}${foodField('估算上限 kcal','kcalMax',item.kcalMax,'number','min="0" max="100000" step="any"')}</div><p class="food-help">不能判断时，上下限同时留空。</p>`:`<div class="food-fields">${foodField('标签能量','labelEnergy',item.labelEnergy,'number','min="0" step="any" required')}<label>能量单位<select data-food-field="labelUnit" required><option value="">请选择</option>${['kJ','kcal'].map(u=>`<option ${item.labelUnit===u?'selected':''}>${u}</option>`).join('')}</select></label>${foodField('标签每多少','labelBasisAmount',item.labelBasisAmount,'number','min="0.01" step="any" required')}<label>标签基准单位<select data-food-field="labelBasisUnit" required><option value="">请选择</option>${[['g','克'],['ml','毫升'],['serving','份']].map(([u,n])=>`<option value="${u}" ${item.labelBasisUnit===u?'selected':''}>${n}</option>`).join('')}</select></label></div>${foodField('我实际吃了多少（与上方基准同单位）','consumed',item.consumed,'number','min="0.01" step="any" required')}<p class="food-calculated" data-food-calculated>填完后显示计算结果</p>`}<label>识别依据与不确定性<textarea data-food-field="notes" rows="2" maxlength="2000">${esc(item.notes)}</textarea></label></fieldset>`).join('')}<label class="food-confirm"><input id="food-confirm" type="checkbox" required> 我已核对食物与实际份量，理解照片热量只是估算。</label><button class="daily-primary" id="food-save" type="submit">确认保存到饮食记录</button></form>`}`;
  root.querySelectorAll('[data-food-row]').forEach(el=>{
    const row=r.items[Number(el.dataset.foodRow)];
    const calc=()=>{const target=el.querySelector('[data-food-calculated]');if(target){try{target.textContent='按标签计算：'+VivianFood.labelCalories({...row,labelEnergy:Number(row.labelEnergy),labelBasisAmount:Number(row.labelBasisAmount),consumed:Number(row.consumed)})+' kcal';}catch(_){target.textContent='请核对标签并填写实际食用量';}}};
    el.querySelector('[data-food-selected]').onchange=e=>{row.selected=e.target.checked;foodCache();foodLock();};
    el.querySelectorAll('[data-food-field]').forEach(input=>input.oninput=()=>{row[input.dataset.foodField]=input.value;calc();foodCache();});calc();
  });
  const form=root.querySelector('form');if(form)form.onsubmit=e=>{e.preventDefault();foodSave();};foodLock();
}
async function foodSave(){
  if(foodUI.busy)return;
  if(!document.getElementById('food-date').reportValidity())return;
  foodUI.busy=true;foodLock();
  try{
    await localSync.flush();
    if(!foodUI.pending){const entries=VivianFood.entries({id:foodUI.requestId,date:foodUI.date,meal:foodUI.meal,mode:foodUI.mode,items:foodUI.result.items,imageId:foodUI.imageId,note:foodUI.note,model:foodUI.result.model});if(!entries.length)throw Error('请至少勾选一项食物。');entries.forEach(VivianRecords.normalizeEntry);foodUI.pending=entries;await foodCache();}
    await foodRequest('image',{id:foodUI.imageId,data:foodUI.image});
    state=VivianRecords.applyEntries(state,foodUI.pending);await dailyCommit();
    const date=foodUI.date,count=foodUI.pending.length;foodUI={loaded:true,date,meal:'',mode:foodUI.mode,note:'',image:'',imageId:'',requestId:'',result:null,pending:null,busy:false,message:`${date} 的 ${count} 项饮食已保存，照片与热量依据一并保留。`,error:false,config:foodUI.config};await foodCache();renderHeader();if(currentRoute.tab==='food')await renderFoodPage();else toast(foodUI.message);
  }catch(e){foodStatus('尚未确认保存成功：'+e.message+'。照片和核对结果仍保留。',true);}
  finally{foodUI.busy=false;foodLock();}
}
