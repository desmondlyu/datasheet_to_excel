export const COLUMNS=['產品名稱','max','typ','min','symbol','parameter','condition','description','unit','spec type','page'];
export const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
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
 for(const k of ['max','typ','min'])r[k]=numericValue(clean(v[k]).replace(/\((\d+)\)/g,(_,n)=>{desc.push(k+': Note '+n);return '';}));
 if(/Factory Mode/i.test(meta.section))r.condition=[r.condition,'Factory Mode'].filter(Boolean).join('; ');
 const temperature=meta.section.match(/Operating Temperature[^|)]*/i)?.[0];
 if(temperature)r.condition=[r.condition,temperature.trim()].filter(Boolean).join('; ');
 if(v.alternate)desc.push('Alternate symbol: '+clean(v.alternate));
 r.description=desc.join('; ');return r;
}
const identity=r=>JSON.stringify(['產品名稱','spec type','symbol','parameter','condition'].map(k=>clean(r[k]).toLowerCase()));
export function compareRows(newRows,oldRows){
 const group=rs=>{const m=new Map();for(const r of rs){const k=identity(r);m.set(k,[...(m.get(k)||[]),r]);}return m;};
 const newer=group(newRows),older=group(oldRows);const out=newRows.map(source=>{
  const r={...source,_changes:{}};const key=identity(r),prev=older.get(key);
  if(newer.get(key).length>1||(prev?.length||0)>1){r._status='review';r._candidates=(prev||[]).map(p=>({...p}));}
  else if(!prev)r._status='added';
  else {for(const c of ['max','typ','min','unit','description'])if(String(r[c]??'')!==String(prev[0][c]??''))r._changes[c]={old:prev[0][c]??'',new:r[c]??''};r._status=Object.keys(r._changes).length?'changed':'unchanged';}
  return r;
 });
 return [...out,...oldRows.filter(r=>!newer.has(identity(r))).map(r=>({...r,_status:'removed',_changes:{}}))];
}
