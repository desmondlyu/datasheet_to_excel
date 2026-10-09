import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {makeWorkbook} from '../../browser/workbook.mjs';
import {COLUMNS} from '../../browser/spec-core.mjs';
test('XLSX uses requested headers, numeric limits, blank cells and inert formula text',async()=>{
 const r={...Object.fromEntries(COLUMNS.map(c=>[c,''])),產品名稱:'W25Q32RW',max:50,typ:0,description:'=1+1',_status:'uncompared'};
 const bytes=await makeWorkbook({rows:[r],review:[],sources:[]});const w=new ExcelJS.Workbook();await w.xlsx.load(bytes);const s=w.getWorksheet('Specs');
 assert.deepEqual(s.getRow(1).values.slice(1),COLUMNS);assert.equal(s.getCell('B2').value,50);assert.equal(s.getCell('C2').value,0);assert.equal(s.getCell('D2').value,null);assert.equal(s.getCell('H2').value,'=1+1');assert.equal(s.getCell('H2').formula,undefined);
});
test('removed rows appear in Changes, not new Specs',async()=>{
 const bytes=await makeWorkbook({rows:[{產品名稱:'X',symbol:'A',_status:'removed'}],review:[],sources:[]});const w=new ExcelJS.Workbook();await w.xlsx.load(bytes);assert.equal(w.getWorksheet('Specs').rowCount,1);assert.equal(w.getWorksheet('Changes').rowCount,2);
});
test('ambiguous old values are included in Changes for manual review',async()=>{
 const bytes=await makeWorkbook({rows:[{產品名稱:'X',max:30,_status:'review',_candidates:[{產品名稱:'X',max:10},{產品名稱:'X',max:20}]}]});const w=new ExcelJS.Workbook();await w.xlsx.load(bytes);const s=w.getWorksheet('Changes');assert.equal(s.rowCount,4);assert.equal(s.getCell('C3').value,10);assert.equal(s.getCell('C4').value,20);
});
