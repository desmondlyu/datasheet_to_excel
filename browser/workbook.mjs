import ExcelJS from 'exceljs';
import {COLUMNS} from './spec-core.mjs';
export const COMPARE_SHEET='產品規格比較表';
export const STATUS_LABELS={changed:'變更',added:'新增',removed:'移除',review:'待確認',unchanged:'未變更',uncompared:'未比對'};
const SPEC_COLUMNS=COLUMNS.filter(c=>c!=='page');
export const COMPARE_HEADERS=['比較結果','變更欄位','變更說明（舊 → 新）',...SPEC_COLUMNS,'新版頁碼','舊版頁碼'];
const FILLS={added:'FFE2F1E7',changed:'FFFFE9BE',review:'FFFFDDDA',removed:'FFE7E9EC'};
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
function compareRow(r){
 const removed=r._status==='removed';
 const oldPage=removed?r.page:r._status==='review'?[...new Set((r._candidates||[]).map(p=>p.page).filter(p=>p!==''&&p!==undefined))].join(', '):r._old_page;
 return [STATUS_LABELS[r._status]||r._status||'',r._status==='changed'?Object.keys(r._changes||{}).join(', '):'',explain(r),...SPEC_COLUMNS.map(c=>r[c]),removed?'':r.page,oldPage];
}
export async function makeWorkbook(result){
 const book=new ExcelJS.Workbook();book.creator='Datasheet 規格工作台';
 function sheet(name,headers,data){const s=book.addWorksheet(name);s.addRow(headers);for(const row of data)s.addRow(row.map(v=>v===''||v===undefined?null:v));s.views=[{state:'frozen',ySplit:1}];s.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,s.rowCount),column:headers.length}};s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17483F'}};s.columns.forEach((c,i)=>{c.width=['parameter','condition','description','text','raw','變更說明（舊 → 新）'].includes(headers[i])?55:18;c.alignment={vertical:'top',wrapText:true};});return s;}
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
  ['【底色】','底色僅為輔助：變更＝淡黃、新增＝淡綠、移除＝淡灰、待確認＝淡紅。請以「比較結果」欄位為準。'],
  ['',''],['【工作表】',''],
  [COMPARE_SHEET,'新版規格與新舊版比較結果，可用第一列篩選「比較結果」。'],
  ['Review','無法可靠轉成固定欄位的原始表格，需人工核對。舊版內容的 section 以「舊版 /」開頭。'],
  ['Source','新舊版來源頁擷取文字與原始 Notes（舊版 section 以「舊版 /」開頭）。page 為印刷頁碼，pdf_page 為 PDF 實際頁次。']
 ].forEach(row=>info.addRow(row));
 info.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};info.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17483F'}};
 info.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};if(String(row.getCell(1).value||'').startsWith('【'))row.font={bold:true};});
 sheet('Review',['page','pdf_page','table','section','reason','raw'],(result.review||[]).map(r=>[r.page,r.pdf_page,r.table,r.section,r.reason,r.raw.map(row=>row.join(' | ')).join('\n')]));
 sheet('Source',['page','pdf_page','section','text'],(result.sources||[]).map(r=>[r.page,r.pdf_page,r.section,r.text]));
 return book.xlsx.writeBuffer();
}
