import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTable,normalizeFrequency} from '../../browser/normalize.mjs';
test('symbol-less body row is retained for review beside a parsed row',()=>{
 const cells=[],items=[];const content=[['Parameter','Symbol','Max'],['Supply current','ICC','10'],['Storage temperature','','125']];
 for(let y=0;y<3;y++)for(let x=0;x<3;x++){cells.push([x*100,y*25,(x+1)*100,(y+1)*25]);if(content[y][x])items.push({text:content[y][x],x:x*100+5,y:y*25+12,width:80,height:10});}
 const r=normalizeTable({cells,bbox:[0,0,300,75]},items,['X'],{kind:'DC',page:1,pdfPage:1,section:'DC',table:1});
 assert.equal(r.rows.length,1);assert.ok(r.unparsed.flat().join(' ').includes('Storage temperature'));
});
test('a product column assigns specific limits without duplicating them across the family',()=>{
 const cells=[],items=[];const content=[['Parameter','Symbol','Product','Min','Max','Unit'],['Erase','tCE','W35T51NW','','100','s'],['Erase','tCE','W35T01NW','','200','s'],['Setup','tSU','','0','5','ns']];
 for(let y=0;y<content.length;y++)for(let x=0;x<6;x++){cells.push([x*100,y*25,(x+1)*100,(y+1)*25]);if(content[y][x])items.push({text:content[y][x],x:x*100+5,y:y*25+12,width:80,height:10});}
 const r=normalizeTable({cells,bbox:[0,0,600,100]},items,['W35T51NW','W35T01NW'],{kind:'AC',page:1,pdfPage:1,section:'AC',table:1});
 assert.deepEqual(r.rows.filter(r=>r.symbol==='tCE').map(r=>[r['產品名稱'],r.max]),[['W35T51NW',100],['W35T01NW',200]]);
 assert.equal(r.rows.filter(r=>r.symbol==='tSU'&&r.min===0).length,2);
});
test('alternate symbols and SDR/DDR modes never become part of the primary symbol',()=>{
 const cells=[],items=[];const content=[['Description','Symbol','ALT','MODE','Min','Max','Unit'],['Frequency','FR','fC','SDR','','166','MHz'],['Frequency','FR','fC','DDR','','200','MHz']];
 for(let y=0;y<content.length;y++)for(let x=0;x<7;x++){cells.push([x*100,y*25,(x+1)*100,(y+1)*25]);if(content[y][x])items.push({text:content[y][x],x:x*100+5,y:y*25+12,width:80,height:10});}
 const r=normalizeTable({cells,bbox:[0,0,700,75]},items,['W35T51NW'],{kind:'AC',page:1,pdfPage:1,section:'AC Electrical Characteristics (Operating Temperature –40°C to +105°C)',table:1});
 assert.deepEqual(r.rows.map(r=>r.symbol),['FR','FR']);
 assert.ok(r.rows[0].condition.includes('SDR'));assert.ok(r.rows[1].condition.includes('DDR'));
 assert.ok(r.rows.every(r=>r.condition.includes('105°C')));
});
test('unresolved product qualifiers are retained for review instead of applied to all products',()=>{
 const cells=[],items=[];const content=[['Parameter','Symbol','Product','Max'],['Erase','tCE','32Mb only','10']];
 for(let y=0;y<2;y++)for(let x=0;x<4;x++){cells.push([x*100,y*25,(x+1)*100,(y+1)*25]);if(content[y][x])items.push({text:content[y][x],x:x*100+5,y:y*25+12,width:80,height:10});}
 const r=normalizeTable({cells,bbox:[0,0,400,50]},items,['W35T51NW','W35T01NW'],{kind:'AC',page:1,pdfPage:1,section:'AC',table:1});
 assert.equal(r.rows.length,0);assert.ok(r.unparsed.flat().join(' ').includes('32Mb only'));
});
test('side-by-side product limit groups are retained for review without mixing columns',()=>{
 const cells=[],items=[];const content=[['Parameter','Symbol','Min','Max','Min','Max'],['Voltage','VCC','1','2','3','4']];
 for(let y=0;y<2;y++)for(let x=0;x<6;x++){cells.push([x*100,y*25,(x+1)*100,(y+1)*25]);if(content[y][x])items.push({text:content[y][x],x:x*100+5,y:y*25+12,width:80,height:10});}
 const r=normalizeTable({cells,bbox:[0,0,600,50]},items,['W35T51NW','W35T01NW'],{kind:'DC',page:1,pdfPage:1,section:'DC',table:1});
 assert.equal(r.rows.length,0);assert.ok(r.unparsed.length);
});
test('standard identifiers in conditions do not replace document products',()=>{
 const cells=[],items=[];const content=[['Parameter','Symbol','Conditions','Max'],['Current','ICC','JESD216B compliant','10']];
 for(let y=0;y<2;y++)for(let x=0;x<4;x++){cells.push([x*100,y*25,(x+1)*100,(y+1)*25]);if(content[y][x])items.push({text:content[y][x],x:x*100+5,y:y*25+12,width:80,height:10});}
 const r=normalizeTable({cells,bbox:[0,0,400,50]},items,['W35T51NW'],{kind:'DC',page:1,pdfPage:1,section:'DC',table:1});
 assert.equal(r.rows[0]['產品名稱'],'W35T51NW');assert.equal(r.rows[0].condition,'JESD216B compliant');
});
test('an unresolved product range never creates a synthetic product',()=>{
 const cells=[],items=[];const content=[['Parameter','Symbol','Product','Max'],['Erase','tCE','W35T32NW-W35T99NW','10']];
 for(let y=0;y<2;y++)for(let x=0;x<4;x++){cells.push([x*100,y*25,(x+1)*100,(y+1)*25]);if(content[y][x])items.push({text:content[y][x],x:x*100+5,y:y*25+12,width:80,height:10});}
 const r=normalizeTable({cells,bbox:[0,0,400,50]},items,['W35T32NW','W35T64NW'],{kind:'AC',page:1,pdfPage:1,section:'AC',table:1});
 assert.equal(r.rows.length,0);assert.ok(r.unparsed.length);
});
test('superscript note and mixed-baseline suffix retain symbol character order',()=>{
 const cells=[[0,0,100,20],[100,0,200,20],[200,0,300,20],[0,20,100,45],[100,20,200,45],[200,20,300,45]];
 const items=[['Parameter',2,10,80,10],['Symbol',102,10,80,10],['Max',202,10,80,10],['Release',2,32,80,10],['10',202,32,20,10],['t',112,32.692,2.635,9.48],['RES',114.64,33.364,13.805,7.56],['1',128.44,32.692,4.74,9.48],['(2)',133.24,30.196,9.397,8.04]].map(([text,x,y,width,height])=>({text,x,y,width,height}));
 const r=normalizeTable({cells,bbox:[0,0,300,45]},items,['X'],{kind:'AC',page:1,pdfPage:1,section:'AC',table:1});
 assert.equal(r.rows[0].symbol,'tRES1');assert.match(r.rows[0].description,/Note 2/);
});
test('frequency matrix note references do not remain in opcode or numeric dummy fields',()=>{
 const content=[
  [0,0,100,10,'Address Mode'],[100,0,300,10,'Fast Read Quad I/O'],
  [0,10,100,20,'3-/4-byte Address'],[100,10,300,20,'EBh(2)'],
  [0,20,100,30,'Dummy'],[100,20,200,30,'Aligned'],[200,20,300,30,'Any'],
  [0,30,100,40,'16(3)'],[100,30,200,40,'133'],[200,30,300,40,'100'],
 ];
 const cells=content.map(c=>c.slice(0,4)),items=content.map(([x0,y0,x1,y1,text])=>({text,x:x0+2,y:(y0+y1)/2,width:x1-x0-4,height:6}));
 const rows=normalizeFrequency({cells,bbox:[0,0,300,40]},items,['X'],{kind:'AC',page:1,pdfPage:1,section:'SPI',table:1});
 assert.equal(rows.length,2);
 assert.ok(rows.every(r=>r._opcode==='EBh'&&r._dummy===16));
 assert.ok(rows.every(r=>r.condition.includes('opcode=EBh(2); Dummy=16(3)')));
});
