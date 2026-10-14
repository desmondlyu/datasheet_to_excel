import test from 'node:test';
import assert from 'node:assert/strict';
import * as commands from '../../browser/commands.mjs';
import {makeRow,compareRows} from '../../browser/spec-core.mjs';
import {compareRow} from '../../browser/comparison-display.mjs';

// Synthetic frequency/command fixtures; actual PDF coverage is in command-coverage.test.mjs.
const command=kw=>({command:'Fast Read',opcode:'0Bh',mode:'1-1-1',address:'A31 / A23-A0',dummy:'8',data:'D7-D0',extra:'Aligned Address (MHz): 133; Any Address (MHz): 104',setting:'',section:'SPI Commands',page:56,pdf_page:56,...kw});
function ac(kw={}){
 const start=kw._start||'Aligned',max=kw.max??(start==='Aligned'?133:104);
 const condition=`SPI; 3-/4-byte Address; opcode=0Bh / 9Ch; Dummy=8; Starting Address: ${start}`;
 return {...makeRow('X',{parameter:'Fast Read/Read Checksum maximum clock frequency',condition,max,unit:'MHz'},{kind:'AC',page:172,pdfPage:172,section:'SPI',table:1}),_opcode:'0Bh / 9Ch',_mode:'SPI',_address:'3-/4-byte Address',_dummy:8,_start:start,...kw};
}
const consolidate=rows=>{assert.equal(typeof commands.consolidateSpecs,'function');return commands.consolidateSpecs(rows);};

