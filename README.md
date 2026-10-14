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
3. 按「解析並預覽」，預覽與 Excel「產品規格比較表」共用相同的 21 欄、欄位順序與內容。依產品、規格類型及比對狀態篩選，或搜尋任一顯示欄位（包含 Opcode、相關指令及變更說明）。
4. 點選規格列查看完整欄位、來源章節、PDF 頁次與註解。
5. 按「下載全部 Excel」或「下載篩選結果」。待核對原表與來源文字仍完整保留，方便追查。

## 固定匯出結構

第一列直接是欄位名稱，資料由第二列開始，沒有合併儲存格。「產品規格比較表」欄位：

`比較結果 | 變更欄位 | 變更說明（舊 → 新） | 產品名稱 | Opcode | unit | max | typ | min | symbol | SPI/QPI | 3/4 byte address | Dummy | Starting Address | spec type | 相關指令 | parameter | condition | description | 新版頁碼 | 舊版頁碼`

- 欄位順序依 `title_sequence.xlsx`，不再匯出「對應依據」；瀏覽器預覽與 Excel 使用相同欄位及內容。
- Opcode 優先使用頻率矩陣指令碼，其他規格則由相關指令帶入並去除重複；空格、逗號與斜線統一為 `0Bh/9Ch`、`C7h/60h`。SPI/QPI 欄顯示介面名稱：`1-1-1` 為 SPI、`4-4-4` 為 QPI；可辨識的 Dual/Quad SPI 仍為 SPI，DTR 分開標示。原始 IO 模式保留於 condition，混合 SDR／ODDR 或其他未辨識模式不強制改成 QPI。Address／Dummy 由頻率矩陣或指令表帶出；Starting Address 也會從一般規格的 condition 擷取。
- 相關指令：依原文 opcode 或明確名稱規則（例如 Page Program Time → Page Program 類指令）帶出指令名稱與介面模式；找不到可靠對應則留空，不猜測。指令碼統一放在 Opcode 欄，相關指令不影響原 AC/DC 規格的「比較結果」。
- 指令表的 `Aligned Address (MHz)`／`Any Address (MHz)` 轉成 max、MHz 與 Starting Address，不再只藏在 description；其他條件及所有規格相同時合為 `Aligned/Any`，不同頻率則分列。
- 完整 User mode 指令依產品／IO 模式／設定列入比較表，不再受 AC/DC 對應規則限制。相同指令、模式、Address、Dummy、設定與對齊條件已有 AC 頻率規格時，整合指令名稱與 Data 等資訊到 AC 列，不再重複建立 Command 列；無對應者保留 `spec type = Command`。數值衝突或多筆候選保留並標示待確認。symbol／typ／min 不補值；只有來源明示的頻率才填 max／MHz，其他 Data 與欄位放在 description。不同 Dummy／設定，以及 MHz 頻率與 ms／s 執行時間仍分列，不能只憑 Opcode 合併。Factory-only 章節不加入，User mode 可執行的 Enter Factory Mode 指令仍保留。產品限定請核對 Source 原始 Notes；指定頁碼只限制電性表格，指令表仍由完整 PDF 自動偵測。
- 比較表與指令表的 Opcode／Dummy 移除 `(2)`、`(11,14)` 等數字註腳，Dummy 也移除 `(Def)`／`(Def.)` 預設註記（例如 `6 (Def.)` → `6`），保留數值與其他有效內容；Source、獨立指令表其他欄位與原始 Byte 證據仍保留原文，整合列的 condition 保留實際 IO 與對齊條件。

- 每個產品、規格、條件獨立一列，數值單位獨立。
- 空白保持空白，0 仍是數字 0；± 和 VCC 表達式保留文字。
- parameter 統一承接原文 Parameter / Description；description 保留原文註解引用，不用 AI 自動翻譯或補規格。
- Symbol 的括號數字註解移到 description；限制值的註解同樣移出，數值可直接排序。
- 頻率矩陣依介面模式、opcode、位址模式、Dummy cycle 與對齊條件展開，相同 Aligned／Any 規格才合併；原文 x 不當作數字 0。沒有 symbol 的矩陣保留空白。
- Factory Mode 與一般模式分開；Factory Mode 的電壓條件由文件註解讀取。
- 保留原程式擷取的其他電性表格，以 Other 類型呈現。無法標準化的表格保留在 Review，不宣稱已全數轉換。

Excel 包含：

