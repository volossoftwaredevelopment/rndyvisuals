import { defineConfig } from 'vite'
import type { HtmlTagDescriptor, Plugin } from 'vite'
import { fileURLToPath } from 'node:url'

// Критичные latin-сабсеты шрифтов (§3): прелоадер держит занавес до
// document.fonts.ready, а без прелоада браузер узнаёт про woff2 только после
// загрузки и парсинга CSS — на круг сетевого пути позже. Инжектим
// <link rel="preload"> на хешированные файлы прямо в HTML при сборке.
// Имена должны точно соответствовать latin-файлам fontsource-variable
// (latin-ext/vietnamese гейтятся unicode-range и не качаются — их не трогаем).
const CRITICAL_FONTS = [
  'archivo-latin-standard-normal',
  'space-grotesk-latin-wght-normal',
]

function preloadCriticalFonts(): Plugin {
  return {
    name: 'preload-critical-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        // ctx.bundle есть только на билде; в dev прелоады не нужны.
        if (!ctx.bundle) return
        const tags: HtmlTagDescriptor[] = []
        for (const fileName of Object.keys(ctx.bundle)) {
          if (!fileName.endsWith('.woff2')) continue
          if (!CRITICAL_FONTS.some((name) => fileName.includes(name))) continue
          tags.push({
            tag: 'link',
            attrs: {
              rel: 'preload',
              href: `./${fileName}`,
              as: 'font',
              type: 'font/woff2',
              crossorigin: true,
            },
            injectTo: 'head',
          })
        }
        return tags
      },
    },
  }
}

// base './' — сайт работает и на volossoftwaredevelopment.github.io/rndyvisuals/, и на кастомном
// домене без пересборки конфига (миграция = добавить CNAME + настройка Pages).
export default defineConfig({
  base: './',
  plugins: [preloadCriticalFonts()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
})
