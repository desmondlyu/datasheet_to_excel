import test from 'node:test';
import assert from 'node:assert/strict';
import {compareRows, COLUMNS, productsFromText, parsePageInput, numericValue, makeRow} from '../../browser/spec-core.mjs';
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
test('product detection accepts other families and multiple shorthand groups',()=>{
 assert.deepEqual(productsFromText('W35T51NW'),['W35T51NW']);
 assert.deepEqual(productsFromText('W35T51/01NW W25Q32/64RW-DTR'),['W35T51NW','W35T01NW','W25Q32RW','W25Q64RW']);
 assert.deepEqual(productsFromText('MX25L12835F / MT25QL128ABA'),['MX25L12835F','MT25QL128ABA']);
});
test('product ranges use document order instead of a fixed family list',()=>{
 const catalog=['W35T32NW','W35T64NW','W35T51NW'];
 assert.deepEqual(productsFromText('W35T32NW–W35T51NW',catalog),catalog);
 assert.deepEqual(productsFromText('W35T64NW',catalog),['W35T64NW']);
});
test('ranges exclude unrelated families from an interleaved document catalogue',()=>{
 assert.deepEqual(productsFromText('W35T32NW–W35T51NW',['W35T32NW','W25Q32RW','W35T64NW','W25Q64RW','W35T51NW']),['W35T32NW','W35T64NW','W35T51NW']);
});
test('a range preserves additional explicitly named products',()=>{
 assert.deepEqual(productsFromText('W35T32NW–W35T64NW W35T51NW',['W35T32NW','W35T64NW','W35T51NW']),['W35T32NW','W35T64NW','W35T51NW']);
});

test('ordinary conditions populate Starting Address only for explicit unambiguous values',()=>{
 const meta={kind:'AC',page:1,pdfPage:1,section:'AC',table:1};
 for(const [condition,expected] of [
  ['Starting Address: Aligned','Aligned'],
  ['Starting Address: Any','Any'],
  ['SPI; starting address = any; Dummy=6','Any'],
  ['Starting Address：aligned','Aligned'],
  ['Any address is allowed',undefined],
  ['Starting Address: Aligned / Any',undefined],
  ['Starting Address: Aligned; Starting Address: Any',undefined],
  ['',undefined]
 ]){
  const r=makeRow('X',{parameter:'Clock frequency',symbol:'fR',condition,max:100},meta);
  assert.equal(r._start,expected,condition);assert.equal(r.condition,condition);
 }
});
