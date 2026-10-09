# Datasheet 規格工作台

## 已確認需求
沿用原 Python 的章節偵測、指定頁碼、表格擷取及版本比對流程，新增瀏覽器操作。第一列固定為產品名稱、max、typ、min、symbol、parameter、condition、description、unit、spec type、page；每個產品／條件獨立一列。空值不填零，公式、正負號和註解保留。

## 實作方式
Python Flask 提供本機服務，沿用原擷取核心，新增合併儲存格幾何解析和標準化層。上傳檔暫存於系統暫存目錄並於解析後清除，不提交 PDF 到 Git。Excel 含 Specs、Changes、Review、Source 工作表。無法標準化的表格原文放入 Review，不宣稱完整轉換。

## 介面
藍灰底、白色工作區、深藍導航、青色操作按鈕；Segoe UI 與系統中文字型。左側上傳及比對設定，右側全寬表格。固定表頭、搜尋、產品／類型／差異篩選、點選規格查看來源及詳細內容。窄螢幕改直向排列。

## 驗證
用原始上傳 PDF 比對 W25Q32RW 的 ICC1、Icc3、tCE，W25Q02RW 的容量分組、頻率矩陣，以及欄位順序與空值。使用合成資料測試變更、新增、刪除、重複鍵和 Excel 公式字串。無 OCR；掃描檔需提示無文字資料。
