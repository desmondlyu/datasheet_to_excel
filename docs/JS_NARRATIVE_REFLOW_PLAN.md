# Datasheet 文字差異判斷 — 純 JavaScript 精準化計畫與實作

> 更新：2026-11-05。對應開發分支：fix/narrative-js-reflow-20261105。以 PR 自動測試及 build 作為合併門檻。

## 目標與原則

- 修正兩份 Datasheet 因跨頁、換行或段落分布不同造成的假性新增、刪除、修改。
- 保持 GitHub Pages 純前端部署；不採用 Python／伺服器、不上傳 PDF、不新增雲端依賴。
- 參考 Microsoft MarkItDown「先把 PDF 整理成結構化文本，再做下游處理」的思路，**不是移植 MarkItDown 原始碼**。
- 保留現有 PDF.js 抽取座標、TOC／章節偵測、排除表格、手動章節配對、文字 Excel 匯出。
- 不變更現有 AC/DC、指令解析、產品規格 Excel 欄位與工作表。

## 比對流程

1. PDF.js 讀取新版與舊版的文字、字型與來源 PDF 頁碼。
2. 原本章節與內容過濾規則：先去除頁首頁尾、目錄、Revision History 與框線表格。
3. 新增跨頁語意段落重排：若句子未結束，不以頁面邊界作為分段原因。
4. 新增句子切分：避免相同文字在不同 PDF 被包成一段／兩段而導致誤判。
5. 每段記錄起訖頁碼（page／endPage），並在網站與 Excel 以頁碼範圍呈現。
6. 沿用章節標題配對、字詞層級 diff、型號替換視為相同的既有規則。
7. 另可下載經處理的 Markdown，核對章節、內文及來源頁碼註解。

## 修改檔案及責任

- browser/narrative-structure.mjs：跨頁接合、保守句子切分、結構化 Markdown 輸出。
- browser/text-diff.mjs：擷取時跨頁接續、保留 endPage、串接新重排流程。
- browser/main.mjs：下載 Markdown、頁碼範圍顯示、狀態清除。
- browser/text-diff-workbook.mjs：跨頁段落的 Excel 來源範圍。
- index.html：增加下載預處理 Markdown 按鈕。
- tests/browser/narrative-structure.test.mjs：跨頁、不同分段、實際變更、清單圖說、Markdown 回歸測試。

## 驗證標準

- A 文件同一完整句跨兩頁、B 文件同一句不跨頁：必須判定相同。
- A 文件兩句合一段、B 文件同兩句分兩段：必須判定相同。
- 真正的數值差異（例：20 → 24）必須保留為修改。
- 清單及 Figure/Table caption 不得與正文誤合併。
- 預處理 Markdown 應保留原文與來源頁碼，未另行生成或補寫內容。
- 原 AC/DC、指令與 Excel 解析測試不得退步。
- 指令：npm ci；npm test；npm run build。

## 已知限制

- PDF.js 對多欄、浮動圖、無框線表格與特別複雜的版面仍可能擷取錯序。
- 句子切分使用標點與常見縮寫規則，不是 AI 語意判斷；仍可能發生錯判。
- 章節標題誤偵測、同名不同章、圖表辨識問題仍可能需要人工核對。
- Markdown 是利於查核的中間表示，不是原始 PDF 的版面精準複製。
- GitHub Actions 可執行公開單元測試；兩份私有 PDF 不提交公開 repo，完整實例比對仍需要使用者驗證。

## 部署與回復

- PR 經 GitHub Actions 測試、建置成功後合併至 master。
- 仍沿用既有 GitHub Pages deploy workflow。若真實文件回歸不符合預期，可 revert 該 PR。
