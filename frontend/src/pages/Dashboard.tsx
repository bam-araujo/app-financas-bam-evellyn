import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getShare, lancamentos, receitas } from '../api/client'
import type { LancamentoRow, ReceitaRow, ShareData } from '../api/types'
import type { GlobalFilters } from '../components/Filters'
import { COLOR_BAM, COLOR_EVELLYN, colorForIndex } from '../lib/colors'
import { shiftCompetencia } from '../lib/competencia'
import { formatBRL, formatCompetenciaBR } from '../lib/format'

type Periodo = 'ytd' | '3m' | '6m' | '12m'

interface Props {
  competencia: string
  filters: GlobalFilters
}

function periodoRange(periodo: Periodo, atual: string): { start: string; end: string } {
  if (periodo === 'ytd') {
    const year = atual.slice(0, 4)
    return { start: `${year}-01`, end: atual }
  }
  const months = periodo === '3m' ? 3 : periodo === '6m' ? 6 : 12
  return { start: shiftCompetencia(atual, -(months - 1)), end: atual }
}

function inRange(c: string, start: string, end: string): boolean {
  return c >= start && c <= end
}

function listMonthsInRange(start: string, end: string): string[] {
  const out: string[] = []
  let c = start
  while (c <= end) {
    out.push(c)
    c = shiftCompetencia(c, 1)
    if (out.length > 36) break // sanity
  }
  return out
}

