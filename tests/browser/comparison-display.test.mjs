import test from 'node:test';
import assert from 'node:assert/strict';
test('preview cells retain export fields, opcodes, zero limits and removed page semantics',async()=>{
 const {COMPARE_HEADERS,compareRow}=await import('../../browser/comparison-display.mjs');
 assert.deepEqual(COMPARE_HEADERS,['比較結果','變更欄位','變更說明（舊 → 新）','產品名稱','max','typ','min','symbol','Opcode','SPI/QPI','3/4 byte address','Dummy','Starting Address','相關指令','對應依據','parameter','condition','description','unit','spec type','新版頁碼','舊版頁碼']);
 const row={產品名稱:'X',max:0,typ:'',min:'',symbol:'tPP',parameter:'Page Program Time',_status:'changed',_changes:{max:{old:1,new:0}},_commands:'02h Page Program（1-1-1）；32h Quad Input Page Program（1-1-4）',_command_basis:'名稱規則對應',page:89,_old_page:88};
 const values=compareRow(row);
 assert.deepEqual(values.slice(0,9),['變更','max','max：1 → 0','X',0,'','','tPP','02h, 32h']);
 assert.equal(values[13],'Page Program（1-1-1）；Quad Input Page Program（1-1-4）');
 assert.deepEqual(values.slice(-2),[89,88]);
 assert.deepEqual(compareRow({...row,_status:'removed',page:80}).slice(-2),['',80]);
 assert.deepEqual(compareRow({...row,_opcode:'EBh',_mode:'SPI',_address:'3-/4-byte Address',_dummy:0,_start:'Aligned'}).slice(8,13),['EBh','SPI','3-/4-byte Address',0,'Aligned']);
 assert.deepEqual(compareRow({...row,_status:'review',_candidates:[{page:80,max:1},{page:81,max:2}]}).slice(-2),[89,'80, 81']);
});
