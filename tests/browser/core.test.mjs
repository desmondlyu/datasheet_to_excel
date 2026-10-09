import test from 'node:test';
import assert from 'node:assert/strict';
import {compareRows, COLUMNS, productsFromText, parsePageInput, numericValue} from '../../browser/spec-core.mjs';
const row=(extra={})=>({...Object.fromEntries(COLUMNS.map(c=>[c,''])),產品名稱:'W25Q32RW',symbol:'ICC1',parameter:'Standby Current',condition:'/CS = VCC',max:50,'spec type':'DC',...extra});
test('family expands slash shorthand, preserving all products',()=>assert.equal(productsFromText('W25Q32/64/12/25/51/01/02RW-DTR W25Q32RW').length,7));
test('explicit pages validate and deduplicate',()=>{assert.deepEqual(parsePageInput('169,170,169'),[169,170]);assert.throws(()=>parsePageInput('0'));assert.throws(()=>parsePageInput('abc'));});
test('limits preserve blanks, zero, formula strings and signed leakage',()=>{assert.equal(numericValue(''), '');assert.equal(numericValue('0'),0);assert.equal(numericValue('−0.5'),-.5);assert.equal(numericValue('±2'),'±2');assert.equal(numericValue('VCC × 0.3'),'VCC × 0.3');});
test('comparison tracks changed, added and removed',()=>assert.deepEqual(compareRows([row({max:60}),row({symbol:'ICC2'})],[row(),row({symbol:'ICC3'})]).map(r=>r._status),['changed','added','removed']));
test('comparison does not silently overwrite duplicate identity',()=>assert.ok(compareRows([row(),row()],[row()]).every(r=>r._status==='review')));
test('zero is not a missing limit',()=>assert.equal(compareRows([row({min:0})],[row()])[0]._status,'changed'));
test('ambiguous pairing preserves all old candidates',()=>{
 const newer={產品名稱:'X',symbol:'A',max:30};
 const r=compareRows([newer],[{...newer,max:10},{...newer,max:20}]);
 assert.equal(r[0]._status,'review');assert.deepEqual(r[0]._candidates.map(x=>x.max),[10,20]);
});
