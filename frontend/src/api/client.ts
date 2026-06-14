/**
 * Client HTTP para o Apps Script Web App.
 *
 * Convenções:
 * - Content-Type: text/plain (evita preflight CORS — Apps Script não configura CORS).
 * - Token vai no corpo (POST) ou query (GET).
 * - Resposta: {ok:true, data} | {ok:false, error}.
 *
 * PR2: CRUD genérico tipado por tabela + helpers por entidade.
 */

import type {
  CreatePayload,
  TableMap,
  TableName,
  UpdatePayload,
} from './types'

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

/** GET de baixo nível — usado por list/get. */
async function apiGet<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const { url, token } = assertConfigured()
  const qs = new URLSearchParams({ action, token, ...params })
  const res = await fetch(`${url}?${qs.toString()}`, { method: 'GET' })
  return unwrap<T>(res)
}

/** POST de baixo nível — usado por create/update/delete. */
async function apiPost<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
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

// ====== ping =================================================================

export type PingData = { ts: number }
export function ping(): Promise<PingData> {
  return apiGet<PingData>('ping')
}

// ====== CRUD genérico ========================================================

/** Filtros do list: aceita um subset das colunas como string (igualdade exata). */
export type ListFilters<T extends TableName> = Partial<Record<keyof TableMap[T], string | number | boolean>>

function stringifyFilters(filters: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(filters)) {
    const v = filters[k]
    if (v === undefined || v === null) continue
    out[k] = String(v)
  }
  return out
}

export function listRows<T extends TableName>(table: T, filters: ListFilters<T> = {}): Promise<TableMap[T][]> {
  return apiGet<TableMap[T][]>('list', { table, ...stringifyFilters(filters as Record<string, unknown>) })
}

export function getRow<T extends TableName>(table: T, id: string): Promise<TableMap[T]> {
  return apiGet<TableMap[T]>('get', { table, id })
}

export function createRow<T extends TableName>(table: T, data: CreatePayload<T>): Promise<TableMap[T]> {
  return apiPost<TableMap[T]>('create', { table, data })
}

export function updateRow<T extends TableName>(table: T, id: string, data: UpdatePayload<T>): Promise<TableMap[T]> {
  return apiPost<TableMap[T]>('update', { table, id, data })
}

export function deleteRow<T extends TableName>(table: T, id: string): Promise<{ id: string; deleted: true }> {
  return apiPost<{ id: string; deleted: true }>('delete', { table, id })
}

// ====== helpers por tabela ===================================================

function makeTableApi<T extends TableName>(table: T) {
  return {
    list: (filters: ListFilters<T> = {}) => listRows(table, filters),
    get: (id: string) => getRow(table, id),
    create: (data: CreatePayload<T>) => createRow(table, data),
    update: (id: string, data: UpdatePayload<T>) => updateRow(table, id, data),
    remove: (id: string) => deleteRow(table, id),
  }
}

export const pessoas = makeTableApi('pessoas')
export const categorias = makeTableApi('categorias')
export const receitas = makeTableApi('receitas')
export const lancamentos = makeTableApi('lancamentos')
export const investimentosSaldos = makeTableApi('investimentos_saldos')
export const investimentosMovimentos = makeTableApi('investimentos_movimentos')
