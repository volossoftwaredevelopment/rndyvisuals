// RNDY — ADMIN. Static dashboard for src/data/videos.json, spec §11.
// All state lives in this module; rows re-render on structural changes only
// (add / delete / reorder) so inline inputs never lose focus while typing.
import '@fontsource-variable/archivo/standard.css'
import '@fontsource-variable/space-grotesk'
import '../styles/tokens.css'
import './admin.css'

import { SITE } from '../site.config'
import { fetchDeployStatus, fetchManifest, publishManifest, validateToken } from './github'
import type { DeployStatus } from './github'
import { fetchOEmbedTitle, parseVideoUrl } from './oembed'
import { attachListDnd } from './dnd'
import type { Manifest, SourceType, VideoEntry } from './types'

const TOKEN_KEY = 'rndy.admin.token'
const POLL_MS = 10_000

function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const node = document.querySelector<T>(sel)
  if (!node) throw new Error(`admin: missing element ${sel}`)
  return node
}

const ui = {
  tokenDot: $('#token-dot'),
  tokenInput: $<HTMLInputElement>('#token-input'),
  tokenSave: $<HTMLButtonElement>('#token-save'),
  tokenForget: $<HTMLButtonElement>('#token-forget'),
  tokenMsg: $('#token-msg'),
  helpRepo: $('#help-repo'),
  videosPanel: $('#panel-videos'),
  videosNote: $('#videos-note'),
  videosMsg: $('#videos-msg'),
  videosRetry: $<HTMLButtonElement>('#videos-retry'),
  rows: $<HTMLOListElement>('#rows'),
  addUrl: $<HTMLInputElement>('#add-url'),
  addBtn: $<HTMLButtonElement>('#add-btn'),
  addBlank: $<HTMLButtonElement>('#add-blank'),
  addMsg: $('#add-msg'),
  publishBar: $('#publish-bar'),
  publishBtn: $<HTMLButtonElement>('#publish-btn'),
  publishMsg: $('#publish-msg'),
  deployPill: $('#deploy-pill'),
  deployRefresh: $<HTMLButtonElement>('#deploy-refresh'),
}

const state = {
  token: '',
  tokenValid: false,
  sha: '',
  baseline: [] as VideoEntry[], // last loaded/published manifest — diff target
  videos: [] as VideoEntry[], // working copy bound to the UI
  publishing: false,
}

let pollTimer = 0
// Timestamp of the last successful publish — lets the deploy poll ignore the
// PREVIOUS run when GitHub hasn't registered the new push-triggered run yet.
let publishedAt = 0
const PUBLISH_RUN_WAIT_MS = 120_000

/* ---------------------------------- utils ---------------------------------- */

type MsgKind = 'error' | 'ok' | 'info'

function setMsg(el: HTMLElement, text: string, kind: MsgKind = 'info'): void {
  el.textContent = text
  el.hidden = text === ''
  el.classList.remove('msg--error', 'msg--ok', 'msg--info')
  if (text) el.classList.add(`msg--${kind}`)
}

function errText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong — try again.'
}

