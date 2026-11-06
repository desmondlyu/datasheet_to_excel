# Datasheet 規格工作台

把 PDF 規格書（Datasheet）的電性規格整理成 Excel，也能找出新舊版本改了哪些數值和文字。打開網頁就能用，不用安裝軟體、不用登入。**PDF 只在你自己的瀏覽器裡處理，不會上傳到任何伺服器。**

👉 開啟網站：<https://desmondlyu.github.io/datasheet_to_excel/>

## 可以幫你做什麼

| 你想做的事 | 怎麼做 | 你會得到 |
|---|---|---|
| 把規格書的 AC/DC、指令、讀取頻率整理成表格 | 選新版 PDF → 「解析並預覽」 | 可篩選、搜尋的預覽表和 Excel |
| 看新版改了哪些規格數值 | 再勾選「比對新舊版本」並選舊版 PDF | 每一列標示「變更／新增／移除／待確認／未變更」，並寫出 `舊值 → 新值` |
| 看新版的文字敘述改了哪幾句 | 同上，比對兩版時會自動一起比對 | 「文字敘述差異」分頁逐章並排、修改處標色，並附在同一份 Excel |

## 快速上手

### 1. 把規格整理成 Excel

1. 把 PDF 拖進「新版規格書」，或點選檔案。
2. 頁碼通常留白就好，系統會自動找電性章節。只想看特定頁時，在「頁碼設定」填 **PDF 閱讀器顯示的頁次**（例如 `169,170,171`），不是頁尾印的頁碼。
3. 按「解析並預覽」。檔案較大時要等一下，中途可以按「取消解析」。
4. 在「標準化規格」分頁，可以依產品、規格類型、比對狀態篩選，也可以搜尋任何欄位，包括 Opcode、相關指令和變更說明。點任一列可看完整欄位、來源章節、PDF 頁次和原文註解。
5. 按「下載全部 Excel」，或只下載目前畫面的「下載篩選結果」。

### 2. 比對新舊版規格

1. 勾選「比對新舊版本」，再選「舊版規格書」。新、舊版可以各自指定頁碼。
2. 按「解析並預覽」。規格和文字敘述會一起比對：規格結果先顯示，文字比對完成後才能下載 Excel。「比較結果」欄會顯示每一列的狀態，「變更說明」會寫出 `欄位：舊值 → 新值`。
3. 遇到「待確認」時，詳情裡會列出舊版的候選值，請對照原始 PDF 判斷。

### 3. 看文字敘述差異

適合找功能說明、Notes、注意事項等文字段落的修改。只上傳一版時不會比對，也不會出現這個分頁。

1. 依「比對新舊版規格」選好兩份 PDF 並按「解析並預覽」，完成後切到「文字敘述差異」分頁。
2. 左邊是章節清單，可依狀態篩選或搜尋；右邊是舊版和新版並排：
   - **紅色刪除線**：舊版有、新版拿掉了。
   - **綠色底線**：新版新增的文字。
   - **藍色**：只差在產品型號。勾選「僅型號替換視為相同」就不會算成修改。
   - 每句都附 PDF 頁次，跨頁的句子會標出起訖頁，方便直接回 PDF 對照。
3. 章節即使重新編號，也會依標題自動配對。配錯時，在章節詳情的「對應舊版章節」下拉選單手動改。
4. 勾選「只顯示差異段落」可以隱藏沒變的內容。
5. 下載 Excel 時會一併附上「文字差異」和「章節總覽」工作表，內容以網頁上目前的配對為準。

## 下載的 Excel 裡有什麼

**規格 Excel**

| 工作表 | 用途 |
|---|---|
| 產品規格比較表 | 主要結果：每個產品、規格、條件一列；有比對舊版時附比較結果和變更說明 |
| 說明 | 檔名、匯出時間、各種比較結果的意思、配對規則 |
| 指令表 | 從 PDF 自動找到的指令表（Command／Opcode／Address／Dummy／Data），有舊版時也會比對 |
| Review | 系統無法可靠轉換的原始表格，**請人工確認** |
| Source | 來源頁的完整原文，包括 Notes，方便追查 |
| 文字差異 | 只在比對兩版時出現：逐句列出文字敘述修改，並以顏色標示 |
| 章節總覽 | 只在比對兩版時出現：各章節的配對與相同／修改／新增／移除段落數 |

## 使用前請先知道

