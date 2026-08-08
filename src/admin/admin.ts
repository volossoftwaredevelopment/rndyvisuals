// RNDY — ADMIN. Static content manager for the site's editable manifests.
// Tabbed shell: Videos (src/data/videos.json), Contacts & Home (src/data/site.json),
// Sponsors (src/data/sponsors.json). One GitHub token drives every panel; each
// commits to `main`, and the shared deploy pill follows the resulting build.
import '@fontsource-variable/archivo/standard.css'
import '@fontsource-variable/space-grotesk'
import '../styles/tokens.css'
import './admin.css'

import { SITE } from '../site.config'
import { commitFiles, fetchManifest, fetchTextFile, validateToken } from './github'
import type { CommitFile } from './github'
import { afterPublish, initDeploy, refreshDeploy, resetDeploy } from './deploy'
import { fetchOEmbedTitle, parseVideoUrl } from './oembed'
import { attachListDnd } from './dnd'
import { createContactsPanel } from './contacts'
import { createSponsorsPanel } from './sponsors'
import { createProductsPanel } from './products'
import { initAccount } from './account'
import type { AdminCtx, Panel } from './panel'
import type { SourceType, VideoEntry } from './types'

const TOKEN_KEY = 'rndy.admin.token'

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
  workspace: $('#workspace'),
  videosNote: $('#videos-note'),
  videosMsg: $('#videos-msg'),
  videosRetry: $<HTMLButtonElement>('#videos-retry'),
  rows: $<HTMLOListElement>('#rows'),
  addUrl: $<HTMLInputElement>('#add-url'),
  addBtn: $<HTMLButtonElement>('#add-btn'),
  addFile: $<HTMLButtonElement>('#add-file'),
  addFileInput: $<HTMLInputElement>('#add-file-input'),
  addBlank: $<HTMLButtonElement>('#add-blank'),
  addMsg: $('#add-msg'),
  publishBtn: $<HTMLButtonElement>('#publish-btn'),
  publishMsg: $('#publish-msg'),
  deployPill: $('#deploy-pill'),
  deployRefresh: $<HTMLButtonElement>('#deploy-refresh'),
}

const state = {
  token: '',
  tokenValid: false,
  baseline: [] as VideoEntry[], // last loaded/published manifest — diff target
  videos: [] as VideoEntry[], // working copy bound to the UI
  publishing: false,
}

const ctx: AdminCtx = {
  token: () => state.token,
  valid: () => state.tokenValid,
}

const contactsPanel = createContactsPanel(ctx)
const sponsorsPanel = createSponsorsPanel(ctx)
const productsPanel = createProductsPanel(ctx)
const extraPanels: Panel[] = [contactsPanel, sponsorsPanel, productsPanel]

/* ----------------------------- media staging ------------------------------ */
// Uploaded clips (and their auto-generated posters) are held in memory until
// Publish, then committed alongside videos.json in ONE commit.

const MEDIA_DIR = 'public/media'
const MAX_VIDEO_BYTES = 60 * 1024 * 1024
const OK_VIDEO = /^video\/(mp4|webm|quicktime)$/

interface StagedFile {
  base64: string
  /** data: URL for a poster preview (posters only) */
  dataUrl?: string
}

// keyed by repo path, e.g. "public/media/film-a1b2.mp4"
const stagedMedia = new Map<string, StagedFile>()

/** './media/x.mp4' -> 'public/media/x.mp4' */
function toRepoPath(siteUrl: string): string {
  return `${MEDIA_DIR}/${siteUrl.split('/').pop() ?? ''}`
}

// Cheap, deterministic content tag: same file -> same name (idempotent + cache
// busting), different file -> different name. Sampled so 60 MB stays instant.
function shortHash(s: string): string {
  let h = 2166136261 >>> 0
  const step = Math.max(1, Math.floor(s.length / 4096))
  for (let i = 0; i < s.length; i += step) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  h ^= s.length
  return (h >>> 0).toString(36)
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

// Keep the real container extension so GitHub Pages serves the right MIME.
function videoExt(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (fromName === 'webm') return 'webm'
  if (fromName === 'mov') return 'mov'
  if (fromName === 'mp4' || fromName === 'm4v') return 'mp4'
  if (file.type === 'video/webm') return 'webm'
  if (file.type === 'video/quicktime') return 'mov'
  return 'mp4'
}

/** Draw a frame ~a quarter in as a JPEG poster. Resolves null if it can't. */
function posterFromVideo(file: File): Promise<{ base64: string; dataUrl: string } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'auto'
    v.src = url
    let settled = false
    let timer = 0
    const done = (out: { base64: string; dataUrl: string } | null): void => {
      if (settled) return
      settled = true
      if (timer) window.clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(out)
    }
    // Watchdog: a clip that decodes but never fires 'seeked' (or never loads at
    // all) must not hang the whole staging flow — fall back to no poster.
    timer = window.setTimeout(() => done(null), 8000)
    const grab = (): void => {
      const w = v.videoWidth
      const h = v.videoHeight
      if (!w || !h) return done(null)
      const scale = Math.min(1, 1280 / w)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const g = canvas.getContext('2d')
      if (!g) return done(null)
      try {
        g.drawImage(v, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        done({ base64: dataUrl.split(',')[1] ?? '', dataUrl })
      } catch {
        done(null)
      }
    }
    v.addEventListener('error', () => done(null), { once: true })
    v.addEventListener(
      'loadeddata',
      () => {
        v.addEventListener('seeked', grab, { once: true })
        try {
          v.currentTime = Math.min(1, (v.duration || 2) * 0.25)
        } catch {
          grab()
        }
      },
      { once: true },
    )
  })
}

