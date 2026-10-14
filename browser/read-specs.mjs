// Supplementary read-frequency evidence. Explicit instruction tables remain authoritative.
import {clean,interfaceMode,stripNumericNotes,stripDummyNotes} from './spec-core.mjs';
import {textIn,linesOfText} from './geometry.mjs';
import {summarizeCommands} from './commands.mjs';

const codes=text=>[...new Set([...String(text).matchAll(/\b([0-9a-f]{2})h?\b/gi)].map(m=>m[1].toUpperCase()+'h'))];
const nameKey=text=>clean(text).replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
const isRead=c=>!/^Set\b/i.test(c.command)&&/\bread\b|(?:device|JEDEC|unique)\s*ID\b/i.test(c.command);
const modeOf=c=>interfaceMode(c.mode,c.section);
const groupKind=r=>{
 if(!r||r['spec type']!=='AC'||r.unit!=='MHz'||!/^Clock frequency/i.test(r.parameter))return '';
 if(/Read Data.*\d+\s+dummy/i.test(r.parameter))return 'dummy';
 if(/except.*Read Data.*DTR/i.test(r.parameter))return 'except';
 if(/DTR instructions/i.test(r.parameter))return 'dtr';
 if(/Read Data instruction\s*\([0-9a-f]{2}h\)/i.test(r.parameter))return 'read-data';
 return '';
};

export function parseReadParameterTable(table,items,meta){
 const text=c=>clean(textIn(items,c)),headers=table.cells.filter(c=>c[1]<table.bbox[1]+65).sort((a,b)=>(a[2]-a[0])-(b[2]-b[0]));
 const dummy=headers.find(c=>/DUMMY\s+CLOCKS/i.test(text(c)));
 const frequency=headers.find(c=>/MAX(?:IMUM|\.)?\s+READ\s+FREQ/i.test(text(c)));
 const parameter=headers.find(c=>/P\d\s*(?:[-–]\s*P\d|P\d)/i.test(text(c)));
 if(!dummy||!frequency||!parameter||dummy===frequency||parameter===dummy||parameter===frequency)return null;
 const header=[text(parameter),text(dummy),text(frequency)].join(' | '),mode=(/\bQPI\b/i.test(header)?'QPI':/\bSPI\b/i.test(header)?'SPI':'')+(/\bDTR\b/i.test(header)?'_DTR':'');
 const bitNumbers=[...text(parameter).matchAll(/P(\d)/gi)].map(m=>+m[1]),bits=bitNumbers.length>1?Math.abs(bitNumbers[0]-bitNumbers[bitNumbers.length-1])+1:0;
 let targetCodes=codes(header.replace(/P\d/g,''));
 if(!targetCodes.length&&mode==='QPI'){
  const binding=[...(meta.text+'\n'+(meta.previousText||'')).matchAll(/(?:^|\n)\s*-?\s*QPI\s+mode\s*:\s*([^\n]+)/gi)].find(m=>/dummy|Fast Read/i.test(m[1]));
  if(binding)targetCodes=codes(binding[1]);
 }
 const note=linesOfText(items).filter(l=>l.y>table.bbox[3]&&l.y<table.bbox[3]+42&&/^Note:/i.test(l.text)).map(l=>l.text).join(' ');
 const top=Math.max(parameter[3],dummy[3],frequency[3]);
 const ys=[...new Set(table.cells.filter(c=>c[1]>=top-1&&c[0]>=parameter[0]-1&&c[2]<=parameter[2]+1).map(c=>Math.round(c[1]*10)/10))].sort((a,b)=>a-b);
 const records=[],unparsed=[];
 for(let i=0;i<ys.length;i++){
  const lo=ys[i],hi=ys[i+1]??table.bbox[3];
  const value=c=>textIn(items,[c[0],lo,c[2],hi]);
  const setting=value(parameter).replace(/\s+/g,''),rawDummy=value(dummy),rawFrequency=value(frequency);
  const d=clean(stripDummyNotes(rawDummy)).replace(/\(\s*default\s*\)/gi,'').trim();
  const f=clean(stripNumericNotes(rawFrequency)).match(/^(\d+(?:\.\d+)?)\s*MHz(\*)?$/i);
  if(!bits||!new RegExp(`^[01]{${bits}}$`).test(setting)||!/^\d+$/.test(d)||!f||!targetCodes.length||!mode){unparsed.push([setting,rawDummy,rawFrequency,'無法可靠對應設定表的指令、模式或數值。']);continue;}
  records.push({codes:targetCodes,mode,setting:`P${bitNumbers[0]}-P${bitNumbers[bitNumbers.length-1]} = ${setting}`,dummy:+d,max:+f[1],start:/4-byte alignment/i.test(note)?'Aligned':'',note,
   raw:`${header}; ${setting}; Dummy=${rawDummy}; Maximum Read Frequency=${rawFrequency}; ${note}`,page:meta.page,pdfPage:meta.pdfPage,section:meta.section});
 }
 const duplicate=new Set();for(const r of records){if(records.filter(x=>x.setting===r.setting).length>1)duplicate.add(r.setting);}
 for(const r of records)if(duplicate.has(r.setting))r.conflict=`原始設定表重複 ${r.setting}，請核對；未推定缺少的設定。`;
 return {records,unparsed,scopes:[{codes:targetCodes,mode,unresolved:unparsed.length>0}]};
}