function setBusy(btn: HTMLButtonElement, busy: boolean): void {
  btn.disabled = busy
  btn.classList.toggle('is-busy', busy)
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function uniqueId(seed: string): string {
  const base = slugify(seed) || 'video'
  const taken = new Set(state.videos.map((v) => v.id))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

/* ------------------------------- dirty diffing ------------------------------ */

function countChanges(): number {
  const baseById = new Map(state.baseline.map((v) => [v.id, v]))
  const curById = new Map(state.videos.map((v) => [v.id, v]))
  let count = 0
  for (const video of state.videos) {
    const base = baseById.get(video.id)
    if (!base) count += 1
    else if (JSON.stringify(base) !== JSON.stringify(video)) count += 1
  }
  for (const video of state.baseline) {
    if (!curById.has(video.id)) count += 1
  }
  // Reorder of surviving entries counts as one pending change.
  const baseOrder = state.baseline.filter((v) => curById.has(v.id)).map((v) => v.id).join('\n')
  const curOrder = state.videos.filter((v) => baseById.has(v.id)).map((v) => v.id).join('\n')
  if (baseOrder !== curOrder) count += 1
  return count
}

function isDirty(): boolean {
  return countChanges() > 0
}

function updatePublishUI(): void {
  const changes = countChanges()
  ui.publishBtn.textContent = state.publishing
    ? 'Publishing…'
    : changes > 0
      ? `Publish ${changes} change${changes === 1 ? '' : 's'}`
      : 'Publish'
  ui.publishBtn.disabled = state.publishing || changes === 0 || !state.tokenValid
  ui.videosNote.textContent = changes > 0 ? 'Unpublished changes' : 'All changes published'
  ui.videosNote.classList.toggle('is-dirty', changes > 0)
}

/* --------------------------------- row list --------------------------------- */

const BADGE: Record<SourceType, string> = {
  youtube: 'YT',
  vimeo: 'VIMEO',
  file: 'FILE',
  placeholder: 'PLACEHOLDER',
}

const ROW_HTML = `
  <button class="grip" type="button" data-grip tabindex="-1" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</button>
  <span class="row-index" aria-hidden="true"></span>
  <div class="row-body">
    <div class="row-top">
      <input class="f-title" data-field="title" placeholder="Title" spellcheck="false" aria-label="Title" />
      <span class="badge" data-badge></span>
      <button class="star" type="button" data-act="featured">★</button>
      <button class="x" type="button" data-act="delete" title="Delete" aria-label="Delete">×</button>
    </div>
    <div class="row-meta">
      <input class="f-client" data-field="client" placeholder="Client" spellcheck="false" aria-label="Client" />
      <input class="f-category" data-field="category" placeholder="Category" spellcheck="false" aria-label="Category" />
      <input class="f-duration" data-field="duration" placeholder="0:00" spellcheck="false" aria-label="Duration" />
      <input class="f-year" data-field="year" inputmode="numeric" placeholder="2026" aria-label="Year" />
      <span class="row-updown">
        <button type="button" data-act="up" title="Move up" aria-label="Move up">▲</button>
        <button type="button" data-act="down" title="Move down" aria-label="Move down">▼</button>
      </span>
    </div>
  </div>
`

function buildRow(video: VideoEntry, index: number, total: number): HTMLLIElement {
  const li = document.createElement('li')
  li.className = 'row'
  li.dataset.id = video.id
  li.innerHTML = ROW_HTML
  const q = <T extends HTMLElement>(sel: string): T => li.querySelector(sel) as unknown as T
  q('.row-index').textContent = String(index + 1).padStart(2, '0')
  q<HTMLInputElement>('[data-field="title"]').value = video.title
  q<HTMLInputElement>('[data-field="client"]').value = video.client
  q<HTMLInputElement>('[data-field="category"]').value = video.category
  q<HTMLInputElement>('[data-field="duration"]').value = video.duration
  q<HTMLInputElement>('[data-field="year"]').value = String(video.year)
  q('[data-badge]').textContent = BADGE[video.source.type]
  const star = q<HTMLButtonElement>('[data-act="featured"]')
  star.classList.toggle('is-on', video.featured)
  star.setAttribute('aria-pressed', String(video.featured))
  star.title = video.featured ? 'In the showreel — click to remove' : 'Click to feature in the showreel'
  q<HTMLButtonElement>('[data-act="up"]').disabled = index === 0
  q<HTMLButtonElement>('[data-act="down"]').disabled = index === total - 1
  return li
}

function renderRows(): void {
  ui.rows.textContent = ''
  if (state.videos.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'rows-empty'
    empty.textContent = 'No videos yet — add one below.'
    ui.rows.append(empty)
    return
  }
  state.videos.forEach((video, i) => {
    ui.rows.append(buildRow(video, i, state.videos.length))
  })
}

function entryFromNode(node: HTMLElement): { video: VideoEntry; index: number } | null {
  const id = node.closest<HTMLElement>('.row')?.dataset.id
  if (!id) return null
  const index = state.videos.findIndex((v) => v.id === id)
  return index < 0 ? null : { video: state.videos[index], index }
}

function moveVideo(from: number, to: number): void {
  const item = state.videos.splice(from, 1)[0]
  state.videos.splice(to, 0, item)
  renderRows()
  updatePublishUI()
}

// renderRows() rebuilds the list, dropping focus to <body>; put keyboard users
// back on the arrow they pressed (or its twin when parked at a list bound).
function refocusArrow(id: string, act: 'up' | 'down'): void {
  const row = ui.rows.querySelector<HTMLElement>(`.row[data-id="${id}"]`)
  if (!row) return
  const pressed = row.querySelector<HTMLButtonElement>(`[data-act="${act}"]`)
  const opposite = row.querySelector<HTMLButtonElement>(`[data-act="${act === 'up' ? 'down' : 'up'}"]`)
  ;(pressed && !pressed.disabled ? pressed : opposite)?.focus()
}

function focusRowTitle(id: string): void {
  const row = ui.rows.querySelector<HTMLElement>(`.row[data-id="${id}"]`)
  row?.scrollIntoView({ block: 'center' })
  const input = row?.querySelector<HTMLInputElement>('[data-field="title"]')
  input?.focus()
  input?.select()
}

/* ----------------------------- token + loading ------------------------------ */

async function validateAndLoad(token: string): Promise<void> {
  setBusy(ui.tokenSave, true)
  setMsg(ui.tokenMsg, 'Checking token…', 'info')
  try {
    await validateToken(token)
    state.token = token
    state.tokenValid = true
    localStorage.setItem(TOKEN_KEY, token)
    ui.tokenDot.classList.add('is-valid')
    ui.tokenForget.hidden = false
    setMsg(ui.tokenMsg, 'Token works — this browser can publish changes.', 'ok')
    if (isDirty()) {
      // Re-saving a token (e.g. after a 401 mid-session) must not wipe
      // unpublished edits. A stale sha is handled by the 409 path in publish.
      void refreshDeploy()
    } else {
      await loadVideos()
    }
  } catch (err) {
    state.tokenValid = false
    ui.tokenDot.classList.remove('is-valid')
    setMsg(ui.tokenMsg, errText(err), 'error')
  } finally {
    setBusy(ui.tokenSave, false)
    updatePublishUI()
  }
}

async function loadVideos(): Promise<void> {
  ui.videosPanel.hidden = false
  ui.publishBar.hidden = false
  ui.videosRetry.hidden = true
  setMsg(ui.videosMsg, 'Loading videos…', 'info')
  try {
    const { manifest, sha } = await fetchManifest(state.token)
    state.sha = sha
    state.baseline = manifest.videos
    state.videos = structuredClone(manifest.videos)
    setMsg(ui.videosMsg, '')
    renderRows()
    updatePublishUI()
    void refreshDeploy()
  } catch (err) {
    setMsg(ui.videosMsg, errText(err), 'error')
    ui.videosRetry.hidden = false
  }
}

function forgetToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  state.token = ''
  state.tokenValid = false
  state.sha = ''
  state.baseline = []
  state.videos = []
  stopPolling()
  ui.tokenInput.value = ''
  ui.tokenDot.classList.remove('is-valid')
  ui.tokenForget.hidden = true
  ui.videosPanel.hidden = true
  ui.publishBar.hidden = true
  setMsg(ui.tokenMsg, 'Token removed from this browser.', 'info')
}

/* ---------------------------------- adding ---------------------------------- */

function appendEntry(entry: VideoEntry): void {
  state.videos.push(entry)
  renderRows()
  updatePublishUI()
  focusRowTitle(entry.id)
}

async function addFromUrl(): Promise<void> {
  if (ui.addBtn.disabled) return // oEmbed fetch in flight — Enter must not double-add
  const raw = ui.addUrl.value.trim()
  if (!raw) {
    setMsg(ui.addMsg, 'Paste a video link first.', 'error')
    return
  }
  const parsed = parseVideoUrl(raw)
  if (!parsed) {
    setMsg(ui.addMsg, 'That does not look like a YouTube or Vimeo video link.', 'error')
    return
  }
  setBusy(ui.addBtn, true)
  setMsg(ui.addMsg, 'Reading the video title…', 'info')
  const title = await fetchOEmbedTitle(parsed)
  setBusy(ui.addBtn, false)
  setMsg(ui.addMsg, title ? '' : 'Could not read the title automatically — type it in below.', 'info')
  ui.addUrl.value = ''
  appendEntry({
    id: uniqueId(title || `${parsed.type}-${parsed.id}`),
    title,
    client: '',
    category: '',
    year: new Date().getFullYear(),
    duration: '',
    source: { type: parsed.type, id: parsed.id },
    poster: '',
    featured: false,
  })
}

function addBlankPlaceholder(): void {
  setMsg(ui.addMsg, '')
  appendEntry({
    id: uniqueId('new-film'),
    title: '',
    client: '',
    category: '',
    year: new Date().getFullYear(),
    duration: '',
    source: { type: 'placeholder' },
    poster: '',
    featured: false,
  })
}

/* --------------------------------- publishing -------------------------------- */

async function publish(): Promise<void> {
  if (state.publishing || !state.tokenValid || !isDirty()) return
  state.publishing = true
  updatePublishUI()
  setMsg(ui.publishMsg, '')
  try {
    // Snapshot at click time: edits made while the request is in flight must
    // stay dirty rather than being absorbed into the baseline unpublished.
    const manifest: Manifest = { videos: structuredClone(state.videos) }
    state.sha = await publishManifest(state.token, manifest, state.sha, { videos: state.baseline })
    state.baseline = manifest.videos
    publishedAt = Date.now()
    setMsg(ui.publishMsg, 'Published — the site is rebuilding now.', 'ok')
    renderDeploy({ state: 'queued', finishedAt: null, createdAt: null })
    schedulePoll()
  } catch (err) {
    setMsg(ui.publishMsg, errText(err), 'error')
  } finally {
    state.publishing = false
    updatePublishUI()
  }
}

/* -------------------------------- deploy status ------------------------------ */

function stopPolling(): void {
  if (pollTimer) {
    window.clearTimeout(pollTimer)
    pollTimer = 0
  }
}

function schedulePoll(): void {
  stopPolling()
  pollTimer = window.setTimeout(() => {
    void refreshDeploy()
  }, POLL_MS)
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function renderDeploy(status: DeployStatus): void {
  ui.deployRefresh.hidden = false
  ui.deployPill.hidden = false
  let cls = 'pill'
  let text: string
  switch (status.state) {
    case 'none':
      text = 'No site builds yet'
      break
    case 'queued':
      text = 'Build queued…'
      cls += ' pill--busy'
      break
    case 'building':
      text = 'Building the site…'
      cls += ' pill--busy'
      break
    case 'live':
      text = `Live — updated ${formatTime(status.finishedAt)}`
      cls += ' pill--live'
      break
    case 'failed':
      text = 'Build failed — check GitHub Actions'
      cls += ' pill--failed'
      break
  }
  ui.deployPill.className = cls
  ui.deployPill.textContent = text
}

async function refreshDeploy(): Promise<void> {
  if (!state.tokenValid) return
  try {
    const status = await fetchDeployStatus(state.token)
    // Right after a publish the API may still report the previous run as the
    // latest — keep showing "queued" and polling until a run created after the
    // publish appears (capped, in case no run ever starts).
    const staleRun =
      publishedAt !== 0 &&
      (status.createdAt === null || new Date(status.createdAt).getTime() < publishedAt)
    if (staleRun && Date.now() - publishedAt < PUBLISH_RUN_WAIT_MS) {
      renderDeploy({ state: 'queued', finishedAt: null, createdAt: null })
      schedulePoll()
      return
    }
    renderDeploy(status)
    if (status.state === 'queued' || status.state === 'building') schedulePoll()
    else stopPolling()
  } catch (err) {
    ui.deployRefresh.hidden = false
    ui.deployPill.hidden = false
    ui.deployPill.className = 'pill pill--failed'
    ui.deployPill.textContent = errText(err)
    stopPolling()
  }
}

/* ----------------------------------- wiring ---------------------------------- */

function bindEvents(): void {
  ui.tokenSave.addEventListener('click', () => {
    const token = ui.tokenInput.value.trim()
    if (!token) {
      setMsg(ui.tokenMsg, 'Paste a token first.', 'error')
      return
    }
    void validateAndLoad(token)
  })
  ui.tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ui.tokenSave.click()
    }
  })
  ui.tokenForget.addEventListener('click', forgetToken)
  ui.videosRetry.addEventListener('click', () => {
    void loadVideos()
  })

  ui.rows.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]')
    if (!btn) return
    const found = entryFromNode(btn)
    if (!found) return
    const { video, index } = found
    const act = btn.dataset.act
    if (act === 'featured') {
      video.featured = !video.featured
      btn.classList.toggle('is-on', video.featured)
      btn.setAttribute('aria-pressed', String(video.featured))
      btn.title = video.featured ? 'In the showreel — click to remove' : 'Click to feature in the showreel'
      updatePublishUI()
    } else if (act === 'delete') {
      const name = video.title.trim() || video.id
      if (window.confirm(`Delete “${name}”? It disappears from the site on the next publish.`)) {
        state.videos.splice(index, 1)
        renderRows()
        updatePublishUI()
      }
    } else if (act === 'up' && index > 0) {
      moveVideo(index, index - 1)
      refocusArrow(video.id, 'up')
    } else if (act === 'down' && index < state.videos.length - 1) {
      moveVideo(index, index + 1)
      refocusArrow(video.id, 'down')
    }
  })

  ui.rows.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement
    const field = input.dataset.field
    if (!field) return
    const found = entryFromNode(input)
    if (!found) return
    const { video } = found
    if (field === 'title') video.title = input.value
    else if (field === 'client') video.client = input.value
    else if (field === 'category') video.category = input.value
    else if (field === 'duration') video.duration = input.value
    else if (field === 'year') {
      const n = Number.parseInt(input.value, 10)
      if (Number.isFinite(n)) video.year = n
    }
    updatePublishUI()
  })

  // Normalize on blur: trim text fields, snap year back to the stored number,
  // softly mark a duration that is not m:ss.
  ui.rows.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement
    const field = input.dataset.field
    if (!field) return
    const found = entryFromNode(input)
    if (!found) return
    const { video } = found
    const trimmed = input.value.trim()
    if (field === 'title') {
      video.title = trimmed
      input.value = trimmed
    } else if (field === 'client') {
      video.client = trimmed
      input.value = trimmed
    } else if (field === 'category') {
      video.category = trimmed
      input.value = trimmed
    } else if (field === 'duration') {
      video.duration = trimmed
      input.value = trimmed
      input.classList.toggle('is-invalid', trimmed !== '' && !/^\d{1,3}:\d{2}$/.test(trimmed))
    } else if (field === 'year') {
      input.value = String(video.year)
    }
    updatePublishUI()
  })

  attachListDnd(ui.rows, '.row', moveVideo)

  ui.addBtn.addEventListener('click', () => {
    void addFromUrl()
  })
  ui.addUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void addFromUrl()
    }
  })
  ui.addBlank.addEventListener('click', addBlankPlaceholder)

  ui.publishBtn.addEventListener('click', () => {
    void publish()
  })
  ui.deployRefresh.addEventListener('click', () => {
    void refreshDeploy()
  })

  window.addEventListener('beforeunload', (e) => {
    if (!isDirty()) return
    e.preventDefault()
    e.returnValue = ''
  })
}

function init(): void {
  ui.helpRepo.textContent = `${SITE.owner}/${SITE.repo}`
  bindEvents()
  const saved = localStorage.getItem(TOKEN_KEY)
  if (saved) {
    ui.tokenInput.value = saved
    void validateAndLoad(saved)
  }
}

init()
