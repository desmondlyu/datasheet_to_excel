import {clean,productsFromText} from './spec-core.mjs';
import {textItems,linesOfText,textIn,rulingLines,findCells,groupTables} from './geometry.mjs';
import {normalizeTable,normalizeFrequency} from './normalize.mjs';
import {getPageTextContent} from './pdf-text.mjs';
import {mayHoldCommands,isCommandTable,parseCommandTable,linkCommands,commandSpecRows,consolidateSpecs} from './commands.mjs';
import {parseReadParameterTable,supplementReadSpecs} from './read-specs.mjs';

export async function parsePdf(pdfjs,data,{pages=[],onProgress=()=>{}}={}){
 if(data.byteLength>50*1024*1024)throw Error('每份 PDF 上限為 50 MB。');
 const task=pdfjs.getDocument({data:new Uint8Array(data),isEvalSupported:false,useSystemFonts:true,disableFontFace:true,stopAtErrors:true});
 task.onPassword=()=>task.destroy();
 let doc;
 try{doc=await task.promise;}catch(e){if(/password|destroyed/i.test(e.message))throw Error('PDF 可能受密碼保護，請先解除保護後再試。');throw Error('無法讀取 PDF，請確認檔案完整且為有效的 PDF。');}
 try{
  if(doc.numPages>600)throw Error('目前每份 PDF 上限為 600 頁。');
  if(pages.some(n=>n>doc.numPages))throw Error(`頁碼超出範圍，這份 PDF 共 ${doc.numPages} 頁。`);
  const pageInfo=[];let inChapter=false,label='Electrical Characteristics';
  for(let n=1;n<=doc.numPages;n++){
   onProgress({stage:'text',current:n,total:doc.numPages});
   const page=await doc.getPage(n),viewport=page.getViewport({scale:1}),items=textItems(await getPageTextContent(page),viewport),lines=linesOfText(items),text=lines.map(l=>l.text).join('\n');
   const topLines=lines.filter(l=>l.y<180&&!/\.{3}|…/.test(l.text));
   const title=l=>l.text.replace(/^\d+(?:\.\d+)*(?:\.\s*|\s+)/,'');
   const electrical=/^(?:(?:DC|AC|D\.C\.|A\.C\.)\s+)?Electrical Characteristics\b/i;
   const section=/^(?:(?:DC|AC|D\.C\.|A\.C\.)\s+(?:Electrical Characteristics|Measurement Conditions)|IO Capacitance|Absolute Maximum Ratings|Operating Ranges|Recommended Operating|Power[- ]up|Program.*(?:Erase|Timing)|Erase.*Timing|Serial.*Frequency)/i;
   const end=/^(?:PACKAGE|PACKAGING|ORDERING|REVISION HISTORY|REVISION TABLE|IMPORTANT NOTICE)\b/i;
   for(const l of topLines){
    const t=title(l);
    if(end.test(t)){inChapter=false;label=t;break;}
    if(electrical.test(t)){inChapter=true;if(!/cont[’']?d|continued/i.test(t)||!electrical.test(label))label=t;}
    else if(section.test(t)){label=t;}
    else if(/^\d+\s+[A-Z][A-Z /-]+$/.test(l.text)){inChapter=false;label=t;}
    else if(/^[1-9]\d*\.\d+\.?\s+[A-Z/]/.test(l.text))label=t;
   }
   const footer=lines.find(l=>l.y>viewport.height-90&&/^-\s*\d+\s*-/.test(l.text));
   pageInfo.push({n,page,viewport,items,lines,text,label,inChapter,printed:footer?Number(footer.text.match(/^-\s*(\d+)/)[1]):n});
  }
  const intro=pageInfo.slice(0,2).map(p=>p.text).join('\n');
  const headerProducts=productsFromText(pageInfo.slice(0,2).flatMap(p=>p.lines.filter(l=>l.y<100).map(l=>l.text)).join(' '));
  const defaults=headerProducts.length?headerProducts:productsFromText(intro,['未辨識產品']);
  let selected=pages.length?pageInfo.filter(p=>pages.includes(p.n)):pageInfo.filter(p=>p.inChapter);
  if(!selected.length&&!pages.length){selected=pageInfo.filter(p=>/(DC|AC) Electrical|AC Measurement|Program and Erase Timing/i.test(p.label));}
  if(!selected.length&&!pages.length)selected=pageInfo.filter(p=>/\b(?:PARAMETER|DESCRIPTION)\b/i.test(p.text)&&/\bSYMBOL\b/i.test(p.text)&&/\b(?:MIN|TYP|MAX)\b/i.test(p.text));
  if(!selected.length)throw Error(pageInfo.some(p=>p.text.trim())?'已讀取 PDF 文字，但找不到可辨識的電性規格章節或表格。請指定 PDF 實際頁次。':'PDF 未包含可擷取的文字；若為掃描圖片，請先經過文字辨識。');
  const rows=[],review=[],sources=[];
  if(defaults.includes('未辨識產品'))review.push({page:1,pdf_page:1,table:0,section:'產品辨識',reason:'無法可靠辨識產品名稱，請核對原文。',raw:[[intro]]});
  for(let j=0;j<selected.length;j++){
   const p=selected[j];onProgress({stage:'tables',current:j+1,total:selected.length});
   const ops=await p.page.getOperatorList(),tables=groupTables(findCells(rulingLines(ops,pdfjs.OPS,p.viewport)));
   const kind=specKind(p.label);
   const pageProducts=productsFromText(p.lines.filter(l=>l.y<85).map(l=>l.text).join(' '),defaults);
   sources.push({page:p.printed,pdf_page:p.n,section:p.label,text:p.text});
   for(let t=0;t<tables.length;t++){
    const table=tables[t],near=p.lines.filter(l=>l.y<table.bbox[1]&&l.y>table.bbox[1]-45).map(l=>l.text).join(' ');
    const tableLabel=near.match(/(?:DC Electrical|AC Electrical|AC Measurement|IO Capacitance|Program.*Erase)/i)?near:p.label;
    const meta={page:p.printed,pdfPage:p.n,kind:specKind(tableLabel)||kind,section:p.label+' | '+near,table:t+1,notes:p.text.includes('Notes:')?p.text.split('Notes:').slice(1).join('Notes:'):''};
    const parsed=normalizeTable(table,p.items,pageProducts,meta);let got=parsed.rows;
    if(!got.length)got=normalizeFrequency(table,p.items,pageProducts,{...meta,kind:'AC'});
    rows.push(...got);
    if((!got.length&&textIn(p.items,table.bbox).trim())||parsed.unparsed.length){review.push({page:p.printed,pdf_page:p.n,table:t+1,section:p.label,reason:!got.length?'未能可靠轉成固定欄位，請核對原表。':'部分規格未能辨識限制值，已保留原文。',raw:parsed.unparsed.length?parsed.unparsed:[[textIn(p.items,table.bbox)]]});}
   }
   if(!tables.length&&/\b(PARAMETER|SYMBOL|DESCRIPTION)\b/i.test(p.text))review.push({page:p.printed,pdf_page:p.n,table:0,section:p.label,reason:'找不到可重建的表格線；請核對來源文字。',raw:[[p.text]]});
  }
  for(const r of rows){
   if(!r._notes){const s=pageInfo.find(p=>p.n>=r._pdf_page&&p.label===r._section.split(' | ')[0]&&p.text.includes('Notes:'));if(s)r._notes=s.text.split('Notes:').slice(1).join('Notes:');}
   r._notes=(r._notes||'').split(/\n\s*[1-9]\d*\.\d+\s+/)[0].split('Publication Release Date:')[0];
   if(r.condition.includes('Factory Mode')){const v=r._notes.match(/Factory mode[\s\S]*?VCC range from ([0-9.]+V\s+to\s+[0-9.]+V)/i);if(v)r.condition+='; VCC = '+clean(v[1]);}
  }
  if(!rows.length&&!sources.some(s=>s.text.trim()))throw Error('未找到可擷取的文字，請確認 PDF 可選取文字，或指定規格頁的實際頁次。');
  if(!rows.length&&!review.length)review.push({page:selected[0].printed,pdf_page:selected[0].n,table:0,section:selected[0].label,reason:'所選頁面未找到可標準化表格，請核對 Source 工作表。',raw:[['完整原文已保留於 Source。']]});
  const commands=[],state={},candidates=pageInfo.filter(p=>mayHoldCommands(p.text));
  // Command tables are supplementary: a failure here must not block the spec export.
  try{for(let j=0;j<candidates.length;j++){
   const p=candidates[j];onProgress({stage:'tables',current:j+1,total:candidates.length});
   const tables=groupTables(findCells(rulingLines(await p.page.getOperatorList(),pdfjs.OPS,p.viewport)));
   for(let t=0;t<tables.length;t++){
    const table=tables[t];if(!isCommandTable(table,p.items))continue;
    const heading=p.lines.filter(l=>l.y<table.bbox[1]&&l.text.length<100&&(/^[1-9]\d*(?:\.\d+)+\.?\s+[A-Z]/.test(l.text)||/\b(?:Command|Instruction) Set Table\b/i.test(l.text))).pop();
    if(heading)state.section=heading.text;
    const section=state.section||p.label;
    const parsed=parseCommandTable(table,p.items,{page:p.printed,pdfPage:p.n,section},state);
    commands.push(...parsed.rows);
    if(parsed.unparsed.length)review.push({page:p.printed,pdf_page:p.n,table:t+1,section:'指令表 / '+section,reason:'指令表部分列未能辨識，已保留原文。',raw:parsed.unparsed});
   }
  }}catch(e){commands.length=0;review.push({page:'',pdf_page:'',table:0,section:'指令表',reason:'指令表解析失敗，已略過（規格擷取不受影響）。',raw:[[e.message||String(e)]]});}
  // Keep the byte/clock evidence and following notes available for manual verification.
  for(const n of new Set(commands.map(c=>c.pdf_page))){
   const p=pageInfo[n-1],next=pageInfo[n];
   for(const source of [p,...(next?.lines.some(l=>l.y<180&&/^Notes?:\s*$/i.test(l.text))?[next]:[])]){
    if(!sources.some(s=>s.pdf_page===source.n))sources.push({page:source.printed,pdf_page:source.n,section:'指令表 / '+(source===p?commands.find(c=>c.pdf_page===n).section:'Notes'),text:source.text});
   }
  }
  linkCommands(rows,commands);
  const configurations=[],configurationScopes=[];
  // Multi-column page text interleaves header words; validate the actual cells below.
  for(const p of pageInfo.filter(p=>/DUMMY/i.test(p.text)&&/CLOCKS/i.test(p.text)&&/MAX(?:IMUM|\.)/i.test(p.text)&&/FREQ/i.test(p.text))){
   const tables=groupTables(findCells(rulingLines(await p.page.getOperatorList(),pdfjs.OPS,p.viewport)));
   for(let t=0;t<tables.length;t++){
    const parsed=parseReadParameterTable(tables[t],p.items,{page:p.printed,pdfPage:p.n,section:p.label,text:p.text,previousText:pageInfo[p.n-2]?.text||''});
    if(!parsed)continue;
    configurations.push(...parsed.records);
    configurationScopes.push(...parsed.scopes);
    if(!sources.some(s=>s.pdf_page===p.n))sources.push({page:p.printed,pdf_page:p.n,section:'Read parameter table / '+p.label,text:p.text});
    if(parsed.unparsed.length)review.push({page:p.printed,pdf_page:p.n,table:t+1,section:'Read parameter table / '+p.label,reason:'設定表部分資料無法可靠對應，已保留原文。',raw:parsed.unparsed});
   }
  }
  const supplemental=supplementReadSpecs(consolidateSpecs([...rows,...commandSpecRows(commands,defaults)]),commands,configurations,pageInfo,configurationScopes),consolidated=supplemental.rows;
  review.push(...supplemental.review);
  for(const n of supplemental.usedPages){const p=pageInfo[n-1];if(p&&!sources.some(s=>s.pdf_page===n))sources.push({page:p.printed,pdf_page:n,section:'Read frequency source / '+p.label,text:p.text});}
  for(const r of consolidated.filter(r=>r._merge_conflict&&!r._read_origin))review.push({page:r.page,pdf_page:r._pdf_page,table:r._table||0,section:'規格與指令頻率核對',reason:r._merge_conflict,raw:[[r['產品名稱'],r._opcode,r.condition,r._merge_conflict]]});
  return {rows:consolidated,review,sources,commands,command_pages:[...new Set(commands.map(c=>c.pdf_page))],products:[...new Set(consolidated.map(r=>r['產品名稱']))].sort()};
 }finally{await task.destroy();}
}

function specKind(label){return /(?:DC|D\.C\.)\s+Electrical/i.test(label)?'DC':/\b(?:AC|A\.C\.)\s+(?:Electrical|Measurement)|Program.*(?:Erase|Timing)|Erase.*Timing/i.test(label)?'AC':'Other';}
