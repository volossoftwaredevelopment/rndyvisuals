// Shared services the admin shell hands to each content panel.

export interface AdminCtx {
  /** True once the panel may write (the session is already verified server-side). */
  valid(): boolean
}

export interface Panel {
  /** Load this panel's manifest from the repo and render it. */
  load(): Promise<void>
  /** Clear state + UI when the token is forgotten. */
  reset(): void
  /** True when the panel has unpublished edits (guards page unload). */
  isDirty(): boolean
}
