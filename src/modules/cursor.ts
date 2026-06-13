// Custom cursor (§7) — dot 1:1, ring with frame-rate-independent lerp,
// state machine via pointerover delegation. Init only under fine pointers.

import gsap from 'gsap'

type CursorState = 'default' | 'link' | 'play' | 'drag' | 'hidden'

const LERP = 0.15
const STATE_EASE = 'power3.out'
const STATE_DUR = 0.35

function resolveState(target: EventTarget | null): CursorState {
  if (!(target instanceof Element)) return 'default'
  if (target.closest('[data-cursor="play"]')) return 'play'
  if (target.closest('[data-cursor="drag"]')) return 'drag'
  if (target.closest('a, button, [data-cursor="link"]')) return 'link'
  return 'default'
}

export function initCursor(): () => void {
  const dot = document.createElement('div')
  dot.className = 'cursor-dot'
  dot.setAttribute('aria-hidden', 'true')
  const dotIn = document.createElement('div')
  dotIn.className = 'cursor-dot__in'
  dot.appendChild(dotIn)

  const ring = document.createElement('div')
  ring.className = 'cursor-ring'
  ring.setAttribute('aria-hidden', 'true')
  const ringIn = document.createElement('div')
  ringIn.className = 'cursor-ring__in'
  const label = document.createElement('span')
  label.className = 'cursor-ring__label'
  ringIn.appendChild(label)
  ring.appendChild(ringIn)

  document.body.append(dot, ring)
  document.documentElement.classList.add('has-custom-cursor')

  let tx = window.innerWidth / 2
  let ty = window.innerHeight / 2
  let rx = tx
  let ry = ty
  let started = false
  let state: CursorState = 'hidden'
  let killed = false

  gsap.set([dotIn, ringIn], { scale: 0 })

  const setState = (next: CursorState): void => {
    if (next === state) return
    state = next
    const d = { duration: STATE_DUR, ease: STATE_EASE, overwrite: 'auto' as const }
    ring.classList.toggle('is-solid', next === 'play')
    switch (next) {
      case 'default':
        gsap.to(ringIn, { scale: 1, ...d })
        gsap.to(dotIn, { scale: 1, ...d })
        gsap.to(label, { autoAlpha: 0, duration: 0.15, overwrite: 'auto' })
        break
      case 'link':
        gsap.to(ringIn, { scale: 1.6, ...d })
        gsap.to(dotIn, { scale: 0, ...d })
        gsap.to(label, { autoAlpha: 0, duration: 0.15, overwrite: 'auto' })
        break
      case 'play':
        label.textContent = 'PLAY ●'
        gsap.set(label, { scale: 1 / 2.5 }) // counter-scale so the label renders at 10px
        gsap.to(ringIn, { scale: 2.5, ...d })
        gsap.to(dotIn, { scale: 0, ...d })
        gsap.to(label, { autoAlpha: 1, duration: 0.25, overwrite: 'auto' })
        break
      case 'drag':
        label.textContent = 'DRAG'
        gsap.set(label, { scale: 1 / 1.8 })
        gsap.to(ringIn, { scale: 1.8, ...d })
        gsap.to(dotIn, { scale: 0, ...d })
        gsap.to(label, { autoAlpha: 1, duration: 0.25, overwrite: 'auto' })
        break
      case 'hidden':
        gsap.to([ringIn, dotIn], { scale: 0, duration: 0.2, ease: STATE_EASE, overwrite: 'auto' })
        gsap.to(label, { autoAlpha: 0, duration: 0.15, overwrite: 'auto' })
        break
    }
  }

  const tick = (_time: number, deltaTime: number): void => {
    // frame-rate-independent lerp per §7
    const k = 1 - Math.pow(1 - LERP, (deltaTime / 1000) * 60)
    rx += (tx - rx) * k
    ry += (ty - ry) * k
    dot.style.transform = `translate3d(${tx}px, ${ty}px, 0)`
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`
  }

  const onMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      destroy()
      return
    }
    tx = e.clientX
    ty = e.clientY
    if (!started) {
      started = true
      rx = tx
      ry = ty
      setState(resolveState(e.target))
    }
  }

  const onOver = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return
    setState(resolveState(e.target))
  }

  const onOut = (e: PointerEvent): void => {
    if (!e.relatedTarget) setState('hidden')
  }

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') destroy()
  }

  window.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('pointerover', onOver, { passive: true })
  document.addEventListener('pointerout', onOut, { passive: true })
  window.addEventListener('pointerdown', onDown, { passive: true })
  gsap.ticker.add(tick)

  function destroy(): void {
    if (killed) return
    killed = true
    gsap.ticker.remove(tick)
    window.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerover', onOver)
    document.removeEventListener('pointerout', onOut)
    window.removeEventListener('pointerdown', onDown)
    document.documentElement.classList.remove('has-custom-cursor')
    dot.remove()
    ring.remove()
  }

  return destroy
}
