import {parsePageInput} from './spec-core.mjs';
import {COMPARE_HEADERS,compareRow} from './comparison-display.mjs';
import {BUILD_ID,diagnosticText} from './diagnostics.mjs';
'use strict';
const $=id=>document.getElementById(id);
$('build-version').textContent='v'+BUILD_ID;
function clearError(){$('error').hidden=true;$('error-detail').hidden=true;$('error-report').textContent='';}
function showError(error,phase){$('error').textContent=error.message||'解析失敗，請重試。';$('error').hidden=false;$('error-report').textContent=diagnosticText(error.diagnostic||error,{phase,browser:navigator.userAgent});$('error-detail').hidden=false;}
let result=null, page=0; const pageSize=60;
function el(tag,text,cls){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;}
function fileName(){ $('new-label').textContent=$('new-file').files[0]?.name||'選擇或拖入 PDF';textInvalidate(); }
$('new-file').addEventListener('change',fileName);
$('compare').addEventListener('change',()=>{$('old-area').hidden=!$('compare').checked;$('old-file').required=$('compare').checked;});
const zone=$('drop-zone');
zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag');});
zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));
zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');if(e.dataTransfer.files.length){const dt=new DataTransfer();dt.items.add(e.dataTransfer.files[0]);$('new-file').files=dt.files;fileName();}});
let activeWorker=null, generation=0;
function busy(value){$('convert').disabled=value;$('convert').textContent=value?'正在解析…':'解析並預覽';$('cancel').hidden=!value;document.body.classList.toggle('busy',value);}
function clearResult(){result=null;page=0;render();for(const id of ['row-count','product-count','change-count','review-count'])$(id).textContent='—';$('review-list').replaceChildren();$('source-list').replaceChildren();$('file-title').textContent='選擇規格書後，在這裡核對匯出結果。';$('export-all').disabled=true;$('export-filtered').disabled=true;$('detail').close();textStop();textClear();setTextTab(false);}
function stop(){generation++;activeWorker?.terminate();activeWorker=null;textStop();busy(false);}
$('cancel').onclick=()=>{stop();clearResult();$('progress').textContent='已取消解析。';};
$('clear-session').onclick=()=>{stop();clearResult();$('upload-form').reset();$('old-area').hidden=true;$('old-file').required=false;fileName();clearError();$('progress').textContent='已清除檔案與結果。PDF 不會上傳到伺服器。';};
$('upload-form').addEventListener('submit',async e=>{
 e.preventDefault();stop();const run=generation;let phase='讀取檔案';clearResult();clearError();busy(true);
 try{
  const file=$('new-file').files[0],old=$('compare').checked?$('old-file').files[0]:null;
  if(!file||($('compare').checked&&!old))throw Error('請選擇需要解析的 PDF。');
  if(file.size+(old?.size||0)>50*1024*1024)throw Error('PDF 合計上限為 50 MB。');
  const pages=parsePageInput($('pages').value),oldPages=parsePageInput($('old-pages').value);
  $('progress').textContent='正在讀取本機檔案…';
  const newData=await file.arrayBuffer(),oldData=old?await old.arrayBuffer():null;if(run!==generation)return;
  phase='啟動解析程序';
  const worker=new Worker(new URL('./conversion.worker.mjs',import.meta.url),{type:'module'});activeWorker=worker;
  const json=await new Promise((resolve,reject)=>{worker.onmessage=({data})=>{if(data.type==='progress')$('progress').textContent=`${data.label}：${data.stage==='text'?'讀取頁面':'整理表格'} ${data.current} / ${data.total}`;else if(data.type==='result')resolve(data.result);else if(data.type==='error'){const error=Error(data.message);error.diagnostic=data;reject(error);}};worker.onerror=e=>{const error=Error(e.message||'解析程序無法啟動，請更新瀏覽器或重新載入頁面。');error.stack=e.filename?`${e.filename}:${e.lineno}:${e.colno}`:'';reject(error);};phase='解析 PDF';worker.postMessage({newData,oldData,pages,oldPages,filename:file.name,oldFilename:old?.name},oldData?[newData,oldData]:[newData]);});
  if(run!==generation)return;phase='整理預覽';result=json;page=0;$('file-title').textContent=json.filename+(json.compared?'　比對 '+json.old_filename:'');
  $('row-count').textContent=json.rows.filter(r=>r._status!=='removed').length.toLocaleString();$('product-count').textContent=json.products.length;
  $('change-count').textContent=json.compared?['changed','added','removed'].map(s=>json.rows.filter(r=>r._status===s).length).join(' / '):'未比對';
  $('review-count').textContent=json.review.length;$('product').replaceChildren(el('option','全部產品'));$('product').firstChild.value='';
  json.products.forEach(p=>{const o=el('option',p);o.value=p;$('product').append(o);});
  $('search').value='';$('kind').value='';$('status').value='';render();rawViews();
  const specDone=`解析完成。${json.rows.length.toLocaleString()} 列，${json.review.length} 張原表待核對。`;
  // Two versions: the narrative comparison runs in the same analysis; a single version skips it.
  if(json.compared){
   phase='比對文字敘述';setTextTab(true);$('progress').textContent='規格解析完成，正在比對文字敘述…';
   try{await runText(file,old);if(run!==generation)return;$('progress').textContent=specDone+'文字敘述比對完成。';}
   catch(err){if(run!==generation)return;$('progress').textContent=specDone+(err.cancelled?'文字敘述比對已中止。':'文字敘述比對未完成，詳見「文字敘述差異」分頁。');}
  }else $('progress').textContent=specDone;
  $('export-all').disabled=false;$('export-filtered').disabled=false;
 }catch(err){if(run!==generation)return;showError(err,phase);$('progress').textContent='本次解析未完成，請確認檔案或頁碼後重試。';clearResult();}
 finally{if(run===generation){activeWorker?.terminate();activeWorker=null;busy(false);}}
});
function filtered(){if(!result)return [];const q=$('search').value.toLowerCase();return result.rows.filter(r=>(!$('product').value||r['產品名稱']===$('product').value)&&(!$('kind').value||r['spec type']===$('kind').value)&&(!$('status').value||r._status===$('status').value)&&(!q||compareRow(r).map(v=>String(v??'')).join(' ').toLowerCase().includes(q)));}
function render(){
 const rows=filtered();$('empty').hidden=!!result;$('table-wrap').hidden=!result;
 const head=el('tr');COMPARE_HEADERS.forEach(c=>{const th=el('th',c);th.scope='col';head.append(th);});$('spec-table').tHead.replaceChildren(head);
 const body=$('spec-table').tBodies[0];body.replaceChildren();const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);
 rows.slice(page*pageSize,(page+1)*pageSize).forEach(r=>{const tr=el('tr');tr.tabIndex=0;tr.setAttribute('aria-label',`${r['產品名稱']} ${r.symbol||r.parameter} 規格詳情`);tr.className=`row-${r._status}`;compareRow(r).forEach((value,i)=>{const c=COMPARE_HEADERS[i],td=el('td');td.dataset.column=c;if(i===0)td.append(el('span',value,`status ${r._status}`));else td.textContent=value??'';if(r._changes?.[c]){td.className='changed-cell';td.title=`舊值：${r._changes[c].old}`;}tr.append(td);});tr.addEventListener('click',()=>detail(r));tr.addEventListener('keydown',e=>{if(e.key==='Enter'){detail(r);}});body.append(tr);});
 if(result&&!rows.length){const tr=el('tr');const td=el('td','沒有符合篩選條件的規格。');td.colSpan=COMPARE_HEADERS.length;tr.append(td);body.append(tr);}
 $('shown').textContent=result?`符合 ${rows.length.toLocaleString()} 列 ／ 全部 ${result.rows.length.toLocaleString()} 列`:'尚無資料';$('pagination').textContent=result?`${page+1} / ${pages}`:'';$('prev').disabled=page===0;$('next').disabled=page>=pages-1;
}
for(const id of ['search','product','kind','status'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=0;render();});
$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
function detail(r){const dl=el('dl');compareRow(r).forEach((value,i)=>{dl.append(el('dt',COMPARE_HEADERS[i]),el('dd',value!==''&&value!==undefined&&value!==null?value:'未提供'));});dl.append(el('dt','PDF 實際頁次'),el('dd',r._pdf_page||'—'),el('dt','章節'),el('dd',r._section||'—'));const wrap=$('detail-content');wrap.replaceChildren(dl);if(r._status==='review')wrap.append(el('p','相同產品／規格／條件出現多筆資料，未自動判定配對，請核對原文。'));if(r._candidates?.length){wrap.append(el('h3','舊版候選規格（未自動配對）'));for(const p of r._candidates)wrap.append(el('pre',result.columns.map(c=>`${c}: ${p[c]??''}`).join('\n')+`\nPDF 實際頁次: ${p._pdf_page||'—'}`));}if(r._changes&&Object.keys(r._changes).length){wrap.append(el('h3','版本差異'));for(const [k,v] of Object.entries(r._changes))wrap.append(el('p',`${k}：${v.old===''?'空白':v.old} → ${v.new===''?'空白':v.new}`));}if(r._notes){wrap.append(el('h3','原文註解'),el('pre',r._notes));}$('detail').showModal();}
$('close-detail').onclick=()=>$('detail').close();
function rawViews(){const rev=$('review-list');rev.replaceChildren();if(!result.review.length)rev.append(el('p','沒有待核對的未轉換表格。'));result.review.forEach(r=>{const d=el('details');d.append(el('summary',`第 ${r.page} 頁 · ${r.section}`),el('p',r.reason));const wrap=el('div',undefined,'raw-table');const t=el('table');r.raw.forEach(row=>{const tr=el('tr');row.forEach(c=>tr.append(el('td',c||'')));t.append(tr);});wrap.append(t);d.append(wrap);rev.append(d);});const src=$('source-list');src.replaceChildren();result.sources.forEach(s=>{const d=el('details');d.append(el('summary',`文件第 ${s.page} 頁 ／ PDF 第 ${s.pdf_page} 頁　${s.section}`),el('pre',s.text));src.append(d);});}
function selectTab(b){document.querySelectorAll('[data-tab]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));$(x.dataset.tab+'-panel').hidden=x!==b;});}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>selectTab(b));
// The narrative tab only exists when two versions are analysed together.
function setTextTab(visible){const b=document.querySelector('[data-tab="text"]');b.hidden=!visible;if(!visible&&b.classList.contains('active'))selectTab(document.querySelector('[data-tab="specs"]'));}
async function download(filteredOnly){if(!result)return;const snapshot={...result,rows:filteredOnly?filtered():result.rows};try{$('export-all').disabled=true;$('export-filtered').disabled=true;const {makeWorkbook}=await import('./workbook.mjs');const text=textState?{newDoc:textState.newDoc,oldDoc:textState.oldDoc,report:textState.report}:null;const bytes=await makeWorkbook(snapshot,text);const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=el('a');a.href=url;a.download=filteredOnly?'datasheet_specs_filtered.xlsx':'datasheet_specs.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){showError(e,'匯出 Excel');}finally{$('export-all').disabled=!result;$('export-filtered').disabled=!result;}}
$('export-all').onclick=()=>download(false);$('export-filtered').onclick=()=>download(true);
// ---- 文字敘述差異 ----
let textState=null,textWorker=null,textGen=0,textLib=null,textSelected=null,textCancel=null;
const cancelled=()=>Object.assign(Error('文字敘述比對已中止。'),{cancelled:true});
function textStop(){textGen++;textWorker?.terminate();textWorker=null;textCancel?.();textCancel=null;}
function textClear(){textState=null;textSelected=null;$('text-summary').hidden=true;$('text-error').hidden=true;$('text-progress').textContent='';$('text-sections').replaceChildren(el('p','尚未比對。','text-empty'));$('text-detail').replaceChildren(el('p','選擇左側章節查看舊版／新版並排差異。','text-empty'));}
function textInvalidate(){if(!textState&&!textWorker)return;textStop();textClear();$('text-progress').textContent='檔案已變更，請重新按「解析並預覽」。';}
$('old-file').addEventListener('change',textInvalidate);$('compare').addEventListener('change',textInvalidate);
// Runs after the spec analysis of the same two PDFs; rejects with {cancelled:true} when stopped.
async function runText(file,old){
 textStop();textClear();const run=textGen;
 try{
  $('text-progress').textContent='正在讀取本機檔案…';
  const [newData,oldData]=await Promise.all([file.arrayBuffer(),old.arrayBuffer()]);textLib??=await import('./text-diff.mjs');if(run!==textGen)throw cancelled();
  const worker=new Worker(new URL('./text-diff.worker.mjs',import.meta.url),{type:'module'});textWorker=worker;
  const json=await new Promise((resolve,reject)=>{textCancel=()=>reject(cancelled());worker.onmessage=({data})=>{if(data.type==='progress'){const msg=`${data.label}：讀取頁面 ${data.current} / ${data.total}`;$('text-progress').textContent=msg;$('progress').textContent='文字敘述比對 · '+msg;}else if(data.type==='result')resolve(data.result);else if(data.type==='error'){const e=Error(data.message);e.diagnostic=data;reject(e);}};worker.onerror=e=>reject(Error(e.message||'文字比對程序無法啟動，請更新瀏覽器或重新載入頁面。'));worker.postMessage({newData,oldData,filename:file.name,oldFilename:old.name},[newData,oldData]);});
  if(run!==textGen)throw cancelled();
  textState={...json,manual:new Set()};textRebuild();
  $('text-progress').textContent=`比對完成：新版 ${json.newDoc.sections.length} 個章節（PDF ${json.newDoc.pages} 頁），舊版 ${json.oldDoc.sections.length} 個章節（PDF ${json.oldDoc.pages} 頁）。`;
 }catch(err){if(run===textGen&&!err.cancelled){textClear();$('text-error').textContent=err.message||'文字比對失敗。';$('text-error').hidden=false;$('text-progress').textContent='文字比對未完成。';}throw err;}
 finally{if(run===textGen){textWorker?.terminate();textWorker=null;textCancel=null;}}
}
const hidePart=()=>$('text-hide-part').checked;
// With "僅型號替換視為相同", part-only differences count as same everywhere in the view.
const shownStatus=s=>s==='part'&&hidePart()?'same':s;
function textRebuild(){
 const {newDoc,oldDoc,pairing}=textState,report=textLib.buildReport(oldDoc,newDoc,pairing);
 for(const e of report){const n=newDoc.sections[e.newIndex],o=oldDoc.sections[e.oldIndex];e.label=textLib.sectionLabel(n||o);e.search=[textLib.sectionLabel(n),textLib.sectionLabel(o),...e.paragraphs.flatMap(p=>[p.old?.text,p.new?.text])].join('\n').toLowerCase();}
 textState.report=report;textRender();
}
function textBadge(status){return el('span',textLib.TEXT_STATUS_LABELS[status],`text-badge s-${status}`);}
function textRender(){
 if(!textState)return;const {report}=textState,q=$('text-search').value.trim().toLowerCase(),want=$('text-status').value;
 const counts={changed:0,added:0,removed:0,part:0,same:0};report.forEach(e=>counts[shownStatus(e.status)]++);
 const sum=$('text-summary');sum.replaceChildren(...['changed','added','removed','part','same'].filter(s=>!(s==='part'&&hidePart())).map(s=>{const b=el('span',undefined,'text-count');b.append(textBadge(s),el('strong',String(counts[s])));return b;}),el('span',`章節配對 ${report.filter(e=>e.newIndex>=0&&e.oldIndex>=0).length} 組${textState.manual.size?`（手動 ${textState.manual.size}）`:''}`,'text-note'));sum.hidden=false;
 const list=report.filter(e=>{const s=shownStatus(e.status);return (!want||(want==='diff'?s!=='same':s===want))&&(!q||e.search.includes(q));});
 const nav=$('text-sections');nav.replaceChildren();
 if(!list.length)nav.append(el('p','沒有符合條件的章節。','text-empty'));
 if(!textSelected||!list.includes(textSelected))textSelected=list[0]||null;
 for(const e of list){const b=el('button',undefined,'text-section');b.type='button';b.style.setProperty('--level',Math.max(0,(textState.newDoc.sections[e.newIndex]||textState.oldDoc.sections[e.oldIndex]).level-1));if(e===textSelected)b.setAttribute('aria-current','true');b.append(textBadge(shownStatus(e.status)),el('span',e.label,'text-section-label'));b.title=e.label;b.onclick=()=>{textSelected=e;textRender();$('text-detail').focus({preventScroll:true});};nav.append(b);}
 textDetail();
}
function chunkNodes(chunks,side){
 const out=[];
 for(const c of chunks){
  if(c.t==='eq')out.push(document.createTextNode(c.v));
  else if(c.t==='del'){if(side==='old')out.push(el('del',c.v));}
  else if(c.t==='ins'){if(side==='new')out.push(el('ins',c.v));}
  else{const v=side==='old'?c.o:c.n;out.push(hidePart()?document.createTextNode(v):el('mark',v,'part'));}
 }
 return out;
}
function textDetail(){
 const box=$('text-detail'),e=textSelected;box.replaceChildren();
 if(!e){box.append(el('p','選擇左側章節查看舊版／新版並排差異。','text-empty'));return;}
 const {newDoc,oldDoc,pairing,manual}=textState,n=newDoc.sections[e.newIndex],o=oldDoc.sections[e.oldIndex];
 const head=el('div',undefined,'text-head');const h=el('h3');h.append(textBadge(shownStatus(e.status)),document.createTextNode(' '+e.label));head.append(h);
 const meta=el('dl','','text-meta');
 const titleCell=(sec,side)=>{const dd=el('dd');if(!sec){dd.textContent='（無對應章節）';return dd;}if(sec.number)dd.append(sec.number+' ');dd.append(...(e.titleChunks?chunkNodes(e.titleChunks,side):[sec.title]),` · PDF 第 ${sec.page} 頁`);return dd;};
 meta.append(el('dt','舊版'),titleCell(o,'old'),el('dt','新版'),titleCell(n,'new'));head.append(meta);
 // Manual pairing: pick the counterpart section; previous pairs are released automatically.
 const pick=el('label',undefined,'text-pair');const sel=el('select');
 const others=n?oldDoc.sections:newDoc.sections;sel.append(new Option('（無對應章節）','-1'));others.forEach((s,i)=>sel.append(new Option(textLib.sectionLabel(s).slice(0,90)+` (p.${s.page})`,String(i))));
 sel.value=String(n?e.oldIndex:-1);
 sel.onchange=()=>{const v=Number(sel.value);let key;if(n){if(v>=0){const k=pairing.indexOf(v);if(k>=0)pairing[k]=-1;}pairing[e.newIndex]=v;manual.add(e.newIndex);key={newIndex:e.newIndex};}else{if(v<0)return;pairing[v]=e.oldIndex;manual.add(v);key={newIndex:v};}textRebuild();textSelected=textState.report.find(x=>x.newIndex===key.newIndex)||null;textRender();};
 pick.append(el('span',n?'對應舊版章節':'對應新版章節'),sel);if(n&&manual.has(e.newIndex))pick.append(el('small','手動配對'));head.append(pick);box.append(head);
 const onlyDiff=$('text-only-diff').checked,rows=e.paragraphs.filter(p=>!onlyDiff||shownStatus(p.status)!=='same'),hidden=e.paragraphs.length-rows.length;
 if(!e.paragraphs.length){box.append(el('p','此章節沒有可比對的文字敘述（可能只有表格或圖）。','text-empty'));return;}
 const table=el('table',undefined,'text-table');const thead=el('thead'),hr=el('tr');['狀態','舊版','新版'].forEach(t=>{const th=el('th',t);th.scope='col';hr.append(th);});thead.append(hr);table.append(thead);
 const body=el('tbody');
 for(const p of rows){const s=shownStatus(p.status),tr=el('tr',undefined,`p-${s}`);const st=el('td');st.append(textBadge(s));
  const cell=(side,par)=>{const td=el('td');if(!par){td.append(el('span',side==='old'?'（舊版無此段）':'（新版無此段）','text-missing'));return td;}td.append(...(p.status==='added'||p.status==='removed'?[document.createTextNode(par.text)]:chunkNodes(p.chunks,side)));const range=par.endPage&&par.endPage>par.page?par.page+'–'+par.endPage:par.page;td.append(el('small',` p.${range}`,'text-page'));return td;};
  tr.append(st,cell('old',p.old),cell('new',p.new));body.append(tr);}
 table.append(body);box.append(table);
 if(hidden)box.append(el('p',`已隱藏 ${hidden} 段相同段落。取消勾選「只顯示差異段落」可顯示全部。`,'text-note'));
 if(!rows.length)box.append(el('p','此章節沒有差異段落。','text-empty'));
}
for(const id of ['text-status','text-hide-part','text-only-diff'])$(id).addEventListener('change',textRender);
$('text-search').addEventListener('input',textRender);
