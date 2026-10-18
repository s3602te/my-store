# my-store

線上菜單 + 點餐系統(單店、外帶、現金到店付款)。

| 部分 | 技術 | 位置 |
|---|---|---|
| 前端(顧客與後台畫面) | React + Vite + TypeScript + Tailwind CSS | `apps/web` |
| 後端 API | Node.js + TypeScript + Fastify | `apps/api` |
| 資料庫 | PostgreSQL 17(本機用 Docker 執行)+ Prisma | `apps/api/prisma`、`docker-compose.yml` |

> 目前進度:前端仍是示範版(資料存在瀏覽器);後端已有 `/health` 與 `/api/menu`,資料庫已建立並有範例資料。下單、後台登入等 API 之後的階段才會做。

## 需要先安裝

- [Node.js](https://nodejs.org/) 24 以上
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)(**要先打開,等它顯示 Engine running**)

## 第一次設定(只需做一次)

在專案資料夾執行:

```bash
npm install                 # 1. 安裝所有套件
cp .env.example .env        # 2. 建立自己的設定檔(Windows PowerShell:Copy-Item .env.example .env)
npm run db:up               # 3. 用 Docker 啟動 PostgreSQL 資料庫
npm run db:generate         # 4. 產生 Prisma 程式碼
npm run db:migrate          # 5. 建立資料表
npm run db:seed             # 6. 放入範例資料(會印出老闆帳號的密碼,只顯示一次,請記下來)
```

## 每天開發

```bash
npm run db:up               # 確認資料庫有開(已經開著也沒關係)
npm run dev                 # 同時啟動前端與後端
```

| 網址 | 說明 |
|---|---|
| http://127.0.0.1:5173/my-store/ | 前端 |
| http://127.0.0.1:3000/health | 後端健康檢查(應顯示 `"db":"up"`) |
| http://127.0.0.1:3000/api/menu | 菜單 API(從資料庫讀出來的) |

用 `Ctrl + C` 停止。

## 常用指令

| 指令 | 說明 |
|---|---|
| `npm run dev` | 同時啟動前端 + 後端 |
| `npm run dev:web` / `npm run dev:api` | 只啟動前端 / 只啟動後端 |
| `npm run build` | 建置前端 |
| `npm run typecheck` | 型別檢查 |
| `npm test` | 執行後端測試 |
| `npm run db:up` / `npm run db:stop` | 啟動 / 暫停資料庫(資料都保留) |
| `npm run db:migrate` | 套用資料表變更(改了 `schema.prisma` 之後執行) |
| `npm run db:seed` | 放入範例資料(可重複執行,不會變成兩份) |
| `npm run db:studio` | 開啟 Prisma Studio,在瀏覽器裡直接看資料庫內容 |

## 資料庫注意事項

- `docker compose down`:關閉資料庫容器,**資料仍保留**。
- `docker compose down -v`:⚠️ **連資料一起刪除**,資料庫會被清空(之後要重新 `db:migrate` + `db:seed`)。
- `.env` 只存在你的電腦,**不會上傳到 GitHub**;`.env.example` 才是範本。
- Prisma migration 檔案(`apps/api/prisma/migrations/`)**要一起上傳**,它是資料庫的變更紀錄。

## 修改網站文字

畫面上所有看得到的文字(店名、導覽列、各頁標題、按鈕、提示訊息…)都集中在 `apps/web/src/siteContent.ts`,改那一個檔案即可。
改店名只要改最上面的 `const name`,網頁標題(含 `index.html`)、頁首、頁尾都會一起更新。

## 部署

推送到 `master` 後,GitHub Actions 會自動:
- `deploy.yml`:建置前端並部署到 GitHub Pages(第一次使用要到 Settings → Pages,把 Source 設為「GitHub Actions」)。
- `ci.yml`:檢查型別、執行測試、建置。

後端與資料庫的正式主機尚未決定,目前只在本機執行。
