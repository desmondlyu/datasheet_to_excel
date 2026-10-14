// Command (instruction set) tables are located by header signature, never by fixed page numbers.
import {clean,makeRow,numericValue,normalizeOpcode,identityText,interfaceMode,specIdentity,combineStartingAddresses,stripNumericNotes,stripDummyNotes} from './spec-core.mjs';
import {textIn} from './geometry.mjs';
import {isByteCommandTable,parseByteCommandTable} from './byte-commands.mjs';

export const OPCODE_RE=/\b[0-9A-F]{2}h\b/i;
const HEADER={
 command:/^(?:command|instruction)(?:\s+name)?s?$/i,
 opcode:/opcode|command code|instruction code|^byte\s*1\b/i,
 mode:/interface|^mode$/i,
 address:/^address/i,
 dummy:/^dummy/i,
 data:/^data/i,
};
// Pages whose text could hold a command table; table of contents lines (dot leaders) are ignored.
export function mayHoldCommands(text){
 const body=text.split('\n').filter(l=>!/\.{4,}|…{2,}/.test(l)).join('\n');
 return /\bopcode\b|command code|instruction code|\bbyte\s*1\b/i.test(body);
}
function headerColumns(table,text){
 const cells=[...table.cells].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
 const top=cells[0][1],first=cells.filter(c=>Math.abs(c[1]-top)<1),bottom=Math.max(...first.map(c=>c[3]));
 const columns=[];
 for(const h of first){
  const label=clean(text(h)),subs=cells.filter(c=>c[1]>=h[3]-1&&c[1]<bottom-1&&c[0]>=h[0]-1&&c[2]<=h[2]+1);
  const key=Object.keys(HEADER).find(k=>HEADER[k].test(label.replace(/\d+$/,'')))||'extra';
  if(subs.length>1)for(const s of subs.sort((a,b)=>a[0]-b[0]))columns.push({key,label:clean(label+' '+text(s)),x0:s[0],x1:s[2]});
  else columns.push({key,label,x0:h[0],x1:h[2]});
 }
 return {columns,bottom};
}
export function isCommandTable(table,items){
 if(table.cells.length<6)return false;
 if(isByteCommandTable(table,items))return true;
 const keys=headerColumns(table,c=>textIn(items,c)).columns.map(c=>c.key);
 return keys.includes('command')&&keys.includes('opcode')&&['address','dummy','data'].some(k=>keys.includes(k));
}
export function parseCommandTable(table,items,meta,state={}){
 if(isByteCommandTable(table,items))return parseByteCommandTable(table,items,meta);
 const cache=new Map(),text=c=>{const k=c.join(',');if(!cache.has(k))cache.set(k,clean(textIn(items,c)));return cache.get(k);};
 const {columns,bottom}=headerColumns(table,text);const headerLabels=new Set(columns.map(c=>c.label.toLowerCase()));
 const body=table.cells.filter(c=>c[1]>=bottom-1);const ys=[...new Set(body.map(c=>Math.round(c[1]*10)/10))].sort((a,b)=>a-b);
 const rows=[],unparsed=[];
 for(let i=0;i<ys.length;i++){
  const lo=ys[i],next=ys.slice(i+1).find(y=>y>lo+1),hi=next??Math.max(...body.filter(c=>Math.abs(c[1]-lo)<.2).map(c=>c[3]));
  const cy=(lo+hi)/2,hits=columns.map(col=>body.filter(c=>c[0]<col.x1-1&&c[2]>col.x0+1&&c[1]<=cy&&cy<c[3]).sort((a,b)=>a[0]-b[0]));
  const v=hits.map(cs=>clean(cs.map(text).join(' ')));const distinct=new Set(hits.flat().filter(c=>text(c)));
  const get=k=>columns.map((c,j)=>c.key===k?v[j]:null).filter(x=>x!==null);
  const command=get('command')[0]||'',opcode=normalizeOpcode(get('opcode')[0]||'');
  const rowText=clean([...distinct].map(text).join(' '));
  if(!rowText||headerLabels.has(command.toLowerCase()))continue;
  const io=command.match(/Number of Clock[\s(]*(?:IO\s*)?([0-9d]+(?:-[0-9d]+){2})/i);
  if(io){state.io=io[1];state.units=Object.fromEntries(columns.map((c,j)=>[c.label,/^MHz$/i.test(v[j])?'MHz':'']));continue;}
  if(distinct.size===1&&!OPCODE_RE.test(rowText)){state.group=rowText;continue;}
  const modes=columns.map((c,j)=>c.key==='mode'&&v[j]&&v[j]!=='-'?`${v[j]}（${c.label.replace(/^.*?\b(SDR|ODDR|DDR|STR|DTR)\b.*$/i,'$1')}）`:'').filter(Boolean);
  const extra=columns.map((c,j)=>c.key==='extra'&&v[j]&&!/^MHz$/i.test(v[j])?`${c.label}${state.units?.[c.label]?` (${state.units[c.label]})`:''}: ${v[j]}`:'').filter(Boolean).join('; ');
  const record={command,opcode,mode:modes.join('；')||state.io||'',address:get('address').join(' '),dummy:stripDummyNotes(get('dummy').join(' ')),data:get('data').join(' '),extra,setting:'',group:state.group||'',section:meta.section,page:meta.page,pdf_page:meta.pdfPage};
  const variant=command.match(/^(.*?)\s+([01](?:\s*[01]){1,3})$/);
  if(variant&&state.last&&(opcode===state.last.opcode||/^[01\s]+$/.test(opcode))){rows.push({...record,command:state.last.command,opcode:state.last.opcode,setting:`${variant[1].replace(/\s*M7.*$/,'')} = ${variant[2].replace(/\s+/g,'')}`});continue;}
  const bits=opcode.replace(/\s+/g,'');
  if(/^[01]{2,4}$/.test(bits)&&state.last){rows.push({...record,command:state.last.command,opcode:state.last.opcode,setting:`${command.replace(/\s*M7.*$/,'')} = ${bits}`});continue;}
  if(OPCODE_RE.test(opcode)){state.last=record;rows.push(record);continue;}
  unparsed.push([rowText,'指令表列未辨識到 opcode，請核對原文。']);
 }
 return {rows,unparsed};
}

export function commandSpecRows(commands,products){
 const rows=[];
 for(const c of commands){
  const scope=[c.section,c.group].filter(Boolean).join(' ');
  if(/\bFactory[\s-]+(?:Mode|Only)\b/i.test(scope)&&!/\bUser[\s-]+Mode\b/i.test(scope))continue;
  const opcode=normalizeOpcode(c.opcode),dummy=numericValue(stripDummyNotes(c.dummy)),limits=[];
  const extra=String(c.extra||'').split(/;\s*/).filter(field=>{
   const frequency=field.match(/^\s*(Aligned|Any)\s+Address\s*\(\s*MHz\s*\)\s*:\s*(.*?)\s*$/i);
   if(!frequency)return true;
   const value=clean(stripNumericNotes(frequency[2])).match(/^(\d+(?:\.\d+)?)(?:\s*(\([^()]+\)))?$/);
   if(!value||!Number.isFinite(Number(value[1])))return true;
   limits.push({start:frequency[1].toLowerCase()==='aligned'?'Aligned':'Any',max:Number(value[1]),qualifier:value[2]||''});return false;
  }).join('; ');
  const base=[`opcode=${opcode}`,c.mode?`IO=${c.mode}`:'',c.setting].filter(Boolean).join('; ');
  for(const product of products)for(const limit of limits.length?limits:[null]){
   const condition=[base,limit?.qualifier,limit?`Starting Address: ${limit.start}`:''].filter(Boolean).join('; ');
   const r=makeRow(product,{parameter:c.command,condition,max:limit?.max,unit:limit?'MHz':''},{kind:'Command',page:c.page,pdfPage:c.pdf_page,section:clean(c.section)});
   Object.assign(r,{_opcode:opcode,_mode:interfaceMode(c.mode,c.section),_io:c.mode,_setting:c.setting||'',_address:c.address,_dummy:dummy,_commands:`${opcode} ${c.command}`,_command_sources:[c]});
   if(limit)r._start=limit.start;
   r.description=[c.data?`Data: ${c.data}`:'',extra].filter(Boolean).join('; ');
   rows.push(r);
  }
 }
 return rows;
}

function addressKey(value){
 const address=clean(stripNumericNotes(value)).toUpperCase();
 if(/^[-–]+$/.test(address))return 'none';
 if(/^A31\s*\/\s*A23[-–]A0$/.test(address)||/^3-?\s*\/\s*4[- ]*BYTE(?:S)?(?: ADDRESS)?$/.test(address))return '3/4';
 const bytes=address.match(/^(\d+)(?:[- ]*BYTES?(?: ADDRESS)?)?$/);if(bytes)return bytes[1];
 if(/^A\d+[-–]A?\d+(?:\s*,\s*A\d+[-–]A?\d+)*$/.test(address)){
  const ranges=[...address.matchAll(/A(\d+)[-–]A?(\d+)/g)].map(m=>[Number(m[2]),Number(m[1])]).sort((a,b)=>a[0]-b[0]);
  let end=0;for(const [lo,hi] of ranges){if(lo!==end||hi<lo)return address;end=hi+1;}
  if(end%8===0)return String(end/8);
 }
 return address;
}
const frequencyRemainder=r=>clean(r.condition).split(/[;；]/).map(clean).filter(field=>field&&!/^(?:SPI|QPI)(?:_DTR)?$/i.test(field)&&!/byte(?:s)?\s+address$/i.test(field)&&!/^(?:opcode|Dummy|IO)\s*[:=]/i.test(field)&&!/^Starting\s+Address\s*[:=：]/i.test(field)).map(identityText).join(';');
const commandName=value=>clean(value).replace(/\bI\s*\/\s*O\b/gi,'IO').replace(/\s+with\s+[34][- ]Byte\s+Addr(?:ess)?$/i,'').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
function sameFrequencyScope(spec,command){
 const codes=normalizeOpcode(command._opcode).split('/'),specCodes=normalizeOpcode(spec._opcode).split('/');
 const mode=interfaceMode(spec._mode,spec._section),address=addressKey(spec._address);
 const names=clean(spec.parameter).replace(/\s+(?:maximum\s+)?clock\s+frequency.*$/i,'').replace(/\bI\s*\/\s*O\b/gi,'IO').split('/').map(commandName);
 return command._setting===''&&spec['產品名稱']===command['產品名稱']&&
  codes.every(code=>OPCODE_RE.test(code)&&specCodes.includes(code))&&
  /^(SPI|QPI)(?:_DTR)?$/.test(mode)&&mode===command._mode&&
  (!spec._io||spec._io===command._io)&&address!==''&&address===addressKey(command._address)&&
  spec._dummy!==undefined&&identityText(stripDummyNotes(spec._dummy))===identityText(stripDummyNotes(command._dummy))&&
  spec._start===command._start&&names.includes(commandName(command.parameter))&&
  frequencyRemainder(spec)===frequencyRemainder(command);
}
export function consolidateSpecs(input){
 const dedup=new Map();
 for(const source of input){
  const r={...source,_command_sources:[...(source._command_sources||[])]};
  if(r._opcode!==undefined)r._opcode=normalizeOpcode(r._opcode);
  const key=JSON.stringify([specIdentity(r),r['spec type']==='Command'?'':identityText(r._section),...['max','typ','min','unit','description','_mode','_io','_address','_dummy','_start','_commands','_setting'].map(k=>identityText(r[k]))]);
  const prev=dedup.get(key);
  if(!prev){dedup.set(key,r);continue;}
  prev._command_sources=unique([...prev._command_sources,...r._command_sources]);
  prev._source_conditions=unique([...(prev._source_conditions||[prev.condition]),...(r._source_conditions||[r.condition])]);
  prev._source_pages=unique([...(prev._source_pages||[prev.page]),...(r._source_pages||[r.page])]);
 }
 const rows=[...dedup.values()],specs=rows.filter(r=>r['spec type']==='AC'&&r.unit==='MHz'&&typeof r.max==='number'),absorbed=new Set();
 for(const c of rows.filter(r=>r['spec type']==='Command'&&r.unit==='MHz')){
  const matches=specs.filter(s=>sameFrequencyScope(s,c));if(!matches.length)continue;
  const s=matches[0];
  if(matches.length===1&&s.max===c.max&&!s._merge_conflict){
   s._command_sources=unique([...s._command_sources,...c._command_sources]);
   s._commands=unique([s._commands,summarize(c._command_sources)]).join('；');
   s.description=unique([s.description,[`${c.parameter}:`,c._io?`IO=${c._io}`:'',c.description].filter(Boolean).join(' ')]).join('; ');
   if(c._io&&!s._io)s.condition=[s.condition,`IO=${c._io}`].filter(Boolean).join('; ');
   s._io=c._io;absorbed.add(c);continue;
  }
  const reason=matches.length>1?'相同指令與條件對應到多筆 AC 頻率，未自動合併。':s._merge_conflict&&s.max===c.max?s._merge_conflict:`相同指令與條件的頻率不一致：AC ${s.max} MHz、指令表 ${c.max} MHz，未自動合併。`;
  for(const r of [...matches,c]){r._merge_conflict=unique([r._merge_conflict,reason]).join('；');r._status='review';}
 }
 return combineStartingAddresses(rows.filter(r=>!absorbed.has(r)));
}

// Explicit rules: parameter wording -> command wording. Ordered; first match wins.
export const COMMAND_RULES=[
 {parameter:/Page Program Time/i,command:/\bPage Program\b/i},
 {parameter:/Sector Erase Time \(4\s*KB\)|4\s*KB Sector Erase/i,command:c=>/Erase/i.test(c)&&(/\b4\s*KB\b/i.test(c)||(/Sector Erase/i.test(c)&&!/\d+\s*KB/i.test(c)))},
 {parameter:/Block Erase Time \(32\s*KB\)|32\s*KB Block Erase/i,command:c=>/Erase/i.test(c)&&/\b32\s*KB\b/i.test(c)},
 {parameter:/Block Erase Time \(64\s*KB\)|64\s*KB Block Erase/i,command:c=>/Erase/i.test(c)&&/\b64\s*KB\b/i.test(c)},
 {parameter:/Chip Erase Time/i,command:/^(?:Chip|Bulk) Erase\b/i},
 {parameter:/Write Status Register Time/i,command:/^Write Status Register/i},
 {parameter:/Write Non-Volatile Register Time/i,command:/^Write Non-Volatile/i},
 {parameter:/Power-?down Mode$/i,command:/^(?:Enter )?(?:Deep )?Power[- ]?down$/i},
 {parameter:/Release Power-?down/i,command:/^(?:Release|Exit) (?:from )?(?:Deep )?Power[- ]?down/i},
 {parameter:/Lock Register Program Time/i,command:/^Write Non-Volatile Lock Register/i},
 {parameter:/Suspend|Resume/i,command:/Suspend|Resume/i},
 {parameter:/after (?:Software\/Hardware )?Reset$|after Reset\b/i,command:/^(?:Enable Reset|Reset Device|Reset)$/i},
];
const unique=xs=>[...new Set(xs.filter(Boolean))];
function summarize(list){
 const by=new Map();for(const c of list){const k=c.opcode+'|'+c.command;if(!by.has(k))by.set(k,{...c,modes:[]});by.get(k).modes.push(c.mode);}
 return [...by.values()].map(c=>{const m=unique(c.modes);return `${c.opcode} ${c.command}${m.length?`（${m.join(', ')}）`:''}`;}).join('；');
}
export {summarize as summarizeCommands};
export function linkCommands(rows,commands){
 const main=commands.filter(c=>!c.setting);
 for(const r of rows){
  if(r._opcode)continue;
  const named=unique((r.parameter.match(/\(([0-9A-F]{2}h(?:\s*\/\s*[0-9A-F]{2}h)*)\)/gi)||[]).flatMap(m=>m.match(/[0-9A-F]{2}h/gi).map(x=>x.toUpperCase().replace(/H$/,'h'))));
  if(named.length){const hit=main.filter(c=>named.some(o=>c.opcode.toUpperCase().replace(/H/g,'h').split(/[^0-9A-Fa-fh]+/).includes(o)));
   r._commands=hit.length?summarize(hit):named.join(', ');r._command_basis='原文標示 opcode';continue;}
  const rule=COMMAND_RULES.find(x=>x.parameter.test(r.parameter));if(!rule)continue;
  const test=typeof rule.command==='function'?rule.command:c=>rule.command.test(c);
  const hit=main.filter(c=>test(c.command));
  if(hit.length){r._commands=summarize(hit);r._command_basis='名稱規則對應';}
 }
 return rows;
}

const commandKey=c=>JSON.stringify([c.mode,c.command,c.opcode,c.setting].map(identityText));
export function compareCommands(newer,older){
 const old=new Map();for(const c of older){const k=commandKey(c);old.set(k,[...(old.get(k)||[]),c]);}
 const seen=new Map();for(const c of newer){const k=commandKey(c);seen.set(k,(seen.get(k)||0)+1);}
 const out=newer.map(c=>{const k=commandKey(c),prev=old.get(k);
  if(seen.get(k)>1||(prev?.length||0)>1)return {...c,_status:'review',_changes:{}};
  if(!prev)return {...c,_status:'added',_changes:{}};
  const changes={},bare=x=>clean(x).replace(/\s+/g,'');for(const f of ['address','dummy','data','extra'])if(bare(c[f])!==bare(prev[0][f]))changes[f]={old:prev[0][f],new:c[f]};
  return {...c,_old_page:prev[0].page,_status:Object.keys(changes).length?'changed':'unchanged',_changes:changes};});
 return [...out,...older.filter(c=>!seen.has(commandKey(c))).map(c=>({...c,_status:'removed',_changes:{}}))];
}
