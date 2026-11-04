// Excel export for narrative comparison. Kept separate from workbook.mjs so the
// existing spec export is unchanged.
import ExcelJS from 'exceljs';
import {TEXT_STATUS_LABELS,sectionLabel} from './text-diff.mjs';
export const TEXT_DIFF_SHEET='文字差異';
export const TEXT_SECTION_SHEET='章節總覽';
export const TEXT_DIFF_HEADERS=['比較結果','新版章節','舊版章節','新版 PDF 頁','舊版 PDF 頁','差異標示（紅刪除線＝舊版／綠底線＝新版）','舊版原文','新版原文'];
export const TEXT_SECTION_HEADERS=['比較結果','新版章節','舊版章節','新版 PDF 頁','舊版 PDF 頁','相同','僅型號替換','修改','新增','移除'];
const FILLS={added:'FFE2F1E7',changed:'FFFFE9BE',removed:'FFE7E9EC',part:'FFE3EEFA'};
const LIMIT=32000;
const cut=s=>{s=String(s??'');return s.length>LIMIT?s.slice(0,LIMIT)+'…（已截斷）':s;};
const FONT={del:{color:{argb:'FFB42318'},strike:true},ins:{color:{argb:'FF1E7B34'},underline:true,bold:true},partOld:{color:{argb:'FF5B6B7F'},strike:true},partNew:{color:{argb:'FF1D5FA8'},bold:true}};
export function richDiff(chunks){
 const runs=[];let used=0;
 const add=(text,font)=>{if(!text||used>=LIMIT)return;const t=text.slice(0,LIMIT-used);used+=t.length;runs.push(font?{text:t,font}:{text:t});};
 for(const c of chunks){if(c.t==='eq')add(c.v);else if(c.t==='del')add(c.v,FONT.del);else if(c.t==='ins')add(c.v,FONT.ins);else{add(c.o,FONT.partOld);add(c.n,FONT.partNew);}}
 if(used>=LIMIT)runs.push({text:'…（已截斷）'});
 return runs.length?{richText:runs}:null;
}
function style(s,headers,wide){
 s.views=[{state:'frozen',ySplit:1}];s.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,s.rowCount),column:headers.length}};
 s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17483F'}};
 s.columns.forEach((c,i)=>{c.width=wide[headers[i]]||12;c.alignment={vertical:'top',wrapText:true};});
}
const fill=(row,status)=>{if(FILLS[status])row.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:FILLS[status]}};};
// data: {newDoc, oldDoc, report, filename, oldFilename}
export async function makeTextDiffWorkbook({newDoc,oldDoc,report,filename='',oldFilename=''}){
 const book=new ExcelJS.Workbook();book.creator='Datasheet 規格工作台';
 const diff=book.addWorksheet(TEXT_DIFF_SHEET);diff.addRow(TEXT_DIFF_HEADERS);
 const sections=book.addWorksheet(TEXT_SECTION_SHEET);sections.addRow(TEXT_SECTION_HEADERS);
 for(const e of report){
  const n=newDoc.sections[e.newIndex],o=oldDoc.sections[e.oldIndex];
  const srow=sections.addRow([TEXT_STATUS_LABELS[e.status],cut(sectionLabel(n))||null,cut(sectionLabel(o))||null,n?.page??null,o?.page??null,e.counts.same,e.counts.part,e.counts.changed,e.counts.added,e.counts.removed]);fill(srow,e.status);
  if(e.titleChunks){const r=diff.addRow([e.titleChunks.some(c=>c.t==='del'||c.t==='ins')?TEXT_STATUS_LABELS.changed:TEXT_STATUS_LABELS.part,cut(sectionLabel(n)),cut(sectionLabel(o)),n.page,o.page,null,cut(o.title),cut(n.title)]);r.getCell(6).value=richDiff([{t:'eq',v:'〔章節標題〕'},...e.titleChunks]);fill(r,e.titleChunks.some(c=>c.t==='del'||c.t==='ins')?'changed':'part');}
  for(const p of e.paragraphs){
   const r=diff.addRow([TEXT_STATUS_LABELS[p.status],cut(sectionLabel(n))||null,cut(sectionLabel(o))||null,p.new?.page??null,p.old?.page??null,null,p.old?cut(p.old.text):null,p.new?cut(p.new.text):null]);
   r.getCell(6).value=p.status==='same'?null:richDiff(p.chunks);fill(r,p.status);
  }
 }
 style(diff,TEXT_DIFF_HEADERS,{'新版章節':30,'舊版章節':30,'差異標示（紅刪除線＝舊版／綠底線＝新版）':70,'舊版原文':55,'新版原文':55});
 style(sections,TEXT_SECTION_HEADERS,{'新版章節':55,'舊版章節':55});
 const info=book.addWorksheet('說明');info.columns=[{header:'項目',width:22},{header:'說明',width:90}];
 [['新版檔案',filename],['舊版檔案',oldFilename],
  ['比對範圍','只比對文字敘述：段落、條列、Notes、Figure/Table 標題。已排除有框線的表格（AC/DC、指令表等）、圖中小字標籤、頁首頁尾、目錄頁及 Revision History。'],
  ['章節配對','以去除編號後的章節標題配對，型號字樣視為相同；無同名標題時再以標題相似度與章節編號輔助。網頁上可手動修正配對，匯出內容以網頁目前的配對為準。'],
  ['相同','忽略空白、斷字空白與引號樣式後完全一致。'],
  ['僅型號替換','差異只在產品型號（例如 W25QxxRW → W25QxxMV/MW/MY），文字其餘相同。'],
  ['修改','同一段落有字詞增刪；「差異標示」欄的紅色刪除線為舊版文字，綠色底線為新版文字，藍色為型號替換。'],
  ['新增 / 移除','只出現在新版或舊版的段落或章節。'],
  ['頁次','「PDF 頁」為 PDF 檔案的實際頁次，可能與頁尾印刷頁碼不同。'],
  ['限制','PDF 文字抽取依版面推斷段落；換頁、雙欄或圖文混排處可能切段不同，請以原始 PDF 為準。單一儲存格超過 32,000 字元時會截斷。']].forEach(r=>info.addRow(r));
 info.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};info.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17483F'}};info.getColumn(2).alignment={wrapText:true,vertical:'top'};
 return book.xlsx.writeBuffer();
}
