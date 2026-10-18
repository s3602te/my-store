import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { site } from './src/siteContent.ts'

// 把 index.html 裡的 __SITE_NAME__ 換成 src/siteContent.ts 的店名,這樣連預設的網頁標題都只需要改一個地方
const siteName = (): Plugin => ({
  name: 'site-name',
  transformIndexHtml: (html) => html.replaceAll('__SITE_NAME__', site.name),
})

// GitHub Pages 專案網站的網址為 https://<帳號>.github.io/my-store/,所以 base 必須是 /my-store/
export default defineConfig({
  base: '/my-store/',
  plugins: [react(), tailwindcss(), siteName()],
})
