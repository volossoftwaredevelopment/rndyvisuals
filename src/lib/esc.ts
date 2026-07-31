// Escape a string for safe interpolation into innerHTML / attribute values.
// Content here is owner-authored (no visitor input), so this guards against
// ordinary characters — a quote in a title, an `&` or `<` in a feature line —
// breaking the markup, rather than a cross-site trust boundary.

const MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => MAP[c])
}
