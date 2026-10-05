/** What a session worked on, read from its transcript: its branch, the merge requests it opened, the tickets it touched. */

export interface PrLink { url: string; number?: number; repository?: string }

/** What Claude learned of a ticket through a Linear MCP server (get_issue / save_issue). */
export interface TicketTrace {
  title?: string
  url?: string
  /** the branch Linear suggests for the ticket */
  branch?: string
  /** last known state, as Linear names it, and when it was read or set */
  status?: string
  statusAt?: string
  /** the state comes from a save_issue that changed it */
  statusSetByClaude?: boolean
}

export interface SessionWork {
  /** the git branch of the last event that names one */
  branch?: string
  prs: PrLink[]
  /** ticket id ("HN-12528") → trace */
  tickets: Record<string, TicketTrace>
}

/** A ticket id as Linear writes it: `HN-12528`, `MAR-468`. */
const TICKET = /^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/
/** get_issue / save_issue of any Linear server: the claude.ai connector (`mcp__claude_ai_Linear__…`) or `mcp__linear__…` */
const LINEAR_TOOL = /^mcp__.*linear.*__(get_issue|save_issue)$/i

/**
 * Reads the lines that matter: the last `gitBranch`, `pr-link` records, and the Linear calls with their answers (a call
 * and its result are two records tied by the call's id). The most recent state of a ticket wins.
 */
export function summarizeWork(lines: readonly string[]): SessionWork {
  const work: SessionWork = { prs: [], tickets: {} }
  const pending = new Map<string, { saved: boolean; ticket?: string; at?: string }>()
  const trace = (id: string) => (work.tickets[id] ??= {})
  const setStatus = (t: TicketTrace, status: string, at: string | undefined, byClaude: boolean) => {
    if (t.statusAt && at && at < t.statusAt) return
    t.status = status
    if (at) t.statusAt = at
    t.statusSetByClaude = byClaude
  }
  for (const line of lines) {
    const branch = /"gitBranch":"((?:[^"\\]|\\.)*)"/.exec(line)
    if (branch?.[1]) try { work.branch = JSON.parse(`"${branch[1]}"`) } catch { /* a broken escape */ }
    const isPr = line.includes('"pr-link"')
    const isCall = line.includes('"tool_use"') && /linear/i.test(line)
    const isResult = pending.size > 0 && line.includes('"tool_result"')
    if (!isPr && !isCall && !isResult) continue
    let o: any
    try { o = JSON.parse(line) } catch { continue }
    const at = typeof o?.timestamp === 'string' ? o.timestamp : undefined
    if (o?.type === 'pr-link' && typeof o.prUrl === 'string') {
      if (!work.prs.some((p) => p.url === o.prUrl)) work.prs.push({ url: o.prUrl, ...(typeof o.prNumber === 'number' ? { number: o.prNumber } : {}), ...(typeof o.prRepository === 'string' ? { repository: o.prRepository } : {}) })
      continue
    }
    const content = o?.message?.content
    if (!Array.isArray(content)) continue
    for (const b of content) {
      if (b?.type === 'tool_use' && typeof b.name === 'string' && LINEAR_TOOL.test(b.name) && typeof b.id === 'string') {
        const raw = b.input?.id ?? b.input?.issueId
        const ticket = typeof raw === 'string' && TICKET.test(raw) ? raw : undefined
        pending.set(b.id, { saved: /save_issue$/i.test(b.name) && b.input?.state !== undefined, ticket, at })
        if (ticket) trace(ticket)
      } else if (b?.type === 'tool_result' && typeof b.tool_use_id === 'string' && pending.has(b.tool_use_id)) {
        const call = pending.get(b.tool_use_id)!
        pending.delete(b.tool_use_id)
        if (b.is_error === true) continue
        const text = Array.isArray(b.content) ? b.content.map((x: any) => (typeof x?.text === 'string' ? x.text : '')).join('') : String(b.content ?? '')
        let issue: any
        try { issue = JSON.parse(text) } catch { continue }
        const id = typeof issue?.id === 'string' && TICKET.test(issue.id) ? issue.id : call.ticket
        if (!id) continue
        const t = trace(id)
        if (typeof issue.title === 'string') t.title = issue.title
        if (typeof issue.url === 'string') t.url = issue.url
        if (typeof issue.gitBranchName === 'string') t.branch = issue.gitBranchName
        if (typeof issue.status === 'string') setStatus(t, issue.status, at ?? call.at, call.saved)
      }
    }
  }
  return work
}
