export const COLUMNS=['產品名稱','max','typ','min','symbol','parameter','condition','description','unit','spec type','page'];
export const FAMILY=['32','64','12','25','51','01','02'].map(x=>'W25Q'+x+'RW');
export const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
export function numericValue(v){const s=clean(v).replace(/^([+−–-])\s+(?=\d)/,'$1');return /^[+−–-]?\d[\d,]*(?:\.\d+)?$/.test(s)?Number(s.replace(/,/g,'').replace(/[−–]/g,'-')):s;}
export function parsePageInput(s){if(!s?.trim())return [];const p=s.split(',').map(x=>x.trim());if(p.some(x=>!/^\d+$/.test(x)||+x<1))throw Error('頁碼請使用正整數，以逗號分隔，例如 169,170,171。');return [...new Set(p.map(Number))];}
export function productsFromText(text,fallback=[]){
 const family=text.match(/W25Q((?:\d{2}\/)+\d{2})([A-Z]{2})(?:-DTR)?/i);
 if(family)return family[1].split('/').map(n=>'W25Q'+n+family[2].toUpperCase());
 const range=text.match(/W25Q(32|64|12|25|51|01|02)RW\s*[-–]\s*(?:W25Q)?(32|64|12|25|51|01|02)RW/i);
 if(range)return FAMILY.slice(FAMILY.indexOf('W25Q'+range[1]+'RW'),FAMILY.indexOf('W25Q'+range[2]+'RW')+1);
 const ps=[...text.matchAll(/W25Q\d{2,4}[A-Z]{2}(?:-DTR)?/gi)].map(m=>m[0].toUpperCase().replace(/-DTR$/,''));
 return ps.length?[...new Set(ps)]:fallback;
}
export function stripProducts(text){return clean(text.replace(/W25Q\w+(?:\s*[-–]\s*(?:W25Q)?\w+RW)?/g,'')).replace(/^[,; ]+|[,; ]+$/g,'');}
export function makeRow(product,v,meta){
 const r=Object.fromEntries(COLUMNS.map(c=>[c,'']));let desc=[];
 let symbol=clean(v.symbol).replace(/\((\d+)\)/g,(_,n)=>{desc.push('Note '+n);return '';}).replace(/\s+/g,'').trim();
 Object.assign(r,{'產品名稱':product,symbol,parameter:clean(v.parameter),condition:stripProducts(v.condition||''),unit:clean(v.unit),'spec type':meta.kind,page:meta.page,_pdf_page:meta.pdfPage,_section:meta.section,_table:meta.table,_status:'uncompared',_notes:meta.notes||''});
 for(const k of ['max','typ','min'])r[k]=numericValue(clean(v[k]).replace(/\((\d+)\)/g,(_,n)=>{desc.push(k+': Note '+n);return '';}));
 if(/Factory Mode/i.test(meta.section))r.condition=[r.condition,'Factory Mode'].filter(Boolean).join('; ');
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