test('matching command frequencies enrich AC rows without leaving duplicate Command entries',()=>{
 const c=command({}),checksum=command({command:'Read Checksum',opcode:'9Ch',extra:'Read Bypass: --; Aligned Address (MHz): 133; Any Address (MHz): 104'});
 const rows=[ac(),ac({_start:'Any'}),...commands.commandSpecRows([c,checksum],['X'])],before=JSON.stringify(rows);
 const out=consolidate(rows);
 assert.equal(out.length,2);assert.ok(out.every(r=>r['spec type']==='AC'));
 assert.deepEqual(out.map(r=>[r._opcode,r._start,r.max]),[['0Bh/9Ch','Aligned',133],['0Bh/9Ch','Any',104]]);
 assert.ok(out.every(r=>r._command_sources.includes(c)&&r._command_sources.includes(checksum)));
 assert.ok(out.every(r=>/Fast Read/.test(r._commands)&&/Read Checksum/.test(r._commands)&&/Read Bypass: --/.test(r.description)));
 assert.ok(out.every(r=>r.condition.includes('IO=1-1-1')));
 assert.equal(JSON.stringify(rows),before);
});
test('equal aligned and any limits combine only when other specification details agree',()=>{
 const c=command({extra:'Aligned Address (MHz): 133; Any Address (MHz): 133'});
 const out=consolidate([ac(),ac({_start:'Any',max:133}),...commands.commandSpecRows([c],['X'])]);
 assert.equal(out.length,1);assert.equal(out[0]._start,'Aligned/Any');assert.equal(out[0].max,133);
 assert.match(out[0].condition,/Starting Address: Aligned\/Any/);
 assert.equal(consolidate([ac(),ac({_start:'Any',max:133,typ:100})]).length,2);
 assert.equal(consolidate([ac(),ac({_start:'Any',max:133,condition:'SPI; Starting Address: Any; DS bit enabled'})]).length,2);
});
test('format-only opcode duplication collapses but differing command identities remain separate',()=>{
 const c=command({command:'Chip Erase',opcode:'C7h/60h',extra:'Any Address (MHz): 133',address:'--',dummy:'--'});
 const out=consolidate(commands.commandSpecRows([c,{...c,opcode:'60h, C7h'},{...c,command:'Advanced Chip Erase OP-3'}],['X']));
 assert.equal(out.length,2);assert.deepEqual(out.map(r=>r.parameter),['Chip Erase','Advanced Chip Erase OP-3']);
 assert.equal(out[0]._opcode,'C7h/60h');assert.equal(out[0]._command_sources.length,2);
});
test('mode, address, dummy, setting and environmental differences prevent unsafe AC absorption',()=>{
 for(const change of [{mode:'4-4-4'},{address:'A31-A0'},{dummy:'6'},{setting:'Set Read Parameters (C0h) = 000'},{mode:'1-1d-1d'}]){
  const out=consolidate([ac(),...commands.commandSpecRows([command({...change,extra:'Aligned Address (MHz): 133'})],['X'])]);
  assert.equal(out.length,2,JSON.stringify(change));assert.ok(out.some(r=>r['spec type']==='Command'));
 }
 const out=consolidate([ac({max:200,condition:ac().condition+'; DS bit enabled'}),...commands.commandSpecRows([command({extra:'Aligned Address (MHz): 133'})],['X'])]);
 assert.equal(out.length,2);assert.ok(out.every(r=>!r._merge_conflict));
});
test('conflicting frequencies stay visible and explain why manual review is required',()=>{
 const out=consolidate([ac(),...commands.commandSpecRows([command({extra:'Aligned Address (MHz): 104'})],['X'])]);
 assert.equal(out.length,2);assert.ok(out.every(r=>r._status==='review'&&/133.*104|104.*133/.test(r._merge_conflict)));
 assert.ok(compareRows(out,out).every(r=>r._status==='review'));
 assert.match(compareRow(out[0])[2],/133.*104|104.*133/);
});
test('a later matching alias keeps the real conflict instead of inventing an equal-value disagreement',()=>{
 const mismatch=command({extra:'Aligned Address (MHz): 104'});
 const matching=command({command:'Read Checksum',opcode:'9Ch',extra:'Aligned Address (MHz): 133'});
 const out=consolidate([ac(),...commands.commandSpecRows([mismatch,matching],['X'])]);
 assert.equal(out.length,3);assert.ok(out.every(r=>r._status==='review'));
 assert.ok(out.every(r=>/133.*104|104.*133/.test(r._merge_conflict)));
 assert.ok(out.every(r=>!/AC 133 MHz、指令表 133 MHz/.test(r._merge_conflict)));
});
test('execution time and clock frequency are not placed in the same numeric limit',()=>{
 const c=command({command:'Page Program',opcode:'02h',extra:'Aligned Address (MHz): 133; Any Address (MHz): 133'});
 const timing=makeRow('X',{parameter:'Page Program Time',symbol:'tPP',max:1.2,typ:0.25,unit:'ms'},{kind:'AC',page:178,section:'AC'});
 const out=consolidate([timing,...commands.commandSpecRows([c],['X'])]);
 assert.equal(out.length,2);assert.deepEqual(out.map(r=>[r.unit,r.max]),[['ms',1.2],['MHz',133]]);
});
test('identical electrical limits in different source sections do not silently lose their context',()=>{
 const row=makeRow('X',{parameter:'Clock Rise Time peak to peak',symbol:'tCL',min:0.05,unit:'ns'},{kind:'AC',page:178,section:'AC Measurement Conditions'});
 const other={...row,page:183,_section:'Other AC Measurement Conditions'};
 const out=consolidate([row,other]);
 assert.equal(out.length,2);assert.deepEqual(out.map(r=>r.page),[178,183]);
});
test('comparison expands combined alignments so only the changed address limit is reported changed',()=>{
 const older=consolidate([ac({page:170}),ac({_start:'Any',max:133,page:170})]);
 const newer=consolidate([ac(),ac({_start:'Any',max:104})]);
 assert.equal(older.length,1);
 const out=compareRows(newer,older);
 assert.deepEqual(out.map(r=>[r._start,r._status]),[['Aligned','unchanged'],['Any','changed']]);
 assert.deepEqual(out[1]._changes,{max:{old:133,new:104}});assert.equal(out[1]._old_page,170);
 const same=compareRows(older,older);assert.equal(same.length,1);assert.equal(same[0]._start,'Aligned/Any');assert.equal(same[0]._status,'unchanged');
});
