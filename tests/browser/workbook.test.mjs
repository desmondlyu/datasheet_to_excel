import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {makeWorkbook,COMPARE_SHEET,COMPARE_HEADERS} from '../../browser/workbook.mjs';
import {COLUMNS,compareRows} from '../../browser/spec-core.mjs';
const blank=()=>Object.fromEntries(COLUMNS.map(c=>[c,'']));
const load=async result=>{const w=new ExcelJS.Workbook();await w.xlsx.load(await makeWorkbook(result));return w;};
test('XLSX uses comparison headers, numeric limits, blank cells and inert formula text',async()=>{
 const r={...blank(),產品名稱:'W25Q32RW',max:50,typ:0,description:'=1+1',page:12,_status:'uncompared'};
 const w=await load({rows:[r],review:[],sources:[]});const s=w.getWorksheet(COMPARE_SHEET);
 assert.equal(w.getWorksheet('Specs'),undefined);assert.equal(w.getWorksheet('Changes'),undefined);
 assert.deepEqual(w.worksheets.map(x=>x.name),[COMPARE_SHEET,'說明','Review','Source']);
 assert.deepEqual(s.getRow(1).values.slice(1),COMPARE_HEADERS);
 assert.equal(s.getCell('A2').value,'未比對');assert.equal(s.getCell('E2').value,50);assert.equal(s.getCell('F2').value,0);assert.equal(s.getCell('G2').value,null);
 assert.equal(s.getCell('K2').value,'=1+1');assert.equal(s.getCell('K2').formula,undefined);assert.equal(s.getCell('N2').value,12);assert.equal(s.getCell('O2').value,null);
});
test('changed, added and removed rows are described in text with old and new pages',async()=>{
 const row=kw=>({...blank(),產品名稱:'X',symbol:'ICC1',max:50,unit:'mA',...kw});
 const rows=compareRows([row({max:60,page:20}),row({symbol:'ICC2',page:21})],[row({page:18}),row({symbol:'ICC3',page:19})]);
 const s=(await load({rows,review:[],sources:[],compared:true})).getWorksheet(COMPARE_SHEET);
 assert.equal(s.rowCount,4);
 assert.deepEqual([2,3,4].map(i=>s.getCell('A'+i).value),['變更','新增','移除']);
 assert.equal(s.getCell('B2').value,'max');assert.equal(s.getCell('C2').value,'max：50 → 60');
 assert.equal(s.getCell('N2').value,20);assert.equal(s.getCell('O2').value,18);
 assert.equal(s.getCell('N3').value,20+1);assert.equal(s.getCell('O3').value,null);
 assert.match(s.getCell('C4').value,/新版已移除/);assert.equal(s.getCell('N4').value,null);assert.equal(s.getCell('O4').value,19);
});
test('ambiguous old candidates are listed in the change description',async()=>{
 const s=(await load({rows:[{產品名稱:'X',max:30,page:5,_status:'review',_candidates:[{產品名稱:'X',max:10,page:3},{產品名稱:'X',max:20,page:4}]}]})).getWorksheet(COMPARE_SHEET);
 assert.equal(s.rowCount,2);assert.equal(s.getCell('A2').value,'待確認');
 assert.match(s.getCell('C2').value,/舊版候選 1：max 10.*舊版頁 3/);assert.match(s.getCell('C2').value,/舊版候選 2：max 20.*舊版頁 4/);
 assert.equal(s.getCell('O2').value,'3, 4');
});
test('info sheet records file names and status definitions',async()=>{
 const s=(await load({rows:[],filename:'new.pdf',old_filename:'old.pdf',compared:true})).getWorksheet('說明');
 const text=[];s.eachRow(r=>text.push(r.values.slice(1).join('|')));const all=text.join('\n');
 assert.match(all,/新版 PDF\|new\.pdf/);assert.match(all,/舊版 PDF\|old\.pdf/);
 for(const label of ['變更','新增','移除','待確認','未變更','未比對'])assert.match(all,new RegExp('^'+label+'\\|','m'));
});
