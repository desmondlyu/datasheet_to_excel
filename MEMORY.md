# MEMORY.md — datasheet_to_excel（AI 工作記憶）

## AI 快速喚醒區

- **專案**：純瀏覽器的「Datasheet 規格工作台」（Vite 8 + pdfjs-dist legacy + ExcelJS），部署於 GitHub Pages；repo `desmondlyu/datasheet_to_excel`，主線為 `master`（沒有 `main`）。
- **分頁**：規格解析／比較預覽／來源文字／**文字敘述差異**（2026-11-04 新增；2026-11-06 起只在雙版比對時顯示，由「解析並預覽」自動產生）。
- **指令**：`npm test`（`node --test tests/browser/*.test.mjs`）、`npm run build`、`npm run dev`（127.0.0.1:5173）、`npm run preview`。
- **私有 PDF**：放在 repo 根目錄，已被 `.gitignore` 排除，不可提交。整合測試使用以下環境變數：
  - `SPEC_REFERENCE_PDF`
  - `SPEC_TEXT_NEW_PDF`（新版，例如 `Target W25Q51MV_MW_MY-DTR_Rev_A1 06152026.pdf`）
  - `SPEC_TEXT_OLD_PDF`（舊版，例如 `W25Q32_64_12_25_51_01_02RW-DTR_RevD3 09092026.pdf`）
  - `SPEC_TEXT_AG_NEW_PDF`／`SPEC_TEXT_AG_OLD_PDF`（`W25H32_64_12_25_51_01_02RW-DTR Preliminary AG Rev 0.5 101626.pdf`／`… Rev 0.4 092226.pdf`，同產品改版、應只剩真實修改）
- **注意**：`core.autocrlf=true`，檔案使用 CRLF、無 BOM；PowerShell `Add-Content` 會混入 LF，寫入後需正規化。Playwright 暫存檔 `.playwright-mcp\` 不可提交。

## 文字敘述差異（2026-11-04）

- 計畫與設計決策：`docs/TEXT_DIFF_PLAN.md`。原始需求書 `W25Q51MV_vs_W25Q51RW_Datasheet_Text_Diff.md` 未找到，因此 Q2–Q8 依建議答案實作，**尚待使用者確認**。
- 檔案：
  - `browser/text-diff.mjs`：核心，包含 extractNarrative、buildSections、alignParagraphs（門檻 .35）、diffWords、pairSections、buildReport、summarize。
  - `browser/text-diff.worker.mjs`：Worker。
  - `browser/text-diff-workbook.mjs`：Excel 匯出（文字差異／章節總覽／說明）。
  - `browser/main.mjs`：文字差異 UI，位於檔案末尾；textState 與手動配對使用 `manual` Set。
  - `index.html`（`#text-panel`）、`browser/style.css`（`.text-*`）。
  - `tests/browser/text-diff.test.mjs`。
- 狀態：same、part（僅型號替換）、changed、added、removed。勾選「僅型號替換視為相同」時，part 視為 same，統計與篩選一起套用。
- 範例 PDF 結果：
  - 新版 228 個章節、舊版 206 個章節，共配對 186 組，Excel 1397 列。
  - 6.3.5 判定為 same，5.1.2 判定為 part。
  - 3.3 標出 `section 2`→`Figure 2.x`。
  - 3.9 /RSTO 判定為 added。
- 驗證：
  - 未設定私有 PDF 時，98 項測試中 90 項通過、8 項略過；設定 `SPEC_TEXT_*` 後，文字比對私有測試 6/6 通過。
  - build 成功；Chromium 1440px 與 390px 驗證通過。
  - Safari／WebKit 未測。
- 已知限制：
  - 段落依版面推斷。
  - Figure 編號差異算作修改。
  - 3.7 BUSY 與 RSTO 段落對齊不完美。
  - 5.5 新版標題會帶入多餘文字。
- Git：
  - 功能 commit `404a1f1`（`feat/narrative-text-diff`）。
  - merge commit `b81a35b` 已合併到 `master`，並已推送到 `origin/master` 與 `origin/feat/narrative-text-diff`（2026-11-04）。

## 文字差異雜訊修正（2026-11-05）

- 版面誤報修正（`43f4299`／merge `e18c89a`）：
  - TOC 列出的標題可辨識為小標題。
  - 頁尾（Publication Release Date）會被過濾。
  - 過大的表格會被過濾。
  - `mergeSplitParagraphs` 只合併相鄰的「配對列 + 單邊列」，而且只在 diff 成本變低時才合併。
- 雲端 `2837b12`（Desmond Lyu）新增 `browser/narrative-structure.mjs`：
  - `reflowSections`：跨頁段落重排。
  - `splitSentences`：差異列改成「一句一列」。
  - `pageSpan`：記錄頁碼範圍。
  - 新增「下載預處理 Markdown」。
