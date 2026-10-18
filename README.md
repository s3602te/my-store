# my-store

商品販售網站(React + Vite + TypeScript + Tailwind CSS)

- 前台:首頁、產品、商品詳情、關於我們、聯絡我們、會員登入/註冊、會員中心、購物車
- 後台:`/#/admin`(商品與會員管理)
- 資料暫存在瀏覽器的 localStorage(示範用,尚無後端)

## 開發

```bash
npm install
npm run dev      # 開發伺服器
npm run build    # 型別檢查 + 建置到 dist/
npm run preview  # 預覽建置結果
```

## 部署

推送到 `master` 後,GitHub Actions(`.github/workflows/deploy.yml`)會自動建置並部署到 GitHub Pages。
第一次使用需要到 Settings → Pages,把 Source 設為「GitHub Actions」。
