// GitHub REST API client for the static admin page.
// Everything runs in the browser with a fine-grained PAT supplied by the user;
// a commit to `main` triggers the Pages rebuild via Actions.
import { SITE } from '../site.config'
import type { Manifest } from './types'

const API = 'https://api.github.com'
const REPO = `${SITE.owner}/${SITE.repo}`

export class GitHubError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function friendlyStatus(res: Response): string {
  if (res.status === 401) return 'Token is invalid or expired — create a new one and save it again.'
  if (res.status === 403) {
    if (res.headers.get('x-ratelimit-remaining') === '0') {
      return 'GitHub is rate-limiting this browser — wait a few minutes and try again.'
    }
    return 'Access denied — the token needs “Contents: Read and write” plus “Actions: Read-only” on this repository.'
  }
  if (res.status === 404) return 'Repository or file not found — check the token can see this repository.'
  if (res.status === 409) return 'The file changed on GitHub while you were editing.'
  return `GitHub returned an unexpected error (${res.status}) — try again.`
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
  } catch {
    throw new GitHubError(0, 'Network error — check your connection and try again.')
  }
  if (!res.ok) throw new GitHubError(res.status, friendlyStatus(res))
  return (await res.json()) as T
}

// btoa/atob are latin1-only — round-trip through UTF-8 bytes for titles like “Αιγαίο”.
function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

interface RepoInfo {
  permissions?: { push?: boolean }
}

/* ------------------------------------------------------------------ generic
 * File-level helpers used by the Contacts and Sponsors panels. `fetchTextFile`
 * + `putTextFile` handle a single JSON manifest (Contacts). `commitFiles` bundles
 * a manifest plus any number of binary assets (logos) into ONE commit — so a
 * sponsor edit triggers a single Pages build, not one per uploaded file.       */

export interface RepoFile {
  text: string
  sha: string
}

/** Read a UTF-8 text file from the repo. Throws GitHubError(404) if missing. */
export async function fetchTextFile(token: string, path: string): Promise<RepoFile> {
  const data = await api<ContentsResponse>(token, `/repos/${REPO}/contents/${path}?ref=${SITE.branch}`)
  return { text: decodeBase64Utf8(data.content), sha: data.sha }
}

