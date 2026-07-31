// Shared services the admin shell hands to each content panel.

export interface AdminCtx {
  /** The current GitHub token (empty until a valid one is saved). */
  token(): string
  /** Whether the saved token has been validated for write access. */
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
