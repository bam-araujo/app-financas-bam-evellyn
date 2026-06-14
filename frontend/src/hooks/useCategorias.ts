import { useEffect, useState } from 'react'
import { categorias as categoriasApi } from '../api/client'
import type { CategoriaRow } from '../api/types'

let cache: CategoriaRow[] | null = null
let inflight: Promise<CategoriaRow[]> | null = null

/**
 * Hook simples: carrega categorias do backend e cacheia em memória.
 * Categorias mudam pouco — uma única busca por sessão é suficiente.
 */
export function useCategorias(): {
  loading: boolean
  error: string | null
  data: CategoriaRow[]
  reload: () => void
} {
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    data: CategoriaRow[]
  }>(() => ({
    loading: !cache,
    error: null,
    data: cache ?? [],
  }))

  const load = () => {
    if (cache) {
      setState({ loading: false, error: null, data: cache })
      return
    }
    if (!inflight) inflight = categoriasApi.list()
    setState((s) => ({ ...s, loading: true, error: null }))
    inflight
      .then((rows) => {
        cache = rows
        setState({ loading: false, error: null, data: rows })
      })
      .catch((err: Error) => {
        inflight = null
        setState((s) => ({ ...s, loading: false, error: err.message }))
      })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ...state, reload: () => { cache = null; inflight = null; load() } }
}