/**
 * Read a chosen video file, generate its poster, and stage both. Returns the
 * site-relative { url, poster } to store on the entry, or an error string.
 * Never throws — an unreadable file surfaces as an error string.
 */
async function stageVideo(file: File, seed: string): Promise<{ url: string; poster: string } | string> {
  if (file.type && !OK_VIDEO.test(file.type)) return 'Use an MP4 (H.264), WebM or MOV file.'
  if (file.size > MAX_VIDEO_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB — keep clips under 60 MB (web-encode first).`
  }
  try {
    const base = slugify(seed) || 'film'
    const ext = videoExt(file)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const b64 = bytesToBase64(bytes)
    const tag = shortHash(b64)
    stagedMedia.set(`${MEDIA_DIR}/${base}-${tag}.${ext}`, { base64: b64 })

    const poster = await posterFromVideo(file)
    let posterUrl = ''
    if (poster) {
      stagedMedia.set(`${MEDIA_DIR}/${base}-${tag}.jpg`, { base64: poster.base64, dataUrl: poster.dataUrl })
      posterUrl = `./media/${base}-${tag}.jpg`
    }
    return { url: `./media/${base}-${tag}.${ext}`, poster: posterUrl }
  } catch {
    return 'Could not read that file — try again, or choose a different one.'
  }
}

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
    .replace(/[̀-ͯ]/g, '')
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

function anyDirty(): boolean {
  return isDirty() || extraPanels.some((p) => p.isDirty())
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
      <button class="x" type="button" data-act="delete" title="Delete" aria-label="Delete">×</button>
    </div>
    <div class="row-media">
      <span class="vid-thumb"><img alt="" data-thumb hidden /></span>
      <button type="button" class="btn btn--ghost btn--sm vid-replace" data-act="replace-video-btn">Replace video</button>
      <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden data-act="replace-video" />
      <span class="vid-status" data-status aria-live="polite"></span>
      <span class="row-updown">
        <button type="button" data-act="up" title="Move up" aria-label="Move up">▲</button>
        <button type="button" data-act="down" title="Move down" aria-label="Move down">▼</button>
      </span>
    </div>
  </div>
`

function previewPoster(poster: string): string {
  if (!poster) return ''
  return stagedMedia.get(toRepoPath(poster))?.dataUrl ?? poster
}

function buildRow(video: VideoEntry, index: number, total: number): HTMLLIElement {
  const li = document.createElement('li')
  li.className = 'row'
  li.dataset.id = video.id
  li.innerHTML = ROW_HTML
  const q = <T extends HTMLElement>(sel: string): T => li.querySelector(sel) as unknown as T
  q('.row-index').textContent = String(index + 1).padStart(2, '0')
  q<HTMLInputElement>('[data-field="title"]').value = video.title
  q('[data-badge]').textContent = BADGE[video.source.type]
  const thumb = q<HTMLImageElement>('[data-thumb]')
  const src = previewPoster(video.poster)
  if (src) {
    thumb.src = src
    thumb.hidden = false
  }
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
    ui.workspace.hidden = false
    setMsg(ui.tokenMsg, 'Token works — this browser can publish changes.', 'ok')
    await loadAll()
  } catch (err) {
    state.tokenValid = false
    ui.tokenDot.classList.remove('is-valid')
    setMsg(ui.tokenMsg, errText(err), 'error')
  } finally {
    setBusy(ui.tokenSave, false)
    updatePublishUI()
  }
}

// Load every panel that has no unpublished edits — re-saving a token (e.g. after
// a 401 mid-session) must not wipe in-progress changes in any panel.
async function loadAll(): Promise<void> {
  const jobs: Promise<void>[] = []
  if (!isDirty()) jobs.push(loadVideos())
  for (const p of extraPanels) if (!p.isDirty()) jobs.push(p.load())
  await Promise.all(jobs)
  void refreshDeploy()
}

async function loadVideos(): Promise<void> {
  ui.videosRetry.hidden = true
  setMsg(ui.videosMsg, 'Loading videos…', 'info')
  try {
    const { manifest } = await fetchManifest(state.token)
    stagedMedia.clear()
    state.baseline = manifest.videos
    state.videos = structuredClone(manifest.videos)
    setMsg(ui.videosMsg, '')
    renderRows()
    updatePublishUI()
  } catch (err) {
    setMsg(ui.videosMsg, errText(err), 'error')
    ui.videosRetry.hidden = false
  }
}

function forgetToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  state.token = ''
  state.tokenValid = false
  state.baseline = []
  state.videos = []
  stagedMedia.clear()
  ui.tokenInput.value = ''
  ui.tokenDot.classList.remove('is-valid')
  ui.tokenForget.hidden = true
  ui.workspace.hidden = true
  extraPanels.forEach((p) => p.reset())
  resetDeploy()
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
    source: { type: parsed.type, id: parsed.id },
    poster: '',
    featured: false,
  })
}