- REA 靜態分析（`analyze_javascript_application`）確認資料流：worker → `extractNarrative` → `segmentsOf` → `buildSections` → `reflowSections`／`splitSentences` → `alignParagraphs` → `mergeSplitParagraphs` → Excel／Markdown。
- 依分析結果再優化：
  - `text-diff.mjs` 新增 `unwrap`：`compactKey`／`maskedKey` 忽略小寫字母之間的換行連字號（`double-buffering` 視同 `doublebuffering`）；`Quad-SPI` 這類大寫或數字旁的連字號仍算差異。
  - `segmentsOf`：項目符號（`–`、`•` 等）前的空隙大於 1.2 倍字高時，切成新的一欄，修正 1 FEATURE 雙欄項目被合併的問題。
  - `splitSentences`：句點後沒有空格時也能切句（例如 `Register.A`、`'1'.If`）；`e.g.`、`Rev.`、`2.1` 不切。
- 效果（AG Rev0.5 vs 0.4）：修改 38→33、新增 6→4、刪除 5→4。剩下的差異看起來都是真實改版。
- 私有測試 W25Q51 3.3 改成依內容找 `Figure 2.x` 那一列，因為改成一句一列後位置不固定。
- 驗證：`npm test` 含 4 個私有 PDF，共 109 項，102 通過、0 失敗、7 略過；`npm run build` 成功。
- 已知限制：舊版 PDF 的萃取瑕疵（例如 `8-p 0.13"ad`）會被算成修改。

## 解析與文字比對整合（2026-11-06）

- 需求：「比對文字敘述」併入「解析並預覽」；文字敘述差異分頁移除工具列按鈕（比對／取消／下載文字差異 Excel／下載預處理 Markdown），只顯示結果；只上傳一版時不做文字比對。
- `index.html`：`[data-tab=text]` 預設 `hidden`；移除 `.text-toolbar`（`text-run`／`text-cancel`／`text-export`／`text-export-md`）；`#text-panel` 末尾加 `.hint` 說明。
- `browser/main.mjs`：
  - submit：規格結果渲染後，若 `json.compared` → `setTextTab(true)` + `await runText(file,old)`（依序執行，記憶體較安全；規格預覽先出現）。文字比對失敗不影響規格結果；匯出按鈕等文字比對結束才啟用。
  - `runText` 重新讀取兩個檔案（規格 worker 已 transfer buffer）並跑 `text-diff.worker.mjs`；`textCancel` reject hook 回傳 `{cancelled:true}`；進度同步到 `#progress`（前綴「文字敘述比對 · 」）。
  - `clearResult()`／`stop()` 會呼叫 `textStop()`、`textClear()`、`setTextTab(false)`；`selectTab`／`setTextTab` 隱藏作用中分頁時切回 specs。
  - `download()` 把 `textState` 的 `{newDoc,oldDoc,report}` 傳給 `makeWorkbook`（手動章節配對後的 report 也會反映）。
- `browser/workbook.mjs`：`makeWorkbook(result,text=null)`；有 `text` 時說明頁加入文字差異說明（`TEXT_DIFF_NOTES`），並在 Source 後加 文字差異／章節總覽（`addTextDiffSheets`）。「下載全部」與「下載篩選結果」都包含。
- `browser/text-diff-workbook.mjs`：抽出 `addTextDiffSheets`、`TEXT_DIFF_NOTES`；`makeTextDiffWorkbook` 保留給測試。`narrative-structure.mjs` 的 `toComparisonMarkdown` 仍匯出但 UI 不再使用。
- `BUILD_ID` = `2026-11-06.1`。
- 驗證：`npm test` 110 項，101 通過、0 失敗、9 略過；`npm run build` 成功；Playwright E2E（vite preview）單版 AG Rev0.5 → 文字分頁隱藏；AG Rev0.5 vs 0.4 → 修改 17／新增 1／移除 0，下載 Excel 含 7 張表（產品規格比較表、說明、指令表、Review、Source、文字差異 1898 列、章節總覽 231 列），無 page error。

## 跨 Session reference（最多 3 筆）

1. 2026-11-04 Copilot CLI session `ed086d40-3972-47b7-bdaf-c8445673f34c`：文字敘述差異分頁實作、計畫文件與本機合併。
2. 2026-11-05 Copilot CLI session `5adf4d1b-c445-433b-a7c7-6cf511e37ff8`：版面誤報修正、拉取雲端重排、REA 分析與雜訊優化、Portal 卡片、解析與文字比對整合（2026-11-06）。
