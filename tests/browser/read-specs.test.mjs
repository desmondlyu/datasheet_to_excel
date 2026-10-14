import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {parsePdf} from '../../browser/pdf-parser.mjs';
import ExcelJS from 'exceljs';
import {makeWorkbook,COMPARE_SHEET,COMPARE_HEADERS} from '../../browser/workbook.mjs';
import {compareRow} from '../../browser/comparison-display.mjs';
import {makeRow} from '../../browser/spec-core.mjs';
import {commandSpecRows} from '../../browser/commands.mjs';
import {supplementReadSpecs,parseReadParameterTable} from '../../browser/read-specs.mjs';

const groups=()=>[
 makeRow('X',{parameter:'Clock frequency except for Read Data (03h) & DTR instructions',symbol:'FR',unit:'MHz',max:133,min:'D.C.'},{kind:'AC',page:90,pdfPage:91,section:'AC'}),
 makeRow('X',{parameter:'Clock frequency DTR instructions',symbol:'FR',unit:'MHz',max:104,min:'D.C.'},{kind:'AC',page:90,pdfPage:91,section:'AC'}),
 makeRow('X',{parameter:'Clock frequency for Read Data instruction (03h)',symbol:'fR',unit:'MHz',max:84,min:'D.C.'},{kind:'AC',page:90,pdfPage:91,section:'AC'})
];
const read=extra=>({command:'Fast Read Quad I/O',opcode:'EBh',mode:'1-4-4',address:'A23-A0',dummy:'6',setting:'',section:'SPI Commands',page:23,pdf_page:24,extra});
test('explicit command frequency tables stay untouched by read groups and embedded tables',()=>{
 const c=read('Aligned Address (MHz): 104'),original=commandSpecRows([c],['X']),before=JSON.stringify(original);
 const out=supplementReadSpecs([...groups(),...original],[c],[{codes:['EBh'],mode:'SPI',dummy:16,max:166,setting:'P6-P4 = 111',page:73,pdfPage:74,section:'Set Read Parameters'}],[]);
 assert.deepEqual(out.rows.filter(r=>r['spec type']==='Command'),original);
 assert.equal(JSON.stringify(original),before);
 assert.ok(!out.rows.some(r=>r._read_origin));
 assert.ok(out.rows.filter(r=>r._read_group).every(r=>!r._commands.includes('EBh')));
 const unknown=read('Any Address (MHz): X'),raw=commandSpecRows([unknown],['X']);
 assert.deepEqual(supplementReadSpecs([...groups(),...raw],[unknown],[],[]).rows.filter(r=>r['spec type']==='Command'),raw);
});
test('an unresolved embedded frequency does not receive a generic AC fallback',()=>{
 const content=[['SPI EBh P6 P5 P4','DUMMY CLOCKS','MAXIMUM READ FREQ.'],['0 0 0','6','X']],cells=[],items=[];
 content.forEach((row,y)=>row.forEach((text,x)=>{cells.push([x*100,y*20,(x+1)*100,(y+1)*20]);items.push({text,x:x*100+2,y:y*20+10,width:90,height:8});}));
 const parsed=parseReadParameterTable({cells,bbox:[0,0,300,40]},items,{page:73,pdfPage:74,section:'Set Read Parameters',text:''});
 const c=read(''),inventory=commandSpecRows([c],['X']);
 const out=supplementReadSpecs([...groups(),...inventory],[c],parsed.records,[],parsed.scopes);
 assert.ok(out.rows.some(r=>r._opcode==='EBh'&&r['spec type']==='Command'&&r.max===''));
 assert.ok(!out.rows.some(r=>r._opcode==='EBh'&&r._read_origin==='read-group'));
 assert.ok(out.rows.filter(r=>r._read_group).every(r=>!r._commands.includes('EBh')));
});
test('a missing AC group preserves commands that have embedded settings',()=>{
 const c={...read(''),command:'DTR Fast Read Quad I/O',mode:'SPI_DTR',opcode:'EDh'};
 const original=commandSpecRows([c],['X']);
 const out=supplementReadSpecs([groups()[0],...original],[c],[{codes:['EDh'],mode:'SPI_DTR',dummy:16,max:104,setting:'P6-P4 = 111',page:74,pdfPage:75,section:'Set Read Parameters'}],[]);
 assert.deepEqual(out.rows.filter(r=>r['spec type']==='Command'),original);
});

