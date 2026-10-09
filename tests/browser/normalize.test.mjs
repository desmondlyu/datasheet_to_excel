import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTable} from '../../browser/normalize.mjs';
test('symbol-less body row is retained for review beside a parsed row',()=>{
 const cells=[],items=[];const content=[['Parameter','Symbol','Max'],['Supply current','ICC','10'],['Storage temperature','','125']];
 for(let y=0;y<3;y++)for(let x=0;x<3;x++){cells.push([x*100,y*25,(x+1)*100,(y+1)*25]);if(content[y][x])items.push({text:content[y][x],x:x*100+5,y:y*25+12,width:80,height:10});}
 const r=normalizeTable({cells,bbox:[0,0,300,75]},items,['X'],{kind:'DC',page:1,pdfPage:1,section:'DC',table:1});
 assert.equal(r.rows.length,1);assert.ok(r.unparsed.flat().join(' ').includes('Storage temperature'));
});
