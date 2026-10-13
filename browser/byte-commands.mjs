// Instruction tables that describe the transfer byte by byte instead of named phases.
import {clean,stripNumericNotes} from './spec-core.mjs';
import {textIn} from './geometry.mjs';

const isLabel=s=>/^Data\s+Input\s*\/?\s*Output$/i.test(s);
const byteLabel=/^Byte\s+\d+(?:\s*[~–-]\s*(?:Byte\s*)?\d+)?$/i;
const sorted=cells=>[...cells].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
export function isByteCommandTable(table,items){
 const first=table.cells.filter(c=>Math.abs(c[1]-table.bbox[1])<1).map(c=>clean(textIn(items,c)));
 return first.some(isLabel)&&first.some(s=>/^Byte\s+1$/i.test(s))&&first.filter(s=>byteLabel.test(s)).length>=2;
}

export function parseByteCommandTable(table,items,meta){
 const cells=sorted(table.cells),cache=new Map();
 const text=c=>{if(!cache.has(c))cache.set(c,clean(textIn(items,c)));return cache.get(c);};
 const anchors=cells.filter(c=>Math.abs(c[0]-table.bbox[0])<1);
 const rows=[],unparsed=[];let columns=[],clocks=[],mode='',group='';
 for(const anchor of anchors){
  const cy=(anchor[1]+anchor[3])/2;
  const band=cells.filter(c=>c[1]<=cy&&cy<c[3]),name=text(anchor);
  if(band.some(c=>/^Byte\s+1$/i.test(text(c)))&&band.filter(c=>byteLabel.test(text(c))).length>=2){
   columns=band.filter(c=>byteLabel.test(text(c))).map(c=>({label:text(c),x0:c[0],x1:c[2]}));
   if(isLabel(name)){clocks=[];mode='';group='';}else group=name;
   continue;
  }
  if(/^Number of Clock/i.test(name)){
   mode=name.match(/\b([1-9]d?(?:-[1-9]d?){2})\b/i)?.[1]||'';
   clocks=band.filter(c=>c!==anchor).map(c=>({x0:c[0],x1:c[2],value:text(c)}));continue;
  }
  if(!name)continue;
  const opcodeColumn=columns.find(c=>/^Byte\s+1$/i.test(c.label));
  const opcodeCell=opcodeColumn&&band.find(c=>c[0]>=opcodeColumn.x0-1&&c[2]<=opcodeColumn.x1+1);
  const opcode=opcodeCell?stripNumericNotes(text(opcodeCell)):'';
  if(!/^[0-9A-F]{2}h(?:\s*[/,]\s*[0-9A-F]{2}h)*$/i.test(opcode)){
   unparsed.push([band.map(text).join(' '),'指令表列未辨識到 opcode，請核對原文。']);continue;
  }
  const address=[],dummy=[],data=[],raw=[];
  for(const c of band.filter(c=>c!==anchor&&c!==opcodeCell)){
   const value=text(c);if(!value)continue;
   const labels=columns.filter(col=>col.x0<c[2]-1&&col.x1>c[0]+1).map(col=>col.label).join(' / ');
   const counts=clocks.filter(k=>k.x0<c[2]-1&&k.x1>c[0]+1).map(k=>k.value).filter(Boolean).join(' + ');
   raw.push(`${labels}: ${value}${counts?` [${counts} clocks]`:''}`);
   if(/^A\d+\s*[-–]\s*A?\d+/i.test(value))address.push(value);
   else if(/^Dummy\b/i.test(value))dummy.push(`${labels}: ${counts||'?'} clocks (${value})`);
   else data.push(`${labels}: ${value}`);
  }
  rows.push({command:clean(name.replace(/\(\d+(?:\s*,\s*\d+)*\)/g,'')),opcode,mode,
   address:address.join(', '),dummy:stripNumericNotes(dummy.join('; ')),data:data.join('; '),
   extra:`${name}; ${raw.join('; ')}`,setting:'',group,section:meta.section,page:meta.page,pdf_page:meta.pdfPage});
 }
 return {rows,unparsed};
}
