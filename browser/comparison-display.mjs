// Shared presentation for the browser preview and Excel comparison worksheet.
import {numericValue,normalizeOpcode,interfaceMode,stripDummyNotes} from './spec-core.mjs';
export const STATUS_LABELS={changed:'變更',added:'新增',removed:'移除',review:'待確認',unchanged:'未變更',uncompared:'未比對'};
export const COMPARE_HEADERS=['比較結果','變更欄位','變更說明（舊 → 新）','產品名稱','Opcode','unit','max','typ','min','symbol','SPI/QPI','3/4 byte address','Dummy','Starting Address','spec type','相關指令','parameter','condition','description','新版頁碼','舊版頁碼'];
function bodyValues(r){
 const opcodes=[],names=[];
 for(const raw of String(r._commands||'').split(/[；;]/)){
  const entry=raw.replace(/([0-9a-f]{2}h)\s*\(\s*\d+(?:\s*,\s*\d+)*\s*\)/gi,'$1');
  const match=entry.match(/^\s*((?:[0-9a-f]{2}h)(?:\s*[/,]\s*[0-9a-f]{2}h)*)\s*/i);
  if(match)opcodes.push(...match[1].match(/[0-9a-f]{2}h/gi).map(code=>code.slice(0,-1).toUpperCase()+'h'));
  const name=(match?entry.slice(match[0].length):entry).trim();if(name)names.push(name);
 }
 return {Opcode:normalizeOpcode(r._opcode)||normalizeOpcode([...new Set(opcodes)].join('/')),'SPI/QPI':r._mode===undefined?undefined:interfaceMode(r._mode,r._section),'3/4 byte address':r._address,Dummy:numericValue(stripDummyNotes(r._dummy)),'Starting Address':r._start,'相關指令':names.join('；')};
}
const shown=v=>v===''||v===undefined||v===null?'空白':String(v);
function explain(r){
 if(r._status==='changed')return Object.entries(r._changes||{}).map(([k,v])=>`${k}：${shown(v.old)} → ${shown(v.new)}`).join('；');
 if(r._status==='added')return '新版新增，舊版無對應規格。';
 if(r._status==='removed')return '舊版有此規格，新版已移除；本列數值為舊版內容。';
 if(r._status==='review'){
  if(r._merge_conflict)return r._merge_conflict;
  const lines=['相同產品／規格類型／symbol／parameter／condition 出現多筆，未自動配對，請人工核對。'];
  (r._candidates||[]).forEach((p,i)=>lines.push(`舊版候選 ${i+1}：`+['max','typ','min','unit'].map(k=>`${k} ${shown(p[k])}`).join('、')+`（舊版頁 ${shown(p.page)}）`));
  return lines.join('\n');
 }
 return '';
}
export function compareRow(r){
 const removed=r._status==='removed';
 const oldPage=removed?r.page:r._status==='review'?[...new Set((r._candidates||[]).map(p=>p.page).filter(p=>p!==''&&p!==undefined))].join(', '):r._old_page;
 const values={...r,...bodyValues(r),'比較結果':STATUS_LABELS[r._status]||r._status||'','變更欄位':r._status==='changed'?Object.keys(r._changes||{}).join(', '):'','變更說明（舊 → 新）':explain(r),'新版頁碼':removed?'':r.page,'舊版頁碼':oldPage};
 return COMPARE_HEADERS.map(c=>values[c]);
}