/** Commit UTF-8 text (create when sha is '', update in place otherwise). */
export async function putTextFile(
  token: string,
  path: string,
  text: string,
  sha: string,
  message: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    message,
    content: encodeBase64Utf8(text),
    branch: SITE.branch,
  }
  if (sha) body.sha = sha
  const res = await api<PutContentsResponse>(token, `/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  return res.content.sha
}

export interface CommitFile {
  path: string
  /** UTF-8 text or base64 bytes, matching `encoding`. */
  content: string
  encoding: 'utf-8' | 'base64'
}

interface RefResponse {
  object: { sha: string }
}
interface CommitResponse {
  sha: string
  tree: { sha: string }
}
interface ShaResponse {
  sha: string
}

/**
 * Commit several files (a manifest + uploaded assets) in a single commit via the
 * Git Data API, then fast-forward `main`. One commit → one Pages build. Fails
 * cleanly if the branch moved underneath us (the ref update is not forced).
 */
export async function commitFiles(token: string, files: CommitFile[], message: string): Promise<void> {
  const ref = await api<RefResponse>(token, `/repos/${REPO}/git/ref/heads/${SITE.branch}`)
  const headSha = ref.object.sha
  const headCommit = await api<CommitResponse>(token, `/repos/${REPO}/git/commits/${headSha}`)

  const blobs = await Promise.all(
    files.map((f) =>
      api<ShaResponse>(token, `/repos/${REPO}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: f.content, encoding: f.encoding }),
      }),
    ),
  )
  const tree = await api<ShaResponse>(token, `/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: headCommit.tree.sha,
      tree: files.map((f, i) => ({ path: f.path, mode: '100644', type: 'blob', sha: blobs[i].sha })),
    }),
  })
  const commit = await api<ShaResponse>(token, `/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }),
  })
  await api<unknown>(token, `/repos/${REPO}/git/refs/heads/${SITE.branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  })
}

/** Throws a GitHubError with a human message when the token can't read or write the repo. */
export async function validateToken(token: string): Promise<void> {
  const repo = await api<RepoInfo>(token, `/repos/${REPO}`)
  if (!repo.permissions?.push) {
    throw new GitHubError(403, 'This token can read but not write — set “Contents” to “Read and write”.')
  }
}

export interface LoadedManifest {
  manifest: Manifest
  sha: string
}

interface ContentsResponse {
  content: string
  sha: string
}

export async function fetchManifest(token: string): Promise<LoadedManifest> {
  const data = await api<ContentsResponse>(
    token,
    `/repos/${REPO}/contents/${SITE.manifestRepoPath}?ref=${SITE.branch}`,
  )
  let manifest: Manifest
  try {
    manifest = JSON.parse(decodeBase64Utf8(data.content)) as Manifest
  } catch {
    throw new GitHubError(0, 'videos.json in the repository is not valid JSON — fix it on GitHub first.')
  }
  if (!Array.isArray(manifest.videos)) {
    throw new GitHubError(0, 'videos.json has an unexpected shape — missing the "videos" list.')
  }
  return { manifest, sha: data.sha }
}

interface PutContentsResponse {
  content: { sha: string }
}

/**
 * Commits the manifest. On a 409 (sha drift) the remote file is refetched and
 * the PUT retried only when the remote content still matches `baseline` — i.e.
 * the drift came from a branch race, not a real edit. A genuine remote change
 * surfaces as a conflict error instead of silent last-write-wins.
 */
export async function publishManifest(
  token: string,
  manifest: Manifest,
  sha: string,
  baseline: Manifest,
): Promise<string> {
  const content = encodeBase64Utf8(`${JSON.stringify(manifest, null, 2)}\n`)
  const put = (currentSha: string): Promise<PutContentsResponse> =>
    api<PutContentsResponse>(token, `/repos/${REPO}/contents/${SITE.manifestRepoPath}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'content: update videos via admin',
        content,
        sha: currentSha,
        branch: SITE.branch,
      }),
    })
  try {
    return (await put(sha)).content.sha
  } catch (err) {
    if (err instanceof GitHubError && err.status === 409) {
      const fresh = await fetchManifest(token)
      if (JSON.stringify(fresh.manifest) === JSON.stringify(baseline)) {
        return (await put(fresh.sha)).content.sha
      }
      throw new GitHubError(
        409,
        'The videos changed on GitHub while you were editing — reload the page and re-apply your changes.',
      )
    }
    throw err
  }
}

export type DeployState = 'none' | 'queued' | 'building' | 'live' | 'failed'

export interface DeployStatus {
  state: DeployState
  finishedAt: string | null
  /** When the reported run started — lets callers ignore runs older than their publish. */
  createdAt: string | null
}

interface RunsResponse {
  workflow_runs: Array<{
    status: string
    conclusion: string | null
    updated_at: string
    created_at: string
  }>
}

export async function fetchDeployStatus(token: string): Promise<DeployStatus> {
  const data = await api<RunsResponse>(
    token,
    `/repos/${REPO}/actions/runs?per_page=1&branch=${SITE.branch}`,
  )
  const run = data.workflow_runs[0]
  if (!run) return { state: 'none', finishedAt: null, createdAt: null }
  if (run.status === 'completed') {
    return {
      state: run.conclusion === 'success' ? 'live' : 'failed',
      finishedAt: run.updated_at,
      createdAt: run.created_at,
    }
  }
  return {
    state: run.status === 'in_progress' ? 'building' : 'queued',
    finishedAt: null,
    createdAt: run.created_at,
  }
}
