import test from 'node:test';
import assert from 'node:assert/strict';
import {linesOfText,mergeEdges} from '../../browser/geometry.mjs';
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
