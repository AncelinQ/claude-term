/** Loose readers of parsed JSON from outside (APIs, Claude Code files): the value, or undefined when of another type. */
export const obj = (v: unknown): Record<string, any> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : undefined)
export const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
export const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