export function DashboardPage({ competencia, filters }: Props) {
  const [allLanc, setAllLanc] = useState<LancamentoRow[]>([])
  const [allRec, setAllRec] = useState<ReceitaRow[]>([])
  const [shares, setShares] = useState<Record<string, ShareData>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Período é o único filtro específico do Dashboard (range vs mês único)
  const [periodo, setPeriodo] = useState<Periodo>('ytd')
  const pessoa = filters.pessoa
  const rateio = filters.rateio

  const { start, end } = useMemo(() => periodoRange(periodo, competencia), [periodo, competencia])
  const meses = useMemo(() => listMonthsInRange(start, end), [start, end])

  function reload() {
    setLoading(true)
    setError(null)
    Promise.all([lancamentos.list(), receitas.list()])
      .then(async ([ls, rs]) => {
        setAllLanc(ls)
        setAllRec(rs)
        // Fetch share pra cada competência no range
        const competencias = listMonthsInRange(start, end)
        const sharesArr = await Promise.all(competencias.map((c) => getShare(c).catch(() => null)))
        const map: Record<string, ShareData> = {}
        competencias.forEach((c, i) => { if (sharesArr[i]) map[c] = sharesArr[i] as ShareData })
        setShares(map)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [competencia, periodo])

  // -------- agregação --------

  /** Peso aplicado a uma despesa, dado filtro pessoa + toggle rateio. 0 = excluir. */
  function weight(row: LancamentoRow): number {
    // Aplica tipo+categoria globais primeiro
    if (filters.tipo && row.tipo !== filters.tipo) return 0
    if (filters.categoria && row.categoria !== filters.categoria) return 0
    if (pessoa === 'casal') return 1
    // pessoa específica
    if (row.tipo === 'individual') {
      return row.dono === pessoa ? 1 : 0
    }
    // conjunto
    if (!rateio) return 1
    const s = shares[row.competencia]
    if (!s) return 0.5
    return s[pessoa]
  }

  const despesasFiltradas = useMemo(() => {
    return allLanc
      .filter((r) => inRange(r.competencia, start, end))
      .map((r) => ({ row: r, w: weight(r) }))
      .filter((x) => x.w > 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLanc, start, end, pessoa, rateio, shares, filters.tipo, filters.categoria])

  const receitasFiltradas = useMemo(() => {
    return allRec.filter((r) => inRange(r.competencia, start, end))
  }, [allRec, start, end])

  // Totais
  const totalDespesas = despesasFiltradas.reduce((s, x) => s + Number(x.row.valor) * x.w, 0)
  const totalReceitas = receitasFiltradas
    .filter((r) => pessoa === 'casal' || r.pessoa === pessoa)
    .reduce((s, r) => s + Number(r.valor), 0)
  const saldo = totalReceitas - totalDespesas

  // Por categoria (pie)
  const porCategoria = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const { row, w } of despesasFiltradas) {
      const v = Number(row.valor) * w
      acc[row.categoria] = (acc[row.categoria] ?? 0) + v
    }
    return Object.entries(acc)
      .map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor)
  }, [despesasFiltradas])

  // Por mês (bar)
  const porMes = useMemo(() => {
    const map: Record<string, { despesas: number; receitas: number }> = {}
    for (const m of meses) map[m] = { despesas: 0, receitas: 0 }
    for (const { row, w } of despesasFiltradas) {
      const k = row.competencia
      if (!map[k]) continue
      map[k].despesas += Number(row.valor) * w
    }
    for (const r of receitasFiltradas) {
      if (pessoa !== 'casal' && r.pessoa !== pessoa) continue
      const k = r.competencia
      if (!map[k]) continue
      map[k].receitas += Number(r.valor)
    }
    return meses.map((m) => ({
      mes: formatCompetenciaBR(m, 'short'),
      Despesas: Math.round(map[m].despesas * 100) / 100,
      Receitas: Math.round(map[m].receitas * 100) / 100,
    }))
  }, [despesasFiltradas, receitasFiltradas, meses, pessoa])

  // Receitas por pessoa (bar empilhado por mês)
  const receitasPorPessoa = useMemo(() => {
    const map: Record<string, { Bam: number; Evellyn: number }> = {}
    for (const m of meses) map[m] = { Bam: 0, Evellyn: 0 }
    for (const r of receitasFiltradas) {
      if (!map[r.competencia]) continue
      map[r.competencia][r.pessoa] += Number(r.valor)
    }
    return meses.map((m) => ({
      mes: formatCompetenciaBR(m, 'short'),
      Bam: Math.round(map[m].Bam * 100) / 100,
      Evellyn: Math.round(map[m].Evellyn * 100) / 100,
    }))
  }, [receitasFiltradas, meses])

  // -------- render --------

  const fmtTooltip = (v: unknown): string => formatBRL(Number(v) || 0)

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p className="muted">
            {formatCompetenciaBR(start, 'short')} → {formatCompetenciaBR(end, 'short')} ·{' '}
            {pessoa === 'casal' ? 'casal' : pessoa}
            {pessoa !== 'casal' && rateio && <span className="muted-light"> · conjuntas rateadas</span>}
          </p>
        </div>
      </header>

      <div className="card filters" style={{ marginBottom: '1rem' }}>
        <div className="filters-body">
          <label>
            <span>Período</span>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
              <option value="ytd">YTD ({end.slice(0, 4)})</option>
              <option value="3m">Últimos 3 meses</option>
              <option value="6m">Últimos 6 meses</option>
              <option value="12m">Últimos 12 meses</option>
            </select>
          </label>
        </div>
      </div>

      {loading && <p className="muted">Carregando…</p>}
      {error && <p className="error-msg">Erro: {error}</p>}

      <div className="card resumo" style={{ marginBottom: '1rem' }}>
        <div className="resumo-grid">
          <div>
            <span className="muted">Despesas</span>
            <strong>{formatBRL(totalDespesas)}</strong>
            <span className="muted">Receitas</span>
            <strong>{formatBRL(totalReceitas)}</strong>
            <span className="muted">Saldo</span>
            <strong className={saldo >= 0 ? 'pos' : 'neg'}>{formatBRL(saldo)}</strong>
          </div>
          <div>
            <span className="muted">% gasto</span>
            <strong>{totalReceitas > 0 ? ((totalDespesas / totalReceitas) * 100).toFixed(0) : '—'}%</strong>
            <span className="muted">Despesas/mês (média)</span>
            <strong>{formatBRL(totalDespesas / Math.max(1, meses.length))}</strong>
            <span className="muted">Categorias ativas</span>
            <strong>{porCategoria.length}</strong>
          </div>
        </div>
      </div>

      {/* Despesas por mês */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Despesas × Receitas por mês</h3>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={porMes} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={fmtTooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Despesas" fill="#ef4444" />
              <Bar dataKey="Receitas" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Despesas por categoria */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Despesas por categoria</h3>
        {porCategoria.length === 0 ? (
          <p className="muted">Sem despesas no período.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={porCategoria}
                  dataKey="valor"
                  nameKey="nome"
                  innerRadius={48}
                  outerRadius={92}
                  paddingAngle={2}
                  label={(props: { name?: string; percent?: number }) =>
                    props.percent !== undefined && props.percent > 0.05 && props.name ? props.name : ''
                  }
                >
                  {porCategoria.map((_, i) => (
                    <Cell key={i} fill={colorForIndex(i)} />
                  ))}
                </Pie>
                <Tooltip formatter={fmtTooltip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {porCategoria.length > 0 && (
          <ul className="cat-list">
            {porCategoria.slice(0, 12).map((c, i) => (
              <li key={c.nome}>
                <span className="cat-dot" style={{ background: colorForIndex(i) }} />
                <span className="grow">{c.nome}</span>
                <strong>{formatBRL(c.valor)}</strong>
                <span className="muted-light">
                  {totalDespesas > 0 ? `${((c.valor / totalDespesas) * 100).toFixed(1)}%` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Receitas por pessoa (apenas em modo casal — mostra split) */}
      {pessoa === 'casal' && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Receitas por pessoa</h3>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={receitasPorPessoa} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={fmtTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Bam" stackId="r" fill={COLOR_BAM} />
                <Bar dataKey="Evellyn" stackId="r" fill={COLOR_EVELLYN} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  )
}
