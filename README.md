# Datasheet 規格工作台

純瀏覽器版 PDF 電性規格轉 Excel。PDF 解析、新舊版比對、篩選與 XLSX 產生都在使用者裝置完成，不需要安裝 Python，也沒有後端 API。網站可部署到 GitHub Pages。

## GitHub Pages 部署

1. 將本分支合併到 `master`。
2. 在 repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**（需要 repository 管理權限）。
3. 查看 Actions 的 **Build and deploy browser app**。若先前部署失敗，完成設定後重新執行 workflow。
4. 部署成功後，在 Pages 設定頁取得網址；此 repo 的預期網址為 `https://desmondlyu.github.io/datasheet_to_excel/`。

Workflow 只部署 `dist` 靜態檔案；PR 僅進行測試與建置。套件不依賴第三方 CDN。開啟網站需要取得靜態資源；選取的 PDF 內容不會送到 GitHub 或其他服務。

## 本機開發

使用 Node.js 24：

```sh
npm ci
npm run dev
```

正式建置與预覽：

```sh
npm run build
npm run preview
```

## 操作

1. 選擇或拖入新版 PDF；需要比對時，勾選比對並選擇舊版。
2. 頁碼留白時沿用電性章節偵測。指定頁碼請填 **PDF 實際頁次**（例如 `169,170,171`），不是頁尾印刷頁碼；新舊版可以分開指定。
3. 按「解析並預覽」，依產品、AC/DC、symbol、parameter、條件及比對狀態篩選。
4. 點選規格列查看完整欄位、來源章節、PDF 頁次與註解。
5. 按「下載全部 Excel」或「下載篩選結果」。待核對原表與來源文字仍完整保留，方便追查。

## 固定匯出結構

第一列直接是欄位名稱，資料由第二列開始，沒有合併儲存格：

`產品名稱 | max | typ | min | symbol | parameter | condition | description | unit | spec type | page`

- 每個產品、規格、條件獨立一列，數值單位獨立。
- 空白保持空白，0 仍是數字 0；± 和 VCC 表達式保留文字。
- parameter 統一承接原文 Parameter / Description；description 保留原文註解引用，不用 AI 自動翻譯或補規格。
- Symbol 的括號數字註解移到 description；限制值的註解同樣移出，數值可直接排序。
- 頻率矩陣依介面模式、opcode、位址模式、Dummy cycle 與對齊條件展開；原文 x 不當作數字 0。沒有 symbol 的矩陣保留空白。
- Factory Mode 與一般模式分開；Factory Mode 的電壓條件由文件註解讀取。
- 保留原程式擷取的其他電性表格，以 Other 類型呈現。無法標準化的表格保留在 Review，不宣稱已全數轉換。

Excel 包含：

- **Specs**：新版規格。新增以綠色、變更以淡黃、配對待確認以淡紅標記。
- **Changes**：變更欄位、舊值、新值，以及新增、移除、重複鍵待確認項目。移除項目不混入新版 Specs。
- **Review**：無法可靠轉換的原始表格。
- **Source**：來源頁完整擷取文字，包含原始 Notes。page 為辨識到的印刷頁碼；pdf_page 為實際頁次。

版本配對使用產品、規格類型、symbol、parameter、condition。相同鍵出現多筆時標為待確認，不任意覆蓋。條件或規格名稱變更時可能呈現一筆新增與一筆移除，需人工核對。

## 資料處理與限制

- PDF 合計上限 50 MB，每份上限 600 頁。只支援可擷取文字的 PDF，不含 OCR；加密 PDF 需先解除保護。
- 檔案與結果只存在瀏覽器記憶體；可取消解析、清除檔案與結果。重新整理或關閉頁面後不保留。
- PDF 在 Web Worker 解析，避免鎖住主要介面。Excel 產生時大型結果仍可能短暫占用主執行緒。
- 產品辨識與表格重建以 Winbond W25Q 系列為主。已針對提供的 W25Q32/64/12/25/51/01/02RW reference PDF 驗證 1,442 列；不保證任意廠商或版型都能完整解析。
- Review 與 Source 保留未轉換內容和原文，請在使用規格前核對。PDF.js 版本固定，升級後應重跑 reference 驗證。
- 比對遇到重複鍵時，舊版候選值會保留在詳情與 Changes，供人工核對。
- PDF 文字匯出為 Excel 文字，空白不補零。repo 不包含使用者 PDF 或匯出結果。
- 目前瀏覽器驗證範圍見 `docs/BROWSER_VALIDATION.md`。

## 測試

```sh
npm test
SPEC_REFERENCE_PDF=/absolute/path/reference.pdf npm test
```

第一個指令略過未提供私有 PDF 的整合測試。PowerShell 設定環境變數可用 `$env:SPEC_REFERENCE_PDF = "C:\path\reference.pdf"` 後執行 `npm test`。

`browser/` 包含座標與表格線重建、標準化、比對、匯出及介面。`index.html` 是靜態網站入口。

## 舊版 Python 工具

原 PyQt 桌面版與 Flask 本機版保留供比對或舊流程使用，不是 GitHub Pages 的執行依賴。

- 桌面版：安裝 `PyQt6 pdfplumber pandas openpyxl`，執行 `python pdf_to_excel.py`。
- Flask 版：`python -m pip install -r requirements-web.txt`，執行 `python app.py`，開啟 `http://127.0.0.1:8000`。Windows 也可執行 `start-web.bat`。
- Python 測試：`python -m unittest discover -s tests`。

`extraction_core.py` 保留原擷取工具；`spec_service.py` 是舊 Flask 版的標準化與匯出服務。