- **產品規格比較表**：新版 AC/DC 等規格、完整 User mode 指令資訊與新舊版比較結果整合在同一表，相同條件的 Command 頻率與 AC 不重複列出。「比較結果」以文字標示 變更／新增／移除／待確認／未變更／未比對；「變更說明」列出 `欄位：舊值 → 新值`。Command 列也比較 Address／Dummy。移除項目顯示舊版內容與舊版頁碼；待確認項目說明來源衝突或列出舊版候選值。底色僅為輔助。
- **說明**：新舊版檔名、匯出時間、各比較結果定義、配對規則、Command 列與數字註腳處理、指令表來源頁與工作表用途。
- **指令表**：依表頭（Command／Opcode／Address／Dummy／Data，或 Data Input Output／Byte 1／Byte 2…）自動偵測 PDF 指令表，不依固定頁碼；跨頁續表會合併，目錄頁忽略。欄位：比較結果、變更說明、介面模式、指令名稱、Opcode、設定（例如 Set Read Parameters (C0h) = 000）、Address、Dummy、Data、其他欄位、分組、章節、新舊版頁碼。有舊版時以 介面模式＋指令名稱＋Opcode＋設定 配對比較。未偵測到時會明確標示。逐 Byte 格式會從 Byte 1 讀取 Opcode、從 Number of Clock 列讀取介面模式與時脈數，保留 Address 位元範圍及原始 Byte 內容；Opcode／Dummy 欄的數字註腳已移除，原始指令來源頁與緊接的 Notes 頁保留在 Source。
- **Review**：無法可靠轉換的原始表格。
- **Source**：來源頁完整擷取文字，包含原始 Notes。page 為辨識到的印刷頁碼；pdf_page 為實際頁次。

版本配對使用產品、規格類型、symbol、parameter、condition，Opcode 組合先正規化，空格、分隔符或組合順序不同不視為新增／移除。已合併的 Aligned／Any 先各自比較，再合併內容與比較結果相同的列，避免其中一種頻率改變時錯配。相同鍵有多筆不同規格時標為待確認，不任意覆蓋；其他實際條件或規格名稱變更仍可能呈現一筆新增與一筆移除。

## 資料處理與限制

- PDF 合計上限 50 MB，每份上限 600 頁。只支援可擷取文字的 PDF，不含 OCR；加密 PDF 需先解除保護。
- 檔案與結果只存在瀏覽器記憶體；可取消解析、清除檔案與結果。重新整理或關閉頁面後不保留。
- PDF 在 Web Worker 解析，避免鎖住主要介面。Excel 產生時大型結果仍可能短暫占用主執行緒。
- 產品從文件頁首／前兩頁辨識，不依檔名或固定型號清單。支援完整型號、斜線縮寫（如 W35T51/01NW）及依文件產品順序展開的型號範圍；共用規格依產品分列，Product／條件欄指定產品時只歸屬指定產品。
- 支援有編號與無編號的電性章節，並以 Parameter／Symbol／Min／Typ／Max 表頭作為備援。保留 MODE、ALT 與 AC 標題中的 Operating Temperature（含續頁）。
- 已用 W25Q32/64/12/25/51/01/02RW（1,442 列）及 W35T51NW 文件回歸驗證。仍不保證任意廠商或版型完整解析；無法辨識的產品限定、橫向並排多組限制值欄位會保留在 Review，避免錯配。
- Review 與 Source 保留未轉換內容和原文，請在使用規格前核對。PDF.js 版本固定，升級後應重跑 reference 驗證。
- 比對遇到重複鍵時，舊版候選值會保留在詳情與「產品規格比較表」的變更說明，供人工核對。
- PDF 文字匯出為 Excel 文字，空白不補零。repo 不包含使用者 PDF 或匯出結果。
- 目前瀏覽器驗證範圍見 `docs/BROWSER_VALIDATION.md`。

## 測試

```sh
npm test
SPEC_REFERENCE_PDF=/absolute/path/reference.pdf SPEC_SECOND_REFERENCE_PDF=/absolute/path/second-reference.pdf SPEC_SINGLE_REFERENCE_PDF=/absolute/path/single-reference.pdf npm test
SPEC_COMMAND_REFERENCE_DIR=/absolute/path/pdf-and-template-directory npm test
```

第一個指令略過未提供私有 PDF 的整合測試。PowerShell 設定環境變數可用 `$env:SPEC_REFERENCE_PDF = "C:\path\reference.pdf"` 後執行 `npm test`。
`SPEC_COMMAND_REFERENCE_DIR` 指向四份參考 PDF 與 `title_sequence.xlsx` 所在目錄，核對所有產品／指令／設定與對齊頻率完整涵蓋、AC 整合、介面及 Opcode 格式、模板欄序、註腳清除、Source 原文及新舊版預覽／Excel 一致性；私有 PDF 與模板不需提交至 repo。

`browser/` 包含座標與表格線重建、標準化、比對、匯出及介面。`index.html` 是靜態網站入口。

## 舊版 Python 工具

原 PyQt 桌面版與 Flask 本機版保留供比對或舊流程使用，不是 GitHub Pages 的執行依賴。

- 桌面版：安裝 `PyQt6 pdfplumber pandas openpyxl`，執行 `python pdf_to_excel.py`。
- Flask 版：`python -m pip install -r requirements-web.txt`，執行 `python app.py`，開啟 `http://127.0.0.1:8000`。Windows 也可執行 `start-web.bat`。
- Python 測試：`python -m unittest discover -s tests`。

`extraction_core.py` 保留原擷取工具；`spec_service.py` 是舊 Flask 版的標準化與匯出服務。
