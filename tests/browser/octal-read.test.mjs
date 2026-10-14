import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import ExcelJS from 'exceljs';
import {parsePdf} from '../../browser/pdf-parser.mjs';
import {makeRow} from '../../browser/spec-core.mjs';
import {commandSpecRows} from '../../browser/commands.mjs';
import {supplementReadSpecs} from '../../browser/read-specs.mjs';
import {compareRow,COMPARE_HEADERS} from '../../browser/comparison-display.mjs';
import {makeWorkbook,COMPARE_SHEET} from '../../browser/workbook.mjs';

const command=(opcode,mode,name='Read Status Register',extra='')=>({opcode,mode,command:name,extra,address:'-',dummy:'0',section:'Command Set Table',page:74,pdf_page:75});
const group=(parameter,mode,max,symbol='FR',temperature='+105')=>makeRow('X',{parameter,condition:`${mode}; Operating Temperature –40°C to ${temperature}°C`,unit:'MHz',max,min:'D.C.',symbol},{kind:'AC',page:162,pdfPage:163,section:'AC'});
const groups=()=>[group('Clock frequency except for Read','SDR',166),group('Clock frequency except for Read','DDR',200),group('Clock frequency for Read (03h/13h/23h)','SDR',54,'fR')];
test('octal read commands split by first phase and inherit only matching AC conditions',()=>{
 const commands=[command('05h','1-0-1（SDR）；8d-0-8d（ODDR）'),command('03h','1-1-1（SDR）','Read Data'),command('9Dh','1-1d-8d（SDR）；8d-8d-8d（ODDR）','Fast Read DDR')];
 const out=supplementReadSpecs([...groups(),group('Clock frequency except for Read','SDR',150,'FR','+125'),...commandSpecRows(commands,['X'])],commands,[],[]).rows;
 const values=opcode=>out.filter(r=>r._opcode===opcode).map(r=>[...compareRow(r).slice(4,11),r.condition]);
 assert.deepEqual(values('05h').map(v=>v.slice(0,7)),[['05h','MHz',166,'','D.C.','FR','SDR'],['05h','MHz',200,'','D.C.','FR','DDR'],['05h','MHz',150,'','D.C.','FR','SDR']]);
 assert.ok(values('05h').find(v=>v[2]===150)[7].includes('+125'));
 assert.deepEqual(values('03h').map(v=>v.slice(0,7)),[['03h','MHz',54,'','D.C.','fR','SDR']]);
 assert.deepEqual(values('9Dh').map(v=>[v[2],v[6]]),[[166,'SDR'],[200,'DDR'],[150,'SDR']]);
 const ddrSummary=out.find(r=>r.parameter==='Clock frequency except for Read'&&r.condition.startsWith('DDR'));
 assert.ok(!ddrSummary._commands.includes('03h'));
 assert.ok(!ddrSummary._commands.includes('1-0-1'));
});
test('explicit command frequency and unsupported octal modes do not acquire generic limits',()=>{
 const protectedRead=command('05h','1-0-1（SDR）；8d-0-8d（ODDR）','Read Status Register','Any Address (MHz): 108');
 const unknown=command('7Dh','8-8-8','Read Advanced ECC Register');
 const original=commandSpecRows([protectedRead,unknown],['X']);
 const out=supplementReadSpecs([...groups(),...original],[protectedRead,unknown],[],[]).rows;
 assert.deepEqual(out.filter(r=>r['spec type']==='Command'),original);
 assert.ok(out.filter(r=>r._read_group).every(r=>!r._commands.includes('05h')));
});
test('missing mode groups and unsupported protocol fragments retain command evidence',()=>{
 const c=command('05h','1-0-1（SDR）；8d-0-8d（ODDR）；8-8-8');
 const out=supplementReadSpecs([groups()[0],...commandSpecRows([c],['X'])],[c],[],[]).rows.filter(r=>r._opcode==='05h');
 assert.ok(out.some(r=>r._mode==='SDR'&&r.max===166));
 assert.ok(out.some(r=>r._mode==='DDR'&&r['spec type']==='Command'&&r.max===''));
 assert.ok(out.some(r=>r._io==='8-8-8'&&r['spec type']==='Command'&&r.max===''));
});
test('an unrelated product keeps its SPI commands when another product has octal groups',()=>{
 const octal=command('05h','1-0-1（SDR）；8d-0-8d（ODDR）'),spi=command('06h','1-1-1','Write Enable');
 const original=commandSpecRows([spi],['OTHER']);
 const out=supplementReadSpecs([...groups(),...original],[octal,spi],[],[]).rows;
 assert.deepEqual(out.filter(r=>r['產品名稱']==='OTHER'),original);
});

const path=process.env.SPEC_SECOND_REFERENCE_PDF;
test('W35T octal reads preserve SDR-only commands, temperature groups and Excel parity',{skip:!path,timeout:120000},async()=>{
 const r=await parsePdf(pdfjs,await readFile(path));
 const reads=code=>r.rows.filter(x=>x._opcode===code&&x._read_origin==='octal-read-group');
 assert.equal(reads('05h').length,4);
 assert.deepEqual(reads('05h').map(x=>[x.max,x._mode,x.symbol,x.unit,x.min,x.typ]),[[166,'SDR','FR','MHz','D.C.',''],[200,'DDR','FR','MHz','D.C.',''],[166,'SDR','FR','MHz','D.C.',''],[200,'DDR','FR','MHz','D.C.','']]);
 for(const code of ['03h','13h','23h']){assert.equal(reads(code).length,2);assert.ok(reads(code).every(x=>x._mode==='SDR'&&x.max===54&&x.symbol==='fR'));}
 assert.ok(reads('9Dh').some(x=>x._mode==='SDR'&&x.max===166));
 assert.ok(reads('9Dh').some(x=>x._mode==='DDR'&&x.max===200));
 assert.equal(r.commands.find(c=>c.opcode==='05h').mode,'1-0-1（SDR）；8d-0-8d（ODDR）');
 for(const c of r.commands)assert.ok(r.rows.some(x=>x._command_sources?.includes(c)),c.command);
 const rows=reads('05h'),book=new ExcelJS.Workbook();await book.xlsx.load(await makeWorkbook({...r,rows}));
 const sheet=book.getWorksheet(COMPARE_SHEET);
 rows.forEach((row,i)=>assert.deepEqual(COMPARE_HEADERS.map((_,j)=>sheet.getRow(i+2).getCell(j+1).value),compareRow(row).map(v=>v===''||v===undefined?null:v)));
});
