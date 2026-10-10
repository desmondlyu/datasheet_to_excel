import './array-compat.mjs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import {parsePdf} from './pdf-parser.mjs';
import {COLUMNS,compareRows} from './spec-core.mjs';
// Run PDF.js inside this application worker, with the same compatibility shims.
globalThis.pdfjsWorker={WorkerMessageHandler};
self.onmessage=async({data})=>{try{
 const progress=label=>p=>self.postMessage({type:'progress',label,...p});
 const result=await parsePdf(pdfjs,data.newData,{pages:data.pages,onProgress:progress('新版')});
 if(data.oldData){const old=await parsePdf(pdfjs,data.oldData,{pages:data.oldPages,onProgress:progress('舊版')});result.rows=compareRows(result.rows,old.rows);result.sources.push(...old.sources.map(s=>({...s,section:'舊版 / '+s.section})));result.review.push(...old.review.map(s=>({...s,section:'舊版 / '+s.section})));result.products=[...new Set(result.rows.map(r=>r['產品名稱']))].sort();}
 self.postMessage({type:'result',result:{...result,columns:COLUMNS,filename:data.filename,old_filename:data.oldFilename,compared:!!data.oldData}});
 }catch(e){self.postMessage({type:'error',message:e.message||'解析失敗，請確認 PDF 格式。'});}};
