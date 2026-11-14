import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import netlify from '@netlify/vite-plugin-tanstack-start'

// The whole game runs in the browser, so we build a static SPA: dist/client/index.html + assets.
// That deploys anywhere (Vercel, Netlify, any static host). The Netlify adapter is only added
// when building on Netlify.
const onNetlify = !!process.env.NETLIFY

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    ...(onNetlify ? [netlify()] : []),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: { outputPath: '/index.html' },
      },
    }),
    viteReact(),
  ],
})

export default config
