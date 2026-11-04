import './array-compat.mjs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import {extractNarrative,pairSections} from './text-diff.mjs';
import {BUILD_ID} from './diagnostics.mjs';
globalThis.pdfjsWorker={WorkerMessageHandler};
self.onmessage=async({data})=>{let lastProgress=null;try{
 const progress=label=>p=>{lastProgress={label,...p};self.postMessage({type:'progress',...lastProgress});};
 const newDoc=await extractNarrative(pdfjs,data.newData,{onProgress:progress('新版')});
 const oldDoc=await extractNarrative(pdfjs,data.oldData,{onProgress:progress('舊版')});
 self.postMessage({type:'result',result:{newDoc,oldDoc,pairing:pairSections(oldDoc.sections,newDoc.sections),filename:data.filename,oldFilename:data.oldFilename}});
}catch(e){self.postMessage({type:'error',name:e.name,message:e.message||'文字比對失敗，請確認 PDF 格式。',stack:e.stack,progress:lastProgress,build:BUILD_ID});}};
