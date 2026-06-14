import { useEffect, useMemo, useRef, useState } from 'react'
import {
  investimentosMovimentos,
  investimentosSaldos,
  lancamentos,
  receitas,
} from '../api/client'
import type {
  InvestimentoMovimentoRow,
  InvestimentoSaldoRow,
  LancamentoRow,
  ReceitaRow,
} from '../api/types'
import { formatBRL, formatDateBR } from '../lib/format'

/**
 * Paleta de busca global. Atalho Cmd/Ctrl+K abre; busca em descricao,
 * categoria, origem, instituicao, ativo. Volume é baixo (2 usuários) —
 * baixa tudo no open e indexa em memória; sem paginação no backend.
 *
 * Resultado clicado: chama `onNavigate(route, competencia)` — o pai (App)
 * atualiza a competência ANTES de mudar de rota pra garantir que a tela
 * destino renderize com o mês certo do item clicado (e não com o mês
 * que estava selecionado antes).
 */

interface IndexedRow {
  kind: 'lancamento' | 'receita' | 'invest_saldo' | 'invest_mov'
  id: string
  haystack: string  // texto pre-computado pra match
  title: string
  subtitle: string
  valor: string
  route: string
  competencia: string  // YYYY-MM pra setar no header ao navegar
}

function buildIndex(
  lncs: LancamentoRow[],
  rcts: ReceitaRow[],
  sals: InvestimentoSaldoRow[],
  movs: InvestimentoMovimentoRow[],
): IndexedRow[] {
  const out: IndexedRow[] = []
  for (const l of lncs) {
    const comp = l.competencia || (l.data || '').slice(0, 7)
    out.push({
      kind: 'lancamento',
      id: l.id,
      haystack: `${l.descricao} ${l.categoria} ${l.pagador} ${l.dono} ${l.tipo}`.toLowerCase(),
      title: l.descricao,
      subtitle: `${formatDateBR(l.data)} · ${l.categoria} · ${l.tipo === 'conjunto' ? 'conjunta' : l.dono}`,
      valor: formatBRL(Number(l.valor) || 0),
      route: '#/despesas',
      competencia: comp,
    })
  }
  for (const r of rcts) {
    out.push({
      kind: 'receita',
      id: r.id,
      haystack: `${r.origem} ${r.tipo} ${r.pessoa}`.toLowerCase(),
      title: `${r.pessoa} · ${r.tipo}`,
      subtitle: `${r.competencia}${r.origem ? ' · ' + r.origem : ''}`,
      valor: formatBRL(Number(r.valor) || 0),
      route: '#/receitas',
      competencia: r.competencia,
    })
  }
  for (const s of sals) {
    out.push({
      kind: 'invest_saldo',
      id: s.id,
      haystack: `${s.ativo} ${s.instituicao} ${s.titular}`.toLowerCase(),
      title: `${s.ativo} · ${s.instituicao}`,
      subtitle: `${formatDateBR(s.data)} · saldo · ${s.titular}`,
      valor: formatBRL(Number(s.valor_saldo) || 0),
      route: '#/investimentos',
      competencia: (s.data || '').slice(0, 7),
    })
  }
  for (const m of movs) {
    out.push({
      kind: 'invest_mov',
      id: m.id,
      haystack: `${m.ativo} ${m.instituicao} ${m.titular} ${m.tipo}`.toLowerCase(),
      title: `${m.tipo === 'aporte' ? '↑ Aporte' : '↓ Resgate'} · ${m.ativo}`,
      subtitle: `${formatDateBR(m.data)} · ${m.instituicao} · ${m.titular}`,
      valor: formatBRL(Number(m.valor) || 0),
      route: '#/investimentos',
      competencia: (m.data || '').slice(0, 7),
    })
  }
  return out
}

interface Props {
  open: boolean
  onClose: () => void
  /**
   * Chamado quando o usuário escolhe um resultado. O pai deve atualizar
   * a competência E mudar a rota. Hash sozinho não basta porque a
   * competência é estado do App (sticky no header), e a página destino
   * filtra por essa competência — se não atualizar, o item não aparece.
   */
  onNavigate: (route: string, competencia: string) => void
}

export function SearchPalette({ open, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState<IndexedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Recarrega o índice toda vez que abre — garante dados frescos sem cache stale.
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setQuery('')
    setCursor(0)
    Promise.all([
      lancamentos.list(),
      receitas.list(),
      investimentosSaldos.list(),
      investimentosMovimentos.list(),
    ])
      .then(([lncs, rcts, sals, movs]) => setIndex(buildIndex(lncs, rcts, sals, movs)))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [open])

  // Foca o input quando abre (após o render).
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0) }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as IndexedRow[]
    const terms = q.split(/\s+/).filter(Boolean)
    const matched = index.filter((row) => terms.every((t) => row.haystack.includes(t)))
    return matched.slice(0, 50)
  }, [index, query])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); return }
    if (e.key === 'Enter' && results[cursor]) {
      const r = results[cursor]
      onNavigate(r.route, r.competencia)
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Buscar em despesas, receitas e investimentos…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
          onKeyDown={handleKey}
        />
        <div className="search-results">
          {loading && <p className="muted">Indexando…</p>}
          {error && <p className="error-msg">Erro: {error}</p>}
          {!loading && !error && query.trim() && results.length === 0 && (
            <p className="muted">Nenhum resultado para "{query}".</p>
          )}
          {!loading && !error && !query.trim() && (
            <p className="muted-light" style={{ fontSize: '0.78rem' }}>
              {index.length} itens indexados · ↑↓ pra navegar · Enter pra abrir · Esc pra sair
            </p>
          )}
          <ul>
            {results.map((row, i) => (
              <li
                key={`${row.kind}:${row.id}`}
                className={'search-row' + (i === cursor ? ' active' : '')}
                onClick={() => { onNavigate(row.route, row.competencia); onClose() }}
                onMouseEnter={() => setCursor(i)}
              >
                <div className="search-row-main">
                  <strong>{row.title}</strong>
                  <span className="muted">{row.subtitle}</span>
                </div>
                <span className="search-row-valor">{row.valor}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
