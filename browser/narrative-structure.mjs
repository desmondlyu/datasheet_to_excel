// Pure-JavaScript, MarkItDown-style semantic normalization for narrative PDF text.
// The structured sections are the canonical comparison input; Markdown is an
// inspectable export. PDF.js supplies page evidence; no Python/server is needed.
const TERMINATOR=/[.!?;:。！？][)"'\]]*$/;
const ABBREVIATION=/(?:\be\.g|\bi\.e|\bFig|\bFigs|\bNo|\bRev|\bSec|\betc|\bvs|\bMr|\bDr)\.$/i;

export function endsSentence(value){
 const text=String(value??'').trim().replace(/[)"'\]]+$/,'');
 return TERMINATOR.test(String(value??'').trim())&&!ABBREVIATION.test(text);
}
export function joinWrappedText(left,right){
 const a=String(left??'').trim(),b=String(right??'').trim();
 // Repair a clear word wrap, not compound technical names such as "Quad-SPI".
 if(/[a-z]{2,}-$/.test(a)&&/^[a-z]/.test(b))return a.slice(0,-1)+b;
 return [a,b].filter(Boolean).join(' ');
}
function canJoin(a,b){
 if(!a||a.kind!=='text'||b.kind!=='text'||endsSentence(a.text))return false;
 if(a.text.length>2400||b.text.length>2400)return false;
 const lastPage=a.endPage??a.page;
 // Continuation on an adjacent PDF page, or a lowercase continuation in the
 // same page. Do not silently merge lists and Figure/Table captions.
 return lastPage!==b.page||/^[a-z(]/.test(b.text);
}
const SENTENCE_END=/[.!?;。！？]/;
const SENTENCE_START=/^[A-Z(“"'‘]/;
export function splitSentences(input){
 const text=String(input??'').replace(/\s+/g,' ').trim();
 if(!text)return [];
 const out=[];let begin=0;
 for(let i=0;i<text.length;i++){
  if(!SENTENCE_END.test(text[i]))continue;
  if(!/\s/.test(text[i+1]??''))continue;
  const left=text.slice(begin,i+1);
  if(text[i]==='.'&&ABBREVIATION.test(left))continue;
  const rest=text.slice(i+1).trimStart();
  if(!SENTENCE_START.test(rest))continue;
  out.push(text.slice(begin,i+1).trim());
  begin=i+1;while(/\s/.test(text[begin]??''))begin++;
 }
 const tail=text.slice(begin).trim();if(tail)out.push(tail);
 return out;
}
export function reflowSections(sections){
 return sections.map(section=>{
  const joined=[];
  for(const original of section.paragraphs||[]){
   const paragraph={...original,text:String(original.text??'').replace(/\s+/g,' ').trim()};
   if(!paragraph.text)continue;
   const last=joined[joined.length-1];
   if(canJoin(last,paragraph)){
    last.text=joinWrappedText(last.text,paragraph.text);
    if(paragraph.endPage!=null||paragraph.page!==last.page){
     last.endPage=paragraph.endPage??paragraph.page;
     if(paragraph.endPrinted!=null)last.endPrinted=paragraph.endPrinted;
    }
   }else joined.push(paragraph);
  }
  const paragraphs=joined.flatMap(p=>{
   const texts=p.kind==='text'?splitSentences(p.text):[p.text];
   return texts.map(text=>({...p,text}));
  });
  return {...section,paragraphs};
 });
}
export function pageSpan(paragraph){
 if(!paragraph||!Number.isInteger(paragraph.page))return '';
 const end=Number.isInteger(paragraph.endPage)?paragraph.endPage:paragraph.page;
 return end>paragraph.page?String(paragraph.page)+'–'+end:String(paragraph.page);
}
export function toStructuredMarkdown(doc,{filename='datasheet.pdf'}={}){
 const lines=[
  '# '+filename,
  '',
  '> Source: local PDF.js extraction and JavaScript narrative reflow.',
  '> PDF page ranges are source locations, not semantic differences.',
  ''
 ];
 for(const s of doc?.sections||[]){
  const title=[s.number,s.title].filter(Boolean).join(' ');
  const level=s.level>1?Math.min(6,s.level+1):2;
  lines.push('#'.repeat(level)+' '+title,'');
  for(const p of s.paragraphs||[]){
   const span=pageSpan(p);
   if(span)lines.push('<!-- PDF page '+span+' -->');
   const value=p.kind==='list'&&!/^[-*•●]/.test(p.text)?'- '+p.text:p.text;
   lines.push(value,'');
  }
 }
 return lines.join('\n').trim()+'\n';
}
export function toComparisonMarkdown(newDoc,oldDoc,{filename='new.pdf',oldFilename='old.pdf'}={}){
 return [
  '# Datasheet narrative preprocessing',
  '',
  '> Generated locally in the browser. Compare section text, not PDF page boundaries.',
  '',
  '---','',
  toStructuredMarkdown(oldDoc,{filename:oldFilename}).trimEnd(),
  '',
  '---','',
  toStructuredMarkdown(newDoc,{filename}).trimEnd(),
  ''
 ].join('\n');
}
