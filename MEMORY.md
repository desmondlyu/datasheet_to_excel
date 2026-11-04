# MEMORY.md — datasheet_to_excel（AI 工作記憶）

## AI 快速喚醒區

- **專案**：純瀏覽器的「Datasheet 規格工作台」（Vite 8 + pdfjs-dist legacy + ExcelJS），部署於 GitHub Pages；repo `desmondlyu/datasheet_to_excel`，主線為 `master`（沒有 `main`）。
- **分頁**：規格解析／比較預覽／來源文字／**文字敘述差異**（2026-11-04 新增）。
- **指令**：`npm test`（`node --test tests/browser/*.test.mjs`）、`npm run build`、`npm run dev`（127.0.0.1:5173）、`npm run preview`。
- **私有 PDF**：放在 repo 根目錄，已被 `.gitignore` 排除，不可提交。整合測試使用以下環境變數：
  - `SPEC_REFERENCE_PDF`
  - `SPEC_TEXT_NEW_PDF`（新版，例如 `Target W25Q51MV_MW_MY-DTR_Rev_A1 06152026.pdf`）
  - `SPEC_TEXT_OLD_PDF`（舊版，例如 `W25Q32_64_12_25_51_01_02RW-DTR_RevD3 09092026.pdf`）
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

## 跨 Session reference（最多 3 筆）

1. 2026-11-04 Copilot CLI session `ed086d40-3972-47b7-bdaf-c8445673f34c`：文字敘述差異分頁實作、計畫文件與本機合併。
