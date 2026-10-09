import ExcelJS from 'exceljs';
import {COLUMNS} from './spec-core.mjs';
export async function makeWorkbook(result){
 const book=new ExcelJS.Workbook();book.creator='Datasheet 規格工作台';
 function sheet(name,headers,data){const s=book.addWorksheet(name);s.addRow(headers);for(const row of data)s.addRow(row.map(v=>v===''||v===undefined?null:v));s.views=[{state:'frozen',ySplit:1}];s.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,s.rowCount),column:headers.length}};s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17483F'}};s.columns.forEach((c,i)=>{c.width=['parameter','condition','description','text','raw'].includes(headers[i])?55:18;c.alignment={vertical:'top',wrapText:true};});return s;}
 const specs=result.rows.filter(r=>r._status!=='removed');const s=sheet('Specs',COLUMNS,specs.map(r=>COLUMNS.map(c=>r[c])));
 specs.forEach((r,i)=>{const color={added:'FFE2F1E7',changed:'FFFFE9BE',review:'FFFFDDDA'}[r._status];if(color)s.getRow(i+2).fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};});
 sheet('Changes',['status',...COLUMNS,'field','old','new'],result.rows.filter(r=>['changed','added','removed','review'].includes(r._status)).flatMap(r=>{const entries=Object.entries(r._changes||{});return (entries.length?entries:[['',{old:'',new:''}]]).map(([k,v])=>[r._status,...COLUMNS.map(c=>r[c]),k,v.old,v.new]).concat((r._candidates||[]).map(p=>['review-old',...COLUMNS.map(c=>p[c]),'舊版候選，未自動配對','','']));}));
 sheet('Review',['page','pdf_page','table','section','reason','raw'],(result.review||[]).map(r=>[r.page,r.pdf_page,r.table,r.section,r.reason,r.raw.map(row=>row.join(' | ')).join('\n')]));
 sheet('Source',['page','pdf_page','section','text'],(result.sources||[]).map(r=>[r.page,r.pdf_page,r.section,r.text]));
 return book.xlsx.writeBuffer();
}
