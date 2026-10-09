import {COLUMNS,clean,makeRow,productsFromText} from './spec-core.mjs';
import {textIn} from './geometry.mjs';
export function normalizeTable(table,items,defaults,meta){
 const cache=new Map();const text=c=>{const key=c.join(',');if(!cache.has(key))cache.set(key,textIn(items,c));return cache.get(key);};
 const headers={};const mapping={description:'parameter',parameter:'parameter',parameters:'parameter',symbol:'symbol',conditions:'condition',condition:'condition',min:'min',typ:'typ',max:'max',unit:'unit'};
 for(const cell of [...table.cells].sort((a,b)=>a[1]-b[1]||a[0]-b[0])){if(cell[1]>table.bbox[1]+60)continue;const key=mapping[clean(text(cell)).toLowerCase()];if(key&&!headers[key])headers[key]=cell;}
 if(!headers.parameter||!headers.symbol||!['min','typ','max'].some(k=>headers[k]))return {rows:[],unparsed:[]};
 const keys=Object.keys(headers).sort((a,b)=>headers[a][0]-headers[b][0]);const bounds=Object.fromEntries(keys.map((k,i)=>[k,[headers[k][0],i+1<keys.length?headers[keys[i+1]][0]:table.bbox[2]]]));
 const top=Math.max(...Object.values(headers).map(c=>c[3]));const [sx0,sx1]=bounds.symbol;
 const anchors=table.cells.filter(c=>c[1]>=top-1&&c[0]>=sx0-1&&c[2]<=sx1+1&&/\p{L}/u.test(text(c))).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
 let rows=[],unparsed=[];
 for(const anchor of anchors){
  const [y0,y1]=[anchor[1],anchor[3]],param=textIn(items,[bounds.parameter[0],y0,bounds.parameter[1],y1]);
  const ys=new Set([y0,y1]);
  for(const c of table.cells)if(c[1]>=y0-1&&c[3]<=y1+1&&c[0]>=(bounds.condition||bounds.min||bounds.symbol)[0]-1){ys.add(Math.max(y0,c[1]));ys.add(Math.min(y1,c[3]));}
  const bands=[...ys].sort((a,b)=>a-b);let active=defaults,emitted=0;
  for(let i=0;i<bands.length-1;i++){
   const [lo,hi]=bands.slice(i,i+2);if(hi-lo<2)continue;const cy=(lo+hi)/2,v={parameter:param,symbol:text(anchor)};
   for(const [key,[x0,x1]] of Object.entries(bounds)){if(['parameter','symbol'].includes(key))continue;v[key]=clean([...new Set(table.cells.filter(c=>c[0]>=x0-1&&c[2]<=x1+1&&c[1]<=cy&&cy<c[3]).sort((a,b)=>a[0]-b[0]).map(text))].join(' '));}
   if(!['min','typ','max'].some(k=>v[k])&&bounds.min&&bounds.max){
    const r=textIn(items,[bounds.min[0],lo,bounds.max[1],hi]).split(/\s+to\s+/);if(r.length===2){v.min=r[0];v.max=r[1];}
   }
   if(!['min','typ','max'].some(k=>v[k])){const band=textIn(items,[(bounds.condition||[sx1])[0],lo,table.bbox[2],hi]);active=productsFromText(band,active);continue;}
   for(const product of productsFromText(v.condition||'',active)){rows.push(makeRow(product,v,meta));emitted++;}
  }
  if(!emitted)unparsed.push([param,text(anchor),'未辨識到限制值或限制值跨欄，請核對原文。']);
 }
 for(const c of table.cells){if(c[1]>=top-1&&c[0]>=bounds.parameter[0]-1&&c[2]<=bounds.parameter[1]+1&&text(c)&&!anchors.some(a=>a[1]<c[3]-1&&a[3]>c[1]+1))unparsed.push([textIn(items,[table.bbox[0],c[1],table.bbox[2],c[3]]),'未辨識到 symbol，請核對原文。']);}
 rows=[...new Map(rows.map(r=>[JSON.stringify(COLUMNS.map(c=>r[c])),r])).values()];
 return {rows,unparsed};
}
export function normalizeFrequency(table,items,defaults,meta){
 const text=c=>textIn(items,c);const sorted=[...table.cells].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
 const address=sorted.find(c=>/Address Mode/i.test(text(c))&&c[1]<table.bbox[1]+35);if(!address)return [];
 const alignCells=sorted.filter(c=>['Aligned','Any'].includes(text(c)));if(!alignCells.length)return [];
 const alignTop=Math.min(...alignCells.map(c=>c[1])),alignBottom=Math.max(...alignCells.map(c=>c[3]));
 const yBands=[...new Set(sorted.filter(c=>c[1]>=alignBottom-1).map(c=>c[1]))].sort((a,b)=>a-b);
 const mode=['QPI_DTR','SPI_DTR','QPI','SPI'].find(m=>meta.section.includes(m))||'SPI';
 const cellAt=(x,y)=>sorted.find(c=>x>=c[0]&&x<c[2]&&y>=c[1]&&y<c[3]);const rows=[];
 const addressHeaders=sorted.filter(c=>c[0]<=address[0]+2&&c[1]>address[1]+2&&c[1]<alignTop&&/byte/i.test(text(c)));
 for(const top of yBands){
  const cycleCell=sorted.find(c=>c[1]===top&&c[0]<alignCells[0][0]&&/^\d+(?:[–-]\d+)?(?:\(\d+\))?$/.test(text(c)));if(!cycleCell)continue;
  const cycle=text(cycleCell),y=(cycleCell[1]+cycleCell[3])/2;
  for(const align of alignCells){const x=(align[0]+align[2])/2,c=cellAt(x,y);if(!c)continue;const limit=text(c);if(!/^\d+(?:\(\d+\))?$/.test(limit))continue;
   const head=cellAt(x,(address[1]+address[3])/2);if(!head)continue;
   for(const a of addressHeaders){const opcodeCell=cellAt(x,(a[1]+a[3])/2),opcode=opcodeCell?text(opcodeCell):'';if(!opcode||/^x$/i.test(opcode))continue;
    let condition=`${mode}; ${text(a)}; opcode=${opcode}; Dummy=${cycle}; Starting Address: ${text(align)}`;
    if(+limit.replace(/\(\d+\)/g,'')===200)condition+='; DS bit enabled';
    for(const product of defaults){const r=makeRow(product,{parameter:text(head)+' maximum clock frequency',condition,max:limit,unit:'MHz'},meta);r.description=[r.description,'Frequency matrix; symbol not specified in source'].filter(Boolean).join('; ');rows.push(r);}
   }
  }
 }
 return rows;
}
