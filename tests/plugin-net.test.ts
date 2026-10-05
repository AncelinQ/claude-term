import { describe, it, expect } from 'vitest'
import { netFetch, netRequest, NET_LIMITS } from '../src/main/services/plugin-net'

describe('plugin requests', () => {
  it('checks the method, the headers and the body', () => {
    expect(netRequest({ url: 'https://a.dev/x' })).toEqual({ url: 'https://a.dev/x', method: 'GET', headers: {} })
    expect(netRequest({ url: 'https://a.dev/x', method: 'post', headers: { Authorization: 'k', 'Content-Type': 'application/json' }, body: '{}' }))
      .toEqual({ url: 'https://a.dev/x', method: 'POST', headers: { Authorization: 'k', 'Content-Type': 'application/json' }, body: '{}' })
    expect(netRequest({ url: 'https://a.dev/x', body: null })).toEqual({ url: 'https://a.dev/x', method: 'GET', headers: {} })
    expect(() => netRequest(undefined)).toThrow(/fetch\(url/)
    expect(() => netRequest({ url: 'https://a.dev', method: 'CONNECT' })).toThrow(/method CONNECT/)
    expect(() => netRequest({ url: 'https://a.dev', method: 3 })).toThrow(/method/)
    for (const h of ['Cookie', 'host', 'Origin', 'Referer', 'Proxy-Authorization', 'Sec-Fetch-Mode', 'Content-Length'])
      expect(() => netRequest({ url: 'https://a.dev', headers: { [h]: 'x' } }), h).toThrow(/set by the app/)
    expect(() => netRequest({ url: 'https://a.dev', headers: { 'bad header': 'x' } })).toThrow(/invalid header/)
    expect(() => netRequest({ url: 'https://a.dev', headers: { a: 1 } })).toThrow(/invalid header/)
    expect(() => netRequest({ url: 'https://a.dev', headers: [['a', 'b']] })).toThrow(/object/)
    expect(() => netRequest({ url: 'https://a.dev', method: 'POST', body: { q: 1 } })).toThrow(/JSON.stringify/)
    expect(() => netRequest({ url: 'https://a.dev', body: 'x' })).toThrow(/no body with GET/)
    expect(() => netRequest({ url: 'https://a.dev', method: 'POST', body: 'é'.repeat(6) }, { ...NET_LIMITS, request: 10 })).toThrow(/too large/)
  })

  it('sends it without cookies and reads the answer whole, cookies left out', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const fetch = async (url: string, init: RequestInit) => { seen = { url, init }; return new Response('{"data":{"viewer":{"name":"A"}}}', { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json', 'set-cookie': 'sid=1' } }) }
    const r = await netFetch(fetch, { url: 'https://api.linear.app/graphql', method: 'POST', headers: { Authorization: 'k' }, body: '{"query":"{ viewer { name } }"}' })
    expect(r).toEqual({ status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, body: '{"data":{"viewer":{"name":"A"}}}' })
    expect(seen?.init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', body: '{"query":"{ viewer { name } }"}', headers: { Authorization: 'k' } })
    const notFound = await netFetch(async () => new Response('nope', { status: 404 }), { url: 'https://a.dev', method: 'GET', headers: {} })
    expect(notFound).toMatchObject({ status: 404, body: 'nope' })
    expect((await netFetch(async () => new Response(null, { status: 204 }), { url: 'https://a.dev', method: 'GET', headers: {} })).body).toBe('')
  })

  it('refuses an answer over the cap, announced or streamed', async () => {
    const limits = { ...NET_LIMITS, response: 10 }
    await expect(netFetch(async () => new Response('x'.repeat(5), { headers: { 'content-length': '50' } }), { url: 'https://a.dev', method: 'GET', headers: {} }, limits)).rejects.toThrow(/too large/)
    let n = 0
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (n++ < 5) c.enqueue(new Uint8Array(4)); else c.close() } })
    await expect(netFetch(async () => new Response(stream), { url: 'https://a.dev', method: 'GET', headers: {} }, limits)).rejects.toThrow(/too large/)
  })

  it('gives up after the timeout', async () => {
    const hang = (_url: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted'))))
    await expect(netFetch(hang, { url: 'https://a.dev', method: 'GET', headers: {} }, { ...NET_LIMITS, timeoutMs: 20 })).rejects.toThrow(/no answer after 0 s/)
    await expect(netFetch(async () => { throw new Error('net::ERR_BLOCKED_BY_CLIENT') }, { url: 'https://a.dev', method: 'GET', headers: {} })).rejects.toThrow(/BLOCKED/)
  })
})
