# 文字敘述差異比較計畫

> 建立日期：2026-11-04。狀態：已實作，並完成 Node 測試、build 與 Chromium 驗證；Safari／WebKit 尚未實測。
> 原始需求文件 `W25Q51MV_vs_W25Q51RW_Datasheet_Text_Diff.md` 未在本機找到；以下設計依實作時提出的建議答案（Q2–Q8）定案，尚待使用者確認。

## 目標

比較新、舊兩份 datasheet 各章節的**文字敘述**差異，排除規格表格。功能放在獨立分頁，不改變既有規格解析、預覽與 Excel 匯出。

範例檔案（私有，不進 repo）：

| 角色 | 檔案 |
|---|---|
| 新版 | `Target W25Q51MV_MW_MY-DTR_Rev_A1 06152026.pdf` |
| 舊版 | `W25Q32_64_12_25_51_01_02RW-DTR_RevD3 09092026.pdf` |

## 設計決策

| # | 議題 | 決策 |
|---|---|---|
| Q1 | 原始計畫書 | 未找到，以下各項為暫定設計 |
| Q2 | 放置位置 | 新增第 4 個分頁「文字敘述差異」；沿用既有新／舊版上傳欄位，以獨立按鈕與獨立 Web Worker 執行，可取消 |
| Q3 | 章節配對 | 以去除編號的標題配對，型號字樣視為相同，可對上重新編號的章節；配對錯誤時可手動修正 |
| Q4 | 比對範圍 | 包含段落、條列、Notes、Figure／Table 標題；排除有框線的表格、圖中小字標籤、頁首頁尾、目錄頁及 Revision History |
| Q5 | 差異規則 | 忽略空白、斷字空白及引號樣式差異；只差產品型號時標為「僅型號替換」，可設定視為相同；大小寫與數字差異視為修改 |
| Q6 | 呈現方式 | 左側章節清單，可依狀態篩選與全文搜尋；右側舊版／新版並排，標示字詞差異及 PDF 實際頁次 |
| Q7 | 匯出 | 另存 `datasheet_text_diff.xlsx`，依網頁目前的配對產生 |
| Q8 | 測試 | 單元測試使用合成資料；真實 PDF 透過環境變數執行私有整合測試 |

章節狀態：相同、僅型號替換、修改、新增、移除。

## 架構與資料流

```text
新／舊 PDF
  → browser/text-diff.worker.mjs（PDF.js 抽取文字，執行 pairSections）
  → browser/main.mjs（buildReport、篩選、渲染並排 diff、手動配對）
  → browser/text-diff-workbook.mjs（ExcelJS 匯出）
```

| 檔案 | 職責 |
|---|---|
| `browser/text-diff.mjs` | 核心邏輯：`extractNarrative` 抽取內文、`buildSections` 切分章節、`alignParagraphs` 對齊段落、`diffWords` 比對字詞、`pairSections` 配對章節、`buildReport` 產生報告、`summarize` 統計 |
| `browser/text-diff.worker.mjs` | 背景抽取兩份 PDF，並回傳 `{newDoc, oldDoc, pairing}`；錯誤訊息附上 `BUILD_ID` |
| `browser/text-diff-workbook.mjs` | 產生文字差異 Excel |
| `browser/main.mjs`、`index.html`、`browser/style.css` | 文字差異分頁的介面與樣式；更換檔案或清除工作階段時，同步清除文字比對結果 |
| `tests/browser/text-diff.test.mjs` | 單元測試與私有 PDF 整合測試 |

### 重點規則

- 章節標題 regex 支援編號後沒有空格的標題，例如 `2.1Pin Configuration`。
- 未配對的舊章節，排在它在舊版中前一個已配對章節所對應的新章節之後。
- 手動配對時，如果選擇的舊章節原本已經配對，會先解除原本的配對；之後重新產生報告與統計，並標示為「手動配對」。
- 勾選「僅型號替換視為相同」時，統計、清單篩選與段落顯示都一起套用。

## Excel 匯出

| 工作表 | 內容 |
|---|---|
| 文字差異 | 每列一個段落。差異欄使用 rich text：刪除為紅色刪除線，新增為綠色粗體底線，型號替換為藍色。凍結首列並啟用篩選 |
| 章節總覽 | 每列一個章節，列出狀態、新舊章節及頁次 |
| 說明 | 列出狀態定義與比對規則 |

單一儲存格最多保留 32000 字元，超過的部分會截斷。

## 驗證結果（範例 PDF）

- 新版約 5 秒切出 228 個章節；舊版約 6 秒切出 206 個章節。共配對 186 組，產生報告約 45 ms，Excel 共 1397 列。
- 代表章節：
  - 6.3.5 判定為相同。
  - 5.1.2 判定為僅型號替換。
  - 3.3 正確標出 `section 2` → `Figure 2.x`。
  - 3.9 /RSTO 判定為新增。
  - 5.6.1 → 5.5.1 Write Password 可依標題配對。
- `npm test`：98 項測試，90 項通過、8 項需要私有 PDF 的測試略過。設定 `SPEC_TEXT_NEW_PDF`／`SPEC_TEXT_OLD_PDF` 後，文字比對測試 6 項全部通過。
- `npm run build` 成功。
- 已在 Chromium 驗證比對、篩選、手動配對、Excel 下載、清除工作階段、缺少檔案時的錯誤提示，以及 390px 窄畫面。

## 已知限制

- 段落依 PDF 版面推斷；換頁、雙欄或圖文混排處可能切分不同。
- 沒有框線且沒有標題的表格，可能被當成內文比對。
- Figure 編號差異（例如 `Figure 6.3.1` 與 `6.3`）會算作修改。
- 段落對齊偶爾不完美，例如 3.7 的 BUSY 與 RSTO 段落。
- 部分新版標題會帶入下一行的多餘文字，例如 5.5。
- 尚未在 Safari／WebKit 或實體手機測試。

## 待確認

1. 補上原始計畫書，或確認以上 Q2–Q8 設計。
2. 是否需要調整段落對齊門檻（目前為 0.35），或忽略 Figure 編號差異。
