(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.VivianFood=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000;
  function validateResult(result,mode){
    if(!result||!Array.isArray(result.items)||result.items.length>20||!Array.isArray(result.questions)||!Array.isArray(result.warnings))throw Error('识别结果格式不正确，请重新识别。');
    const strings=list=>{if(list.length>20||list.some(s=>typeof s!=='string'||s.length>2000))throw Error('识别说明格式不正确');return list;};
    const items=result.items.map(r=>{
      if(!r||typeof r.name!=='string'||!r.name.trim()||r.name.length>500||typeof r.portion!=='string'||r.portion.length>1000||typeof r.notes!=='string'||r.notes.length>2000)throw Error('食物描述无效');
      for(const field of ['kcalMin','kcalMax','labelEnergy','labelBasisAmount'])if(r[field]!=null&&!finite(r[field]))throw Error('识别数值无效');
      if((r.kcalMin==null)!==(r.kcalMax==null)||r.kcalMin>r.kcalMax)throw Error('估算范围无效');
      if(![null,'kcal','kJ'].includes(r.labelUnit)||![null,'g','ml','serving'].includes(r.labelBasisUnit))throw Error('标签单位无效');
      return {name:r.name.trim(),portion:r.portion,notes:r.notes,kcalMin:mode==='photo'?r.kcalMin:null,kcalMax:mode==='photo'?r.kcalMax:null,labelEnergy:mode==='label'?r.labelEnergy:null,labelUnit:mode==='label'?r.labelUnit:null,labelBasisAmount:mode==='label'?r.labelBasisAmount:null,labelBasisUnit:mode==='label'?r.labelBasisUnit:null};
    });
    return {items,questions:strings(result.questions),warnings:strings(result.warnings)};
  }
  function labelCalories(row){
    if(!finite(row.labelEnergy)||!finite(row.labelBasisAmount)||row.labelBasisAmount<=0||!finite(row.consumed)||row.consumed<=0||!['kcal','kJ'].includes(row.labelUnit)||!['g','ml','serving'].includes(row.labelBasisUnit))throw Error('请核对标签能量、单位、每份基准，以及你实际吃的量。');
    const kcal=row.labelEnergy/(row.labelUnit==='kJ'?4.184:1)*row.consumed/row.labelBasisAmount;
    if(!finite(kcal))throw Error('计算值过大，请核对标签和食用量。');
    return Math.round(kcal*10)/10;
  }
  function calorieText(row){
    if(row.kcalEstimate)return `照片估算 ${row.kcalEstimate.min}–${row.kcalEstimate.max} kcal`;
    if(row.kcal==null||row.kcal==='')return '热量未填写';
    return `${Number(row.kcal)} kcal${row.calorieBasis==='label-calculation'?'（标签计算）':''}`;
  }
  function estimateTotal(items){const rows=items.filter(r=>r.kcalEstimate);return rows.length?`另有 ${rows.length} 项照片估算：${Math.round(rows.reduce((s,r)=>s+r.kcalEstimate.min,0))}–${Math.round(rows.reduce((s,r)=>s+r.kcalEstimate.max,0))} kcal（未计入已知热量）`:'';}
  function entries({id,date,meal,mode,items,imageId,note,model}){
    const num=v=>v===''||v==null?null:Number(v);
    return items.map((r,index)=>({...r,index})).filter(r=>r.selected).map(r=>{
      const e={id:id+':'+r.index,type:'diet',date,meal,name:r.name,source:mode==='label'?'营养标签核对计算':'照片识别 · 用户确认',sourceText:[note,r.portion,r.notes,model?'识别模型：'+model:''].filter(Boolean).join('\n'),img:imageId,kcal:null};
      if(mode==='photo'){
        const min=num(r.kcalMin),max=num(r.kcalMax);if(min!==null||max!==null){if(!finite(min)||!finite(max)||min>max)throw Error('请填写有效的热量范围，或将上下限同时留空。');e.kcalEstimate={min,max,portion:r.portion||'',note:r.notes||''};e.calorieBasis='photo-estimate';}
      }else{
        const row={...r,labelEnergy:num(r.labelEnergy),labelBasisAmount:num(r.labelBasisAmount),consumed:num(r.consumed)};e.kcal=labelCalories(row);e.calorieBasis='label-calculation';
        const unit={g:'克',ml:'毫升',serving:'份'}[row.labelBasisUnit];e.calorieNote=`标签每 ${row.labelBasisAmount} ${unit}：${row.labelEnergy} ${row.labelUnit}；实际食用 ${row.consumed} ${unit}。`;e.sourceText+='\n'+e.calorieNote;
      }
      return e;
    });
  }
  return {validateResult,labelCalories,calorieText,estimateTotal,entries};
});