// Prettify a filename into a title: "viva_la-malta.mp4" -> "Viva La Malta"
function titleFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

async function addFromFile(file: File): Promise<void> {
  const title = titleFromFilename(file.name)
  setBusy(ui.addFile, true)
  setMsg(ui.addMsg, 'Reading the video…', 'info')
  const staged = await stageVideo(file, title || 'film')
  setBusy(ui.addFile, false)
  if (typeof staged === 'string') {
    setMsg(ui.addMsg, staged, 'error')
    return
  }
  setMsg(
    ui.addMsg,
    staged.poster ? '' : 'Added — a poster frame could not be read, so the tile will be blank until it plays.',
    staged.poster ? 'info' : 'info',
  )
  appendEntry({
    id: uniqueId(title || 'new-film'),
    title,
    source: { type: 'file', url: staged.url },
    poster: staged.poster,
    featured: false,
  })
}

function addBlankPlaceholder(): void {
  setMsg(ui.addMsg, '')
  appendEntry({
    id: uniqueId('new-film'),
    title: '',
    source: { type: 'placeholder' },
    poster: '',
    featured: false,
  })
}

// Free a row's previously-staged (not-yet-published) bytes, but never the ones
// we just staged for it (guards the same-file re-pick case).
function freeStaged(url: string | undefined, poster: string, keep: Set<string>): void {
  for (const u of [url, poster]) {
    if (!u) continue
    const path = toRepoPath(u)
    if (!keep.has(path)) stagedMedia.delete(path)
  }
}

async function replaceVideo(id: string, file: File, statusEl: HTMLElement | null): Promise<void> {
  const found = state.videos.find((v) => v.id === id)
  if (!found) return
  if (statusEl) statusEl.textContent = 'Reading…'
  const staged = await stageVideo(file, found.title || found.id)
  if (typeof staged === 'string') {
    setMsg(ui.addMsg, staged, 'error')
    if (statusEl) statusEl.textContent = ''
    return
  }
  const keep = new Set([toRepoPath(staged.url), ...(staged.poster ? [toRepoPath(staged.poster)] : [])])
  freeStaged(found.source.type === 'file' ? found.source.url : undefined, found.poster, keep)
  found.source = { type: 'file', url: staged.url }
  found.poster = staged.poster
  renderRows()
  updatePublishUI()
  // renderRows() recreates the status node; set it next frame so the live region announces
  requestAnimationFrame(() => {
    const s = ui.rows.querySelector<HTMLElement>(`.row[data-id="${id}"] [data-status]`)
    if (s) s.textContent = staged.poster ? 'New clip staged' : 'New clip staged (no poster)'
  })
}

/* --------------------------------- publishing -------------------------------- */

// media repo paths referenced by a set of entries (video url + poster)
function referencedMedia(entries: VideoEntry[]): Set<string> {
  const set = new Set<string>()
  for (const v of entries) {
    if (v.source.type === 'file' && v.source.url) set.add(toRepoPath(v.source.url))
    if (v.poster) set.add(toRepoPath(v.poster))
  }
  return set
}