export function supplementReadSpecs(rows,commands,configurations,pageInfo,scopes=[]){
 rows=supplementOctalReads(rows,commands);
 const groups=rows.filter(r=>groupKind(r)),review=[],usedPages=new Set();
 if(!groups.length)return {rows,review,usedPages};
 const references=[];
 for(const p of pageInfo){
  for(const m of p.text.matchAll(/\bThe\s+([A-Za-z][A-Za-z /-]{1,70}?)\s+instruction\s+allows\s+clock\s+rates\s+from\s+D\.?\s*C\.?\s+to\s+a\s+maximum\s+of\s+(f\s*R|F\s*R)\b/g))references.push({name:nameKey(m[1]),symbol:m[2].replace(/\s/g,''),page:p.n,printed:p.printed});
 }
 const explicit=new Set(rows.filter(r=>r.unit==='MHz').flatMap(r=>r._command_sources||[]));
 const protectedCommand=c=>/\bMHz\b/i.test(c.extra||'')||explicit.has(c);
 const unresolvedCommand=c=>scopes.some(s=>s.unresolved&&(!s.mode||s.mode===modeOf(c))&&(!s.codes.length||s.codes.some(code=>codes(c.opcode).includes(code))));
 const baseCodes=new Set(groups.filter(r=>groupKind(r)==='read-data').flatMap(r=>codes(r.parameter)));
 const referenceFor=c=>references.find(x=>x.name===nameKey(c.command));
 const groupFor=(product,c,dummy)=>{
  const available=groups.filter(r=>r['產品名稱']===product),mode=modeOf(c);
  if(/DTR|DDR/i.test(mode))return available.find(r=>groupKind(r)==='dtr');
  const reference=referenceFor(c);
  if(reference){const hit=available.find(r=>r.symbol===reference.symbol&&groupKind(r)!=='dummy');if(hit)return hit;}
  if(dummy!==undefined){const hit=available.find(r=>groupKind(r)==='dummy'&&+r.parameter.match(/(\d+)\s+dummy/i)?.[1]===dummy);if(hit)return hit;}
  return available.find(r=>groupKind(r)===(codes(c.opcode).some(code=>baseCodes.has(code))?'read-data':'except'));
 };
 const configFor=c=>configurations.filter(x=>x.mode===modeOf(c)&&x.codes.some(code=>codes(c.opcode).includes(code)));
 const annotate=(r,g,c,origin)=>{
  const kind=groupKind(g),use=/^(?:DTR\s+)?(?:Fast Read|Read Data|Burst Read|Read with Wrap)/i.test(c.command)?'Main Array':'Other Read';
  const source=`AC read group: ${g.parameter} (page ${g.page})`;
  return {...r,'spec type':'AC',symbol:g.symbol,typ:g.typ,min:g.min,unit:g.unit,_read_group:kind,_read_origin:origin,
   description:[r.description,source,`Read use: ${use}`].filter(Boolean).join('; '),_source_pages:[...new Set([r.page,g.page])],_source_conditions:[r.condition,g.condition]};
 };
 const output=[];
 for(const row of rows){
  if(groupKind(row)){
   const kind=groupKind(row),dummy=kind==='dummy'?+row.parameter.match(/(\d+)\s+dummy/i)?.[1]:undefined;
   const eligible=commands.filter(isRead).filter(c=>!protectedCommand(c)&&!unresolvedCommand(c)).filter(c=>{
    if(kind==='dummy')return configFor(c).some(x=>x.dummy===dummy&&!/DTR/.test(x.mode));
    return groupKind(groupFor(row['產品名稱'],c))===kind;
   });
   output.push({...row,_read_group:kind,_commands:summarizeCommands(eligible),_command_basis:'AC read group'});continue;
  }
  const c=row['spec type']==='Command'&&row._command_sources?.[0];
  if(!c||!isRead(c)||protectedCommand(c)){output.push(row);continue;}
  const config=configFor(c);
  if(config.length){
   const before=output.length;
   for(const x of config){
    const g=groupFor(row['產品名稱'],c,x.dummy);if(!g)continue;
    const condition=[row.condition,x.setting,`Dummy=${x.dummy}`,x.start?`Starting Address: ${x.start}`:'',x.note].filter(Boolean).join('; ');
    const r=annotate({...row,condition,max:x.max,page:x.page,_pdf_page:x.pdfPage,_section:x.section,_dummy:x.dummy,_start:x.start,_setting:x.setting,description:[row.description,x.raw].filter(Boolean).join('; ')},g,c,'parameter-table');
    if(x.conflict){r._merge_conflict=x.conflict;r._status='review';}
    r._source_pages=[...new Set([...r._source_pages,row.page])];
    output.push(r);usedPages.add(x.pdfPage);
   }
   if(output.length===before)output.push(row);
  }else{
   if(unresolvedCommand(c)){output.push(row);continue;}
   const g=groupFor(row['產品名稱'],c);if(!g){output.push(row);continue;}
   const r=annotate({...row,max:g.max},g,c,'read-group'),ref=referenceFor(c);
   if(ref){usedPages.add(ref.page);r.description+=`; Explicit frequency symbol: ${ref.symbol} (page ${ref.printed})`;}
   output.push(r);usedPages.add(g._pdf_page);
  }
 }
 // A code present only in the settings table is evidence, not a verified instruction definition.
 for(const x of configurations)for(const code of x.codes){
  if(commands.some(c=>modeOf(c)===x.mode&&codes(c.opcode).includes(code)))continue;
  for(const product of new Set(groups.map(g=>g['產品名稱']))){
   const c={command:'Read command (settings table only)',opcode:code,mode:x.mode,section:x.section};const g=groupFor(product,c,x.dummy);if(!g)continue;
   const reason=`設定表列出 ${code}，指令總表未找到對應定義，Address 等欄位未推定。`;
   const r=annotate({'產品名稱':product,parameter:c.command,condition:`opcode=${code}; ${x.mode}; ${x.setting}; Dummy=${x.dummy}${x.start?`; Starting Address: ${x.start}`:''}`,max:x.max,page:x.page,_pdf_page:x.pdfPage,_section:x.section,_opcode:code,_mode:x.mode,_dummy:x.dummy,_start:x.start,_setting:x.setting,_commands:`${code} ${c.command}`,description:x.raw,_status:'review',_merge_conflict:reason},g,c,'parameter-table');
   output.push(r);usedPages.add(x.pdfPage);
  }
 }
 for(const r of output.filter(r=>r._read_origin&&r._merge_conflict))review.push({page:r.page,pdf_page:r._pdf_page,table:0,section:'Read frequency / '+r._section,reason:r._merge_conflict,raw:[[r._opcode,r.condition,r.description]]});
 return {rows:output,review,usedPages};
}

