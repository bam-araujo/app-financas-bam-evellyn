/**
 * Client HTTP para o Apps Script Web App.
 *
 * Convenções:
 * - Content-Type: text/plain (evita preflight CORS — Apps Script não configura CORS).
 * - Token vai no corpo (POST) ou query (GET).
 * - Resposta: {ok:true, data} | {ok:false, error}.
 *
 * PR1 só expõe ping(). Os CRUDs entram no PR2.
 */

const API_URL = import.meta.env.VITE_API_URL as string | undefined
const API_TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string }

function assertConfigured(): { url: string; token: string } {
  if (!API_URL || !API_TOKEN) {
    throw new Error(
      'API não configurada. Defina VITE_API_URL e VITE_API_TOKEN (.env.local local; Secrets do GitHub no deploy).',
    )
  }
  return { url: API_URL, token: API_TOKEN }
}

export async function apiGet<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const { url, token } = assertConfigured()
  const qs = new URLSearchParams({ action, token, ...params })
  const res = await fetch(`${url}?${qs.toString()}`, { method: 'GET' })
  return unwrap<T>(res)
}

export async function apiPost<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { url, token } = assertConfigured()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token, ...body }),
  })
  return unwrap<T>(res)
}

async function unwrap<T>(res: Response): Promise<T> {
  let payload: ApiResponse<T>
  try {
    payload = (await res.json()) as ApiResponse<T>
  } catch {
    throw new Error(`Resposta inválida da API (HTTP ${res.status})`)
  }
  if (!payload.ok) throw new Error(payload.error || `HTTP ${res.status}`)
  return payload.data
}

export type PingData = { ts: number }
export function ping(): Promise<PingData> {
  return apiGet<PingData>('ping')
}
