import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {parsePdf} from '../../browser/pdf-parser.mjs';
const path=process.env.SPEC_SINGLE_REFERENCE_PDF;
test('single-product Plus Only byte-layout PDF extracts commands and excludes package pages',{skip:!path,timeout:120000},async()=>{
 const r=await parsePdf(pdfjs,await readFile(path));
 assert.deepEqual(r.products,['W25Q33PW']);
 // Read commands can now be expanded into AC rows; every original command must remain covered.
 for(const c of r.commands)assert.ok(r.rows.some(x=>x._command_sources?.includes(c)),c.command+' '+c.mode);
 assert.equal(r.rows.find(x=>x.parameter.includes('Standby Mode without ID')).symbol,'tRES1');
 assert.ok(r.sources.some(s=>s.section==='指令表 / Notes'&&/dummy/i.test(s.text)));
 assert.ok(r.sources.every(s=>!/\bPACKAGE|\bORDERING|\bREVISION HISTORY/i.test(s.section)));
 assert.equal(r.command_pages.length,4);
 assert.ok(r.command_pages.every(n=>r.sources.some(s=>s.pdf_page===n&&/Byte\s+1/i.test(s.text))));
 assert.ok(!r.review.some(s=>s.section.startsWith('指令表')));
 const pp=r.commands.filter(c=>c.command==='Page Program');
 assert.deepEqual(pp.map(c=>[c.opcode,c.mode,c.address]),[['02h','1-1-1','A23-A16, A15-A8, A7-A0'],['02h','4-4-4','A23-A16, A15-A8, A7-A0']]);
 const tpp=r.rows.find(x=>x.symbol==='tPP');
 const limits=r.sources.find(s=>s.pdf_page===tpp._pdf_page).text.match(/Page Program Time\s+tPP\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+ms/);
 assert.ok(limits);assert.equal(tpp.typ,Number(limits[1]));assert.equal(tpp.max,Number(limits[2]));
 assert.match(tpp._commands,/02h Page Program/);assert.match(tpp._commands,/32h Quad Input Page Program/);
 assert.equal(r.rows.filter(x=>x['spec type']==='DC').length,20);
 assert.equal(r.rows.find(x=>x.symbol==='tCE').max,40);
 assert.ok(r.commands.some(c=>c.opcode==='EDh'&&c.mode==='1-4-4'&&/DTR/.test(c.section)&&c.dummy.includes('clocks')&&/Dummy\(\d/.test(c.extra)));
});
