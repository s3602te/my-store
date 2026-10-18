import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages 專案網站的網址為 https://<帳號>.github.io/my-store/,所以 base 必須是 /my-store/
export default defineConfig({
  base: '/my-store/',
  plugins: [react(), tailwindcss()],
})
