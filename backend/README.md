# 題庫協作：免費專案啟用步驟

網站仍使用 GitHub Pages。Supabase Free 負責 Auth、PostgreSQL、RLS 與建立協作者帳號的 Edge Function。
不購買網域、不使用付費方案、不設定付費寄信。Supabase 免費專案有容量與流量限制，閒置可能暫停，並不提供免費自動備份；請在變更前從儀表板匯出資料。這次不包含反爬蟲或 IP 封鎖。

## 1. 新建 Free 專案

建立專案時保留 Enable Data API，取消 Automatically expose new tables，勾選 Enable automatic RLS。
在 Authentication 設定停用 Allow new users to sign up，不開放公眾註冊。
密碼最短長度設為 12。僅管理員從受保護的 Edge Function 建立協作者帳號。
不要把 Supabase 組織管理權限交給一般題庫協作者。

## 2. 建立資料表

確認這是尚未建立協作資料表的新專案，在 SQL Editor 執行 `schema.sql` 一次。
接著依序執行 `migrations/20261017-password-reset.sql`、`migrations/20261017-collaboration-formats-units.sql` 與 `migrations/20261017-collaboration-limits.sql`。既有專案只執行尚未套用的 migration，不要重跑 schema.sql。
它會建立 members、submissions、published、audit 及單元清單，預設拒絕所有直接寫入，只開放有身分檢查的 RPC。
每張表明確啟用 RLS。匿名讀者只能讀取已核准、未撤回的公開題目與單元。
先不要把全部舊 JSON 匯入：既有題庫維持原本來源，新核准的題目額外載入，避免重複。

## 3. 建立你的管理員

在 Authentication → Users → Add user 建立你自己的 Email/密碼帳號，設為已確認（Auto Confirm）。
密碼由你自行設定，不貼到聊天或 GitHub。
在 `bootstrap-admin.sql` 副本填入你的 Email，從 SQL Editor 執行。它拒絕建立第二位管理員。
網站協作帳號與你的 Supabase 儀表板帳號是不同的身分，請使用不同密碼。

## 4. 建立協作者帳號的 Edge Function

在 Edge Functions 新建 `manage-collaborators`，貼入 `functions/manage-collaborators/index.ts`。
預設僅允許 `https://chiyyaa.github.io`。如需其他部署網址，可加入伺服器端 Secret：`COLLAB_ALLOWED_ORIGINS`（多個來源以逗號分隔），不要使用萬用字元。
讀取 Supabase 自動注入的 SUPABASE_URL、SUPABASE_PUBLISHABLE_KEYS 與 SUPABASE_SECRET_KEYS，並相容舊版 ANON_KEY／SERVICE_ROLE_KEY。不需手動複製秘密金鑰，也不可自行新增 SUPABASE_ 前綴的環境變數；該前綴由平台保留。若缺少設定，函式拒絕服務，應先確認專案設定。
此函式會自行透過 Auth `/user` 驗證 JWT，再向資料庫確認有效管理員資格。
配合目前 JWT signing keys，部署此函式時關閉 gateway 的 legacy JWT verification；不可刪除函式中的 Auth 與管理員檢查。
不需 SMTP。初始密碼由伺服器安全產生，只回傳一次給管理員，由管理員私下交付本人；協作者登入後可變更密碼。
協作者名單有「重設密碼」，先確認指定帳號，再產生新密碼；同一身分、題目與停用狀態保留，不會重建帳號或自動啟用。
密碼只顯示在當次畫面，可用「複製帳號與密碼」複製；不寫入操作紀錄、localStorage 或 sessionStorage。
重設前以管理員身分記錄意圖並核對目標必須為 contributor；Auth 更新由伺服器秘密金鑰執行，完成紀錄只能由 service_role 補寫，前端不能偽造成功。
若 Auth 明確更新成功但完成紀錄暫時失敗，仍回傳新密碼及提醒，避免因紀錄故障遺失已變更的密碼。初始紀錄保留，可由管理員核對。
帳號建立成功但授權步驟失敗時，不自動刪除帳號。由管理員在 SQL Editor 查明後，使用已登入的管理員權限呼叫 grant_question_collaborator，或從儀表板處理。

## 5. 設定網站公開連線資訊

`js/collaboration-config.js` 只填 Project URL 與 Publishable key，最後設定 `enabled: true`。
絕不可放入 secret、service_role、資料庫連線字串、管理員密碼。
接通前維持 false，原有題庫不受影響，協作頁顯示服務準備中。
更新後要同步變更 config 模組的快取版本，避免舊設定被快取。

## 6. 上線驗收

1. 匿名不能讀 submissions/members/audit，也不能呼叫寫入 RPC。
2. 協作者 A 無法讀取 B 的草稿、不能自行核准、不能修改角色。
3. A 儲存草稿、送審；匿名公開題庫不出現該題。
4. 管理員退回並填原因；A 修改後再送審。
5. 管理員核准或修改後核准；匿名題庫重新載入後可查到。
6. 撤回後匿名不再讀到該題；恢復後重現，操作歷程完整。
7. 停用協作者後，即使原登入 token 尚未到期，也無法繼續讀寫協作資料。
8. 使用舊 revision 送審或核准會報衝突，防止覆蓋別人的更新。
9. 協作者沒有新增、刪除、更新資料表的直接權限。所有修改只能透過受保護函式。
10. 驗證網頁原始碼及儲存庫未含任何 secret 或帳號密碼，再發布。

