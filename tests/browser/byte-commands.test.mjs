import test from 'node:test';
import assert from 'node:assert/strict';
import {isCommandTable,parseCommandTable} from '../../browser/commands.mjs';
function grid(content){
 const cells=[],items=[];
 content.forEach((row,y)=>row.forEach((text,x)=>{cells.push([x*100,y*20,(x+1)*100,(y+1)*20]);if(text)items.push({text,x:x*100+2,y:y*20+10,width:90,height:8});}));
 return {table:{cells,bbox:[0,0,content[0].length*100,content.length*20]},items};
}
const header=['Data Input Output','Byte 1','Byte 2','Byte 3','Byte 4','Byte 5','Byte 6'];
const meta={page:20,pdfPage:21,section:'Instruction Set Table (SPI)'};
test('byte-layout commands retain opcode, address, clock counts and per-group modes',()=>{
 const {table,items}=grid([header,['Number of Clock(1-1-1)','8','8','8','8','8','8'],
 ['Page Program','02h','A23-A16','A15-A8','A7-A0','D7-D0(3)','…'],
 ['Fast Read','0Bh','A23-A16','A15-A8','A7-A0','Dummy','(D7-D0)'],
 ['Number of Clock (1-4d-4d)','8','1','1','1','8','1'],
 ['DTR Fast Read Quad I/O(14)','EDh','A23-A16','A15-A8','A7-A0','Dummy(11,14)','(D7-D0)'],
 header,['Number of Clock (4-4-4)','2','2','2','2','2','2'],['Chip Erase','C7h/60h','','','','','']]);
 assert.equal(isCommandTable(table,items),true);
 const r=parseCommandTable(table,items,meta);
 assert.deepEqual(r.unparsed,[]);
 assert.deepEqual(r.rows.map(c=>[c.command,c.opcode,c.mode]),[['Page Program','02h','1-1-1'],['Fast Read','0Bh','1-1-1'],['DTR Fast Read Quad I/O','EDh','1-4d-4d'],['Chip Erase','C7h/60h','4-4-4']]);
 assert.equal(r.rows[0].address,'A23-A16, A15-A8, A7-A0');
 assert.equal(r.rows[0].dummy,'');
 assert.match(r.rows[0].data,/D7-D0\(3\)/);
 assert.equal(r.rows[1].dummy,'Byte 5: 8 clocks (Dummy)');
 assert.equal(r.rows[2].dummy,'Byte 5: 8 clocks (Dummy)');
 assert.match(r.rows[2].extra,/DTR Fast Read Quad I\/O\(14\)/);
});
test('byte-layout opcodes accept numeric footnotes while preserving raw byte evidence',()=>{
 const {table,items}=grid([header,['Number of Clock(1-1-1)','8','8','8','8','8','8'],['Read','03h(2)','A23-A16','A15-A8','A7-A0','Dummy(3)','D7-D0']]);
 const r=parseCommandTable(table,items,meta);
 assert.deepEqual(r.unparsed,[]);assert.equal(r.rows[0].opcode,'03h');assert.equal(r.rows[0].dummy,'Byte 5: 8 clocks (Dummy)');
 assert.match(r.rows[0].extra,/Dummy\(3\)/);
});
test('byte-layout detection requires instruction label and byte 1, malformed opcodes remain reviewable',()=>{
 const bad=grid([['Description','Byte 1','Byte 2'],['Noise','02h','100']]);
 assert.equal(isCommandTable(bad.table,bad.items),false);
 const {table,items}=grid([header,['Number of Clock (1-1-1)','8','8','8','8','8','8'],['Unknown','??','','','','','']]);
 const r=parseCommandTable(table,items,meta);
 assert.equal(r.rows.length,0);assert.equal(r.unparsed.length,1);
});
test('byte-layout repeated subgroup headers reset byte columns without becoming commands',()=>{
 const {table,items}=grid([header,['Number of Clock(1-1-1)','8','8','8','8','8','8'],['Page Buffer','Byte 1','Byte 2','Byte 3','Byte 4','Byte 5','Byte 6'],['Load Buffer','8Bh','A23-A16','A15-A8','A7-A0','','']]);
 const r=parseCommandTable(table,items,meta);
 assert.deepEqual(r.unparsed,[]);assert.equal(r.rows.length,1);assert.equal(r.rows[0].mode,'1-1-1');assert.equal(r.rows[0].group,'Page Buffer');
});
