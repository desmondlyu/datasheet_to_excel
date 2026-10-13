import test from 'node:test';
import assert from 'node:assert/strict';
import {mayHoldCommands,isCommandTable,parseCommandTable,linkCommands,compareCommands} from '../../browser/commands.mjs';
import * as commands from '../../browser/commands.mjs';
import {compareRows} from '../../browser/spec-core.mjs';
// Synthetic table: cells are [x0,y0,x1,y1]; one text item centred in each cell.
function table(rows){
 const cells=[],items=[];
 for(const [x0,y0,x1,y1,text] of rows){cells.push([x0,y0,x1,y1]);if(text)items.push({text,x:x0+2,y:(y0+y1)/2,width:Math.min(x1-x0-4,text.length*2),height:6});}
 return {table:{cells,bbox:[0,0,400,400]},items};
}
const W25=[
 [0,0,100,10,'Command'],[100,0,150,10,'Opcode'],[150,0,200,10,'Address Bytes'],[200,0,250,10,'Dummy Cycles'],[250,0,300,10,'Data Bytes'],[300,0,350,10,'Any Address'],
 [0,10,100,20,'Number of Clock (IO 1-1-1)'],[100,10,150,20,''],[150,10,200,20,''],[200,10,250,20,''],[250,10,300,20,''],[300,10,350,20,'MHz'],
 [0,20,100,30,'Page Program'],[100,20,150,30,'02h'],[150,20,200,30,'A23-A0'],[200,20,250,30,'--'],[250,20,300,30,'D7-D0'],[300,20,350,30,'133'],
 [0,30,100,40,'Fast Read Quad I/O'],[100,30,150,60,'EBh'],[150,30,200,40,'A23-A0'],[200,30,250,40,'4'],[250,30,300,40,'D7-D0'],[300,30,350,40,'104'],
 [0,40,60,60,'Set Read Parameters (C0h)'],[60,40,100,50,'0 0'],[150,40,200,50,'A23-A0'],[200,40,250,50,'6'],[250,40,300,50,'D7-D0'],[300,40,350,50,'104'],
 [60,50,100,60,'0 1'],[150,50,200,60,'A23-A0'],[200,50,250,60,'8'],[250,50,300,60,'D7-D0'],[300,50,350,60,'133'],
];
test('page detection ignores table-of-contents lines',()=>{
 assert.equal(mayHoldCommands('Instruction Set Table ........ 56\nOpcode list ..... 57'),false);
 assert.equal(mayHoldCommands('Command | Opcode | Address Bytes'),true);
});
test('command table is detected by header and variant rows inherit command and opcode',()=>{
 const {table:t,items}=table(W25);
 assert.equal(isCommandTable(t,items),true);
 const {rows,unparsed}=parseCommandTable(t,items,{page:56,pdfPage:58,section:'6.2.1 SPI Commands'},{});
 assert.deepEqual(unparsed,[]);
 assert.deepEqual(rows.map(r=>[r.mode,r.command,r.opcode,r.setting,r.dummy]),[
  ['1-1-1','Page Program','02h','','--'],
  ['1-1-1','Fast Read Quad I/O','EBh','','4'],
  ['1-1-1','Fast Read Quad I/O','EBh','Set Read Parameters (C0h) = 00','6'],
  ['1-1-1','Fast Read Quad I/O','EBh','Set Read Parameters (C0h) = 01','8'],
 ]);
 assert.equal(rows[0].extra,'Any Address (MHz): 133');assert.equal(rows[0].page,56);assert.equal(rows[0].pdf_page,58);
});
test('table without opcode header is not a command table',()=>{
 const {table:t,items}=table([[0,0,100,10,'Parameter'],[100,0,150,10,'Symbol'],[150,0,200,10,'Max'],[0,10,100,20,'Page Program Time'],[100,10,150,20,'tPP'],[150,10,200,20,'3']]);
 assert.equal(isCommandTable(t,items),false);
});
test('parameters link to commands by explicit opcode or explicit name rule only',()=>{
 const commands=[{command:'Page Program',opcode:'02h',mode:'1-1-1',setting:''},{command:'Quad Input Page Program',opcode:'32h',mode:'1-1-4',setting:''},{command:'4KB Sector Erase',opcode:'20h',mode:'1-1-1',setting:''},{command:'Write Non-Volatile Lock Register',opcode:'2Ch',mode:'4-4-4',setting:''}];
 const rows=linkCommands([{parameter:'Page Program Time'},{parameter:'4KB Sector Erase Time (20h/21h)'},{parameter:'Lock Register Program Time'},{parameter:'Power-down Current'},{parameter:'Fast Read',_opcode:'EBh'}],commands);
 assert.equal(rows[0]._commands,'02h Page Program（1-1-1）；32h Quad Input Page Program（1-1-4）');assert.equal(rows[0]._command_basis,'名稱規則對應');
 assert.equal(rows[1]._commands,'20h 4KB Sector Erase（1-1-1）');assert.equal(rows[1]._command_basis,'原文標示 opcode');
 assert.equal(rows[2]._commands,'2Ch Write Non-Volatile Lock Register（4-4-4）');
 assert.equal(rows[3]._commands,undefined);assert.equal(rows[4]._commands,undefined);
});
test('command comparison reports changed, added and removed entries',()=>{
 const c=kw=>({mode:'1-1-1',command:'Page Program',opcode:'02h',setting:'',address:'A23-A0',dummy:'--',data:'D7-D0',extra:'',page:56,...kw});
 const out=compareCommands([c({dummy:'8'}),c({command:'Read',opcode:'03h'})],[c({page:50}),c({command:'Erase',opcode:'20h'})]);
 assert.deepEqual(out.map(x=>x._status),['changed','added','removed']);
 assert.deepEqual(out[0]._changes,{dummy:{old:'--',new:'8'}});assert.equal(out[0]._old_page,50);
});
test('all user commands become per-product specification rows without fabricated limits',()=>{
 assert.equal(typeof commands.commandSpecRows,'function');
 const c={command:'Write Enable',opcode:'06h',mode:'1-1-1',address:'--',dummy:'--',data:'--',extra:'Any Address (MHz): 133',setting:'',group:'',section:'SPI Commands',page:56,pdf_page:58};
 const input=[c,{...c,command:'Read Buffer',opcode:'83h(14)',dummy:'16(3)',setting:'P = 000'},{...c,mode:'4-4-4'}];
 const rows=commands.commandSpecRows(input,['X','Y']);
 assert.equal(rows.length,6);
 assert.deepEqual(rows.filter(r=>r['產品名稱']==='X').map(r=>r._opcode),['06h','83h','06h']);
 assert.ok(rows.every(r=>r['spec type']==='Command'&&r.symbol===''&&r.max===''&&r.typ===''&&r.min===''&&r.unit===''));
 assert.equal(rows[0]._mode,'1-1-1');assert.equal(rows[0]._address,'--');
 assert.equal(rows[0].page,56);assert.equal(rows[0]._pdf_page,58);assert.equal(rows[0]._section,'SPI Commands');
 assert.equal(rows[2]._dummy,16);assert.match(rows[2].condition,/P = 000/);
 assert.match(rows[0].description,/Any Address \(MHz\): 133/);
 assert.equal(input[1].opcode,'83h(14)');assert.equal(input[1].dummy,'16(3)');
});
test('factory-only tables are excluded but user commands that enter factory mode are included',()=>{
 assert.equal(typeof commands.commandSpecRows,'function');
 const c={command:'Enter Factory Mode OP-1',opcode:'51h',mode:'1-1-1',section:'SPI Commands',group:''};
 const rows=commands.commandSpecRows([c,{...c,section:'Factory Mode Commands'},{...c,group:'Factory-only commands'}],['X']);
 assert.equal(rows.length,1);assert.equal(rows[0].parameter,c.command);
});
test('command address and dummy changes retain pairing and removed-command page semantics',()=>{
 assert.equal(typeof commands.commandSpecRows,'function');
 const c={command:'Read',opcode:'03h',mode:'1-1-1',address:'A23-A0',dummy:'8',data:'D7-D0',setting:'',page:56};
 const newer=commands.commandSpecRows([{...c,address:'A31-A0',dummy:'16'}],['X']);
 const older=commands.commandSpecRows([c,{...c,command:'Write Enable',opcode:'06h'}],['X']);
 const rows=compareRows(newer,older);
 assert.deepEqual(rows.map(r=>r._status),['changed','removed']);
 assert.deepEqual(rows[0]._changes,{'3/4 byte address':{old:'A23-A0',new:'A31-A0'},Dummy:{old:8,new:16}});
 assert.equal(rows[0]._old_page,56);
});
test('named command tables remove numeric opcode and dummy notes without removing defaults',()=>{
 const annotated=W25.map(c=>[...c]);
 annotated.find(c=>c[4]==='02h')[4]='02h(14)';
 annotated.find(c=>c[0]===200&&c[1]===30)[4]='4(3)';
 annotated.find(c=>c[0]===200&&c[1]===40)[4]='6 (Def)';
 const {table:t,items}=table(annotated);
 const {rows,unparsed}=parseCommandTable(t,items,{page:1,pdfPage:1,section:'SPI'},{});
 assert.deepEqual(unparsed,[]);assert.equal(rows[0].opcode,'02h');
 assert.equal(rows[1].dummy,'4');assert.equal(rows[2].dummy,'6 (Def)');
});
