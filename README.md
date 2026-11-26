# 學習題庫

演算法、作業系統與英文共用同一套靜態原始碼。正式來源只有 [Chiyyaa/algorithm-question-bank](https://github.com/Chiyyaa/algorithm-question-bank)。

正式入口為 [Cloudflare 學習題庫](https://algorithm-question-bank.winter0101.workers.dev/)，[GitHub Pages](https://chiyyaa.github.io/algorithm-question-bank/) 保留備用。使用者已於 2026-11-26 明確確認切換；兩站共用既有 Supabase。

## 功能現況

| 科目 | 測驗單元 | 測驗預選 |
| --- | --- | --- |
| 演算法 | U7、U8 | U8 |
| 作業系統 | U6、U7、U8 | U6 |

OS U2～U5 與挖寶僅退出測驗選單，題庫全部保留。搜尋、篩選、答案顯隱、HTML 批次查題／匯入、隨機測驗、協作／審核、帳密登入、日夜模式與響應式功能沿用原站。經典對決維持維護中，未重新開放，也不能把跨站實戰列為通過。

依使用者指示，考前必會、背景音樂與首頁提醒從公開輸出移除。原始碼中待人工刪除的殘留檔案見 [手動刪檔清單](docs/manual-cleanup.txt)。不批量刪檔，不清空使用者瀏覽器儲存資料。

[英文題庫](https://chiyyaa.github.io/algorithm-question-bank/english.html) 與原有語音發音保留。[大禮包](https://github.com/Chiyyaa/algorithm-question-bank/releases/tag/v2026.11.24-coursereader) 仍使用 11/24 發行的 CourseReader_Windows.zip，不複製進 Cloudflare。

## 架構

- GitHub 管理唯一原始碼；兩平台使用同一份 static-assets.json 允許清單和 dist 建置結果。
- Cloudflare Workers Static Assets 直接服務靜態檔，wrangler.jsonc 沒有 main、不啟用 run_worker_first，不建立 Worker API、D1、R2、KV 或 Durable Objects。
- GitHub Pages 保留原專案子路徑。Cloudflare 使用根網域；頁面、模組、題庫及圖片皆以相對路徑載入。
- 兩站共用原 Supabase 專案、帳號、資料庫、RLS 與 RPC。部署不執行任何 SQL 遷移，不重建帳號、不重跑 schema。
- 前端 collaboration-config.js 僅含可公開的 Supabase URL / publishable key；service_role、secret、環境檔、資料庫設定、測試截圖與原始測驗檔不得進入 dist。

## 建置與本地驗證

使用 Node.js 24（最低 22.13）。純靜態建置與檢查不需要安裝套件：

~~~sh
npm run build
npm run check:deploy
npm run preview
~~~

預覽會列出根路徑與 /algorithm-question-bank/ 兩個網址；預設停用正式 Supabase 連線。僅需人工核對正式後端時，使用 node scripts/preview.cjs --live-backend。

需要 Wrangler、瀏覽器或資料庫測試時才執行 npm ci。Wrangler 固定為 4.168.0。npm run deploy:check 只做封裝檢查；npm run test:site 檢查實際輸出頁面。瀏覽器套件若未安裝可執行 npx playwright install chromium；測試也支援 PLAYWRIGHT_CHANNEL=msedge。

每次建置先驗證輸入和已有輸出，逐檔更新允許清單中的內容，不刪目錄。若 dist 出現已不在清單內的舊檔，建置會停止，列出需要人工處理的路徑，避免舊資料跟著發布。新增公開資源必須明確加入 static-assets.json。

deployment.json 含來源 commit 與各公開檔案 SHA-256，供核對兩平台版本；本機未提交修改需搭配檔案雜湊核對，不能只看來源 commit。

## Cloudflare 免費正式部署

1. 使用者在自己的介面登入 Cloudflare，確認帳號維持 Workers Free；不接受任何付費升級。
2. 在本機執行 npx wrangler login，使用者自行完成瀏覽器授權。不要把權杖貼到聊天室或提交 Git。
3. 執行 npm run build、npm run check:deploy、npm run deploy:check。
4. 執行 npm run deploy:cloudflare，部署名稱固定為 algorithm-question-bank。以命令實際回傳的 workers.dev 網址為準，不猜測帳號子網域。
5. 把確切正式來源加入下節的 Supabase CORS；保留 Pages 來源。
6. 核對部署網址的首頁、英文、協作、migration.html、deployment.json 和題庫資源。跨站帳號與協作需人工驗收；對決仍維護，標示未驗證。

### 後續由 GitHub 更新兩平台

Pages Settings → Build and deployment → Source 已設為 GitHub Actions，由 .github/workflows/static-site.yml 發布 dist，保留原網址。請勿改回直接公開整個儲存庫。

Cloudflare Workers & Pages → algorithm-question-bank → Settings → Build，連接同一 GitHub 儲存庫，正式監聽 main；Build command 設 npm run build && npm run check:deploy，Deploy command 設 npm run deploy:cloudflare，Root directory 留空。連接與新增 GitHub App 權限由使用者確認。此設定會自動更新 Cloudflare 正式站，Pages 也由同一 main 的網站變更觸發更新。

只選一種 Cloudflare 部署途徑（Workers Builds 或人工 Wrangler），不要再疊加另一個自動部署工作。Pages 與 Cloudflare 各自建置同一 commit，README-only 變更不應觸發不必要發布；Cloudflare 可在 Build watch paths 設定與 Pages workflow 相同的前端及建置檔案範圍。

## Supabase 控制台設定與驗收

1. 保留原專案 kzgfbfarihvzuutnkpfu，URL／publishable key 維持不變。
2. Edge Function manage-collaborators 的 Secret COLLAB_ALLOWED_ORIGINS 設為 https://chiyyaa.github.io,https://algorithm-question-bank.winter0101.workers.dev。Origin 只含協定與主機，不含路徑、不含結尾斜線、不使用萬用字元。保留既有其他必要來源；不要在聊天室列出其他伺服器密鑰。
3. 此修改是伺服器端設定，不需要改前端、RLS 或資料庫。以兩個來源各自 OPTIONS 預檢，確認回傳精確的 Access-Control-Allow-Origin 與 Vary: Origin。陌生來源仍應拒絕。不要藉測試建立或重設真實使用者密碼。
4. Auth → URL Configuration：核對 Site URL 與 Redirect URLs。既有 Site URL 為 http://localhost:3000，現有帳密 token API 不使用回呼，本次保留；未來啟用郵件或 OAuth 前須改成實際正式站並核對回呼。若控制台已使用郵件回呼／OAuth，加入實際使用的正式站回呼完整路徑，保留 Pages 路徑；目前前端使用帳密 token API，沒有新增 OAuth 流程。
5. 若原本有第三方 OAuth，供應商回呼仍指向同一 Supabase 的 /auth/v1/callback；網站 redirectTo 允許清單與供應商回呼不是同一項設定。未啟用的 OAuth 不為本次部署新增。
6. 兩站分別登入同一既有測試帳號，核對角色、公開題庫、本人草稿、審核頁。任何建立草稿、送審或核准等資料寫入，先由使用者指定測試帳號與測試資料。

## 瀏覽器資料遷移

不同來源的 localStorage、sessionStorage、IndexedDB 不共享，Supabase 共用帳號也不會讓瀏覽器登入狀態自動搬移。現版未使用 IndexedDB；測驗進度在記憶體中，換頁或重新整理會重設，需先完成本輪測驗。

先把含備份工具的版本發布到舊 Pages，再開啟舊站 migration.html 匯出 JSON；在新站同頁選檔檢查，再按「匯入缺少的資料」。工具只允許既有偏好與歷史私人題目鍵，排除 session/token/房間憑證；不讀取 sessionStorage、不傳送伺服器、不覆寫同名資料、不刪舊站資料。舊版私人題目保留為歷史原始資料，不重新啟用私人題庫功能。備份可能含私人內容，勿提交 Git 或分享公開連結。

公開／已送審協作資料保留於原 Supabase；未儲存的表單內容不在備份內，需先處理完畢。日夜偏好仍依台北 06:00／18:00 到期切換，過期偏好不會強制延長。

## 免費限制與費用

2026-11-26 查核官方文件：Workers Free 每版本最多 20,000 個靜態資源、單檔 25 MiB。直接服務靜態資源的請求免費且不限量，靜態儲存無額外費用；未來若新增 Worker 程式，其免費請求額度為 100,000/day。勿啟用 run_worker_first 讓靜態請求進入程式額度。

Workers Builds Free 目前為每月 3,000 分鐘、同時 1 個建置。此案無付費資源綁定。Supabase 仍使用既有免費專案，其資料庫、Auth、流量等用量另計；不能保證任意流量永遠無限制。未來若要付費或加入服務，須另行確認。

官方資料：[Static Assets 計費](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)、[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)、[Builds 額度](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)、[Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)。

## 回復方案

- 正式站失敗時，改用 Pages 備用入口，無須變更資料庫或搬回資料。
- Cloudflare 控制台選擇先前成功版本 Rollback，或在原始碼建立 revert commit 再部署；避免改寫 Git 歷史或強推。
- Pages 已切成 Actions 後，先前成功的靜態版本可由對應 commit 重新建置發布；不要直接恢復整個儲存庫作公開目錄。
- 暫停 Cloudflare 自動建置即可停止新版本推送，保留 GitHub 單一來源。此案不刪 Worker、不刪帳號、不刪資料庫。
- 換回舊站時，原站瀏覽器資料仍在；若在新站新增了本機資料，先匯出保留。兩邊均不自動清除。

## 驗證範圍

自動檢查涵蓋公開檔案允許清單、大小／數量、JSON、來源雜湊、根路徑／專案子路徑引用、備份憑證隔離／衝突／容量不足、圖片相容與維護標示。瀏覽器檢查涵蓋公開輸出頁面與資源。

真實 Cloudflare 部署、Supabase 控制台設定、兩站登入／角色／審核、跨站多人實戰與完整下載，均須記錄實測結果；未完成時明確列為未驗證。歷史 tests/run.cjs、essentials.cjs、notice.cjs 等保留供查考，不再作為目前功能規格。

## 正式網址更名紀錄

2026-11-26 經使用者確認，帳號子網域由 morris-yu0215 改為 winter0101，Worker 由 algorithm-question-bank-test 改為 algorithm-question-bank。舊 workers.dev 網址已停止服務，不假設有自動轉址；GitHub Pages 原網址不變。更名後須各站重新登入；舊站備份工具當時回報 0 項可匯出資料，其他裝置或瀏覽器的資料不在本次檢查範圍內。更名前已保留原資料庫，沒有資料庫遷移。

Cloudflare 更名必須同步本檔、wrangler.jsonc、Workers Builds 連線及 Supabase COLLAB_ALLOWED_ORIGINS，避免下一次發布使用舊名稱。若要恢復主要入口，先使用 Pages；不要假設原帳號子網域永遠能重新取得。
