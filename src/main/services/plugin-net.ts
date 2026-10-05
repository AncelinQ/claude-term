/** A plugin's HTTP request (ctx.net.fetch): checked here, sent by the plugin's own session (plugins.ts). */
export interface NetRequest { url: string; method: string; headers: Record<string, string>; body?: string }
export interface NetResponse { status: number; statusText: string; headers: Record<string, string>; body: string }

export const NET_LIMITS = { request: 1024 * 1024, response: 5 * 1024 * 1024, timeoutMs: 30_000 }

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']
// set by the network stack, or what would let a plugin pass for another site
const OWNED = /^(host|cookie|origin|referer|connection|content-length|transfer-encoding|keep-alive|upgrade|te|trailer|expect|proxy-.*|sec-.*)$/i

/** The request a plugin asked for, or an error saying what is wrong with it. The URL is checked by the policy. */
export function netRequest(a: any, limits = NET_LIMITS): NetRequest {
  if (typeof a?.url !== 'string') throw new Error('fetch(url, init) expected')
  const method = a.method === undefined ? 'GET' : typeof a.method === 'string' ? a.method.toUpperCase() : ''
  if (!METHODS.includes(method)) throw new Error(`fetch: method ${String(a.method)} not allowed`)
  const headers: Record<string, string> = {}
  if (a.headers !== undefined) {
    if (!a.headers || typeof a.headers !== 'object' || Array.isArray(a.headers)) throw new Error('fetch: headers must be an object of strings')
    for (const [k, v] of Object.entries(a.headers)) {
      if (typeof v !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k)) throw new Error(`fetch: invalid header ${k}`)
      if (OWNED.test(k)) throw new Error(`fetch: header ${k} is set by the app`)
      headers[k] = v
    }
  }
  if (a.body !== undefined && a.body !== null) {
    if (typeof a.body !== 'string') throw new Error('fetch: body must be a string (JSON.stringify it)')
    if (method === 'GET' || method === 'HEAD') throw new Error(`fetch: no body with ${method}`)
    if (Buffer.byteLength(a.body) > limits.request) throw new Error('fetch: body too large')
    return { url: a.url, method, headers, body: a.body }
  }
  return { url: a.url, method, headers }
}

/** Sends it without cookies, gives up after the timeout, and refuses an answer larger than the cap. */
export async function netFetch(fetch: (url: string, init: RequestInit) => Promise<Response>, req: NetRequest, limits = NET_LIMITS): Promise<NetResponse> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), limits.timeoutMs)
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: abort.signal })
    if (Number(res.headers.get('content-length') ?? 0) > limits.response) { await res.body?.cancel(); throw new Error('fetch: response too large') }
    const chunks: Uint8Array[] = []
    let size = 0
    const reader = res.body?.getReader()
    for (;;) {
      if (!reader) break
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limits.response) { await reader.cancel(); throw new Error('fetch: response too large') }
      chunks.push(value)
    }
    const headers: Record<string, string> = {}
    res.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v })
    return { status: res.status, statusText: res.statusText, headers, body: Buffer.concat(chunks).toString('utf8') }
  } catch (e) {
    if (abort.signal.aborted) throw new Error(`fetch: no answer after ${Math.round(limits.timeoutMs / 1000)} s`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}
