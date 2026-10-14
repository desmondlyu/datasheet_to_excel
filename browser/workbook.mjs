import ExcelJS from 'exceljs';
import {normalizeOpcode,stripDummyNotes} from './spec-core.mjs';
import {COMPARE_HEADERS,STATUS_LABELS,compareRow} from './comparison-display.mjs';
export {COMPARE_HEADERS,STATUS_LABELS} from './comparison-display.mjs';
export const COMPARE_SHEET='產品規格比較表';
export const COMMAND_SHEET='指令表';
export const COMMAND_HEADERS=['比較結果','變更說明（舊 → 新）','介面模式','指令名稱','Opcode','設定','Address','Dummy','Data','其他欄位','分組','章節','新版頁碼','舊版頁碼'];
const COMMAND_FIELDS={address:'Address',dummy:'Dummy',data:'Data',extra:'其他欄位'};
function commandRow(c,compared){
 const status=compared?c._status:'uncompared',removed=status==='removed';
 const note=status==='changed'?Object.entries(c._changes||{}).map(([k,v])=>`${COMMAND_FIELDS[k]||k}：${shown(v.old)} → ${shown(v.new)}`).join('；'):status==='added'?'新版新增，舊版無對應指令。':status==='removed'?'舊版有此指令，新版已移除；本列內容為舊版。':status==='review'?'相同 介面模式／指令名稱／Opcode／設定 出現多筆，未自動配對，請人工核對。':'';
 return [STATUS_LABELS[status]||'',note,c.mode,c.command,normalizeOpcode(c.opcode),c.setting,c.address,stripDummyNotes(c.dummy),c.data,c.extra,c.group,c.section,removed?'':c.page,removed?c.page:c._old_page];
}
const FILLS={added:'FFE2F1E7',changed:'FFFFE9BE',review:'FFFFDDDA',removed:'FFE7E9EC'};
const shown=v=>v===''||v===undefined||v===null?'空白':String(v);
const pagesText=ps=>ps?.length?`PDF 第 ${ps.join(', ')} 頁`:'未偵測到指令表';
export async function makeWorkbook(result){
 const book=new ExcelJS.Workbook();book.creator='Datasheet 規格工作台';
 function sheet(name,headers,data){const s=book.addWorksheet(name);s.addRow(headers);for(const row of data)s.addRow(row.map(v=>v===''||v===undefined?null:v));s.views=[{state:'frozen',ySplit:1}];s.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,s.rowCount),column:headers.length}};s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17483F'}};s.columns.forEach((c,i)=>{c.width=['parameter','condition','description','text','raw','變更說明（舊 → 新）','相關指令','指令名稱','其他欄位','章節'].includes(headers[i])?55:18;c.alignment={vertical:'top',wrapText:true};});return s;}
 const rows=result.rows||[];const s=sheet(COMPARE_SHEET,COMPARE_HEADERS,rows.map(compareRow));
 rows.forEach((r,i)=>{const color=FILLS[r._status];if(color)s.getRow(i+2).fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};});
 const info=book.addWorksheet('說明');info.columns=[{header:'項目',width:22},{header:'說明',width:90}];
 [['新版 PDF',result.filename||'未提供'],['舊版 PDF',result.compared?(result.old_filename||'未提供'):'未比對（僅匯出新版規格）'],['匯出時間',new Date().toLocaleString('zh-TW',{hour12:false})],
  ['',''],['【比較結果欄位】',''],
  ['變更','新舊版都有此規格，但 max／typ／min／unit／description 有差異；Command 列也比較 Address／Dummy。差異列在「變更欄位」與「變更說明（舊 → 新）」。'],
  ['新增','新版才有的規格，舊版找不到對應項目。'],
  ['移除','舊版有、新版已沒有的規格；該列數值與頁碼為舊版內容。'],
  ['待確認','相同產品／規格類型／symbol／parameter／condition 出現多筆，或 AC 與指令表的同條件頻率有衝突，未自動合併／配對；原因或舊版候選值列在「變更說明」，請人工核對。'],
  ['未變更','新舊版內容相同。'],
  ['未比對','匯出時未提供舊版 PDF，只列出新版規格。'],
  ['',''],['【配對規則】','以 產品名稱 + spec type + symbol + parameter + condition 配對新舊版，Opcode 組合先統一格式與順序，空格或分隔符不同不視為新增／移除。Aligned/Any 先分開比較，再合併內容與結果相同的列。其他條件或規格名稱改寫時，仍可能顯示為一筆「新增」加一筆「移除」。'],
  ['【頻率條件欄】','Opcode 統一為 0Bh/9Ch、C7h/60h 等無空格斜線格式。SPI/QPI 顯示介面名稱：1-1-1 為 SPI、4-4-4 為 QPI，DTR 分開標示；原始 IO 模式保留在 condition，混合或未知模式不猜測。Aligned Address (MHz)／Any Address (MHz) 拆成 max、MHz 與 Starting Address；其他條件及規格相同才合併為 Aligned/Any，不同頻率分列。'],
  ['【相關指令】','列出與該規格相關的指令名稱及介面模式，指令碼放在 Opcode 欄。SPI/QPI 空白時，相關指令只有 1-1-1 回填 SPI、只有 4-4-4 回填 QPI、兩者都有回填 Both；保留該列已有的明確模式（包含 DTR），其他 IO 格式不猜測。原始相關指令、條件與比較結果不變；詳細 Address／Dummy／Data 請查「指令表」。'],
  ['【Command 列】','完整 User mode 指令均保留。相同指令／模式／Address／Dummy／設定／對齊條件已有 AC 頻率規格時，指令資料整合到 AC，不重複建立 Command 列；沒有對應者仍列為 Command。只有原文明示頻率才填 max／MHz，不補 symbol／typ／min。不同設定、Dummy 與 MHz／ms／s 規格仍分列。Factory-only 章節不加入，User mode 可執行的 Enter Factory Mode 仍保留。Data 等資訊列在 description，來源與產品限定請核對指令表及 Source。'],
  ['【數字註腳】','Opcode／Dummy 移除 (2)、(11,14) 等數字註腳，Dummy 也移除 (Def)／(Def.) 預設註記；數值與其他有效內容保留。Source 與原始 Byte 證據仍保留原文。'],
  ['指令表來源頁（新版）',pagesText(result.command_pages)],
  ['指令表來源頁（舊版）',result.compared?pagesText(result.old_command_pages):'未比對'],
  ['【底色】','底色僅為輔助：變更＝淡黃、新增＝淡綠、移除＝淡灰、待確認＝淡紅。請以「比較結果」欄位為準。'],
  ['',''],['【工作表】',''],
  [COMPARE_SHEET,'新版規格、完整 User mode Command 與新舊版比較結果，可用第一列篩選「比較結果」或「spec type」。'],
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
