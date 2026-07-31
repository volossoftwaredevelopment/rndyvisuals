// Shared bootstrap for the content pages (about / contact / privacy):
// styles, shared chrome, and the cinematic system (Lenis, cursor, reveals).

import '@fontsource-variable/archivo/standard.css'
import '@fontsource-variable/space-grotesk'
import '../styles/tokens.css'
import '../styles/base.css'
import '../styles/components.css'
import '../styles/shell.css'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import { mountShell } from '../lib/shell'
import type { PageId } from '../lib/shell'
import { initMagnetics } from '../modules/magnetic'
import { initReveals } from '../modules/reveals'

export function initPage(page: PageId): void {
  gsap.registerPlugin(ScrollTrigger)
  ScrollTrigger.config({ ignoreMobileResize: true })
  gsap.ticker.lagSmoothing(500, 33)

  mountShell(page)

  let lenis: Lenis | null = null
  const mm = gsap.matchMedia()

  mm.add(
    {
      desktop: '(min-width: 769px)',
      motionOk: '(prefers-reduced-motion: no-preference)',
      fine: '(hover: hover) and (pointer: fine)',
    },
    (mmCtx) => {
      const c = (mmCtx.conditions ?? {}) as { desktop?: boolean; motionOk?: boolean; fine?: boolean }
      const cleanups: Array<() => void> = []

      if (c.desktop && c.motionOk) {
        lenis = new Lenis({
          duration: 1.1,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          wheelMultiplier: 1.0,
          touchMultiplier: 1.5,
          syncTouch: false,
          autoRaf: false,
        })
        ;(window as unknown as { __lenis?: Lenis }).__lenis = lenis
        lenis.on('scroll', ScrollTrigger.update)
        const raf = (time: number): void => {
          lenis?.raf(time * 1000)
        }
        gsap.ticker.add(raf)
        cleanups.push(() => {
          gsap.ticker.remove(raf)
          lenis?.destroy()
          lenis = null
          delete (window as unknown as { __lenis?: Lenis }).__lenis
        })
      }

      if (c.fine && c.motionOk) {
        cleanups.push(initMagnetics())
      }

      initReveals({ reduced: !c.motionOk, mobile: !c.desktop, ctx: mmCtx })

      return () => cleanups.forEach((off) => off())
    },
  )

  void document.fonts.ready.then(() => ScrollTrigger.refresh())

  // Safety net: force-reveal any above-the-fold reveal that's still hidden after
  // a beat — guards against a throttled rAF ticker freezing the entrance tween.
  window.setTimeout(() => {
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.top >= window.innerHeight || r.bottom <= 0) return
      if (Number(getComputedStyle(el).opacity) >= 0.99) return
      gsap.set(el, { autoAlpha: 1, y: 0, clearProps: 'transform' })
      el.querySelectorAll<HTMLElement>('.line').forEach((l) =>
        gsap.set(l, { yPercent: 0, rotate: 0 }),
      )
    })
  }, 2600)
}
