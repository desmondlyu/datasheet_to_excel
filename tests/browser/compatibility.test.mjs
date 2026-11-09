import test from 'node:test';
import assert from 'node:assert/strict';
import {linesOfText,mergeEdges,rulingLines} from '../../browser/geometry.mjs';
test('PDF text reconstruction works without Array.findLast',()=>{
 const original=Array.prototype.findLast;Array.prototype.findLast=undefined;
 try{assert.deepEqual(linesOfText([{text:'ICC',x:0,y:10,width:20,height:10},{text:'max',x:30,y:10,width:20,height:10},{text:'50',x:0,y:30,width:10,height:10}]).map(l=>l.text),['ICC max','50']);}
 finally{Array.prototype.findLast=original;}
});
test('table ruling lines merge without Array.at',()=>{
 const original=Array.prototype.at;Array.prototype.at=undefined;
 try{const r=mergeEdges([{axis:'h',pos:10,start:0,end:20},{axis:'h',pos:10,start:20,end:40}]);assert.deepEqual(r,[{axis:'h',pos:10,start:0,end:40}]);}
 finally{Array.prototype.at=original;}
});
test('worker compatibility installs array APIs used by PDF.js when absent',async()=>{
 const {execFileSync}=await import('node:child_process');
 const url=new URL('../../browser/array-compat.mjs',import.meta.url).href;
 const code=`Array.prototype.at=undefined;Array.prototype.findLast=undefined;await import(${JSON.stringify(url)});if([10,20].at(-1)!==20||[10,20,30].findLast(x=>x<30)!==20)throw Error('missing worker compatibility');`;
 execFileSync(process.execPath,['--input-type=module','-e',code]);
});
test('rulings come from multi-rectangle fills measured in page space after scaling',()=>{
 const OPS={save:1,restore:2,transform:3,constructPath:4,endPath:5,fill:6,eoFill:7};
 const rect=(x,y,w,h)=>[0,x,y,1,x+w,y,1,x+w,y+h,1,x,y+h,4];
 const viewport={transform:[1,0,0,1,0,0]};
 // 2.0 user units under a 0.75 CTM is a 1.5pt border; three borders painted by one fill.
 const ops={fnArray:[OPS.transform,OPS.constructPath],argsArray:[[.75,0,0,.75,0,0],[OPS.eoFill,[new Float32Array([...rect(0,0,200,2),...rect(0,40,200,2),...rect(0,0,2,42)])],[0,0,200,42]]]};
 const r=rulingLines(ops,OPS,viewport);
 assert.deepEqual(r.filter(e=>e.axis==='h').map(e=>[e.pos,e.start,e.end]),[[.75,0,150],[30.75,0,150]]);
 assert.deepEqual(r.filter(e=>e.axis==='v').map(e=>[e.pos,e.start,e.end]),[[.75,0,31.5]]);
 // Unscaled 2.5pt shading bars are not rulings.
 assert.deepEqual(rulingLines({fnArray:[OPS.constructPath],argsArray:[[OPS.fill,[new Float32Array(rect(0,0,200,2.5))],[0,0,200,2.5]]]},OPS,viewport),[]);
});
