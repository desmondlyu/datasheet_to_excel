export const COLUMNS=['產品名稱','max','typ','min','symbol','parameter','condition','description','unit','spec type','page'];
export const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
export const stripNumericNotes=v=>typeof v==='string'?clean(v.replace(/\(\s*\d+(?:\s*[,，]\s*\d+)*\s*\)/g,'')):v;
export const stripDummyNotes=v=>stripNumericNotes(typeof v==='string'?v.replace(/\(\s*Def\.?\s*\)/gi,''):v);
const opcodeList=/\b[0-9a-f]{2}h(?:\s*[/,]\s*[0-9a-f]{2}h)*/gi;
const opcodeNote=String.raw`\s*\(\s*\d+(?:\s*[,，]\s*\d+)*\s*\)`;
const annotatedOpcodeList=new RegExp(String.raw`\b[0-9a-f]{2}h(?:${opcodeNote})?(?:\s*[/,]\s*[0-9a-f]{2}h(?:${opcodeNote})?)*`,'gi');
export const normalizeOpcode=v=>clean(stripNumericNotes(v)).replace(opcodeList,list=>[...new Set(list.match(/[0-9a-f]{2}h/gi).map(code=>code.slice(0,-1).toUpperCase()+'h'))].join('/'));
export const identityText=v=>clean(v).replace(annotatedOpcodeList,list=>normalizeOpcode(list).split('/').sort().join('/')).replace(/\s*\/\s*/g,'/').toLowerCase();
export function interfaceMode(value,section=''){
 return clean(value).split(/[；;]/).map(part=>{
  const mode=part.trim(),label=mode.match(/^(SPI|QPI)(?:[_ -](DTR|DDR|SDR|STR))?$/i);
  if(label)return label[1].toUpperCase()+(/DTR|DDR/i.test(label[2]||'')?'_DTR':'');
  const io=mode.match(/^([14])d?-[0-9]d?-[0-9]d?\s*([（(](SDR|ODDR|DDR|STR|DTR)[）)])?$/i);
  if(!io)return mode;
  const dtr=io[3]?/DDR|DTR/i.test(io[3]):/\dd(?:-|$)/i.test(mode)||/\b(?:DTR|DDR)\b/i.test(section);
  return (io[1]==='1'?'SPI':'QPI')+(dtr?'_DTR':'')+(io[2]||'');
 }).join('；');
}
export function numericValue(v){const s=clean(v).replace(/^([+−–-])\s+(?=\d)/,'$1');return /^[+−–-]?\d[\d,]*(?:\.\d+)?$/.test(s)?Number(s.replace(/,/g,'').replace(/[−–]/g,'-')):s;}
export function parsePageInput(s){if(!s?.trim())return [];const p=s.split(',').map(x=>x.trim());if(p.some(x=>!/^\d+$/.test(x)||+x<1))throw Error('頁碼請使用正整數，以逗號分隔，例如 169,170,171。');return [...new Set(p.map(Number))];}
// Model names are evidence from the document, not a built-in product catalogue.
export function productsFromText(text,fallback=[],knownOnly=false){
 const expanded=String(text).toUpperCase().replace(/\b([A-Z]+[A-Z0-9]*[A-Z])(\d+(?:\s*\/\s*\d+)+)([A-Z][A-Z0-9]*)(?:-DTR)?\b/g,
  (_,prefix,numbers,suffix)=>numbers.split(/\s*\/\s*/).map(n=>prefix+n+suffix).join(' '));
 const family=p=>{const m=p.match(/^(.*?[A-Z])\d+([A-Z]+)$/);return m?m[1]+'|'+m[2]:p;};
 let unresolved=false;
 const ranged=expanded.replace(/\b([A-Z]+\d[A-Z0-9]*)\s*[-–—]\s*([A-Z]+\d[A-Z0-9]*|\d+[A-Z]+)\b/g,(_,first,endToken)=>{
  const prefix=first.match(/^(.*?[A-Z])(\d+[A-Z]+)$/)?.[1];
  const last=/^\d/.test(endToken)&&prefix?prefix+endToken:endToken;
  const start=fallback.indexOf(first),end=fallback.indexOf(last);
  if(start>=0&&end>=start&&family(first)===family(last))return fallback.slice(start,end+1).filter(p=>family(p)===family(first)).join(' ');
  if(knownOnly)unresolved=true;
  return first+' '+last;
 });
 if(unresolved)return [];
 const tokens=[...ranged.matchAll(/\b[A-Z]+\d[A-Z0-9]*(?:-[A-Z][A-Z0-9]*)?\b/g)]
  .map(m=>m[0].replace(/-DTR$/,''))
  .filter(s=>s.length>=6&&(s.match(/\d/g)||[]).length>=2&&/[A-Z]/.test(s.slice(s.search(/\d/)+1)));
 const products=[...new Set(tokens)].filter(p=>!knownOnly||fallback.includes(p));
 return products.length?products:fallback;
}
export function stripProducts(text,products=[]){
 let result=String(text);
 for(const p of products){const escaped=p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');result=result.replace(new RegExp('\\b'+escaped+'(?:-DTR)?\\b','gi'),'');}
 return clean(result).replace(/^[,; /–—-]+|[,; /–—-]+$/g,'');
}
export function makeRow(product,v,meta){
 const r=Object.fromEntries(COLUMNS.map(c=>[c,'']));let desc=[];
 let symbol=clean(v.symbol).replace(/\((\d+)\)/g,(_,n)=>{desc.push('Note '+n);return '';}).replace(/\s+/g,'').trim();
 Object.assign(r,{'產品名稱':product,symbol,parameter:clean(v.parameter),condition:stripProducts(v.condition||'',v.products||[]),unit:clean(v.unit),'spec type':meta.kind,page:meta.page,_pdf_page:meta.pdfPage,_section:meta.section,_table:meta.table,_status:'uncompared',_notes:meta.notes||''});
 // Ordinary spec tables also carry alignment in their condition column.
 const starts=new Set([...r.condition.matchAll(/(?:^|[;；])\s*Starting\s+Address\s*[:=：]\s*(Aligned|Any)\s*(?=[;；]|$)/gi)].map(m=>m[1].toLowerCase()==='aligned'?'Aligned':'Any'));
 if(starts.size===1)r._start=[...starts][0];
 for(const k of ['max','typ','min'])r[k]=numericValue(clean(v[k]).replace(/\((\d+)\)/g,(_,n)=>{desc.push(k+': Note '+n);return '';}));
 if(/Factory Mode/i.test(meta.section))r.condition=[r.condition,'Factory Mode'].filter(Boolean).join('; ');
 const temperature=meta.section.match(/Operating Temperature[^|)]*/i)?.[0];
 if(temperature)r.condition=[r.condition,temperature.trim()].filter(Boolean).join('; ');
 if(v.alternate)desc.push('Alternate symbol: '+clean(v.alternate));
 r.description=desc.join('; ');return r;
}
export const specIdentity=r=>JSON.stringify(['產品名稱','spec type','symbol','parameter','condition'].map(k=>identityText(r[k])));
const startingField=/^Starting\s+Address\s*[:=：]\s*(?:Aligned\s*\/\s*Any|Aligned|Any)$/i;
const withoutStarting=condition=>clean(condition).split(/[;；]/).filter(field=>!startingField.test(field.trim())).map(clean).filter(Boolean).join('; ');
function withStarting(r,start){
 const condition=clean(r.condition).split(/[;；]/).map(field=>startingField.test(field.trim())?`Starting Address: ${start}`:field.trim()).join('; ');
 return {...r,condition,_start:start};
}
export function combineStartingAddresses(rows){
 const groups=new Map();
 for(const r of rows){
  if(!['Aligned','Any'].includes(r._start)||r.unit!=='MHz'||typeof r.max!=='number'||r._status==='review')continue;
  const key=JSON.stringify([specIdentity({...r,condition:withoutStarting(r.condition)}),...['max','typ','min','unit','description','page','_section','_mode','_io','_address','_dummy','_commands','_setting','_status','_changes','_old_page'].map(k=>r[k]??'')]);
  groups.set(key,[...(groups.get(key)||[]),r]);
 }
 const replacements=new Map(),omit=new Set();
 for(const pair of groups.values()){
  if(pair.length!==2||pair[0]._start===pair[1]._start)continue;
  const merged=withStarting(pair[0],'Aligned/Any');
  merged._source_conditions=[...new Set(pair.flatMap(r=>r._source_conditions||[r.condition]))];
  merged._command_sources=[...new Set(pair.flatMap(r=>r._command_sources||[]))];
  replacements.set(pair[0],merged);omit.add(pair[1]);
 }
 return rows.filter(r=>!omit.has(r)).map(r=>replacements.get(r)||r);
}
export function compareRows(newRows,oldRows){
 // Pair each address limit before folding equal limits back into a single display row.
 const expand=rows=>rows.flatMap(r=>r._start==='Aligned/Any'?['Aligned','Any'].map(start=>withStarting(r,start)):[r]);
 newRows=expand(newRows);oldRows=expand(oldRows);
 const group=rs=>{const m=new Map();for(const r of rs){const k=specIdentity(r);m.set(k,[...(m.get(k)||[]),r]);}return m;};
 const newer=group(newRows),older=group(oldRows);const out=newRows.map(source=>{
  const r={...source,_changes:{}};const key=specIdentity(r),prev=older.get(key);
  if(r._merge_conflict||prev?.some(p=>p._merge_conflict)){r._status='review';r._merge_conflict=r._merge_conflict||prev.find(p=>p._merge_conflict)._merge_conflict;}
  else if(newer.get(key).length>1||(prev?.length||0)>1){r._status='review';r._candidates=(prev||[]).map(p=>({...p}));}
  else if(!prev)r._status='added';
  else {
   r._old_page=prev[0].page??'';
   const fields=['max','typ','min','unit','description'].map(c=>[c,c]);
   if(r['spec type']==='Command')fields.push(['3/4 byte address','_address'],['Dummy','_dummy']);
   for(const [label,c] of fields)if(String(r[c]??'')!==String(prev[0][c]??''))r._changes[label]={old:prev[0][c]??'',new:r[c]??''};
   r._status=Object.keys(r._changes).length?'changed':'unchanged';
  }
  return r;
 });
 return combineStartingAddresses([...out,...oldRows.filter(r=>!newer.has(specIdentity(r))).map(r=>({...r,_status:'removed',_changes:{}}))]);
}
