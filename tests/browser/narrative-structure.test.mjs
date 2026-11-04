import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSections,compareSection,pairSections,buildReport} from '../../browser/text-diff.mjs';
import {reflowSections,splitSentences,pageSpan,toComparisonMarkdown,joinWrappedText} from '../../browser/narrative-structure.mjs';

const seg=(text,y,h=9.5)=>({text,x0:72,x1:520,y,h});
const page=(n,segments)=>({n,printed:n-1,width:612,segments});
const original=(text,p=1)=>({text,page:p,printed:p-1,kind:'text'});
const section=(paragraphs)=>({number:'3.2',title:'Data Input (DI)',level:2,page:1,printed:1,paragraphs});

test('cross-page wrapped sentence compares equal to unbroken one-page sentence',()=>{
 const words='The device supports Dual SPI and Quad SPI commands with a programmable clock and dummy cycle configuration';
 const a=buildSections([
  page(4,[seg('3.2 Data Input (DI)',100,12),seg(words.slice(0,74),125)]),
  page(5,[seg(words.slice(74)+' in both modes.',125)]),
 ]);
 const b=buildSections([
  page(4,[seg('3.2 Data Input (DI)',100,12),seg(words+' in both modes.',125)]),
 ]);
 assert.equal(a.sections.length,1);
 assert.equal(b.sections.length,1);
 assert.equal(a.sections[0].paragraphs.length,1);
 assert.equal(pageSpan(a.sections[0].paragraphs[0]),'4–5');
 assert.equal(compareSection(a.sections[0],b.sections[0]).status,'same');
});

test('different PDF paragraph grouping cannot produce false added/removed differences',()=>{
 const old=reflowSections([section([original('First identical sentence. Second identical sentence.')])]);
 const newer=reflowSections([section([original('First identical sentence.'),original('Second identical sentence.')])]);
 const result=compareSection(old[0],newer[0]);
 assert.equal(result.status,'same');
 assert.deepEqual(result.paragraphs.map(x=>x.status),['same','same']);
});

test('real changes remain visible after reflow',()=>{
 const before=reflowSections([section([original('The timing value is 20 cycles. The address is 4 bytes.')])]);
 const after=reflowSections([section([original('The timing value is 24 cycles.'),original('The address is 4 bytes.')])]);
 const report=buildReport({sections:before},{sections:after},pairSections(before,after));
 assert.equal(report.length,1);
 assert.equal(report[0].status,'changed');
 assert.deepEqual(report[0].paragraphs.map(x=>x.status),['changed','same']);
});

test('lists, captions, and complete sentences do not join across pages',()=>{
 const source=section([
  original('The product supports SPI.',1),
  {...original('First security register is protected.',2),kind:'list'},
  {...original('Figure 3.1 Pin Configuration',2),kind:'caption'},
  original('An independent new paragraph starts here.',3),
 ]);
 const parsed=reflowSections([source])[0];
 assert.equal(parsed.paragraphs.length,4);
 assert.equal(parsed.paragraphs[1].kind,'list');
 assert.equal(parsed.paragraphs[2].kind,'caption');
 assert.equal(pageSpan(parsed.paragraphs[3]),'3');
});

test('soft line-wrap repair and complete sentence boundaries are conservative',()=>{
 assert.equal(joinWrappedText('configura-','tion supports SPI.'),'configuration supports SPI.');
 assert.equal(joinWrappedText('4-byte','addressing.'),'4-byte addressing.');
 assert.deepEqual(splitSentences('This is Rev. A, e.g. the revision is different. The rest is unchanged.'),[
  'This is Rev. A, e.g. the revision is different.','The rest is unchanged.'
 ]);
});

test('Markdown audit export retains page spans and exact source paragraphs',()=>{
 const oldDoc={sections:reflowSections([section([{...original('The device supports Dual SPI',14),endPage:15}])])};
 const newDoc={sections:reflowSections([section([original('The device supports Dual SPI.',17)])])};
 const md=toComparisonMarkdown(newDoc,oldDoc,{filename:'target.pdf',oldFilename:'rw.pdf'});
 assert.match(md,/## rw\.pdf/);
 assert.match(md,/<!-- PDF page 14–15 -->/);
 assert.match(md,/<!-- PDF page 17 -->/);
 assert.match(md,/The device supports Dual SPI\./);
});