## 資料與操作

既有私人題目仍留在原 localStorage，不會自動送審或公開。協作 session 只存 sessionStorage，關閉分頁後不保留。
草稿和退回題目只有作者能編輯；待審、已發布內容鎖定。只有管理員能核准、退回、撤回與恢復。
每次變動於同一資料庫交易記錄 before/after；協作者只能查看自己題目的紀錄，管理員可查看全部。
暫時不提供硬刪除，撤回可還原。每次內容修改都有 revision，審核會鎖住該筆並在同一交易建立公開快照。
公開題庫每個單元分頁載入核准資料；連線失敗明確提示及提供重試，不把未審核資料當作備援。
此功能管理的是共同編輯權限，不會保護原先已公開的 JSON 或 GitHub 歷史版本。

## 貼上格式、錯答備註與新單元

協作表單預設「無選項新增」，也可切換「含選項新增」。貼上題目、你的答案、正確答案及得分即可；得分不儲存，user_answer 可省略且長度上限 10000。無選項使用 short_answer，不再顯示來源選項遺失的提示。
審核時保留「你的答案」段落，可由管理員修改或移除。公開頁僅在去除空白與換行後仍不同時顯示「曾有作答錯誤」，不顯示作者身分；相同作答仍保存但不加註。
「友列協助題」篩選目前單元已核准的 shared_question，同時仍包含在全部題目中。
有效協作者可透過 create_collaboration_unit 建立同科目 U2～U999；相同科目與編號只建立一次，每帳號每小時至多建立 10 個新單元。停用帳號、未授權帳號與匿名讀者不能建立。
新單元的草稿與待審題目不公開，公開頁只根據已發布題目數擴充單元選單；撤回最後一題後，下次重新載入不再出現該協作單元。內建單元保留。
匿名與協作者僅能讀單元的 subject_id、unit_id，建立者欄位不公開；新增紀錄保留供管理員查看。這份更新不需修改 Edge Function。

## 本機驗證

使用 Node.js 22.13 以上版本，從儲存庫執行 `npm install`，再執行 `npm run test:collaboration`。
使用嵌入式 PostgreSQL 驗證 RLS／RPC 真正拒絕越權，瀏覽器測試只模擬 Auth 與 HTTP，所有資料庫寫入仍通過相同 SQL 函式。
Edge Function 測試涵蓋驗證 JWT、管理員資格、伺服器金鑰隔離、部分失敗、新舊金鑰格式與未設定時拒絕服務。
完整原功能回歸用 `npm test`。所有協作測試不連線正式專案，不建立正式使用者。

## 官方參考

- https://supabase.com/pricing
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/auth/auth-smtp


## 協作題數上限

前端每批最多 100 題；後端每帳號每一小時滾動累計最多新增 300 題，包含新建草稿。修改既有草稿不新增題數。既有專案只套用 migrations/20261017-collaboration-limits.sql，不重跑 schema.sql。更新會讀取目前的函式定義，確認唯一的 30 題上限與一小時條件後只改成 300；遇到不符預期的版本就中止交易。重複套用已為 300 的設定不會更動其他規則。


管理員的「待審核」清單可勾選多題，或全選已載入的題目（每次最多 100 題）。按「預覽並批次審核」確認各題後，可批次核准發布或填寫共同原因後批次退回。原有單題編輯審核仍可使用。每題沿用後端管理員權限與版本檢查；中途失敗保留成功結果，重試只處理未成功題目。連線中斷時先查核結果。

## 指定舊題取代（2026-10-30）

在既有遷移之後執行 migrations/20261030-question-replacement.sql，再執行 migrations/20261030-question-targets.sql。這兩份遷移不取代或刪除既有題目，只新增版本與審核支援。

管理員審核時對照原題與新題，明確選擇「新增一題」或「取代指定舊題」。相近題不會自動決定；可搜尋同科目原題並選定目標。取代保留目標單元與題號，來源單元不同時以目標單元為準。每次取代都記錄原內容、新內容、管理員與時間。原題或待審內容有版本衝突時拒絕寫入。

公開頁、批次查題與測驗統一套用最新取代內容，不增加同一題號的卡片。撤回最新取代會恢復基底原題；恢復發布會重新套用最新取代。更早的取代紀錄不能撤回或恢復，以免覆蓋後續版本。已作為共用取代目標的原發布紀錄由最新取代紀錄管理，不能直接撤回底層來源。

日後經核准更新內建 data/*.json 後，執行 node backend/build-question-targets.cjs，將產生的 migrations/20261030-question-targets.sql 同步到資料庫。原題內容變動但目錄未同步時，審核會拒絕取代；已存在的取代若基底內容不符，也不會默默套用到另一個題目。禁止手動偽造基底快照或繞過版本檢查。
