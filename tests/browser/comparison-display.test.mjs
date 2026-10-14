import test from 'node:test';
import assert from 'node:assert/strict';
test('preview cells retain export fields, opcodes, zero limits and removed page semantics',async()=>{
 const {COMPARE_HEADERS,compareRow}=await import('../../browser/comparison-display.mjs');
 assert.deepEqual(COMPARE_HEADERS,['比較結果','變更欄位','變更說明（舊 → 新）','產品名稱','Opcode','unit','max','typ','min','symbol','SPI/QPI','3/4 byte address','Dummy','Starting Address','spec type','相關指令','parameter','condition','description','新版頁碼','舊版頁碼']);
 const row={產品名稱:'X',max:0,typ:'',min:'',symbol:'tPP',parameter:'Page Program Time',_status:'changed',_changes:{max:{old:1,new:0}},_commands:'02h Page Program（1-1-1）；32h Quad Input Page Program（1-1-4）',_command_basis:'名稱規則對應',page:89,_old_page:88};
 const values=compareRow(row);
 assert.deepEqual(values.slice(0,10),['變更','max','max：1 → 0','X','02h/32h',undefined,0,'','','tPP']);
 assert.equal(values[15],'Page Program（1-1-1）；Quad Input Page Program（1-1-4）');
 assert.deepEqual(values.slice(-2),[89,88]);
 assert.deepEqual(compareRow({...row,_status:'removed',page:80}).slice(-2),['',80]);
 const frequency=compareRow({...row,_opcode:'EBh',_mode:'SPI',_address:'3-/4-byte Address',_dummy:0,_start:'Aligned'});
 assert.equal(frequency[4],'EBh');assert.deepEqual(frequency.slice(10,14),['SPI','3-/4-byte Address',0,'Aligned']);
 assert.deepEqual(compareRow({...row,_status:'review',_candidates:[{page:80,max:1},{page:81,max:2}]}).slice(-2),[89,'80, 81']);
});
test('preview uses canonical opcodes and interface labels without rewriting raw conditions',async()=>{
 const {compareRow}=await import('../../browser/comparison-display.mjs');
 const row={_opcode:'C7h, 60h',_mode:'4-4-4',condition:'IO=4-4-4; opcode=C7h, 60h'};
 const values=compareRow(row);
 assert.equal(values[4],'C7h/60h');assert.equal(values[10],'QPI');assert.equal(values[17],row.condition);
});
test('presentation removes numeric notes and Dummy defaults while leaving raw conditions intact',async()=>{
 const {COMPARE_HEADERS,compareRow}=await import('../../browser/comparison-display.mjs');
 const row={_opcode:'EBh(2)/EDh(11, 14)',_dummy:'16(3)',_address:'3(4)',condition:'opcode=EBh(2); Dummy=16(3)',_command_basis:'名稱規則對應'};
 const values=compareRow(row);
 assert.equal(values[4],'EBh/EDh');assert.equal(values[12],16);assert.equal(values[11],'3(4)');
 assert.equal(values[17],row.condition);assert.ok(!COMPARE_HEADERS.includes('對應依據'));
 assert.equal(compareRow({...row,_dummy:'6 (Def)'})[12],6);
 assert.equal(compareRow({...row,_dummy:'6 (Vendor)'})[12],'6 (Vendor)');
 assert.equal(compareRow({_commands:'81h(14) Clear Buffer'})[4],'81h');
});
test('default annotation cleanup is limited to Dummy and preserves zero and raw source fields',async()=>{
 const {compareRow}=await import('../../browser/comparison-display.mjs');
 const row={_dummy:'0 ( dEf ) (3)',_opcode:'EBh (Def)',condition:'Dummy=0 (Def)',description:'Default (Def)'};
 const values=compareRow(row);
 assert.equal(values[12],0);assert.equal(values[4],'EBh (Def)');
 assert.equal(values[17],row.condition);assert.equal(values[18],row.description);
 assert.equal(row._dummy,'0 ( dEf ) (3)');
});
