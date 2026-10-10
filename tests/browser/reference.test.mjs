import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {parsePdf} from '../../browser/pdf-parser.mjs';
import {compareRows} from '../../browser/spec-core.mjs';
const path=process.env.SPEC_REFERENCE_PDF;
test('private reference PDF without stream async iteration: products, DC/AC, matrix, notes and comparison', {skip:!path,timeout:120000},async()=>{
 const original=Object.getOwnPropertyDescriptor(ReadableStream.prototype,Symbol.asyncIterator);
 delete ReadableStream.prototype[Symbol.asyncIterator];
 let r;try{r=await parsePdf(pdfjs,await readFile(path));}
 finally{if(original)Object.defineProperty(ReadableStream.prototype,Symbol.asyncIterator,original);}
 const find=(symbol,product='W25Q32RW',page)=>r.rows.filter(x=>x.symbol===symbol&&x['產品名稱']===product&&(page===undefined||x.page===page));
 assert.equal(r.products.length,7);
 for(const p of r.products)assert.equal(r.rows.filter(x=>x['產品名稱']===p&&x['spec type']==='DC').length,20,p);
 assert.equal(find('ICC2')[0].typ,0.1);
 assert.equal(find('ICC2','W25Q02RW')[0].typ,0.4);
 assert.equal(find('CIN','W25Q02RW')[0].max,24);
 assert.deepEqual(find('Icc3').map(x=>x.max),[7,9,10,12,13,12]);
 assert.equal(find('VIL')[0].min,-.5);
 assert.equal(find('tCE','W25Q32RW',178)[0].max,25);
 assert.equal(find('tCE','W25Q02RW',178)[0].max,400);
 assert.equal(find('tPP')[0].typ,.15);
 assert.equal(find('tWR')[0].max,200);
 assert.equal(find('tCHDX','W25Q02RW')[0].min,2.5);
 assert.equal(find('VIN','W25Q32RW',171)[0]['spec type'],'AC');
 assert.match(find('tCE','W25Q32RW',179)[0].condition,/Factory Mode.*1\.8V/);
 assert.match(find('tDP')[0]._notes,/guaranteed by design/);
 const freq=r.rows.filter(x=>x['產品名稱']==='W25Q32RW'&&x.page===172&&x.condition.includes('opcode=EBh;')&&x.condition.includes('Dummy=16;'));
 assert.deepEqual(freq.map(x=>x.max),[200,133]);
 assert.match(freq[0].condition,/DS bit enabled/);
 assert.equal(r.rows.length,1442);
 assert.ok(compareRows(r.rows,r.rows).every(x=>x._status==='unchanged'));
});
test('unsupported-only page retains original tables and source for export',{skip:!path,timeout:120000},async()=>{
 const r=await parsePdf(pdfjs,await readFile(path),{pages:[181]});
 assert.equal(r.rows.length,0);assert.ok(r.review.length>0);assert.ok(r.sources[0].text.includes('Alternative'));
});
