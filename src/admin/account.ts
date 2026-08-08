// Admin account controls — log out, and change the admin password via the
// /api/change-password endpoint (which re-checks the current password server-side).

function $<T extends HTMLElement = HTMLElement>(sel: string): T | null {
  return document.querySelector<T>(sel)
}

function setMsg(el: HTMLElement | null, text: string, kind: 'error' | 'ok' | 'info' = 'info'): void {
  if (!el) return
  el.textContent = text
  el.hidden = text === ''
  el.classList.remove('msg--error', 'msg--ok', 'msg--info')
  if (text) el.classList.add(`msg--${kind}`)
}

export function initAccount(): void {
  const panel = $('#panel-password')
  const openBtn = $<HTMLButtonElement>('#pw-open')
  const cancelBtn = $<HTMLButtonElement>('#pw-cancel')
  const saveBtn = $<HTMLButtonElement>('#pw-save')
  const logoutBtn = $<HTMLButtonElement>('#logout')
  const current = $<HTMLInputElement>('#pw-current')
  const next = $<HTMLInputElement>('#pw-next')
  const repeat = $<HTMLInputElement>('#pw-repeat')
  const msg = $('#pw-msg')

  const close = (): void => {
    if (panel) panel.hidden = true
    ;[current, next, repeat].forEach((i) => i && (i.value = ''))
    setMsg(msg, '')
  }

  openBtn?.addEventListener('click', () => {
    if (!panel) return
    panel.hidden = !panel.hidden
    if (!panel.hidden) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
      current?.focus()
    }
  })
  cancelBtn?.addEventListener('click', close)

  logoutBtn?.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
    } catch {
      /* ignore — redirect regardless */
    }
    location.href = '/admin-login.html'
  })

  saveBtn?.addEventListener('click', async () => {
    if (!current || !next || !repeat) return
    if (next.value !== repeat.value) return setMsg(msg, 'Новые пароли не совпадают.', 'error')
    if (next.value.trim().length < 10) return setMsg(msg, 'Новый пароль — минимум 10 символов.', 'error')

    saveBtn.disabled = true
    setMsg(msg, 'Сохраняю…', 'info')
    try {
      const r = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ current: current.value, next: next.value }),
      })
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (r.ok && d.ok) {
        setMsg(msg, 'Пароль изменён. Сейчас откроется страница входа…', 'ok')
        window.setTimeout(() => (location.href = '/admin-login.html'), 1600)
        return
      }
      setMsg(msg, d.error || 'Не удалось сменить пароль.', 'error')
    } catch {
      setMsg(msg, 'Сеть недоступна. Попробуйте ещё раз.', 'error')
    }
    saveBtn.disabled = false
  })
}
