'use strict';
const $=id=>document.getElementById(id);
let result=null, page=0; const pageSize=60;
const labels={uncompared:'未比對',unchanged:'未變更',changed:'變更',added:'新增',removed:'移除',review:'待確認'};
function el(tag,text,cls){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;}
function fileName(){ $('new-label').textContent=$('new-file').files[0]?.name||'選擇或拖入 PDF'; }
$('new-file').addEventListener('change',fileName);
$('compare').addEventListener('change',()=>{$('old-area').hidden=!$('compare').checked;$('old-file').required=$('compare').checked;});
const zone=$('drop-zone');
zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag');});
zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));
zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');if(e.dataTransfer.files.length){const dt=new DataTransfer();dt.items.add(e.dataTransfer.files[0]);$('new-file').files=dt.files;fileName();}});
$('upload-form').addEventListener('submit',async e=>{
 e.preventDefault();$('error').hidden=true;const btn=$('convert');btn.disabled=true;btn.textContent='正在解析…';document.body.classList.add('busy');$('progress').textContent='正在定位章節、展開產品與條件。頁數較多時請稍候。';
 $('export-all').disabled=true;$('export-filtered').disabled=true;
 try{
  const data=new FormData(e.target);data.set('compare',String($('compare').checked));
  const response=await fetch('/api/convert',{method:'POST',body:data,headers:{'X-Requested-With':'SpecWorkbench'}});
  const json=await response.json();if(!response.ok)throw new Error(json.error||'解析失敗。');
  result=json;page=0;$('file-title').textContent=json.filename+(json.compared?'　比對 '+json.old_filename:'');
  $('row-count').textContent=json.rows.filter(r=>r._status!=='removed').length.toLocaleString();$('product-count').textContent=json.products.length;
  $('change-count').textContent=json.compared?['changed','added','removed'].map(s=>json.rows.filter(r=>r._status===s).length).join(' / '):'未比對';
  $('review-count').textContent=json.review.length;$('product').replaceChildren(el('option','全部產品'));$('product').firstChild.value='';
  json.products.forEach(p=>{const o=el('option',p);o.value=p;$('product').append(o);});
  $('search').value='';$('kind').value='';$('status').value='';render();rawViews();
  $('progress').textContent=`解析完成。${json.rows.length.toLocaleString()} 列，${json.review.length} 張原表待核對。結果保留 30 分鐘。`;
  $('export-all').disabled=false;$('export-filtered').disabled=false;
 }catch(err){$('error').textContent=err.message;$('error').hidden=false;$('progress').textContent='本次解析未完成。請確認檔案或頁碼後重試。';result=null;render();$('row-count').textContent='—';$('product-count').textContent='—';$('change-count').textContent='—';$('review-count').textContent='—';$('review-list').replaceChildren();$('source-list').replaceChildren();}
 finally{btn.disabled=false;btn.textContent='解析並預覽';document.body.classList.remove('busy');}
});
function filtered(){if(!result)return [];const q=$('search').value.toLowerCase();return result.rows.filter(r=>(!$('product').value||r['產品名稱']===$('product').value)&&(!$('kind').value||r['spec type']===$('kind').value)&&(!$('status').value||r._status===$('status').value)&&(!q||result.columns.map(c=>String(r[c]??'')).join(' ').toLowerCase().includes(q)));}
function render(){
 const rows=filtered();$('empty').hidden=!!result;$('table-wrap').hidden=!result;
 const head=el('tr');['狀態',...(result?.columns||[])].forEach(c=>head.append(el('th',c)));$('spec-table').tHead.replaceChildren(head);
 const body=$('spec-table').tBodies[0];body.replaceChildren();const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);
 rows.slice(page*pageSize,(page+1)*pageSize).forEach(r=>{const tr=el('tr');tr.tabIndex=0;tr.setAttribute('aria-label',`${r['產品名稱']} ${r.symbol||r.parameter} 規格詳情`);const s=el('td');s.append(el('span',labels[r._status],`status ${r._status}`));tr.append(s);result.columns.forEach(c=>{const td=el('td',r[c]??'');if(r._changes?.[c]){td.className='changed-cell';td.title=`舊值：${r._changes[c].old}`;}tr.append(td);});tr.addEventListener('click',()=>detail(r));tr.addEventListener('keydown',e=>{if(e.key==='Enter'){detail(r);}});body.append(tr);});
 if(result&&!rows.length){const tr=el('tr');const td=el('td','沒有符合篩選條件的規格。');td.colSpan=result.columns.length+1;tr.append(td);body.append(tr);}
 $('shown').textContent=result?`符合 ${rows.length.toLocaleString()} 列 ／ 全部 ${result.rows.length.toLocaleString()} 列`:'尚無資料';$('pagination').textContent=result?`${page+1} / ${pages}`:'';$('prev').disabled=page===0;$('next').disabled=page>=pages-1;
}
for(const id of ['search','product','kind','status'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=0;render();});
$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
function detail(r){const dl=el('dl');result.columns.forEach(c=>{dl.append(el('dt',c),el('dd',r[c]!==''?r[c]:'未提供'));});dl.append(el('dt','PDF 實際頁次'),el('dd',r._pdf_page||'—'),el('dt','章節'),el('dd',r._section||'—'));const wrap=$('detail-content');wrap.replaceChildren(dl);if(r._status==='review')wrap.append(el('p','相同產品／規格／條件出現多筆資料，未自動判定配對，請核對原文。'));if(r._changes&&Object.keys(r._changes).length){wrap.append(el('h3','版本差異'));for(const [k,v] of Object.entries(r._changes))wrap.append(el('p',`${k}：${v.old===''?'空白':v.old} → ${v.new===''?'空白':v.new}`));}if(r._notes){wrap.append(el('h3','原文註解'),el('pre',r._notes));}$('detail').showModal();}
$('close-detail').onclick=()=>$('detail').close();
function rawViews(){const rev=$('review-list');rev.replaceChildren();if(!result.review.length)rev.append(el('p','沒有待核對的未轉換表格。'));result.review.forEach(r=>{const d=el('details');d.append(el('summary',`第 ${r.page} 頁 · ${r.section}`),el('p',r.reason));const wrap=el('div',undefined,'raw-table');const t=el('table');r.raw.forEach(row=>{const tr=el('tr');row.forEach(c=>tr.append(el('td',c||'')));t.append(tr);});wrap.append(t);d.append(wrap);rev.append(d);});const src=$('source-list');src.replaceChildren();result.sources.forEach(s=>{const d=el('details');d.append(el('summary',`文件第 ${s.page} 頁 ／ PDF 第 ${s.pdf_page} 頁　${s.section}`),el('pre',s.text));src.append(d);});}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));$(x.dataset.tab+'-panel').hidden=x!==b;});});
async function download(filteredOnly){const params=new URLSearchParams();if(filteredOnly){params.set('product',$('product').value);params.set('kind',$('kind').value);params.set('status',$('status').value);params.set('q',$('search').value);}try{const r=await fetch('/api/export?'+params);if(!r.ok){const e=await r.json();throw new Error(e.error);}const url=URL.createObjectURL(await r.blob());const a=el('a');a.href=url;a.download=filteredOnly?'datasheet_specs_filtered.xlsx':'datasheet_specs.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){$('error').textContent=e.message;$('error').hidden=false;}}
$('export-all').onclick=()=>download(false);$('export-filtered').onclick=()=>download(true);
