// Pointer-based drag & drop for a grid (the home-page layout map).
//
// Pointer events rather than HTML5 drag&drop so the same code works with a
// mouse and with a finger — the owner may well be arranging films on a tablet.
// A drag only starts after the pointer has actually moved, so a plain tap still
// behaves like a click.

const THRESHOLD = 6 // px before a press becomes a drag

export interface GridDndOptions {
  /** Called with the original and target index once a drop lands. */
  onMove: (from: number, to: number) => void
  /** Optional: skip items that must not be dragged (e.g. empty slots). */
  isDraggable?: (el: HTMLElement) => boolean
}

export function attachGridDnd(
  container: HTMLElement,
  itemSelector: string,
  { onMove, isDraggable }: GridDndOptions,
): () => void {
  let source: HTMLElement | null = null
  let target: HTMLElement | null = null
  let startX = 0
  let startY = 0
  let dragging = false
  let pointerId = -1

  const items = (): HTMLElement[] => Array.from(container.querySelectorAll<HTMLElement>(itemSelector))

  const clearMarks = (): void => {
    for (const el of items()) el.classList.remove('is-drop-target', 'is-dragging')
    container.classList.remove('is-dnd')
  }

  const finish = (commit: boolean): void => {
    if (commit && dragging && source && target && target !== source) {
      const all = items()
      const from = all.indexOf(source)
      const to = all.indexOf(target)
      if (from >= 0 && to >= 0) onMove(from, to)
    }
    source = null
    target = null
    dragging = false
    pointerId = -1
    clearMarks()
  }

  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const el = (e.target as HTMLElement).closest<HTMLElement>(itemSelector)
    if (!el || !container.contains(el)) return
    if (isDraggable && !isDraggable(el)) return
    source = el
    startX = e.clientX
    startY = e.clientY
    pointerId = e.pointerId
  }

  const onMoveEvt = (e: PointerEvent): void => {
    if (!source || e.pointerId !== pointerId) return

    if (!dragging) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD) return
      dragging = true
      source.classList.add('is-dragging')
      container.classList.add('is-dnd')
      // keep receiving moves even if the pointer leaves the tile
      try {
        source.setPointerCapture(pointerId)
      } catch {
        /* not fatal */
      }
    }
    e.preventDefault()

    // pointer capture makes e.target unreliable — ask the document instead
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const over = under?.closest<HTMLElement>(itemSelector) ?? null
    if (over === target) return
    target?.classList.remove('is-drop-target')
    target = over && over !== source && container.contains(over) ? over : null
    target?.classList.add('is-drop-target')
  }

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return
    finish(true)
  }
  const onCancel = (): void => finish(false)

  container.addEventListener('pointerdown', onDown)
  document.addEventListener('pointermove', onMoveEvt, { passive: false })
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onCancel)

  return () => {
    container.removeEventListener('pointerdown', onDown)
    document.removeEventListener('pointermove', onMoveEvt)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onCancel)
  }
}
