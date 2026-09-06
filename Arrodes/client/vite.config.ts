import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// 仅 Vite 开发代理读取；不会打入浏览器 bundle。
// 与后端每次启动生成的临时令牌配对，使普通浏览器也能安全验收本机开发界面。
const devAccessHeaders = process.env.ARRODES_DEV_TOKEN
  ? { 'x-arrodes-local-token': process.env.ARRODES_DEV_TOKEN }
  : {}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        headers: devAccessHeaders,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
      },
      '/v1/chat': {
        target: 'ws://localhost:3002',
        ws: true,
        headers: devAccessHeaders,
      },
    },
  },
})