// Octal instruction tables state the command-phase protocol separately from data timing.
// In particular, 1-1d-8d belongs to SDR mode; only an 8d command phase selects DDR.
function supplementOctalReads(rows,commands){
 if(!commands.some(c=>/(?:^|[；;])\s*8d-/i.test(c.mode)))return rows;
 const protocol=raw=>/^1-[^-\s]+-[^\s（(]+(?:\s*[（(][^）)]*[）)])?$/i.test(raw)?'SDR':/^8d-[^-\s]+-[^\s（(]+(?:\s*[（(][^）)]*[）)])?$/i.test(raw)?'DDR':'';
 const variants=c=>String(c.mode||'').split(/[；;]/).map(clean).map(raw=>({raw,mode:protocol(raw)})).filter(v=>v.mode);
 const groupMode=r=>clean(r.condition).match(/^(SDR|DDR|ODDR)(?:\s*;|$)/i)?.[1]?.toUpperCase().replace('ODDR','DDR');
 const kind=r=>r['spec type']==='AC'&&r.unit==='MHz'&&groupMode(r)?(/^Clock frequency except for Read\s*$/i.test(r.parameter)?'octal-except':/^Clock frequency for Read\s*\([0-9a-fh/\s]+\)/i.test(r.parameter)?'octal-read':''):'';
 const groups=rows.filter(r=>kind(r));if(!groups.length)return rows;
 const explicit=new Set(rows.filter(r=>r.unit==='MHz').flatMap(r=>r._command_sources||[]));
 const protectedCommand=c=>explicit.has(c)||/\bMHz\b/i.test(c.extra||'');
 const specificCodes=product=>groups.filter(g=>g['產品名稱']===product&&kind(g)==='octal-read').flatMap(g=>codes(g.parameter));
 const matches=(g,c,v)=>groupMode(g)===v.mode&&(kind(g)==='octal-read'?codes(g.parameter).some(code=>codes(c.opcode).includes(code)):!specificCodes(g['產品名稱']).some(code=>codes(c.opcode).includes(code)));
 return rows.flatMap(row=>{
  if(kind(row)){
   const eligible=commands.filter(isRead).filter(c=>!protectedCommand(c)).flatMap(c=>variants(c).filter(v=>matches(row,c,v)).map(v=>({...c,mode:v.raw})));
   return [{...row,_mode:groupMode(row),_read_group:kind(row),_commands:summarizeCommands(eligible),_command_basis:'Octal AC read group'}];
  }
  const c=row['spec type']==='Command'&&row._command_sources?.[0];
  if(!c||protectedCommand(c)||!groups.some(g=>g['產品名稱']===row['產品名稱']))return [row];
  const modes=variants(c);if(!modes.length)return [row];
  const forMode=v=>({...row,_mode:v.mode||v.raw,_io:v.raw,condition:row.condition.replace(`IO=${c.mode}`,`IO=${v.raw}`)});
  const applicable=isRead(c)?groups.filter(g=>g['產品名稱']===row['產品名稱']).flatMap(g=>modes.filter(v=>matches(g,c,v)).map(v=>({g,v}))):[];
  const enriched=applicable.map(({g,v})=>({...forMode(v),'spec type':'AC',unit:g.unit,max:g.max,typ:g.typ,min:g.min,symbol:g.symbol,
   condition:[forMode(v).condition,g.condition].filter(Boolean).join('; '),description:[row.description,g.description,`AC read group: ${g.parameter} (page ${g.page})`].filter(Boolean).join('; '),
   page:g.page,_pdf_page:g._pdf_page,_section:g._section,_notes:g._notes,_read_group:kind(g),_read_origin:'octal-read-group',_source_pages:[row.page,g.page],_source_conditions:[row.condition,g.condition]}));
  // Missing or unrecognized mode-specific AC evidence never removes the inventory row.
  const unknown=String(c.mode||'').split(/[；;]/).map(clean).filter(raw=>raw&&!protocol(raw)).map(raw=>({raw,mode:''}));
  return [...enriched,...modes.filter(v=>!applicable.some(a=>a.v===v)).map(forMode),...unknown.map(forMode)];
 });
}
