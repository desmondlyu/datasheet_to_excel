import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import ExcelJS from 'exceljs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {parsePdf} from '../../browser/pdf-parser.mjs';
import {compareRows} from '../../browser/spec-core.mjs';
import {compareCommands} from '../../browser/commands.mjs';
import {makeWorkbook,COMPARE_HEADERS,COMPARE_SHEET,COMMAND_SHEET} from '../../browser/workbook.mjs';
import {compareRow} from '../../browser/comparison-display.mjs';
import {textItems,textIn,rulingLines,findCells,groupTables} from '../../browser/geometry.mjs';

const dir=process.env.SPEC_COMMAND_REFERENCE_DIR;
const codes=value=>[...String(value||'').matchAll(/\b([0-9a-f]{2})h\b/gi)].map(m=>m[1].toUpperCase()+'h');
const footnote=/\(\s*\d+(?:\s*,\s*\d+)*\s*\)/;
const expected={
 'W25Q32_64_12_25_51_01_02RW-DTR_RevD3 09092026.pdf':[1442,88,96],
 'Preliminary W25R12_25_51_01_02RW_DTR_Rev_A2 10082026.pdf':[1160,86,91],
 'Product W25Q33PW_DTR_A2_01262026_Plus Only.pdf':[76,52,53],
 'W35T51NW AG Rev D 050825.pdf':[121,60,59],
};
const quiet={...pdfjs,getDocument:options=>pdfjs.getDocument({...options,verbosity:0})};

test('provided PDF collection exports all user commands with template header order and clean notes',{skip:!dir,timeout:180000},async t=>{
 const template=new ExcelJS.Workbook();await template.xlsx.readFile(join(dir,'title_sequence.xlsx'));
 assert.deepEqual(COMPARE_HEADERS,template.worksheets[0].getRow(1).values.slice(1));
 const files=(await readdir(dir)).filter(f=>Object.hasOwn(expected,f));assert.equal(files.length,4);
 const results=new Map();
 for(const file of files)await t.test(file,async()=>{
  const data=await readFile(join(dir,file)),r=await parsePdf(quiet,data);results.set(file,r);
  const specs=r.rows.filter(row=>row['spec type']!=='Command'),commands=r.rows.filter(row=>row['spec type']==='Command');
  const extractedCodes=new Set(r.commands.flatMap(c=>codes(c.opcode))),extractedNames=new Set(r.commands.map(c=>c.command));
  assert.deepEqual([specs.length,extractedCodes.size,extractedNames.size],expected[file]);
  assert.equal(commands.length,r.commands.length*r.products.length);
  for(const product of r.products){
   const productRows=commands.filter(row=>row['產品名稱']===product);
   assert.deepEqual(new Set(productRows.flatMap(row=>codes(row._opcode))),extractedCodes);
   for(const c of r.commands)assert.ok(productRows.some(row=>row.parameter===c.command&&row._opcode===c.opcode&&row._mode===c.mode&&row.condition.includes(c.setting)));
  }
  const book=new ExcelJS.Workbook();await book.xlsx.load(await makeWorkbook({...r,filename:file}));
  const sheet=book.getWorksheet(COMPARE_SHEET);
  assert.deepEqual(sheet.getRow(1).values.slice(1),COMPARE_HEADERS);
  const exportedCodes=new Set(),exportedNames=new Set();
  sheet.eachRow((row,n)=>{if(n===1)return;
   assert.equal(row.getCell(5).value??'',compareRow(r.rows[n-2])[4]??'');
   assert.ok(!footnote.test(String(row.getCell(5).value||'')));assert.ok(!footnote.test(String(row.getCell(13).value||'')));
   assert.ok(!/\(\s*Def\s*\)/i.test(String(row.getCell(13).value||'')));
   if(row.getCell(15).value==='Command'){codes(row.getCell(5).value).forEach(code=>exportedCodes.add(code));exportedNames.add(row.getCell(17).value);
    assert.ok([6,7,8,9,10].every(col=>row.getCell(col).value===null));
   }
  });
  assert.deepEqual(exportedCodes,extractedCodes);assert.deepEqual(exportedNames,extractedNames);
  book.getWorksheet(COMMAND_SHEET).eachRow((row,n)=>{if(n>1){assert.ok(!footnote.test(String(row.getCell(5).value||'')));assert.ok(!footnote.test(String(row.getCell(8).value||'')));assert.ok(!/\(\s*Def\s*\)/i.test(String(row.getCell(8).value||'')));}});
  if(file.startsWith('W25Q32_')){
   const task=quiet.getDocument({data:new Uint8Array(data)});
   try{
    const doc=await task.promise,rawCodes=new Set();
    for(const n of r.command_pages){
     const page=await doc.getPage(n),viewport=page.getViewport({scale:1}),items=textItems(await page.getTextContent(),viewport);
     const tables=groupTables(findCells(rulingLines(await page.getOperatorList(),pdfjs.OPS,viewport)));
     for(const table of tables){
      const opcode=table.cells.find(c=>Math.abs(c[1]-table.bbox[1])<1&&/^Opcode$/i.test(textIn(items,c)));
      if(!opcode)continue;
      for(const cell of table.cells.filter(c=>Math.abs(c[0]-opcode[0])<1&&Math.abs(c[2]-opcode[2])<1&&c[1]>=opcode[3]-1))codes(textIn(items,cell)).forEach(code=>rawCodes.add(code));
     }
    }
    assert.deepEqual(extractedCodes,rawCodes);
   }finally{await task.destroy();}
  }
 });
 await t.test('old/new comparison includes removed commands and keeps preview/export parity',async()=>{
  const newer=results.get(Object.keys(expected)[0]),older=results.get(Object.keys(expected)[1]);
  const result={...newer,rows:compareRows(newer.rows,older.rows),commands:compareCommands(newer.commands,older.commands),old_command_pages:older.command_pages,compared:true};
  assert.ok(result.rows.some(row=>row['spec type']==='Command'&&row._status==='removed'));
  const book=new ExcelJS.Workbook();await book.xlsx.load(await makeWorkbook(result));const sheet=book.getWorksheet(COMPARE_SHEET);
  sheet.eachRow((row,n)=>{if(n>1)assert.deepEqual(COMPARE_HEADERS.map((_,i)=>row.getCell(i+1).value),compareRow(result.rows[n-2]).map(value=>value===''||value===undefined?null:value));});
 });
});
