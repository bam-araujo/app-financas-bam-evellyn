/**
 * Client HTTP para o Apps Script Web App.
 *
 * Convenções:
 * - Content-Type: text/plain (evita preflight CORS — Apps Script não configura CORS).
 * - Auth: id_token (JWT do Google) vai no body/query em cada request. O backend
 *   valida assinatura via tokeninfo + checa email contra allowlist em /pessoas.
 * - Resposta: {ok:true, data} | {ok:false, error}.
 */

import { currentIdToken } from '../hooks/useAuth'
import type {
  CreatePayload,
  TableMap,
  TableName,
  UpdatePayload,
} from './types'

const API_URL = import.meta.env.VITE_API_URL as string | undefined

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Erro disparado quando o Google retornou algo transient (HTTP 5xx, falha
 * de rede, resposta sem JSON). Sinaliza ao withRetry que vale a pena tentar
 * de novo — diferentemente de um {ok:false, error} de regra de negócio.
 */
class TransientApiError extends Error {
  constructor(msg: string) { super(msg); this.name = 'TransientApiError' }
}

function assertConfigured(): { url: string } {
  if (!API_URL) {
    throw new Error(
      'API não configurada. Defina VITE_API_URL (.env.local local; Secrets do GitHub no deploy).',
    )
  }
  return { url: API_URL }
}

/** Auth: o ping não exige token; tudo o mais sim. */
function authParams(action: string): Record<string, string> {
  if (action === 'ping') return {}
  const token = currentIdToken()
  if (!token) throw new Error('not_signed_in')
  return { id_token: token }
}

/**
 * Roda `fn`. Se ela lançar um TransientApiError, espera 800ms e tenta
 * mais 1 vez. Esse padrão cobre os 500s esporádicos do Apps Script em
 * rajadas (Google segura o pedido por alguns segundos e responde 500 na
 * primeira; segunda tentativa quase sempre vai).
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (!(err instanceof TransientApiError)) throw err
    await new Promise((r) => setTimeout(r, 800))
    return fn()
  }
}

/** fetch que converte falha de rede em TransientApiError (retryable). */
async function fetchTransient(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (err) {
    throw new TransientApiError(`Falha de rede: ${(err as Error).message}`)
  }
}

/** GET de baixo nível — usado por list/get.
 *  `cache: 'no-store'` força bypass do HTTP cache do navegador. Apps Script
 *  Web App nem sempre devolve Cache-Control: no-store, e sem isso o Chrome
 *  pode reusar a resposta GET por heurística — causando leitura stale logo
 *  após um update (sintoma: edita descrição em Despesas, Acerto continua
 *  mostrando descrição antiga até refresh forçado). */
async function apiGet<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const { url } = assertConfigured()
  const qs = new URLSearchParams({ action, ...authParams(action), ...params })
  return withRetry(async () => {
    const res = await fetchTransient(`${url}?${qs.toString()}`, { method: 'GET', cache: 'no-store' })
    return unwrap<T>(res)
  })
}

/** POST de baixo nível — usado por create/update/delete. */
async function apiPost<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { url } = assertConfigured()
  return withRetry(async () => {
    const res = await fetchTransient(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...authParams(action), ...body }),
    })
    return unwrap<T>(res)
  })
}

async function unwrap<T>(res: Response): Promise<T> {
  // 5xx do Google são transientes — vale retry.
  if (res.status >= 500) throw new TransientApiError(`HTTP ${res.status}`)
  let payload: ApiResponse<T>
  try {
    payload = (await res.json()) as ApiResponse<T>
  } catch {
    // JSON inválido geralmente é HTML de erro do Google (timeout, 5xx
    // disfarçado de 200 etc.) — também retryable.
    throw new TransientApiError(`Resposta inválida da API (HTTP ${res.status})`)
  }
  if (!payload.ok) throw new Error(payload.error || `HTTP ${res.status}`)
  return payload.data
}

// ====== ping =================================================================

export type PingData = { ts: number }
export function ping(): Promise<PingData> {
  return apiGet<PingData>('ping')
}

// ====== whoami ===============================================================

