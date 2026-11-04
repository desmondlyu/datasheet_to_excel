import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ExcelJS from 'exceljs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {buildSections,compareSection,diffWords,pairSections,buildReport,summarize,extractNarrative} from '../../browser/text-diff.mjs';
import {makeTextDiffWorkbook,TEXT_DIFF_SHEET,TEXT_SECTION_SHEET,TEXT_DIFF_HEADERS} from '../../browser/text-diff-workbook.mjs';

const sec=(number,title,...texts)=>({number,title,level:number.split('.').length,page:1,printed:1,paragraphs:texts.map(text=>({text,page:1,printed:1,kind:'text'}))});
const seg=(text,x0,x1,y,h=9.5)=>({text,x0,x1,y,h});

test('sections: numbered headings, paragraph breaks, small drawing labels and revision history are separated',()=>{
 const doc=buildSections([{n:3,printed:3,width:612,segments:[
  seg('1. GENERAL DESCRIPTIONS',72,250,100,12),
  seg('The W25Q51MV is a serial flash.',72,300,120),
  seg('Long line of text that continues across the whole column width',72,540,140),
  seg('onto the next line.',72,200,152),
  seg('CLK',280,300,200,7),
  seg('2.1Pin Configuration SOP',72,260,240,12),
  seg('Pins are listed below.',72,200,260),
  seg('3 REVISION HISTORY',72,250,300,12),
  seg('Rev A1 initial release with many words to keep the body height dominant',72,540,320),
 ]}]);
 assert.deepEqual(doc.sections.map(s=>[s.number,s.title]),[['1','GENERAL DESCRIPTIONS'],['2.1','Pin Configuration SOP']]);
 assert.deepEqual(doc.sections[0].paragraphs.map(p=>p.text),['The W25Q51MV is a serial flash.','Long line of text that continues across the whole column width onto the next line.']);
 assert.equal(doc.sections[0].paragraphs[0].page,3);
});

test('paragraph diff: spacing and hyphenation splits are equal, part numbers are separate, words are marked',()=>{
 const c=compareSection(sec('1','A','It is avail able in “SOP” packages.','The W25QxxRW supports Dual SPI.','See section 2 for the pin configuration.'),sec('1','A','It is available in "SOP" packages.','The W25QQxxMV/MW/MY supports Dual SPI.','See Figure 2.x for the pin configuration.'));
 assert.deepEqual(c.paragraphs.map(p=>p.status),['same','part','changed']);
 assert.equal(c.status,'changed');
 assert.deepEqual(c.paragraphs[1].chunks.find(x=>x.t==='part'),{t:'part',o:'W25QxxRW ',n:'W25QQxxMV/MW/MY '});
 const chunks=c.paragraphs[2].chunks;
 assert.equal(chunks.filter(x=>x.t==='del').map(x=>x.v.trim()).join(' '),'section 2');
 assert.equal(chunks.filter(x=>x.t==='ins').map(x=>x.v.trim()).join(' '),'Figure 2.x');
 assert.deepEqual(diffWords('1μs, this','1μS, this').filter(x=>x.t!=='eq'),[{t:'del',v:'1μs, '},{t:'ins',v:'1μS, '}]);
});

test('paragraph alignment keeps order and reports inserted and removed paragraphs',()=>{
 const c=compareSection(sec('1','A','Alpha beta gamma delta.','Removed paragraph only in old.','Epsilon zeta eta theta.'),sec('1','A','Alpha beta gamma delta.','Brand new paragraph about interrupts.','Epsilon zeta eta theta iota.'));
 assert.deepEqual(c.paragraphs.map(p=>p.status).sort(),['added','changed','removed','same']);
 assert.equal(c.paragraphs[0].status,'same');
 assert.equal(c.paragraphs.at(-1).status,'changed');
});

