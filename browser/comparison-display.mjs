// Shared presentation for the browser preview and Excel comparison worksheet.
import {COLUMNS} from './spec-core.mjs';
export const STATUS_LABELS={changed:'變更',added:'新增',removed:'移除',review:'待確認',unchanged:'未變更',uncompared:'未比對'};
const SPEC_COLUMNS=COLUMNS.filter(c=>c!=='page');
const FREQ_FIELDS=[['Opcode','_opcode'],['SPI/QPI','_mode'],['3/4 byte address','_address'],['Dummy','_dummy'],['Starting Address','_start'],['相關指令','_commands'],['對應依據','_command_basis']];
const AT=SPEC_COLUMNS.indexOf('symbol')+1;
const BODY_HEADERS=[...SPEC_COLUMNS.slice(0,AT),...FREQ_FIELDS.map(f=>f[0]),...SPEC_COLUMNS.slice(AT)];
function bodyValues(r){
 const opcodes=[],names=[];
 for(const entry of String(r._commands||'').split(/[；;]/)){
  const match=entry.match(/^\s*((?:[0-9a-f]{2}h)(?:\s*[/,]\s*[0-9a-f]{2}h)*)\s*/i);
  if(match)opcodes.push(...match[1].match(/[0-9a-f]{2}h/gi).map(code=>code.slice(0,-1).toUpperCase()+'h'));
  const name=(match?entry.slice(match[0].length):entry).trim();if(name)names.push(name);
 }
 const display={...r,_opcode:r._opcode||[...new Set(opcodes)].join(', '),_commands:names.join('；')};
 return [...SPEC_COLUMNS.slice(0,AT).map(c=>r[c]),...FREQ_FIELDS.map(f=>display[f[1]]),...SPEC_COLUMNS.slice(AT).map(c=>r[c])];
}
export const COMPARE_HEADERS=['比較結果','變更欄位','變更說明（舊 → 新）',...BODY_HEADERS,'新版頁碼','舊版頁碼'];
const shown=v=>v===''||v===undefined||v===null?'空白':String(v);
function explain(r){
 if(r._status==='changed')return Object.entries(r._changes||{}).map(([k,v])=>`${k}：${shown(v.old)} → ${shown(v.new)}`).join('；');
 if(r._status==='added')return '新版新增，舊版無對應規格。';
 if(r._status==='removed')return '舊版有此規格，新版已移除；本列數值為舊版內容。';
 if(r._status==='review'){
  const lines=['相同產品／規格類型／symbol／parameter／condition 出現多筆，未自動配對，請人工核對。'];
  (r._candidates||[]).forEach((p,i)=>lines.push(`舊版候選 ${i+1}：`+['max','typ','min','unit'].map(k=>`${k} ${shown(p[k])}`).join('、')+`（舊版頁 ${shown(p.page)}）`));
  return lines.join('\n');
 }
 return '';
}
export function compareRow(r){
 const removed=r._status==='removed';
 const oldPage=removed?r.page:r._status==='review'?[...new Set((r._candidates||[]).map(p=>p.page).filter(p=>p!==''&&p!==undefined))].join(', '):r._old_page;
 return [STATUS_LABELS[r._status]||r._status||'',r._status==='changed'?Object.keys(r._changes||{}).join(', '):'',explain(r),...bodyValues(r),removed?'':r.page,oldPage];
}
