import test from 'node:test';
import assert from 'node:assert/strict';
import {getPageTextContent} from '../../browser/pdf-text.mjs';
test('reads PDF text chunks from a stream without async iteration',async()=>{
 let released=false;const chunks=[{items:[{str:'first'}],styles:{a:{fontFamily:'A'}},lang:'en'},{items:[{str:'second'}],styles:{b:{fontFamily:'B'}},lang:'fr'}];
 const page={streamTextContent:()=>({getReader:()=>({read:async()=>chunks.length?{value:chunks.shift(),done:false}:{done:true},releaseLock:()=>{released=true;}})}),getTextContent:()=>{throw Error('unsupported async iterator');}};
 const text=await getPageTextContent(page);
 assert.deepEqual(text.items,[{str:'first'},{str:'second'}]);assert.equal(text.lang,'en');assert.equal(text.styles.b.fontFamily,'B');assert.equal(released,true);
});
test('releases reader and propagates text stream failure',async()=>{
 let released=false;const error=Error('text stream failed');
 await assert.rejects(getPageTextContent({streamTextContent:()=>({getReader:()=>({read:async()=>{throw error;},releaseLock:()=>{released=true;}})})}),e=>e===error);
 assert.equal(released,true);
});
test('XFA text remains handled by PDF.js',async()=>{
 const text={items:[{str:'xfa'}]};assert.equal(await getPageTextContent({isPureXfa:true,getTextContent:async()=>text}),text);
});
