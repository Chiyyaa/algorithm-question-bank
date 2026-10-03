# 演算法題庫

## 檔案分工

- index.html：頁面結構與各面板。
- css/style.css：外觀、答案對齊與響應式樣式。
- js/app.js：題庫載入、搜尋、篩選、分頁與答案切換。
- js/navigation.js：側欄、單元切換與粉色置頂按鈕。
- js/custom-questions.js：自行新增／刪除題目與 localStorage。
- js/utils.js：共用文字處理與題型名稱。
- data/questions.json：內建題目；新增章節時可另增 JSON，並接上單元選擇功能。目前尚未實作多章節載入。
- tests/run.cjs：本機瀏覽器回歸測試與預覽伺服器，不是網站執行必要檔案。

## 本機預覽

此版使用 JavaScript 模組及 fetch，請用 HTTP 伺服器開啟，不要直接雙擊 index.html。

使用 Node.js：

```sh
node tests/run.cjs --serve
```

終端會顯示本機網址。GitHub Pages 可直接提供這些靜態檔案，不需要建置流程。

## 測試

安裝 Playwright 與其 Chromium 瀏覽器後執行：

```sh
node tests/run.cjs
```

## 相容性

localStorage 名稱仍為 algorithm_question_bank_user_questions_v1；在原網站網址部署時，可繼續讀取該瀏覽器已有的自訂題目。本機預覽為不同來源，不會讀取或改動正式網站的自訂題目。

## 更新資料

保持題目 id 唯一。選擇題的 correct_answer 應對應當前 options；options_status=known_options_only 表示只收錄來源已知選項。#43 使用 disputed 題型，保留原標準答案並附爭議提醒。

## 部署

將 index.html、css/、js/、data/ 在同一個 commit 更新，避免新頁面先上線但依賴檔案尚未齊全。

