/** Global Claude information from public sources (pure, tested): Anthropic's status page, the latest Claude Code. */
import { compareVersions } from './plugin-registry'

export const STATUS_URL = 'https://status.claude.com/api/v2/summary.json'
export const STATUS_PAGE = 'https://status.claude.com'
export const NPM_LATEST = 'https://registry.npmjs.org/@anthropic-ai/claude-code/latest'

export interface ServiceStatus {
  /** none | minor | major | critical | maintenance */
  indicator: string
  description: string
  /** components that are not operational */
  degraded: { name: string; status: string }[]
  incidents: { name: string; status: string; impact: string; url?: string; updatedAt?: string }[]
}

const obj = (v: unknown): Record<string, any> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : undefined)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Statuspage summary.json → what the panel shows (unresolved incidents, degraded components). */
export function parseStatusPage(body: unknown): ServiceStatus {
  const d = obj(body) ?? {}
  const st = obj(d.status)
  if (!st || !str(st.indicator)) throw new Error('page de statut illisible')
  const degraded = (Array.isArray(d.components) ? d.components : []).map(obj).filter((c): c is Record<string, any> => !!c && !c.group && str(c.status) !== '' && c.status !== 'operational')
    .map((c) => ({ name: str(c.name), status: str(c.status) }))
  const incidents = (Array.isArray(d.incidents) ? d.incidents : []).map(obj).filter((i): i is Record<string, any> => !!i && i.status !== 'resolved' && i.status !== 'postmortem')
    .map((i) => ({ name: str(i.name), status: str(i.status), impact: str(i.impact), url: str(i.shortlink) || undefined, updatedAt: str(i.updated_at) || undefined }))
  return { indicator: str(st.indicator), description: str(st.description), degraded, incidents }
}

export const statusTone = (indicator: string): 'ok' | 'warn' | 'error' => (indicator === 'none' ? 'ok' : indicator === 'minor' || indicator === 'maintenance' ? 'warn' : 'error')

const LABELS: Record<string, string> = {
  operational: 'opérationnel', degraded_performance: 'ralenti', partial_outage: 'panne partielle', major_outage: 'panne majeure', under_maintenance: 'maintenance',
  investigating: 'analyse en cours', identified: 'cause identifiée', monitoring: 'sous surveillance',
}
export const statusLabel = (s: string) => LABELS[s] ?? s.replace(/_/g, ' ')

/** "2.1.283 (Claude Code)" → "2.1.283"; the newer npm version when the installed one is behind. */
export function updateAvailable(installed: string | null | undefined, latest: string | null | undefined): string | null {
  if (!installed || !latest) return null
  return compareVersions(latest, installed) > 0 ? latest : null
}
