import {clean,productsFromText} from './spec-core.mjs';
import {textItems,linesOfText,textIn,rulingLines,findCells,groupTables} from './geometry.mjs';
import {normalizeTable,normalizeFrequency} from './normalize.mjs';

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
   const page=await doc.getPage(n),viewport=page.getViewport({scale:1}),items=textItems(await page.getTextContent(),viewport),lines=linesOfText(items),text=lines.map(l=>l.text).join('\n');
   const main=lines.find(l=>l.y<150&&/^\d+\s+[A-Z][A-Z /-]+$/.test(l.text)&&!l.text.includes('...'));
   if(main)inChapter=/ELECTRICAL CHARACTERISTICS/i.test(main.text);
   const heading=lines.filter(l=>l.y<160&&/^[1-9]\d*\.\d+\.?\s+[A-Z/]/.test(l.text)&&!l.text.includes('...'));
   if(heading.length)label=heading[heading.length-1].text.replace(/^[\d.]+\s+/,'');
   const footer=lines.find(l=>l.y>viewport.height-90&&/^-\s*\d+\s*-/.test(l.text));
   pageInfo.push({n,page,viewport,items,lines,text,label,inChapter,printed:footer?Number(footer.text.match(/^-\s*(\d+)/)[1]):n});
  }
  const intro=pageInfo.slice(0,2).map(p=>p.text).join('\n'),defaults=productsFromText(intro,['未辨識產品']);
  let selected=pages.length?pageInfo.filter(p=>pages.includes(p.n)):pageInfo.filter(p=>p.inChapter);
  if(!selected.length&&!pages.length){selected=pageInfo.filter(p=>/(DC|AC) Electrical|AC Measurement|Program and Erase Timing/i.test(p.label));}
  if(!selected.length)throw Error('找不到電性規格章節。請指定 PDF 實際頁次；掃描圖片需要先經過文字辨識。');
  const rows=[],review=[],sources=[];
  for(let j=0;j<selected.length;j++){
   const p=selected[j];onProgress({stage:'tables',current:j+1,total:selected.length});
   const ops=await p.page.getOperatorList(),tables=groupTables(findCells(rulingLines(ops,pdfjs.OPS,p.viewport)));
   const kind=/DC Electrical/i.test(p.label)?'DC':/^AC\b/i.test(p.label)?'AC':'Other';
   sources.push({page:p.printed,pdf_page:p.n,section:p.label,text:p.text});
   for(let t=0;t<tables.length;t++){
    const table=tables[t],near=p.lines.filter(l=>l.y<table.bbox[1]&&l.y>table.bbox[1]-45).map(l=>l.text).join(' ');
    const meta={page:p.printed,pdfPage:p.n,kind,section:p.label+' | '+near,table:t+1,notes:p.text.includes('Notes:')?p.text.split('Notes:').slice(1).join('Notes:'):''};
    const parsed=normalizeTable(table,p.items,defaults,meta);let got=parsed.rows;
    if(!got.length)got=normalizeFrequency(table,p.items,defaults,{...meta,kind:'AC'});
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
  return {rows,review,sources,products:[...new Set(rows.map(r=>r['產品名稱']))].sort()};
 }finally{await task.destroy();}
}
