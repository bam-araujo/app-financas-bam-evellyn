import { useCallback, useEffect, useState } from 'react'
import { autoCategorias } from '../api/client'
import type { AutoCategoriaRow } from '../api/types'

/**
 * Hook de auto-categorização. Carrega todos os mappings 1x e expõe:
 *  - `suggest(descricao)`: devolve a melhor categoria pra descrição (ou '').
 *  - `record(descricao, categoria)`: persiste novo mapping (ou incrementa hits).
 *
 * Estratégia simples (sem ML): se a substring cadastrada aparecer na
 * descrição (case-insensitive), match. Em caso de múltiplos matches,
 * vence o que tem maior `hits` (preferência por mapping mais usado).
 *
 * `record` cria mapping novo se substring não existe; se já existe com
 * mesma categoria, incrementa hits. Se já existe com categoria diferente,
 * NÃO sobrescreve — mantém o original. (User pode editar manualmente
 * na planilha; UI dedicada fica pra evolução futura.)
 */
export interface UseAutoCategoriasResult {
  loading: boolean
  mappings: AutoCategoriaRow[]
  suggest: (descricao: string) => string
  record: (descricao: string, categoria: string) => Promise<void>
  refetch: () => void
}

const MIN_SUBSTRING_LEN = 4

/** Pega palavras "marcantes" da descrição (>= 4 chars, lowercase). */
function extractSubstrings(descricao: string): string[] {
  return descricao
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9*]+/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_SUBSTRING_LEN)
}

export function useAutoCategorias(): UseAutoCategoriasResult {
  const [mappings, setMappings] = useState<AutoCategoriaRow[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(() => {
    setLoading(true)
    autoCategorias.list()
      .then(setMappings)
      .catch(() => setMappings([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refetch() }, [refetch])

  const suggest = useCallback((descricao: string): string => {
    if (!descricao || mappings.length === 0) return ''
    const desc = descricao.toLowerCase()
    let bestCat = ''
    let bestHits = -1
    for (const m of mappings) {
      const sub = String(m.substring || '').toLowerCase()
      if (sub.length < MIN_SUBSTRING_LEN) continue
      if (!desc.includes(sub)) continue
      const hits = Number(m.hits) || 0
      if (hits > bestHits) {
        bestHits = hits
        bestCat = String(m.categoria || '')
      }
    }
    return bestCat
  }, [mappings])

  /**
   * Grava o mapping. Não dispara refetch automático — chamada repetida
   * em batch (ex.: ao salvar N linhas do Import) ficaria O(N) chamadas
   * extras. Caller deve chamar `refetch()` manualmente após batch.
   */
  const record = useCallback(async (descricao: string, categoria: string) => {
    if (!descricao || !categoria) return
    const candidates = extractSubstrings(descricao)
    if (candidates.length === 0) return
    for (const sub of candidates) {
      const existing = mappings.find((m) => String(m.substring || '').toLowerCase() === sub)
      if (existing) {
        if (existing.categoria === categoria) {
          try {
            await autoCategorias.update(existing.id, { hits: (Number(existing.hits) || 0) + 1 })
          } catch { /* não-bloqueante */ }
          return
        }
        // Conflito: mesmo substring → categoria diferente. Skip, tenta próximo candidato.
        continue
      }
      try {
        await autoCategorias.create({ substring: sub, categoria, hits: 1 })
      } catch { /* não-bloqueante */ }
      return
    }
  }, [mappings])

  return { loading, mappings, suggest, record, refetch }
}