- **隱私**：開啟網站時只會下載網頁本身，選取的 PDF 和結果都只存在瀏覽器記憶體。重新整理或關閉頁面後就會清空，請記得先下載 Excel；也可以按「清除檔案與結果」。
- **檔案限制**：每份 PDF 最多 600 頁，合計最多 50 MB。只支援能選取文字的 PDF，掃描圖檔（需 OCR）不支援；加密的 PDF 要先解除保護。結果很多時，產生 Excel 的瞬間畫面可能會短暫停頓。
- **請以原始 PDF 為準**：工具不會猜測或補值，無法確定的內容會放在 Review 或標示「待確認」。目前用 W25Q32/64/12/25/51/01/02RW（1,442 列）和 W35T51NW 規格書驗證過，其他廠商或特殊版型不保證能完整解析。
- **產品辨識**：從文件頁首和前兩頁辨識產品，不看檔名。完整型號、斜線縮寫（例如 W35T51/01NW）和型號範圍都支援。
- **文字比對的範圍**：只比對段落、條列、Notes 和 Figure/Table 標題，不比對有框線的表格、圖中的小字、頁首頁尾、目錄和 Revision History。
- **文字比對的判斷方式**：空白、斷字、換行連字號、引號樣式不同都視為相同；大小寫和數字不同算修改。段落是依 PDF 版面推斷的，雙欄或圖文混排的地方偶爾會切得不一樣。

## 常見問題

**看到一個差異，但在 PDF 裡找不到？**
先確認新版和舊版沒有選錯檔案。每個差異都附 PDF 頁次，可以直接翻到那一頁對照。

**頁碼要填哪一個？**
填 PDF 閱讀器上方顯示的頁次，不是頁尾印刷的頁碼。指定頁碼只影響電性表格；指令表仍會從整份 PDF 自動尋找。

**為什麼有些規格出現在 Review？**
那些表格的版型無法可靠轉換。為了避免把數值放錯欄位，系統保留原表給你人工判斷。

## 附錄：轉換與比對規則（進階）

給需要確認 Excel 欄位細節的使用者參考。

第一列直接是欄位名稱，資料由第二列開始，沒有合併儲存格。「產品規格比較表」欄位：

`比較結果 | 變更欄位 | 變更說明（舊 → 新） | 產品名稱 | Opcode | unit | max | typ | min | symbol | SPI/QPI | 3/4 byte address | Dummy | Starting Address | spec type | 相關指令 | parameter | condition | description | 新版頁碼 | 舊版頁碼`

- 欄位順序依 `title_sequence.xlsx`，不再匯出「對應依據」；瀏覽器預覽與 Excel 使用相同欄位及內容。
- Opcode 優先使用頻率矩陣指令碼，其他規格則由相關指令帶入並去除重複；空格、逗號與斜線統一為 `0Bh/9Ch`、`C7h/60h`。SPI/QPI 欄顯示介面名稱：`1-1-1` 為 SPI、`4-4-4` 為 QPI；可辨識的 Dual/Quad SPI 仍為 SPI，DTR 分開標示。原始 IO 模式保留於 condition，混合 SDR／ODDR 或其他未辨識模式不強制改成 QPI。Address／Dummy 由頻率矩陣或指令表帶出；Starting Address 也會從一般規格的 condition 擷取。
- 相關指令：依原文 opcode 或明確名稱規則（例如 Page Program Time → Page Program 類指令）帶出指令名稱與介面模式；找不到可靠對應則留空，不猜測。SPI/QPI 欄空白時，依相關指令回填：只有 `1-1-1` → `SPI`，只有 `4-4-4` → `QPI`，兩者都有 → `Both`；保留該列已有的明確模式（包含 DTR），其他 IO 格式不套用此回填。預覽與 Excel 同步，原始相關指令、條件及比較結果不變。
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

讀取頻率的補充解析獨立於既有 AC/DC、指令表與頻率矩陣規則：辨識指定 Dummy 的 SPI/QPI、排除 03h 與 DTR、DTR、03h 四種 AC 群組，並涵蓋狀態、ID、SFDP、安全暫存器與 Read Buffer 等讀取用途。明確的指令頻率表優先，不套用一般群組；正文明示的 fR／FR 對應優先於一般分類。中途 Set Read Parameters 表依表頭、Opcode、SPI/QPI、DTR 與設定逐列保留 Dummy／頻率，symbol、min、typ 只由同產品的對應 AC 群組帶入。找不到群組時保留原指令；無法辨識的設定表值不回退套用一般頻率。未列於指令總表的 Opcode、重複設定標示待確認；註腳與來源條件保留，不推定缺少的位址或設定。指定 AC 頁碼未包含群組時，不擴充這些頻率。

