// Preloader (§4.1 / §6) — counter chases document.fonts.ready, curtain wipe,
// sessionStorage short path, static fade under reduced motion (§13).

import gsap from 'gsap'

export interface PreloaderOpts {
  reduced: boolean
  /** fires at curtain start — main plays the hero intro from here */
  onReveal: () => void
  /** fires once the preloader is removed from the DOM */
  onDone: () => void
  lock: () => void
  unlock: () => void
}

const WIPE = 'inset(0% 0% 100% 0%)'

export function runPreloader({ reduced, onReveal, onDone, lock, unlock }: PreloaderOpts): void {
  const root = document.getElementById('preloader')
  if (!root) {
    onReveal()
    onDone()
    return
  }
  const panel = root.querySelector<HTMLElement>('.preloader__panel')
  const under = root.querySelector<HTMLElement>('.preloader__under')
  const counter = root.querySelector<HTMLElement>('.preloader__counter')

  lock()
  const finish = (): void => {
    root.remove()
    unlock()
    onDone()
  }
  const seen = ((): boolean => {
    try {
      return sessionStorage.getItem('seen-intro') === '1'
    } catch {
      return false
    }
  })()
  const markSeen = (): void => {
    try {
      sessionStorage.setItem('seen-intro', '1')
    } catch {
      /* private mode — full intro replays, harmless */
    }
  }

  if (reduced) {
    // §13 — static wordmark, single 0.4s opacity fade
    markSeen()
    onReveal()
    gsap.to(root, { opacity: 0, duration: 0.4, ease: 'none', delay: 0.4, onComplete: finish })
    return
  }

  if (seen) {
    // repeat visit within session — 0.6s curtain only
    onReveal()
    const tl = gsap.timeline({ onComplete: finish })
    tl.to(panel, { clipPath: WIPE, duration: 0.6, ease: 'power4.inOut' }, 0)
    tl.to(under, { clipPath: WIPE, duration: 0.6, ease: 'power4.inOut' }, 0.08)
    return
  }

  let fontsReady = false
  const fontsPromise = Promise.race([
    document.fonts.ready,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 3000) // hard cap — never hang the intro
    }),
  ]).then(() => {
    fontsReady = true
  })

  const proxy = { v: 0 }
  const tl = gsap.timeline({
    onComplete: () => {
      markSeen()
      finish()
    },
  })

  // preloader-counter — t=0, 1.2s, chases the only real payload (fonts)
  tl.to(
    proxy,
    {
      v: 100,
      duration: 1.2,
      ease: 'power2.inOut',
      snap: { v: 1 },
      onUpdate: () => {
        if (counter) counter.textContent = String(Math.round(proxy.v))
      },
    },
    0,
  )
  // counter-exit — t=0.9
  if (counter) tl.to(counter, { yPercent: 110, duration: 0.5, ease: 'power4.in' }, 0.9)
  // hold just before the curtain until fonts have landed
  tl.addPause(1.29, () => {
    if (fontsReady) tl.resume()
    else void fontsPromise.then(() => tl.resume())
  })
  // curtain-wipe — t=1.3, darker under-curtain lags 0.08s
  tl.add(() => onReveal(), 1.3)
  tl.to(panel, { clipPath: WIPE, duration: 0.9, ease: 'power4.inOut' }, 1.3)
  tl.to(under, { clipPath: WIPE, duration: 0.9, ease: 'power4.inOut' }, 1.38)
}
