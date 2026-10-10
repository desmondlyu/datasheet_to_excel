import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILD_ID,diagnosticText} from '../../browser/diagnostics.mjs';
test('worker error details survive transport and identify the failing page and build',()=>{
 const error={name:'TypeError',message:'undefined is not a function',stack:'TypeError: undefined is not a function\nparse@conversion.worker.js:123:45',build:'worker-build',progress:{label:'新版',stage:'tables',current:3,total:9}};
 const report=diagnosticText(error,{phase:'解析 PDF',browser:'test-browser'});
 for(const expected of [BUILD_ID,'worker-build','TypeError','parse@conversion.worker.js:123:45','新版','整理表格 3 / 9','test-browser'])assert.ok(report.includes(expected),expected);
});
test('startup errors without a stack retain the native browser message',()=>{
 const report=diagnosticText({message:'Module load failed'},{phase:'啟動解析程序'});
 assert.ok(report.includes('Module load failed'));assert.ok(report.includes('啟動解析程序'));assert.ok(!report.includes('undefined'));
});