Octal 指令表同時列出 SDR 與 ODDR 協定時，產品規格比較表按指令階段分列：`1-*-*` 在 SPI/QPI 欄顯示 `SDR`，`8d-*-*` 顯示 `DDR`，原協定保留在 condition。`1-1d-8d`、`1-8d-8d` 依第一階段仍屬 SDR，不因資料階段帶 d 而套用 DDR。Read 指令只從同產品、同模式的 AC 頻率群組回填 unit／max／typ／min／symbol；`Clock frequency for Read (...)` 中明列的 Opcode 優先，其他 Read 指令對應 `Clock frequency except for Read`，不同溫度條件分列。缺少對應群組、未辨識協定保留 Command 原文且不補頻率。明確指令頻率表仍優先；獨立指令表保持原始支援模式，其他 SPI/QPI 文件的顯示規則不變。

版本配對使用產品、規格類型、symbol、parameter、condition，Opcode 組合先正規化，空格、分隔符或組合順序不同不視為新增／移除。已合併的 Aligned／Any 先各自比較，再合併內容與比較結果相同的列，避免其中一種頻率改變時錯配。相同鍵有多筆不同規格時標為待確認，不任意覆蓋；其他實際條件或規格名稱變更仍可能呈現一筆新增與一筆移除。

## 開發者

### 部署到 GitHub Pages

1. 將變更合併到 `master`。
2. 在 repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**（需要 repository 管理權限）。
3. 查看 Actions 的 **Build and deploy browser app**。若先前部署失敗，完成設定後重新執行 workflow。
4. 部署成功後，網址為 `https://desmondlyu.github.io/datasheet_to_excel/`。

Workflow 會執行 `npm ci`、`npm test`、`npm run build`，只部署 `dist` 靜態檔案；PR 只做測試與建置。套件不依賴第三方 CDN。

### 本機開發

使用 Node.js 24：

```sh
npm ci
npm run dev
```

正式建置與預覽：

```sh
npm run build
npm run preview
```

`browser/` 包含座標與表格線重建、標準化、比對、匯出及介面；`index.html` 是靜態網站入口。PDF.js 版本固定，升級後應重跑 reference 驗證。瀏覽器驗證範圍見 `docs/BROWSER_VALIDATION.md`，文字跨頁重排的實作紀錄見 `docs/JS_NARRATIVE_REFLOW_PLAN.md`。

### 測試

```sh
npm test
SPEC_REFERENCE_PDF=/absolute/path/reference.pdf SPEC_SECOND_REFERENCE_PDF=/absolute/path/second-reference.pdf SPEC_SINGLE_REFERENCE_PDF=/absolute/path/single-reference.pdf npm test
SPEC_COMMAND_REFERENCE_DIR=/absolute/path/pdf-and-template-directory npm test
```

第一個指令略過未提供私有 PDF 的整合測試。PowerShell 設定環境變數可用 `$env:SPEC_REFERENCE_PDF = "C:\path\reference.pdf"` 後執行 `npm test`。
文字敘述差異的私有整合測試使用 `SPEC_TEXT_NEW_PDF`／`SPEC_TEXT_OLD_PDF`（不同產品，核對相同／僅型號替換／修改／新增狀態及重新編號配對），以及 `SPEC_TEXT_AG_NEW_PDF`／`SPEC_TEXT_AG_OLD_PDF`（同產品改版，核對版面差異不被誤報）。
`SPEC_COMMAND_REFERENCE_DIR` 指向四份參考 PDF 與 `title_sequence.xlsx` 所在目錄，核對所有產品／指令／設定與對齊頻率完整涵蓋、AC 整合、介面及 Opcode 格式、模板欄序、註腳清除、Source 原文及新舊版預覽／Excel 一致性。私有 PDF 與模板不提交至 repo。

### 舊版 Python 工具

原 PyQt 桌面版與 Flask 本機版不是 GitHub Pages 的執行依賴，已不再隨 repo 提交（列於 `.gitignore`）。需要時可由 Git 歷史（commit `6cacb0a` 以前）取回。

- 桌面版：安裝 `PyQt6 pdfplumber pandas openpyxl`，執行 `python pdf_to_excel.py`。
- Flask 版：`python -m pip install -r requirements-web.txt`，執行 `python app.py`，開啟 `http://127.0.0.1:8000`。Windows 也可執行 `start-web.bat`。
- Python 測試：`python -m unittest discover -s tests`。