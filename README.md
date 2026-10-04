# 學習題庫

## 檔案分工

- index.html：頁面結構與各面板。
- css/style.css：外觀、答案對齊與響應式樣式。
- js/app.js：題庫載入、搜尋、篩選、分頁與答案切換。
- js/navigation.js：側欄、單元切換與粉色置頂按鈕。
- js/custom-questions.js：自行新增／刪除題目與 localStorage。
- js/music.js：首頁唱片播放按鈕、兩首 MP3 的順序播放與暫停控制。
- js/units.js：科目與單元設定，每個開放單元指向自己的題庫檔案。
- js/utils.js：共用文字處理與題型名稱。
- data/questions.json：演算法 U2 的 60 題；後續單元使用各自的 JSON，透過 js/units.js 設定載入。
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


## 科目與單元

進入網站先選科目；演算法可進入，作業系統尚未開放。演算法預設進入 U2，U1、U3 尚未開放。從側欄點選「選擇單元」後切換單元，或點選「切換科目」回到首頁。每次重新開啟網站皆先顯示科目選擇頁。

新增單元時建立獨立 JSON（例如 data/algorithm-u3.json），再設定 js/units.js 中對應單元的 dataUrl（相對於 js/app.js，例如 ../data/algorithm-u3.json）。搜尋、篩選、分頁與答案狀態只作用於目前單元；切換單元會重設搜尋、篩選、分頁與新增表單。題號只需在單元內唯一，其他單元可重複使用相同題號。

演算法 U2 保留原 localStorage 名稱 algorithm_question_bank_user_questions_v1，舊自訂題繼續歸屬 U2，無需搬移或改寫。其他單元各自使用 question_bank_user_questions_v1_<科目ID>_<單元ID>，自訂題互不混用。

## 首頁與音樂

首頁採冰藍、淡粉與銀白星光風格，SVG 星芒以不同節奏緩慢明暗變化。側欄只保留「選擇單元」入口；隱藏捲動條但仍可捲動。使用者啟用減少動態效果時，星光與唱片動畫停用。

音樂檔案由使用者提供：
- music/blue.mp3：BLUE (WINTER Solo)
- music/speed-of-summer.mp3：WINTER - Speed of Summer

右下角唱片以原生 audio 播放，不顯示原生播放器。首次點擊後才載入音訊，先播 BLUE，再接 Speed of Summer，兩首依序循環；預設音量 50%。再點一次暫停，保留播放位置，再點即可續播。唱片僅在音樂實際播放時旋轉；載入中、暫停或失敗時停止。進入題庫會暫停；返回首頁後可手動續播。重新整理後回到 BLUE，並等待使用者點擊。歌曲放在同一網站來源，不使用 YouTube、外部音訊直連或自動播放。
