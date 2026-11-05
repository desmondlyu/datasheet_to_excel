// Narrative (prose) comparison between two datasheets.
// Extraction keeps paragraphs, list items, notes and figure/table captions; it drops
// ruled tables, small-font drawing labels, running headers/footers, TOC pages and
// revision history. Comparison is deterministic text diff, never AI rewriting.
import {textItems,rulingLines,findCells,groupTables} from './geometry.mjs';
import {getPageTextContent} from './pdf-text.mjs';
import {endsSentence,joinWrappedText,reflowSections} from './narrative-structure.mjs';

export const TEXT_STATUS_LABELS={same:'相同',part:'僅型號替換',changed:'修改',added:'新增',removed:'移除'};
// Some PDFs drop the space after the number ("2.1Pin Configuration").
const HEADING=/^(\d{1,2}(?:\.\d{1,3}){0,5})\.?(?:\s+|(?=[A-Z][a-z]))(\S.*)$/;
const NUMBER_ONLY=/^\d{1,2}(?:\.\d{1,3}){0,5}\.?$/;
const LIST_START=/^(?:[•●▪◦■□➢►‣∙·]|[-–—](?=\s)|\(?\d{1,2}[.)](?=\s)|\(?[a-z][.)](?=\s)|Notes?\s*:)/i;
const CAPTION=/^(?:Figure|Table)\s+\d/i;
const EXCLUDED_CHAPTER=/^(?:REVISION HISTORY|REVISION TABLE|TABLE OF CONTENTS|IMPORTANT NOTICE)\b/i;
const LEADER=/\.{6,}|(?:\.\s){5,}/;
// Part numbers such as W25Q51MV, W25Q32/64/12RW-DTR or W25QxxMV/MW/MY.
const PART=/\bW\s?\d{2}\s?[A-Z]{1,3}[A-Za-z0-9]*(?:\s?\/\s?[A-Za-z0-9]{1,5})*(?:-DTR)?\b/g;

