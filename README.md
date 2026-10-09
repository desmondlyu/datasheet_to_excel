# Datasheet 規格工作台

以瀏覽器操作既有 Python 擷取引擎。上傳文字型 PDF，預覽每個產品與條件的規格，篩選後下載 Excel，也能比對新舊版本。原本 PyQt 桌面程式仍可使用。

## 網頁版啟動（Windows）

先安裝 Python 3.12 以上版本，在專案資料夾開啟 PowerShell，執行：

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-web.txt
.\.venv\Scripts\python.exe app.py
```

瀏覽器開啟 **http://127.0.0.1:8000**。完成安裝後可直接雙擊 `start-web.bat`。關閉終端機即停止服務。

macOS / Linux：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-web.txt
.venv/bin/python app.py
```

不需要 AI API、Node.js 或外部雲端服務。安裝依賴後可離線執行。本版為本機單人使用，預設只監聽 127.0.0.1，尚未部署為公網網站。

## 操作

1. 選擇或拖入新版 PDF；需要比對時，勾選比對並選擇舊版。
2. 頁碼留白時沿用原程式的電性章節偵測。指定頁碼請填 **PDF 實際頁次**（例如 `169,170,171`），不是頁尾印刷頁碼；新舊版可以分開指定。
3. 按「解析並預覽」，依產品、AC/DC、symbol、parameter、條件及比對狀態篩選。
4. 點選規格列查看完整欄位、來源章節、PDF 頁次與註解。
5. 按「下載全部 Excel」或「下載篩選結果」。待核對原表與来源文字仍完整保留，方便追查。

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

- 上傳總大小上限 50 MB，每份上限 600 頁。只支援可擷取文字的 PDF；不含 OCR。
- PDF 只在解析期間暫存於系統暫存目錄，成功或失敗都清除。資料不傳外部 AI。
- 解析結果保留在本機程序記憶體 30 分鐘，最多 8 組；重啟後清除。同一瀏覽器重新轉換會取代上次結果。
- 匯出的 PDF 文字以 Excel 文字儲存，避免被當成可執行公式。
- 產品辨識目前針對 W25QxxRW 家族及斜線縮寫標題；其他系列可能顯示「未辨識產品」。不應視為通用所有廠商的解析器。
- 不同 PDF 的表格結構可能不同。請核對 Review 與 Source；本版不保證任意檔案零漏項。
- 網頁不隨附使用者上傳的 PDF，也不把 PDF 或匯出 Excel 提交到 Git。

## 開發與驗證

```sh
python -m unittest discover -s tests
```

整份 reference PDF 驗證需自行指定本機檔案，避免將文件提交到 Git：

```powershell
$env:SPEC_REFERENCE_PDF = "C:\path\W25Q32_64_12_25_51_01_02RW-DTR_RevD3 09092026.pdf"
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

`extraction_core.py` 是從原程式搬出的非 Qt 擷取／比對工具；`pdf_to_excel.py` 保留原桌面流程；`spec_service.py` 負責網頁版標準化、固定欄位比較及 Excel；`app.py` 提供本機 HTTP 介面。

---

## 原桌面版使用說明

# 📄 Datasheet PDF 比對工具

將 IC 規格書（PDF）中的電性規格表格，一鍵轉換為整齊的 Excel 活頁簿，並支援新舊版本差異比對。

---

## 🎯 這個工具能做什麼？

工程師在驗證新版晶片或核對供應商規格時，常需要逐頁翻閱 PDF 規格書，人工比對新舊版本的電性數值既費時又容易出錯。這個工具可以：

- 📥 **匯入 PDF 規格書**，自動找出電性規格章節（DC、AC 規格、操作範圍等）
- 📊 **輸出結構化 Excel**，每個子章節各自一頁，標題清晰、格式整齊
- 🔍 **新舊版本差異比對**，變動的數值自動標紅，新增的規格標綠，一眼看出差在哪裡

---

## 🖥️ 安裝需求

使用前請確認電腦已安裝以下軟體：

- **Python 3.10 以上**（[點此下載](https://www.python.org/downloads/)）
- 以下 Python 套件（開啟命令提示字元，輸入以下指令安裝）：

```
pip install PyQt6 pdfplumber pandas openpyxl
```

---

## 🚀 如何啟動

1. 下載或 clone 完整專案，保留 `pdf_to_excel.py` 與 `extraction_core.py` 在同一資料夾
2. 開啟命令提示字元，進入檔案所在資料夾
3. 輸入以下指令啟動程式：

```
python pdf_to_excel.py
```

---

## 📖 使用步驟

### 基本用法：PDF 轉 Excel

| 步驟 | 操作說明 |
|------|----------|
| 1 | 點「選擇新版 PDF」，載入要轉換的規格書 |
| 2 | 點「選擇輸出路徑」，指定 Excel 儲存位置 |
| 3 | 確認下方自訂頁碼欄位為空（使用自動偵測） |
| 4 | 點「轉換成 Excel」，等待完成提示 |

> 程式會自動找出 PDF 中的電性規格章節，轉換後每個子章節各為一個 Excel 頁籤（SPEC1、SPEC2…）

---

### 進階用法：新舊版本差異比對

1. 依照上方步驟載入**新版 PDF** 與輸出路徑
2. 勾選「**比對格式**」
3. 點「**選擇舊版 PDF**」，載入舊版規格書
4. 點「轉換成 Excel」

**輸出結果說明：**

| 標記 | 意義 |
|------|------|
| 🔴 紅底白字 `舊值 --> 新值` | 此欄數值在新版中有變動 |
| 🟢 綠底白字 `xxx (新增)` | 此列規格為新版新增 |
| 無標記 | 新舊版本數值相同 |

---

### 指定頁碼（選用）

若只需要擷取特定頁面，可在「**自訂頁碼**」欄位輸入頁碼，格式為逗號分隔，例如：

```
165, 168, 172
```

輸入頁碼後，程式將只處理指定頁面，略過自動章節偵測。

---

## ❓ 常見問題

**Q：轉換後某些頁籤沒有資料？**
請查看畫面下方的日誌面板，會顯示跳過的原因（例如：找不到表頭、資料量不足）。

**Q：比對結果大量標示「新增」？**
新舊兩份 PDF 的章節結構需相近（同為 Winbond 同系列規格書）。若章節標題差異過大，比對準確度會下降。

**Q：支援哪些廠商的規格書？**
目前針對 **Winbond W25Q 系列** Flash IC 規格書最佳化；其他廠商規格書若表格格式相近，也可嘗試使用。

**Q：程式完全離線運作嗎？**
是的，所有處理均在本機完成，不會上傳任何資料。

---

## 📋 系統需求

- 作業系統：Windows 10 / 11
- Python：3.10 以上
- 硬碟空間：< 50 MB（含依賴套件）

---

## 📝 版本資訊

本工具持續開發中，如有問題或建議，歡迎至 [GitHub Issues](https://github.com/desmondlyu/datasheet_to_excel/issues) 回報。
