// Shared deploy-status pill for the admin. Every panel commits to `main`, which
// triggers one Pages build; this module owns the single global status pill and
// the polling that follows a publish through to "live". Panels call afterPublish()
// right after a successful commit so the pill flips to "queued" and starts polling.

import { fetchDeployStatus } from './github'
import type { DeployStatus } from './github'

const POLL_MS = 10_000
// After a publish, GitHub may still report the PREVIOUS run as latest for a beat;
// keep showing "queued" until a run created after the publish appears (capped).
const PUBLISH_RUN_WAIT_MS = 120_000

interface DeployDeps {
  pill: HTMLElement
  refreshBtn: HTMLButtonElement
  getToken: () => string
  isValid: () => boolean
}

let deps: DeployDeps | null = null
let pollTimer = 0
let publishedAt = 0

export function initDeploy(d: DeployDeps): void {
  deps = d
  d.refreshBtn.addEventListener('click', () => void refreshDeploy())
}

function stopPolling(): void {
  if (pollTimer) {
    window.clearTimeout(pollTimer)
    pollTimer = 0
  }
}

function schedulePoll(): void {
  stopPolling()
  pollTimer = window.setTimeout(() => void refreshDeploy(), POLL_MS)
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
  if (!deps) return
  deps.refreshBtn.hidden = false
  deps.pill.hidden = false
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
  deps.pill.className = cls
  deps.pill.textContent = text
}

export async function refreshDeploy(): Promise<void> {
  if (!deps || !deps.isValid()) return
  try {
    const status = await fetchDeployStatus(deps.getToken())
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
    deps.refreshBtn.hidden = false
    deps.pill.hidden = false
    deps.pill.className = 'pill pill--failed'
    deps.pill.textContent = err instanceof Error ? err.message : 'Could not read build status.'
    stopPolling()
  }
}

/** Call right after a successful commit — flips the pill to queued and polls. */
export function afterPublish(): void {
  publishedAt = Date.now()
  renderDeploy({ state: 'queued', finishedAt: null, createdAt: null })
  schedulePoll()
}

/** Called when the token is forgotten — hide the pill and stop polling. */
export function resetDeploy(): void {
  stopPolling()
  publishedAt = 0
  if (!deps) return
  deps.pill.hidden = true
  deps.refreshBtn.hidden = true
}
