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
 'W25Q32_64_12_25_51_01_02RW-DTR_RevD3 09092026.pdf':[1442,88,96,255],
 'Preliminary W25R12_25_51_01_02RW_DTR_Rev_A2 10082026.pdf':[1160,86,91,238],
 'Product W25Q33PW_DTR_A2_01262026_Plus Only.pdf':[76,52,53,81],
 'W35T51NW AG Rev D 050825.pdf':[121,60,59,59],
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
  const sourceSpecCount=specs.reduce((n,row)=>n+(row._start==='Aligned/Any'?2:1),0);
  assert.deepEqual([sourceSpecCount,extractedCodes.size,extractedNames.size,r.commands.length],expected[file]);
  for(const product of r.products){
   const productRows=r.rows.filter(row=>row['產品名稱']===product&&row._command_sources?.length);
   assert.deepEqual(new Set(productRows.flatMap(row=>codes(row._opcode))),extractedCodes);
   for(const c of r.commands){
    const covered=productRows.filter(row=>row._command_sources.includes(c));
    assert.ok(covered.length,`${product}: ${c.opcode} ${c.command} ${c.mode} ${c.setting}`);
    assert.ok(covered.every(row=>row.condition.includes(c.mode)&&row.condition.includes(c.setting)));
    const limits=String(c.extra||'').split(';').flatMap(field=>{
     const match=field.replace(/\(\s*\d+(?:\s*,\s*\d+)*\s*\)/g,'').match(/^\s*(Aligned|Any)\s+Address\s*\(MHz\):\s*(\d+(?:\.\d+)?)(?:\s*(\([^()]+\)))?\s*$/i);
     return match?[{start:match[1],max:Number(match[2]),qualifier:match[3]||''}]:[];
    });
    for(const limit of limits)assert.ok(covered.some(row=>row.unit==='MHz'&&row.max===limit.max&&row.condition.includes(limit.qualifier)&&row._start.split('/').some(start=>start.toLowerCase()===limit.start.toLowerCase())),`${product}: ${c.command} ${limit.start} ${limit.max} MHz ${limit.qualifier}`);
    if(!limits.length)assert.ok(covered.some(row=>row.max===''&&row.unit===''));
    if(/^[14](?:d)?-[0-9]d?-[0-9]d?$/.test(c.mode))assert.ok(covered.every(row=>row._mode.startsWith(c.mode[0]==='1'?'SPI':'QPI')));
   }
  }
  const book=new ExcelJS.Workbook();await book.xlsx.load(await makeWorkbook({...r,filename:file}));
  const sheet=book.getWorksheet(COMPARE_SHEET);
  assert.deepEqual(sheet.getRow(1).values.slice(1),COMPARE_HEADERS);
  const exportedCodes=new Set(),exportedNames=new Set();
  sheet.eachRow((row,n)=>{if(n===1)return;
   assert.equal(row.getCell(5).value??'',compareRow(r.rows[n-2])[4]??'');
   assert.ok(!footnote.test(String(row.getCell(5).value||'')));assert.ok(!footnote.test(String(row.getCell(13).value||'')));
   assert.ok(!/\(\s*Def\.?\s*\)/i.test(String(row.getCell(13).value||'')));
   assert.doesNotMatch(String(row.getCell(5).value||''),/h\s*[,]|h\s+\/|\/\s+/);
   const sourceRow=r.rows[n-2];
   for(const c of sourceRow._command_sources||[]){
    codes(c.opcode).forEach(code=>{assert.ok(codes(row.getCell(5).value).includes(code));exportedCodes.add(code);});
    assert.ok(String(row.getCell(16).value).includes(c.command));exportedNames.add(c.command);
   }
   if(row.getCell(15).value==='Command'){
    assert.ok([8,9,10].every(col=>row.getCell(col).value===null));
    if(sourceRow.unit==='MHz'){assert.equal(typeof row.getCell(7).value,'number');assert.equal(row.getCell(6).value,'MHz');assert.ok(['Aligned','Any','Aligned/Any'].includes(row.getCell(14).value));}
    else assert.ok([6,7].every(col=>row.getCell(col).value===null));
   }
   assert.doesNotMatch(String(row.getCell(19).value||''),/(?:Aligned|Any) Address\s*\(MHz\):\s*\d/);
  });
  assert.deepEqual(exportedCodes,extractedCodes);assert.deepEqual(exportedNames,extractedNames);
  book.getWorksheet(COMMAND_SHEET).eachRow((row,n)=>{if(n>1){assert.ok(!footnote.test(String(row.getCell(5).value||'')));assert.ok(!footnote.test(String(row.getCell(8).value||'')));assert.ok(!/\(\s*Def\.?\s*\)/i.test(String(row.getCell(8).value||'')));}});
  const sourceText=[];book.getWorksheet('Source').eachRow((row,n)=>{if(n>1)sourceText.push(row.getCell(4).value);});assert.deepEqual(sourceText,r.sources.map(s=>s.text));
  if(file.startsWith('W25Q32_')||file.startsWith('Preliminary')){
   const fast=r.rows.filter(row=>row['產品名稱']===r.products[0]&&row._opcode==='0Bh/9Ch'&&row._mode==='SPI'&&row._dummy===8);
   assert.deepEqual(fast.map(row=>[row['spec type'],row._start,row.max]),[['AC','Aligned',133],['AC','Any',104]]);
   assert.ok(fast.every(row=>row._command_sources.some(c=>c.command==='Fast Read')&&row._command_sources.some(c=>c.command==='Read checksum')));
   const chip=r.rows.find(row=>row['產品名稱']===r.products[0]&&row.parameter==='Chip Erase'&&row._mode==='SPI');
   assert.equal(chip._start,'Aligned/Any');assert.equal(chip.max,133);assert.equal(chip.unit,'MHz');
   assert.ok(r.rows.some(row=>row.symbol==='tCE'&&row.unit==='s'));
  }
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
