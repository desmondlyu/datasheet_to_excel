import ExcelJS from 'exceljs';
import {COLUMNS} from './spec-core.mjs';
export const COMPARE_SHEET='產品規格比較表';
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
export const COMMAND_SHEET='指令表';
export const COMMAND_HEADERS=['比較結果','變更說明（舊 → 新）','介面模式','指令名稱','Opcode','設定','Address','Dummy','Data','其他欄位','分組','章節','新版頁碼','舊版頁碼'];
const COMMAND_FIELDS={address:'Address',dummy:'Dummy',data:'Data',extra:'其他欄位'};
function commandRow(c,compared){
 const status=compared?c._status:'uncompared',removed=status==='removed';
 const note=status==='changed'?Object.entries(c._changes||{}).map(([k,v])=>`${COMMAND_FIELDS[k]||k}：${shown(v.old)} → ${shown(v.new)}`).join('；'):status==='added'?'新版新增，舊版無對應指令。':status==='removed'?'舊版有此指令，新版已移除；本列內容為舊版。':status==='review'?'相同 介面模式／指令名稱／Opcode／設定 出現多筆，未自動配對，請人工核對。':'';
 return [STATUS_LABELS[status]||'',note,c.mode,c.command,c.opcode,c.setting,c.address,c.dummy,c.data,c.extra,c.group,c.section,removed?'':c.page,removed?c.page:c._old_page];
}
const FILLS={added:'FFE2F1E7',changed:'FFFFE9BE',review:'FFFFDDDA',removed:'FFE7E9EC'};
const shown=v=>v===''||v===undefined||v===null?'空白':String(v);
const pagesText=ps=>ps?.length?`PDF 第 ${ps.join(', ')} 頁`:'未偵測到指令表';
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
function compareRow(r){
 const removed=r._status==='removed';
 const oldPage=removed?r.page:r._status==='review'?[...new Set((r._candidates||[]).map(p=>p.page).filter(p=>p!==''&&p!==undefined))].join(', '):r._old_page;
 return [STATUS_LABELS[r._status]||r._status||'',r._status==='changed'?Object.keys(r._changes||{}).join(', '):'',explain(r),...bodyValues(r),removed?'':r.page,oldPage];
}
export async function makeWorkbook(result){
 const book=new ExcelJS.Workbook();book.creator='Datasheet 規格工作台';
 function sheet(name,headers,data){const s=book.addWorksheet(name);s.addRow(headers);for(const row of data)s.addRow(row.map(v=>v===''||v===undefined?null:v));s.views=[{state:'frozen',ySplit:1}];s.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,s.rowCount),column:headers.length}};s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17483F'}};s.columns.forEach((c,i)=>{c.width=['parameter','condition','description','text','raw','變更說明（舊 → 新）','相關指令','指令名稱','其他欄位','章節'].includes(headers[i])?55:18;c.alignment={vertical:'top',wrapText:true};});return s;}
 const rows=result.rows||[];const s=sheet(COMPARE_SHEET,COMPARE_HEADERS,rows.map(compareRow));
 rows.forEach((r,i)=>{const color=FILLS[r._status];if(color)s.getRow(i+2).fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};});
 const info=book.addWorksheet('說明');info.columns=[{header:'項目',width:22},{header:'說明',width:90}];
 [['新版 PDF',result.filename||'未提供'],['舊版 PDF',result.compared?(result.old_filename||'未提供'):'未比對（僅匯出新版規格）'],['匯出時間',new Date().toLocaleString('zh-TW',{hour12:false})],
  ['',''],['【比較結果欄位】',''],
  ['變更','新舊版都有此規格，但 max／typ／min／unit／description 有差異。差異列在「變更欄位」與「變更說明（舊 → 新）」。'],
  ['新增','新版才有的規格，舊版找不到對應項目。'],
  ['移除','舊版有、新版已沒有的規格；該列數值與頁碼為舊版內容。'],
  ['待確認','相同產品／規格類型／symbol／parameter／condition 出現多筆，無法一對一配對；舊版候選值列在「變更說明」，請人工核對。'],
  ['未變更','新舊版內容相同。'],
  ['未比對','匯出時未提供舊版 PDF，只列出新版規格。'],
  ['',''],['【配對規則】','以 產品名稱 + spec type + symbol + parameter + condition 配對新舊版。條件或規格名稱改寫時，可能顯示為一筆「新增」加一筆「移除」，請人工核對。'],
  ['【頻率條件欄】','Opcode 統一列出指令碼：優先使用頻率矩陣的指令碼，其他規格由相關指令帶入並去除重複。SPI/QPI／3/4 byte address／Dummy／Starting Address 仍由頻率矩陣拆出；condition 保留完整條件。'],
  ['【相關指令】','列出與該規格相關的指令名稱及介面模式；指令碼統一放在 Opcode 欄，詳細 Address／Dummy／Data 請查「指令表」。相關指令僅供查詢，不影響「比較結果」。'],
  ['原文標示 opcode','parameter 原文已寫明 opcode（例如 (20h/21h)），依此 opcode 從指令表帶出指令名稱。'],
  ['名稱規則對應','依明確的名稱規則對應（例如 Page Program Time → Page Program 類指令），非原文直接標示，建議核對。'],
  ['空白','未找到可靠對應，不自動猜測。'],
  ['指令表來源頁（新版）',pagesText(result.command_pages)],
  ['指令表來源頁（舊版）',result.compared?pagesText(result.old_command_pages):'未比對'],
  ['【底色】','底色僅為輔助：變更＝淡黃、新增＝淡綠、移除＝淡灰、待確認＝淡紅。請以「比較結果」欄位為準。'],
  ['',''],['【工作表】',''],
  [COMPARE_SHEET,'新版規格與新舊版比較結果，可用第一列篩選「比較結果」。'],
  [COMMAND_SHEET,'由 PDF 指令表（依表頭 Command／Opcode／Address／Dummy／Data 或 Data Input Output／Byte 1… 自動偵測，不依固定頁碼）擷取；有舊版時以 介面模式＋指令名稱＋Opcode＋設定 配對比較。'],
  ['Review','無法可靠轉成固定欄位的原始表格，需人工核對。舊版內容的 section 以「舊版 /」開頭。'],
  ['Source','新舊版來源頁擷取文字與原始 Notes（舊版 section 以「舊版 /」開頭）。page 為印刷頁碼，pdf_page 為 PDF 實際頁次。']
 ].forEach(row=>info.addRow(row));
 info.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};info.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17483F'}};
 info.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};if(String(row.getCell(1).value||'').startsWith('【'))row.font={bold:true};});
 const commands=result.commands||[];
 const cs=sheet(COMMAND_SHEET,COMMAND_HEADERS,commands.length?commands.map(c=>commandRow(c,result.compared)):[['','未偵測到指令表，請核對 PDF 是否含 Command／Opcode 表格。']]);
 if(result.compared)commands.forEach((c,i)=>{const color=FILLS[c._status];if(color)cs.getRow(i+2).fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};});
 sheet('Review',['page','pdf_page','table','section','reason','raw'],(result.review||[]).map(r=>[r.page,r.pdf_page,r.table,r.section,r.reason,r.raw.map(row=>row.join(' | ')).join('\n')]));
 sheet('Source',['page','pdf_page','section','text'],(result.sources||[]).map(r=>[r.page,r.pdf_page,r.section,r.text]));
 return book.xlsx.writeBuffer();
}