export function normalizeText(s){
 return String(s??'').normalize('NFKC')
  .replace(/[\u2018\u2019\u201a\u2032`´]/g,"'").replace(/[\u201c\u201d\u201e\u2033]/g,'"')
  .replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u00a0\u2000-\u200b\u3000]/g,' ')
  .replace(/\s+/g,' ').trim();
}
// Line-wrap hyphens differ by revision ("double-buffering" / "doublebuffering"), so
// a hyphen between lowercase letters is ignored when deciding equality.
const unwrap=s=>s.replace(/\s+/g,'').replace(/([a-z])-(?=[a-z])/g,'$1');
export const compactKey=s=>unwrap(normalizeText(s));
export const maskParts=s=>normalizeText(s).replace(PART,'⟨PART⟩');
const maskedKey=s=>unwrap(maskParts(s));
const titleKey=s=>maskParts(s).toLowerCase().replace(/[^a-z0-9⟨⟩]+/g,'');
const words=s=>new Set(maskParts(s).toLowerCase().match(/[a-z0-9⟨⟩]+/g)||[]);
export function similarity(a,b){const x=words(a),y=words(b);if(!x.size&&!y.size)return 1;let common=0;for(const w of x)if(y.has(w))common++;return 2*common/(x.size+y.size);}

function joinItems(items){let s='',prev=null;for(const t of items){const gap=prev?t.x-(prev.x+prev.width):0;s+=(prev&&gap>Math.min(t.height,prev.height)*.18?' ':'')+t.text;prev=t;}return s.replace(/\s+/g,' ').trim();}
// Group items into lines, then split a line where a wide horizontal gap separates columns.
// A bullet after a smaller gap also starts a new column ("Read (4)   – 64-Bit Unique ID").
const BULLET=/^[•●▪◦■□➢►‣∙·–—]/;
export function segmentsOf(items,gapLimit=24){
 const lines=[];
 for(const t of [...items].sort((a,b)=>a.y-b.y||a.x-b.x)){let line=null;for(let i=lines.length-1;i>=0;i--)if(Math.abs(lines[i].y-t.y)<3){line=lines[i];break;}if(!line){line={y:t.y,items:[]};lines.push(line);}line.items.push(t);}
 const segments=[];
 for(const line of lines){
  const sorted=line.items.sort((a,b)=>a.x-b.x);let group=[];
  const flush=()=>{if(!group.length)return;const text=joinItems(group);if(text)segments.push({text,x0:group[0].x,x1:Math.max(...group.map(t=>t.x+t.width)),y:line.y,h:Math.max(...group.map(t=>t.height))});group=[];};
  for(const t of sorted){const prev=group[group.length-1],gap=prev?t.x-(prev.x+prev.width):0;if(prev&&(gap>gapLimit||(gap>t.height*1.2&&BULLET.test(t.text)))&&!NUMBER_ONLY.test(joinItems(group)))flush();group.push(t);}
  flush();
 }
 return segments;
}
function bodyHeight(pages){
 const weight=new Map();
 for(const p of pages)for(const s of p.segments){const h=Math.round(s.h*2)/2;weight.set(h,(weight.get(h)||0)+s.text.length);}
 let best=10,max=-1;for(const [h,w] of weight)if(w>max){max=w;best=h;}return best;
}
function orderSegments(segments,width){
 const mid=width/2,right=segments.filter(s=>s.x0>=mid-5);
 if(right.length<3)return [...segments].sort((a,b)=>a.y-b.y||a.x0-b.x0);
 return [...segments.filter(s=>s.x0<mid-5).sort((a,b)=>a.y-b.y||a.x0-b.x0),...right.sort((a,b)=>a.y-b.y||a.x0-b.x0)];
}

export async function extractNarrative(pdfjs,data,{onProgress=()=>{}}={}){
 if(data.byteLength>50*1024*1024)throw Error('每份 PDF 上限為 50 MB。');
 const task=pdfjs.getDocument({data:new Uint8Array(data),isEvalSupported:false,useSystemFonts:true,disableFontFace:true,stopAtErrors:true});
 task.onPassword=()=>task.destroy();
 let doc;
 try{doc=await task.promise;}catch(e){if(/password|destroyed/i.test(e.message))throw Error('PDF 可能受密碼保護，請先解除保護後再試。');throw Error('無法讀取 PDF，請確認檔案完整且為有效的 PDF。');}
 try{
  if(doc.numPages>600)throw Error('目前每份 PDF 上限為 600 頁。');
  const pages=[],toc=[],footerKeys=new Set(),footerKey=s=>compactKey(s).replace(/\d+/g,'#');
  let listed=tocLookup(toc);
  for(let n=1;n<=doc.numPages;n++){
   onProgress({stage:'text',current:n,total:doc.numPages});
   const page=await doc.getPage(n),viewport=page.getViewport({scale:1});
   const all=textItems(await getPageTextContent(page),viewport),top=viewport.height*.09,bottom=viewport.height*.92;
   const footerSegs=segmentsOf(all.filter(t=>t.y>=bottom));footerSegs.forEach(s=>footerKeys.add(footerKey(s.text)));
   const footer=footerSegs.map(s=>s.text).join(' ');
   const printed=Number(footer.match(/(?:^|\s)-\s*(\d+)\s*-/)?.[1]??footer.match(/(?:^|\s)(\d+)\s+\D/)?.[1]??n);
   let items=all.filter(t=>t.y>top&&t.y<bottom);
   const raw=segmentsOf(items);
   if(raw.filter(s=>LEADER.test(s.text)).length>=4){const entries=tocEntries(raw);toc.push(...entries);listed=tocLookup(toc);pages.push({n,printed,width:viewport.width,segments:[],toc:true,entries});page.cleanup();continue;}
   const tables=groupTables(findCells(rulingLines(await page.getOperatorList(),pdfjs.OPS,viewport)));
   if(tables.length){
    const hit=(t,b)=>{const cx=t.x+t.width/2;return cx>=b[0]-1&&cx<=b[2]+1&&t.y>=b[1]-1&&t.y<=b[3]+1;};
    const oversized=b=>b[0]<-5||b[1]<-5||b[2]>viewport.width+5||b[3]>viewport.height+5;
    // Drawings can be detected as "tables". Keep headings listed in the TOC, and lines that start
    // left of a mis-scaled (oversized) box.
    items=items.filter(t=>{
     const boxes=tables.filter(({bbox:b})=>hit(t,b));if(!boxes.length)return true;
     const line=items.filter(u=>Math.abs(u.y-t.y)<3).sort((a,b)=>a.x-b.x),m=joinItems(line).match(HEADING);
     if(m&&listed(m[1],m[2]))return true;
     return boxes.every(({bbox:b})=>oversized(b)&&line[0].x<b[0]-1);
    });
   }
   // Landscape pages place the running footer above the usual bottom band.
   let segments=segmentsOf(items);const low=s=>s.y>viewport.height*.8;
   if(segments.some(s=>low(s)&&footerKeys.has(footerKey(s.text))))segments=segments.filter(s=>!(low(s)&&(footerKeys.has(footerKey(s.text))||/^[-\s\d]+$/.test(s.text))));
   pages.push({n,printed,width:viewport.width,segments,tables:tables.length});
   page.cleanup();
  }
  return buildSections(pages);
 }finally{await task.destroy();}
}

// "3.1 Chip Select (/CS) ........ 12" -> {number:'3.1',title:'Chip Select (/CS)'}
export function tocEntries(segments){
 const out=[];
 for(const s of segments){const m=s.text.match(/^(\d{1,2}(?:\.\d{1,3}){0,5})\.?\s*(.*)$/);if(!m)continue;const title=m[2].split(LEADER)[0].replace(/[.\s]*\d*\s*$/,'').trim();if(/[A-Za-z]/.test(title))out.push({number:m[1],title});}
 return out;
}

// Returns (number,title)=>full TOC title key when the heading start matches a TOC entry.
function tocLookup(entries){
 const toc=new Map();
 for(const e of entries){if(!toc.has(e.number))toc.set(e.number,[]);toc.get(e.number).push(titleKey(e.title));}
 return (number,title)=>{const k=titleKey(title);return k.length>=3?toc.get(number)?.find(t=>t.startsWith(k))??null:null;};
}

// Separate from PDF access so the sectioning rules can be tested with plain segments.
export function buildSections(pages){
 const body=bodyHeight(pages),minor=body*.9,headingMin=body+.8;
 // Some revisions print sub-headings at body size; the table of contents still identifies them.
 const tocTitle=tocLookup(pages.flatMap(p=>p.entries||[]));
 const sections=[];let current={number:'',title:'(封面與前言)',level:0,page:pages[0]?.n||1,printed:pages[0]?.printed||1,paragraphs:[]};sections.push(current);
 let excludedLevel=null,para=null,prev=null;
 const close=()=>{if(para){para.text=para.text.replace(/\s+/g,' ').trim();if(para.text&&excludedLevel===null)current.paragraphs.push(para);}para=null;};
 for(const p of pages){
  if(p.toc){close();prev=null;continue;}
  const segs=orderSegments(p.segments.filter(s=>s.h>=minor),p.width);
  const mid=p.width/2,edge=col=>Math.max(0,...segs.filter(s=>(s.x0>=mid-5)===col).map(s=>s.x1));
  const rightEdge={false:edge(false),true:edge(true)};
  for(let i=0;i<segs.length;i++){
   const s=segs[i],m=s.text.match(HEADING);
   const big=m&&s.h>=headingMin,listed=m?tocTitle(m[1],m[2]):null;
   if((big||listed)&&s.x0<p.width*.3&&/[A-Za-z]/.test(m[2])){
    close();let title=m[2];
    // A listed title stops where the TOC title stops, so large body text is not absorbed.
    const more=t=>listed!==null?(k=>k.length<=listed.length&&listed.startsWith(k))(titleKey(title+' '+t.text)):t.h>=headingMin;
    while(segs[i+1]&&more(segs[i+1])&&!HEADING.test(segs[i+1].text)&&segs[i+1].y-segs[i].y<s.h*1.9){i++;title+=' '+segs[i].text;}
    const level=m[1].split('.').length;
    if(excludedLevel!==null&&level<=excludedLevel)excludedLevel=null;
    if(excludedLevel===null&&EXCLUDED_CHAPTER.test(title))excludedLevel=level;
    current={number:m[1],title:title.replace(/\s+/g,' ').trim(),level,page:p.n,printed:p.printed,paragraphs:[]};
    if(excludedLevel===null)sections.push(current);
    prev=null;continue;
   }
   const caption=CAPTION.test(s.text),list=LIST_START.test(s.text);
   let fresh=!para||caption||list||para.kind==='caption';
   if(!fresh&&prev){
    if(prev.page!==p.n)fresh=endsSentence(para.text); // A page boundary alone cannot split a sentence.
    else{const short=prev.s.x1<rightEdge[prev.s.x0>=mid-5]-35;fresh=(short&&/[.:!?]$/.test(prev.s.text))||s.y-prev.s.y>s.h*2.4||s.y<prev.s.y;}
   }
   if(fresh){close();para={text:s.text,page:p.n,printed:p.printed,kind:caption?'caption':list?'list':'text'};}
   else {
    para.text=joinWrappedText(para.text,s.text);
    if(p.n!==para.page){para.endPage=p.n;para.endPrinted=p.printed;}
   }
   prev={s,page:p.n};
  }
 }
 close();
 return {sections:reflowSections(sections.filter((s,i)=>i>0||s.paragraphs.length)),bodyHeight:body,pages:pages.length,tocPages:pages.filter(p=>p.toc).map(p=>p.n)};
}

function lcs(a,b,eq){
 const n=a.length,m=b.length,w=m+1,t=new Uint32Array((n+1)*w);
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)t[i*w+j]=eq(a[i],b[j])?t[(i+1)*w+j+1]+1:Math.max(t[(i+1)*w+j],t[i*w+j+1]);
 const ops=[];let i=0,j=0;
 while(i<n&&j<m){if(eq(a[i],b[j])){ops.push(['eq',i++,j++]);}else if(t[(i+1)*w+j]>=t[i*w+j+1])ops.push(['del',i++,-1]);else ops.push(['ins',-1,j++]);}
 while(i<n)ops.push(['del',i++,-1]);while(j<m)ops.push(['ins',-1,j++]);
 return ops;
}
const tokens=s=>normalizeText(s).match(/\S+\s*/g)||[];
// Word-level diff. Runs that differ only in spacing are equal; runs that differ only
// in part numbers are reported as 'part' so the UI can hide model-name substitution.
export function diffWords(oldText,newText){
 const a=tokens(oldText),b=tokens(newText);
 let start=0;while(start<a.length&&start<b.length&&a[start].trim()===b[start].trim())start++;
 let ea=a.length,eb=b.length;while(ea>start&&eb>start&&a[ea-1].trim()===b[eb-1].trim()){ea--;eb--;}
 const midA=a.slice(start,ea),midB=b.slice(start,eb);
 const ops=midA.length*midB.length>4e6?[...midA.map((_,i)=>['del',i,-1]),...midB.map((_,j)=>['ins',-1,j])]:lcs(midA,midB,(x,y)=>x.trim()===y.trim());
 const chunks=[];const push=(t,v)=>{const last=chunks[chunks.length-1];if(last&&last.t===t&&t!=='part')last.v+=v;else chunks.push({t,v});};
 if(start)push('eq',b.slice(0,start).join(''));
 let del='',ins='';
 const flush=()=>{if(!del&&!ins)return;if(compactKey(del)===compactKey(ins))push('eq',ins);else if(maskedKey(del)===maskedKey(ins))chunks.push({t:'part',o:del,n:ins});else{if(del)push('del',del);if(ins)push('ins',ins);}del='';ins='';};
 for(const [op,i,j] of ops){if(op==='eq'){flush();push('eq',midB[j]);}else if(op==='del')del+=midA[i];else ins+=midB[j];}
 flush();
 if(eb<b.length)push('eq',b.slice(eb).join(''));
 return chunks;
}
function pairParagraph(o,n){
 if(!o)return {status:'added',old:null,new:n,chunks:[{t:'ins',v:n.text}]};
 if(!n)return {status:'removed',old:o,new:null,chunks:[{t:'del',v:o.text}]};
 if(compactKey(o.text)===compactKey(n.text))return {status:'same',old:o,new:n,chunks:[{t:'eq',v:n.text}]};
 const chunks=diffWords(o.text,n.text);
 const status=chunks.some(c=>c.t==='del'||c.t==='ins')?'changed':chunks.some(c=>c.t==='part')?'part':'same';
 return {status,old:o,new:n,chunks};
}
// Pair paragraphs in order: exact anchors first, then similar paragraphs inside each gap.
export function alignParagraphs(oldP,newP,threshold=.35){
 const ka=oldP.map(p=>maskedKey(p.text)),kb=newP.map(p=>maskedKey(p.text));
 const anchors=lcs(ka,kb,(x,y)=>x===y).filter(o=>o[0]==='eq');
 const out=[];let ia=0,ib=0;
 const gap=(a0,a1,b0,b1)=>{
  const A=oldP.slice(a0,a1),B=newP.slice(b0,b1);if(!A.length||!B.length){A.forEach(p=>out.push(pairParagraph(p,null)));B.forEach(p=>out.push(pairParagraph(null,p)));return;}
  const w=B.length+1,score=new Float64Array((A.length+1)*w),sim=A.map(x=>B.map(y=>similarity(x.text,y.text)));
  for(let i=A.length-1;i>=0;i--)for(let j=B.length-1;j>=0;j--)score[i*w+j]=Math.max(score[(i+1)*w+j],score[i*w+j+1],sim[i][j]>=threshold?sim[i][j]+score[(i+1)*w+j+1]:0);
  let i=0,j=0;
  while(i<A.length&&j<B.length){if(sim[i][j]>=threshold&&score[i*w+j]===sim[i][j]+score[(i+1)*w+j+1]){out.push(pairParagraph(A[i++],B[j++]));}else if(score[i*w+j]===score[(i+1)*w+j])out.push(pairParagraph(A[i++],null));else out.push(pairParagraph(null,B[j++]));}
  while(i<A.length)out.push(pairParagraph(A[i++],null));while(j<B.length)out.push(pairParagraph(null,B[j++]));
 };
 for(const [,i,j] of anchors){gap(ia,i,ib,j);out.push(pairParagraph(oldP[i],newP[j]));ia=i+1;ib=j+1;}
 gap(ia,oldP.length,ib,newP.length);
 return mergeSplitParagraphs(out);
}
const diffCost=r=>r.status==='same'?0:(!r.old||!r.new)?compactKey((r.old||r.new).text).length:r.chunks.reduce((n,c)=>n+(c.t==='del'||c.t==='ins'?compactKey(c.v).length:0),0);
const joinParagraph=(a,b)=>!a?b:!b?a:{...a,text:a.text+' '+b.text};
// Layout can split one paragraph into two in only one revision ("…bits. LR6 will change…").
// Merge a paired row with an adjacent one-sided row when that shrinks the diff.
function mergeSplitParagraphs(rows){
 const out=[];
 for(const r of rows){
  const last=out[out.length-1];
  if(last&&last.status!=='same'&&r.status!=='same'&&((last.old&&last.new)||(r.old&&r.new))&&(!last.old||!last.new||!r.old||!r.new)){
   const merged=pairParagraph(joinParagraph(last.old,r.old),joinParagraph(last.new,r.new));
   if(diffCost(merged)<diffCost(last)+diffCost(r)){out[out.length-1]=merged;continue;}
  }
  out.push(r);
 }
 return out;
}
export function compareSection(oldSec,newSec){
 const paragraphs=alignParagraphs(oldSec?.paragraphs||[],newSec?.paragraphs||[]);
 const count=s=>paragraphs.filter(p=>p.status===s).length;
 const counts={same:count('same'),part:count('part'),changed:count('changed'),added:count('added'),removed:count('removed')};
 const titleChunks=oldSec&&newSec&&compactKey(oldSec.title)!==compactKey(newSec.title)?diffWords(oldSec.title,newSec.title):null;
 const titleReal=titleChunks?.some(c=>c.t==='del'||c.t==='ins');
 const status=!oldSec?'added':!newSec?'removed':(counts.changed||counts.added||counts.removed||titleReal)?'changed':(counts.part||titleChunks)?'part':'same';
 return {status,counts,titleChunks,paragraphs};
}
// Returns pairing[newIndex] = oldIndex or -1. Titles (without numbering) drive matching
// because related product families often renumber chapters.
export function pairSections(oldSecs,newSecs){
 const pairing=newSecs.map(()=>-1),used=new Set(),byKey=new Map();
 oldSecs.forEach((s,i)=>{const k=titleKey(s.title);if(!byKey.has(k))byKey.set(k,[]);byKey.get(k).push(i);});
 newSecs.forEach((s,j)=>{const list=byKey.get(titleKey(s.title));if(!list?.length)return;const sameNumber=list.findIndex(i=>oldSecs[i].number===s.number);const i=list.splice(sameNumber>=0?sameNumber:0,1)[0];pairing[j]=i;used.add(i);});
 const candidates=[];
 newSecs.forEach((s,j)=>{if(pairing[j]>=0)return;oldSecs.forEach((o,i)=>{if(used.has(i))return;const sim=similarity(o.title,s.title),same=o.number&&o.number===s.number;if(sim>=.6||(same&&sim>=.35))candidates.push([sim+(same?.2:0),i,j]);});});
 for(const [,i,j] of candidates.sort((a,b)=>b[0]-a[0]))if(pairing[j]<0&&!used.has(i)){pairing[j]=i;used.add(i);}
 return pairing;
}
export function sectionLabel(s){return s?[s.number,s.title].filter(Boolean).join(' '):'';}
// New-document order, with unmatched old sections placed after their nearest paired predecessor.
export function buildReport(oldDoc,newDoc,pairing){
 const oldSecs=oldDoc.sections,newSecs=newDoc.sections,used=new Map();
 pairing.forEach((i,j)=>{if(i>=0)used.set(i,j);});
 const entries=newSecs.map((s,j)=>({newIndex:j,oldIndex:pairing[j],...compareSection(oldSecs[pairing[j]]??null,s)}));
 const after=new Map();let anchor=-1;
 oldSecs.forEach((s,i)=>{if(used.has(i)){anchor=used.get(i);return;}if(!after.has(anchor))after.set(anchor,[]);after.get(anchor).push({newIndex:-1,oldIndex:i,...compareSection(s,null)});});
 const out=[...(after.get(-1)||[])];
 entries.forEach((e,j)=>{out.push(e);out.push(...(after.get(j)||[]));});
 return out;
}
export function summarize(report){const counts={same:0,part:0,changed:0,added:0,removed:0};for(const e of report)counts[e.status]++;return counts;}