const path=process.env.SPEC_SINGLE_REFERENCE_PDF;
test('single-product read groups and embedded parameter tables retain distinct source conditions',{skip:!path,timeout:120000},async t=>{
 const r=await parsePdf({...pdfjs,getDocument:o=>pdfjs.getDocument({...o,verbosity:0})},await readFile(path));
 const config=(opcode,mode)=>r.rows.filter(x=>x._read_origin==='parameter-table'&&x._opcode===opcode&&x._mode===mode);
 await t.test('SPI EB settings retain every dummy limit, alignment and AC values',()=>{
  const eb=config('EBh','SPI');
  assert.deepEqual(eb.map(x=>[x._setting,x._dummy,x.max]),[['P6-P4 = 000',6,104],['P6-P4 = 001',6,104],['P6-P4 = 010',6,104],['P6-P4 = 011',8,133],['P6-P4 = 100',10,133],['P6-P4 = 101',12,133],['P6-P4 = 110',14,133],['P6-P4 = 111',16,166]]);
  assert.ok(eb.every(x=>x['spec type']==='AC'&&x.symbol==='FR'&&x.unit==='MHz'&&x.min==='D.C.'&&x.typ===''&&x._start==='Aligned'));
  assert.ok(eb.find(x=>x._dummy===16).description.includes('*'));
 });
 await t.test('DTR dummy 16 stays 104 MHz and does not inherit SDR 166',()=>{
  for(const [opcode,mode] of [['EDh','SPI_DTR'],['0Dh','QPI_DTR'],['EDh','QPI_DTR'],['0Eh','QPI_DTR']])assert.ok(config(opcode,mode).some(x=>x._dummy===16&&x.max===104&&x._read_group==='dtr'));
  assert.ok(!config('EDh','SPI_DTR').some(x=>x.max===166));
 });
 await t.test('other read uses inherit the correct group and explicit fR prose wins',()=>{
  for(const [opcode,max,symbol] of [['03h',84,'fR'],['83h',84,'fR'],['05h',133,'FR'],['25h',133,'FR'],['90h',133,'FR'],['48h',133,'FR'],['BDh',104,'FR']]){
   assert.ok(r.rows.some(x=>x._read_origin==='read-group'&&x._opcode===opcode&&x.max===max&&x.symbol===symbol),opcode);
  }
  assert.ok(r.rows.some(x=>x._opcode==='C0h'&&x['spec type']==='Command'&&x.unit===''));
  const excluded=r.rows.find(x=>/^Clock frequency except/.test(x.parameter));
  assert.ok(!/(?:^|；)03h\s/.test(excluded._commands));
  assert.ok(!/DTR Fast Read/.test(excluded._commands));
 });
 await t.test('unlisted opcode and duplicate source settings remain reviewable',()=>{
  assert.ok(config('ECh','SPI').every(x=>x._status==='review'&&x._merge_conflict));
  assert.equal(config('ECh','SPI').length,8);
  assert.ok(r.review.some(x=>/重複/.test(x.reason)&&x.page===74));
  assert.ok(r.sources.some(x=>x.page===73&&/MAXIMUM/.test(x.text)));
  assert.ok(r.sources.some(x=>x.page===74&&/DTR/.test(x.text)));
 });
 await t.test('new rows use the same preview and Excel projection',async()=>{
  const rows=[...config('EBh','SPI'),...config('EDh','SPI_DTR')];
  assert.ok(rows.length>0);
  const book=new ExcelJS.Workbook();await book.xlsx.load(await makeWorkbook({...r,rows}));const sheet=book.getWorksheet(COMPARE_SHEET);
  rows.forEach((row,i)=>assert.deepEqual(COMPARE_HEADERS.map((_,j)=>sheet.getRow(i+2).getCell(j+1).value),compareRow(row).map(v=>v===''||v===undefined?null:v)));
 });
});