export interface WhoamiData {
  email: string
  nome: 'Bam' | 'Evellyn'
  cor: string
  name: string
  picture: string
  source: 'oauth' | 'service'
}
export function whoami(): Promise<WhoamiData> {
  return apiGet<WhoamiData>('whoami')
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

// ====== Série (parcelado / recorrente) — lancamentos + receitas =============

import type { LancamentoRow, ReceitaRow } from './types'

/** Tabelas que suportam série. Espelha SERIE_TABLES em backend/05_Series.gs. */
export type SerieTable = 'lancamentos' | 'receitas'

type SerieRowMap = { lancamentos: LancamentoRow; receitas: ReceitaRow }

type SerieBase<T extends SerieTable> = Omit<
  SerieRowMap[T],
  'id' | 'serie_id' | 'serie_tipo' | 'parcela_num' | 'parcela_total' | 'competencia'
>

export interface CreateSerieResult<T extends SerieTable = 'lancamentos'> {
  serie_id: string
  count: number
  rows: SerieRowMap[T][]
}

export function createSerieParcelado<T extends SerieTable>(
  table: T,
  data: SerieBase<T>,
  parcelas: number,
): Promise<CreateSerieResult<T>> {
  return apiPost<CreateSerieResult<T>>('create_serie', {
    table,
    serie_tipo: 'parcelado',
    parcela_total: parcelas,
    data,
  })
}

export function createSerieRecorrente<T extends SerieTable>(
  table: T,
  data: SerieBase<T>,
): Promise<CreateSerieResult<T>> {
  return apiPost<CreateSerieResult<T>>('create_serie', {
    table,
    serie_tipo: 'recorrente',
    data,
  })
}

/** Estende séries recorrentes (de TODAS as tabelas suportadas) até cobrir
 *  `throughCompetencia` + 12 meses. Idempotente. */
export function extendRecorrentes(throughCompetencia: string): Promise<{ extended: number; through: string }> {
  return apiPost<{ extended: number; through: string }>('extend_recorrentes', {
    through_competencia: throughCompetencia,
  })
}

export type SerieScope = 'this' | 'forward'

/** Delete uma linha ('this') ou linha + futuras da mesma série ('forward'). */
export function deleteSerieForward(
  table: SerieTable,
  id: string,
  scope: SerieScope,
): Promise<{ id: string; deleted: number; serie_id?: string }> {
  return apiPost<{ id: string; deleted: number; serie_id?: string }>('delete_serie_forward', {
    table,
    id,
    scope,
  })
}

/**
 * Update uma linha ('this') ou propaga campos pra linha + futuras ('forward').
 * Em 'forward', só os campos propagáveis da tabela atravessam — âncora
 * (data/competencia) sempre fica por linha. Lista em backend/05_Series.gs.
 */
export function updateSerieForward<T extends SerieTable>(
  table: T,
  id: string,
  scope: SerieScope,
  fields: Partial<SerieBase<T>>,
): Promise<{ id: string; updated?: number; serie_id?: string }> {
  return apiPost('update_serie_forward', {
    table,
    id,
    scope,
    fields,
  })
}

// ====== Share (rateio) ======================================================

import type { ShareData } from './types'

export function getShare(competencia: string): Promise<ShareData> {
  return apiGet<ShareData>('share', { competencia })
}

export function closeShare(competencia: string): Promise<ShareData> {
  return apiPost<ShareData>('close_share', { competencia })
}

export function reopenShare(competencia: string): Promise<{ competencia: string; deleted: number }> {
  return apiPost<{ competencia: string; deleted: number }>('reopen_share', { competencia })
}

// ====== Batch create ========================================================

export interface BatchCreateResult<T> {
  count: number
  total: number
  results: Array<{ ok: true; data: T } | { ok: false; error: string; index: number }>
}

export function batchCreate<T extends TableName>(
  table: T,
  items: CreatePayload<T>[],
): Promise<BatchCreateResult<TableMap[T]>> {
  return apiPost<BatchCreateResult<TableMap[T]>>('batch_create', { table, items })
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
export const acertosPagos = makeTableApi('acertos_pagos')
export const autoCategorias = makeTableApi('auto_categorias')
export const orcamento = makeTableApi('orcamento')
