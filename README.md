# 學習題庫

線上練習演算法、作業系統與英文。從首頁選擇科目，即可開始搜尋或練習。

[開啟學習題庫](https://chiyyaa.github.io/algorithm-question-bank/)

## 演算法與作業系統

| 科目 | 測驗練習單元 | 預設題庫 |
| --- | --- | --- |
| 演算法 | U2～U7 | U6 |
| 作業系統 | U2～U6、挖寶單元 | U3 |

- **題庫搜尋**可依題目、選項、答案與題型查找目前單元的題目，也可查看已審核的「友列協助題」。
- **測驗練習**可從指定單元抽 15 題、30 題或全部可出題的題目。通過獨立驗證題後開始作答，每題送出即可核對答案，最後可複習錯題。
- **批次查題**可匯入測驗題目頁的 HTML，按題序比對站內題庫，查看找到的答案或開啟相近題目核對。
- **經典對決（維護中）**暫停開放。考前必會已下架。

## 英文

英文頁提供單字表、發音、當週測驗與總測驗。當週測驗從本期單字抽 20 題，總測驗從全部單字抽 30 題。測驗會顯示中文與詞性，輸入英文後即可核對答案。發音使用瀏覽器提供的語音。

[開啟英文題庫](https://chiyyaa.github.io/algorithm-question-bank/english.html)

## 首頁與大禮包

網站依台北時間 06:00／18:00 切換日夜模式，也可手動切換。首頁右上角的「大禮包」位於日夜模式按鈕旁。點開後選「確認下載」，即可取得 Windows 版 `CourseReader_Windows.zip`（約 30 MB）。

[查看 CourseReader 發行檔案](https://github.com/Chiyyaa/algorithm-question-bank/releases/tag/v2026.11.17-coursereader)

## 題庫協作

協作者登入後，可匯入同一次測驗的題目與答案 HTML。系統比對現有題庫並排除已收錄的相同題目。送出前可檢查剩下的題目，管理員審核時可選擇新增一題、取代指定舊題或退回。核准後才會公開。

[進入題庫協作](https://chiyyaa.github.io/algorithm-question-bank/collaborate.html) · [後台設定](backend/README.md)

## 本機預覽與維護

網站以 GitHub Pages 提供靜態頁面。使用 Node.js 22.13 或更新版本，在儲存庫根目錄執行下列指令，再開啟終端顯示的本機網址。

```sh
npm install
node tests/run.cjs --serve
```

執行瀏覽器測試前，可用 `npx playwright install chromium` 安裝 Chromium。`npm run test:practice` 與 `npm run test:english` 分別檢查測驗練習與英文頁。其餘測試指令見 [package.json](package.json)。

內建題庫位於 [data/](data/)，科目與單元設定見 [js/units.js](js/units.js)。題號須在同一科目的同一單元內唯一，選擇題的正確答案須對應該題選項。協作使用 Supabase，後端設定與資料庫更新請參考 [backend/README.md](backend/README.md)。伺服器密鑰須留在後端。
