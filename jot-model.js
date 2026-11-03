/* Local, conservative extraction. Unclear statements remain visible for review. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.VivianJot=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const sports='跑步|慢跑|快走|散步|走路|骑行|瑜伽|游泳|跳绳|八段锦|普拉提|力量训练|健身|跳舞|爬楼|爬山|拉伸|运动';
  const meals='早餐|早饭|午餐|午饭|晚餐|晚饭|加餐|下午茶|夜宵';
  function key(date,text){return date+'\n'+text.trim().replace(/\r\n/g,'\n');}
  function parse(text,date,today){
    const rows=[],warnings=[];
    if(!text.trim())return {rows,warnings:['请先写下今天的记录。']};
    if(text.length>20000)return {rows,warnings:['一次最多整理 20000 字，请分篇保存。']};
    const fullDates=[...text.matchAll(/(\d{4})[年\/-](\d{1,2})[月\/-](\d{1,2})日?/g)].map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
    if(fullDates.some(d=>d!==date))warnings.push('原文日期与所选日期不同。请按天拆开，并选择对应日期后再整理。');
    if(/昨天|昨日|前天/.test(text))warnings.push('请将“昨天／前天”改成具体年月日，并选择相同日期，避免记错天。');
    if(/今天|今日/.test(text)&&date!==today)warnings.push('原文写了“今天”，所选日期不是今天；请确认日期或改写原文。');
    if(/(?:^|[\s，,。；;])\d{1,2}(?:月\d{1,2})?[号日]/.test(text)&&!fullDates.length)warnings.push('请把原文里的日期写完整，例如 2026-10-28，再选择对应日期。');
    const boundary=new RegExp('[，,、](?=\\s*(?:(?:今天|今日|早上|早晨|晚上)?(?:体重|称重)|'+meals+'|'+sports+'|花了|花费|支出|买了|打车|地铁|公交|做了))','g');
    const parts=text.replace(boundary,'\n').split(/[\n；;。！？!?]+/).map(s=>s.trim()).filter(Boolean);
    const push=(type,part,fields={},hint='')=>rows.push({type,sourceText:part,selected:true,hint,...fields});
    for(const part of parts){
      if(/^(?:\d{4}[年\/-]\d{1,2}[月\/-]\d{1,2}日?|今天|今日)[，,:：\s]*$/.test(part))continue;
      if(/明天|后天|计划|打算|准备|想要|想吃|想去|希望|目标|建议|如果|没有|没吃|没做|没跑|没运动|未完成|不吃|不运动|取消|收入|工资|收到|退款|报销/.test(part)){
        push('event',part,{text:part},'计划、未完成或需核对的描述，仅记为小事。');continue;
      }
      let matched=false;
      const weight=part.match(/(?:体重|称重|称了|重了?)\s*[:：是为]?\s*(\d+(?:\.\d+)?)\s*(公斤|千克|kg|斤)?/i);
      if(weight){push('weight',part,{value:weight[1],unit:weight[2]?(weight[2]==='斤'?'斤':'kg'):''},weight[2]?'':'原文未写单位，请选择公斤或斤。');matched=true;}
      const meal=part.match(new RegExp(meals));
      if(meal||/吃了|喝了|饮食[：:]|吃的|喝的/.test(part)){
        const kcal=[...part.matchAll(/(\d+(?:\.\d+)?)\s*(?:kcal|千卡|大卡)/gi)];
        push('diet',part,{meal:meal?({'早饭':'早餐','午饭':'午餐','晚饭':'晚餐'}[meal[0]]||meal[0]):'',name:part,kcal:kcal.length===1&&!/每|分[两二三四五六七八九十\d]+天|分[两二三四五六七八九十\d]+次/.test(part)?kcal[0][1]:''},kcal.length>1?'多处热量保留在原文中，未自动相加。':'');matched=true;
      }
      const sport=part.match(new RegExp(sports));
      if(sport){
        const minutes=part.match(/(\d+(?:\.\d+)?)\s*(?:分钟|分(?!钟)|min\b)/i),hours=part.match(/(\d+(?:\.\d+)?)\s*(?:小时|h\b)/i);
        const duration=minutes||hours?Number(minutes?.[1]||0)+Number(hours?.[1]||0)*60:/半小时/.test(part)?30:'';
        push('exercise',part,{sport:sport[0],duration,note:part},duration===''?'未提供时长，保留为空。':'');matched=true;
      }
      const money=[...part.matchAll(/(?:[¥￥]\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:元|块钱))/g)];
      if(money.length===1){push('expense',part,{amount:money[0][1]||money[0][2],category:'其他',note:part});matched=true;}
      else if(money.length>1){push('event',part,{text:part},'多笔金额尚未拆开；请分行写每笔花销后重新整理。');matched=true;}
      if(!matched)push('event',part,{text:part},'原样保存为小事，可手动调整分类。');
    }
    return {rows,warnings};
  }
  function entries(rows,date,id){
    const selected=rows.map((r,i)=>({...r,index:i})).filter(r=>r.selected);
    if(selected.filter(r=>r.type==='weight').length>1)throw Error('同一天只保留一条体重，请取消多余的勾选。');
    const numeric=v=>v===''||v==null?null:Number(v);
    return selected.map(r=>{
      const base={id:id+':'+r.index,date,type:r.type,source:'随手记整理',sourceText:r.sourceText};
      if(r.type==='weight')return {...base,value:Number(r.value),unit:r.unit};
      if(r.type==='diet')return {...base,meal:r.meal||'',name:r.name,kcal:numeric(r.kcal)};
      if(r.type==='exercise')return {...base,sport:r.sport,duration:numeric(r.duration),note:r.note||''};
      if(r.type==='expense')return {...base,amount:Number(r.amount),category:r.category||'其他',note:r.note||''};
      return {...base,title:'随手记',text:r.text};
    });
  }
  return {parse,entries,key};
});
