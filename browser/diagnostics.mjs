export const BUILD_ID='2026-10-10.3';

// Keep this report local. It contains runtime details, not PDF contents.
export function diagnosticText(error,{phase='',browser=''}={}){
 const p=error.progress;
 return [
  `網站版本：${BUILD_ID}`,
  error.build?`解析程序版本：${error.build}`:'',
  phase?`步驟：${phase}`:'',
  p?`進度：${p.label} · ${p.stage==='text'?'讀取頁面':'整理表格'} ${p.current} / ${p.total}`:'',
  browser?`瀏覽器：${browser}`:'',
  `${error.name||'Error'}: ${error.message||'解析失敗'}`,
  error.stack||''
 ].filter(Boolean).join('\n');
}