async function publish(): Promise<void> {
  if (state.publishing || !state.tokenValid || !isDirty()) return
  state.publishing = true
  updatePublishUI()
  setMsg(ui.publishMsg, '')
  try {
    // Snapshot at click time: edits made while the request is in flight must
    // stay dirty rather than being absorbed into the baseline unpublished.
    const videos = structuredClone(state.videos)

    // Drift guard: refuse if videos.json changed on GitHub since we loaded it,
    // so a concurrent publish (another tab/device) is not silently reverted.
    const remote = await fetchTextFile(state.token, SITE.manifestRepoPath)
    let remoteVideos: unknown = null
    try {
      remoteVideos = (JSON.parse(remote.text) as { videos?: unknown }).videos
    } catch {
      /* unparseable remote — treat as drift below */
    }
    if (JSON.stringify(remoteVideos) !== JSON.stringify(state.baseline)) {
      throw new Error('The videos changed on GitHub in another session — reload the page and re-apply your changes.')
    }

    const files: CommitFile[] = [
      {
        path: SITE.manifestRepoPath,
        content: `${JSON.stringify({ videos }, null, 2)}\n`,
        encoding: 'utf-8',
      },
    ]
    // commit only uploaded media still referenced by a surviving entry
    const referenced = referencedMedia(videos)
    const committed = new Set<string>()
    for (const [path, file] of stagedMedia) {
      if (referenced.has(path)) {
        files.push({ path, content: file.base64, encoding: 'base64' })
        committed.add(path)
      }
    }
    await commitFiles(state.token, files, 'content: update videos via admin')
    state.baseline = videos
    // Drop what we just committed and any staged media the working copy no longer
    // references — but KEEP media staged mid-publish (referenced, not yet committed).
    const live = referencedMedia(state.videos)
    for (const path of [...stagedMedia.keys()]) {
      if (committed.has(path) || !live.has(path)) stagedMedia.delete(path)
    }
    setMsg(ui.publishMsg, 'Published — the site is rebuilding now.', 'ok')
    afterPublish()
  } catch (err) {
    setMsg(ui.publishMsg, errText(err), 'error')
  } finally {
    state.publishing = false
    updatePublishUI()
  }
}

/* ------------------------------------ tabs ----------------------------------- */

function initTabs(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tab-btn]'))
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-tab-panel]'))
  // each panel publishes its own manifest — show only the active tab's button in
  // the shared publish bar.
  const publishBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-publish-for]'))
  const select = (name: string): void => {
    buttons.forEach((b) => {
      const on = b.dataset.tabBtn === name
      b.classList.toggle('is-active', on)
      b.setAttribute('aria-selected', String(on))
    })
    panels.forEach((p) => {
      p.hidden = p.dataset.tabPanel !== name
    })
    publishBtns.forEach((b) => {
      b.hidden = b.dataset.publishFor !== name
    })
  }
  buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.tabBtn as string)))
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
    if (act === 'replace-video-btn') {
      // bridge the focusable button to its sibling hidden file input (keyboard a11y)
      btn.closest('.row-media')?.querySelector<HTMLInputElement>('input[data-act="replace-video"]')?.click()
    } else if (act === 'delete') {
      const name = video.title.trim() || video.id
      if (window.confirm(`Delete “${name}”? It disappears from the site on the next publish.`)) {
        freeStaged(video.source.type === 'file' ? video.source.url : undefined, video.poster, new Set())
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
    if (input.dataset.field !== 'title') return
    const found = entryFromNode(input)
    if (!found) return
    found.video.title = input.value
    updatePublishUI()
  })

  ui.rows.addEventListener('change', (e) => {
    const input = e.target
    if (!(input instanceof HTMLInputElement)) return
    // a chosen replacement clip (file picker on the row)
    if (input.dataset.act === 'replace-video') {
      const id = input.closest<HTMLElement>('.row')?.dataset.id
      const file = input.files?.[0]
      const statusEl = input.closest<HTMLElement>('.row')?.querySelector<HTMLElement>('[data-status]') ?? null
      if (id && file) void replaceVideo(id, file, statusEl)
      input.value = '' // let the same file be re-picked later
      return
    }
    // trim the title on blur
    if (input.dataset.field !== 'title') return
    const found = entryFromNode(input)
    if (!found) return
    const trimmed = input.value.trim()
    found.video.title = trimmed
    input.value = trimmed
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
  ui.addFile.addEventListener('click', () => ui.addFileInput.click())
  ui.addFileInput.addEventListener('change', () => {
    const file = ui.addFileInput.files?.[0]
    if (file) void addFromFile(file)
    ui.addFileInput.value = '' // allow re-picking the same file
  })
  ui.addBlank.addEventListener('click', addBlankPlaceholder)

  ui.publishBtn.addEventListener('click', () => {
    void publish()
  })

  window.addEventListener('beforeunload', (e) => {
    if (!anyDirty()) return
    e.preventDefault()
    e.returnValue = ''
  })
}

function init(): void {
  ui.helpRepo.textContent = `${SITE.owner}/${SITE.repo}`
  initAccount()
  initTabs()
  initDeploy({
    pill: ui.deployPill,
    refreshBtn: ui.deployRefresh,
    getToken: () => state.token,
    isValid: () => state.tokenValid,
  })
  bindEvents()
  const saved = localStorage.getItem(TOKEN_KEY)
  if (saved) {
    ui.tokenInput.value = saved
    void validateAndLoad(saved)
  }
}

init()
