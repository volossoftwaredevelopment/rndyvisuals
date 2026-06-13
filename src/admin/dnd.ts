// HTML5 drag & drop reorder for a vertical list, gated on a [data-grip] handle
// so text selection inside row inputs keeps working. Touch/keyboard fallback
// (the ▲▼ buttons) lives in admin.ts.

export function attachListDnd(
  list: HTMLElement,
  rowSelector: string,
  onMove: (from: number, to: number) => void,
): void {
  let from = -1

  const rows = (): HTMLElement[] => Array.from(list.querySelectorAll<HTMLElement>(rowSelector))

  const clearMarks = (): void => {
    for (const row of rows()) row.classList.remove('drop-before', 'drop-after', 'is-dragging')
  }

  const disarm = (): void => {
    for (const row of rows()) row.draggable = false
  }

  // Arm dragging only when the pointer goes down on the grip.
  list.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement
    const row = target.closest<HTMLElement>(rowSelector)
    if (row && target.closest('[data-grip]')) row.draggable = true
  })
  list.addEventListener('pointerup', disarm)
  list.addEventListener('pointercancel', disarm)

  list.addEventListener('dragstart', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(rowSelector)
    if (!row || !row.draggable) return
    from = rows().indexOf(row)
    row.classList.add('is-dragging')
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(from))
    }
  })

  const dropTarget = (e: DragEvent): { over: HTMLElement | null; after: boolean } => {
    const over = (e.target as HTMLElement).closest<HTMLElement>(rowSelector)
    if (!over) return { over: null, after: true }
    const rect = over.getBoundingClientRect()
    return { over, after: e.clientY > rect.top + rect.height / 2 }
  }

  list.addEventListener('dragover', (e) => {
    if (from < 0) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    const all = rows()
    for (const row of all) row.classList.remove('drop-before', 'drop-after')
    const { over, after } = dropTarget(e)
    if (over) {
      over.classList.add(after ? 'drop-after' : 'drop-before')
    } else {
      all[all.length - 1]?.classList.add('drop-after')
    }
  })

  list.addEventListener('drop', (e) => {
    if (from < 0) return
    e.preventDefault()
    const all = rows()
    const { over, after } = dropTarget(e)
    let to = over ? all.indexOf(over) + (after ? 1 : 0) : all.length
    if (from < to) to -= 1
    const moved = from
    from = -1
    clearMarks()
    disarm()
    if (to !== moved && to >= 0) onMove(moved, to)
  })

  list.addEventListener('dragend', () => {
    from = -1
    clearMarks()
    disarm()
  })
}