test('sections pair by title across renumbering; unmatched sections become added or removed',()=>{
 const oldSecs=[sec('5.6.1','Write Password(28h)','x'),sec('5.4.1','W25Q32RW Status Register Memory Protection (WPS = 0, CMP = 0)','y'),sec('3.7','BUSY (/BUSY) and Reset Output (/RSTO)','z')];
 const newSecs=[sec('5.3.19','W25Q01MV/MW/MY Status Register Memory Protection (WPS = 0, CMP = 0)','y'),sec('5.5.1','Write Password(28h)','x'),sec('3.10','Interrupt Output (/INT)','w')];
 const pairing=pairSections(oldSecs,newSecs);
 assert.deepEqual(pairing,[1,0,-1]);
 const report=buildReport({sections:oldSecs},{sections:newSecs},pairing);
 // Removed old sections follow their nearest paired predecessor in old-document order.
 assert.deepEqual(report.map(e=>[e.newIndex,e.oldIndex,e.status]),[[0,1,'part'],[-1,2,'removed'],[1,0,'same'],[2,-1,'added']]);
 assert.deepEqual(summarize(report),{same:1,part:1,changed:0,added:1,removed:1});
});

test('text diff workbook: paragraph rows, rich-text markup, section overview and inert formula text',async()=>{
 const oldDoc={sections:[sec('3.3','Write Protect (/WP)','See section 2 for details.','=1+1')]},newDoc={sections:[sec('3.3','Write Protect (/WP)','See Figure 2.x for details.','=1+1')]};
 const report=buildReport(oldDoc,newDoc,pairSections(oldDoc.sections,newDoc.sections));
 const w=new ExcelJS.Workbook();await w.xlsx.load(await makeTextDiffWorkbook({oldDoc,newDoc,report,filename:'new.pdf',oldFilename:'old.pdf'}));
 assert.deepEqual(w.worksheets.map(s=>s.name),[TEXT_DIFF_SHEET,TEXT_SECTION_SHEET,'說明']);
 const s=w.getWorksheet(TEXT_DIFF_SHEET);
 assert.deepEqual(s.getRow(1).values.slice(1),TEXT_DIFF_HEADERS);
 assert.equal(s.getCell('A2').value,'修改');assert.equal(s.getCell('B2').value,'3.3 Write Protect (/WP)');assert.equal(s.getCell('G2').value,'See section 2 for details.');
 const runs=s.getCell('F2').value.richText;
 assert.ok(runs.some(r=>r.font?.strike&&r.text.includes('section')));assert.ok(runs.some(r=>r.font?.underline&&r.text.includes('Figure')));
 assert.equal(s.getCell('A3').value,'相同');assert.equal(s.getCell('H3').value,'=1+1');assert.equal(s.getCell('H3').formula,undefined);
 assert.equal(w.getWorksheet(TEXT_SECTION_SHEET).getCell('H2').value,1);
});

const newPdf=process.env.SPEC_TEXT_NEW_PDF,oldPdf=process.env.SPEC_TEXT_OLD_PDF;
test('private W25Q51MV vs W25Q51RW narrative comparison',{skip:!(newPdf&&oldPdf),timeout:180000},async()=>{
 const newDoc=await extractNarrative(pdfjs,await readFile(newPdf)),oldDoc=await extractNarrative(pdfjs,await readFile(oldPdf));
 const report=buildReport(oldDoc,newDoc,pairSections(oldDoc.sections,newDoc.sections));
 const find=(number,title)=>report.find(e=>newDoc.sections[e.newIndex]?.number===number&&newDoc.sections[e.newIndex].title.startsWith(title));
 assert.ok(!newDoc.sections.some(s=>/REVISION HISTORY|TABLE OF CONTENTS/i.test(s.title)));
 assert.equal(find('6.3.5','Write Status Register-1').status,'same');
 assert.equal(oldDoc.sections[find('6.3.5','Write Status Register-1').oldIndex].number,'6.3.5');
 assert.equal(find('5.1.2','Dual SPI Instructions').status,'part');
 const wp=find('3.3','Write Protect');assert.equal(wp.status,'changed');
 assert.ok(wp.paragraphs[0].chunks.some(c=>c.t==='ins'&&c.v.includes('Figure 2.x')));
 assert.equal(find('3.9','Reset Output (/RSTO)').status,'added');
 const pw=find('5.5.1','Write Password');assert.equal(oldDoc.sections[pw.oldIndex].number,'5.6.1');assert.equal(pw.status,'same');
});
