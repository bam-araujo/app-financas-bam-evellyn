import { useEffect, useMemo, useState } from 'react'
import { getShare, investimentosMovimentos, investimentosSaldos, lancamentos, receitas } from '../api/client'
import type { InvestimentoMovimentoRow, InvestimentoSaldoRow, LancamentoRow, ReceitaRow, ShareData } from '../api/types'
import { ChartCategoryPie } from '../components/charts/ChartCategoryPie'
import { ChartMonthlyFlow } from '../components/charts/ChartMonthlyFlow'
import { ChartStackedByPessoa } from '../components/charts/ChartStackedByPessoa'
import { OrcamentoCard } from '../components/charts/OrcamentoCard'
import { PrevisaoCaixa } from '../components/charts/PrevisaoCaixa'
import { ResumoTotaisCard } from '../components/charts/ResumoTotaisCard'
import type { GlobalFilters } from '../components/Filters'
import { shiftCompetencia } from '../lib/competencia'
import { formatCompetenciaBR } from '../lib/format'
import { lancamentoWeight } from '../lib/rateio'

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
  const [allInv, setAllInv] = useState<InvestimentoMovimentoRow[]>([])
  const [allInvSaldos, setAllInvSaldos] = useState<InvestimentoSaldoRow[]>([])
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
    // Fase 1 (rápida): lists. Após isso já dá pra renderizar charts.
    Promise.all([
      lancamentos.list(),
      receitas.list(),
      investimentosMovimentos.list().catch(() => []),
      investimentosSaldos.list().catch(() => [] as InvestimentoSaldoRow[]),
    ])
      .then(([ls, rs, invs, sals]) => {
        setAllLanc(ls)
        setAllRec(rs)
        setAllInv(invs)
        setAllInvSaldos(sals)
        setLoading(false)
        // Fase 2 (lenta, em background): shares por competência. Não bloqueia
        // o render. Quando completar, dashboard re-renderiza com números
        // precisos (relevante só quando filter pessoa != 'casal').
        const competencias = listMonthsInRange(start, end)
        Promise.all(competencias.map((c) => getShare(c).catch(() => null)))
          .then((sharesArr) => {
            const map: Record<string, ShareData> = {}
            competencias.forEach((c, i) => { if (sharesArr[i]) map[c] = sharesArr[i] as ShareData })
            setShares(map)
          })
      })
      .catch((err: Error) => {
        setError(err.message)
        setLoading(false)
      })
  }

  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [competencia, periodo])

  // -------- agregação --------

  /** Peso aplicado a uma despesa, dado filtro pessoa + toggle rateio. 0 = excluir. */
  /** Peso de uma despesa nas agregações. Aplica filtros tipo/categoria primeiro
   *  (0 = excluído) e depois delega o rateio pessoa+conjuntas pra lib/rateio. */
  function weight(row: LancamentoRow): number {
    if (filters.tipo && row.tipo !== filters.tipo) return 0
    if (filters.categoria && row.categoria !== filters.categoria) return 0
    return lancamentoWeight(row, pessoa, rateio, (c) => shares[c] ?? null)
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

  /** Investimentos no período: aportes (+) - resgates (-). Filtro por titular
   *  quando pessoa específica (titulares 'conjunto' ficam fora se pessoa != casal). */
  const investimentosFiltrados = useMemo(() => {
    return allInv.filter((m) => {
      const c = String(m.data).slice(0, 7)
      if (!inRange(c, start, end)) return false
      if (pessoa !== 'casal' && m.titular !== pessoa) return false
      return true
    })
  }, [allInv, start, end, pessoa])

  /** Saldo atual de investimentos = soma do snapshot mais recente por chave
   *  (titular|instituicao|ativo), filtrado nominalmente por titular conforme
   *  o filtro de pessoa. casal=tudo (inclui conjunto). Bam/Evellyn=apenas
   *  titular igual (NÃO inclui conjunto — esses só aparecem na view casal).
   *  Usado pela view "Patrimônio total" em PrevisaoCaixa. */
  const saldoInvestimentosFiltrado = useMemo(() => {
    const latest = new Map<string, InvestimentoSaldoRow>()
    for (const s of allInvSaldos) {
      if (pessoa !== 'casal' && s.titular !== pessoa) continue
      const k = `${s.titular}|${s.instituicao}|${s.ativo}`
      const cur = latest.get(k)
      if (!cur || (s.data || '').localeCompare(cur.data || '') > 0) latest.set(k, s)
    }
    let total = 0
    for (const s of latest.values()) total += Number(s.valor_saldo) || 0
    return total
  }, [allInvSaldos, pessoa])

  // Totais
  const totalDespesas = despesasFiltradas.reduce((s, x) => s + Number(x.row.valor) * x.w, 0)
  const totalReceitas = receitasFiltradas
    .filter((r) => pessoa === 'casal' || r.pessoa === pessoa)
    .reduce((s, r) => s + Number(r.valor), 0)
  const totalInvestido = investimentosFiltrados.reduce((s, m) => {
    const v = Number(m.valor) || 0
    return s + (m.tipo === 'aporte' ? v : -v)
  }, 0)
  const saldo = totalReceitas - totalDespesas
  const pctInvestidoDespesas = totalDespesas > 0 ? (totalInvestido / totalDespesas) * 100 : 0

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

  // Por mês (bar) — agora com Investimentos
  const porMes = useMemo(() => {
    const map: Record<string, { despesas: number; receitas: number; investimentos: number }> = {}
    for (const m of meses) map[m] = { despesas: 0, receitas: 0, investimentos: 0 }
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
    for (const m of investimentosFiltrados) {
      const k = String(m.data).slice(0, 7)
      if (!map[k]) continue
      const v = Number(m.valor) || 0
      map[k].investimentos += m.tipo === 'aporte' ? v : -v
    }
    return meses.map((m) => ({
      mes: formatCompetenciaBR(m, 'short'),
      Despesas: Math.round(map[m].despesas * 100) / 100,
      Receitas: Math.round(map[m].receitas * 100) / 100,
      Investimentos: Math.round(map[m].investimentos * 100) / 100,
    }))
  }, [despesasFiltradas, receitasFiltradas, investimentosFiltrados, meses, pessoa])

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

  // Despesas por pessoa (bar empilhado por mês) — individuais.dono + share×conjuntas.
  // Ignora filtros tipo/categoria/pessoa pra mostrar SEMPRE a foto Bam vs Evellyn.
  const despesasPorPessoa = useMemo(() => {
    const map: Record<string, { Bam: number; Evellyn: number }> = {}
    for (const m of meses) map[m] = { Bam: 0, Evellyn: 0 }
    for (const r of allLanc) {
      if (!inRange(r.competencia, start, end)) continue
      if (filters.categoria && r.categoria !== filters.categoria) continue
      if (filters.tipo && r.tipo !== filters.tipo) continue
      const k = r.competencia
      if (!map[k]) continue
      const v = Number(r.valor) || 0
      if (r.tipo === 'individual') {
        if (r.dono === 'Bam' || r.dono === 'Evellyn') map[k][r.dono] += v
      } else {
        // conjunto — split pelo share da competência (50/50 se desconhecido)
        const s = shares[r.competencia]
        const shareBam = s ? s.Bam : 0.5
        map[k].Bam += v * shareBam
        map[k].Evellyn += v * (1 - shareBam)
      }
    }
    return meses.map((m) => ({
      mes: formatCompetenciaBR(m, 'short'),
      Bam: Math.round(map[m].Bam * 100) / 100,
      Evellyn: Math.round(map[m].Evellyn * 100) / 100,
    }))
  }, [allLanc, shares, meses, start, end, filters.tipo, filters.categoria])

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Home</h2>
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

      <OrcamentoCard competencia={competencia} lancamentos={allLanc} />

      <PrevisaoCaixa
        competenciaAtual={competencia}
        lancamentos={allLanc}
        receitas={allRec}
        saldoInvestimentos={saldoInvestimentosFiltrado}
        share={shares[competencia] ?? null}
        pessoa={pessoa}
      />

      <ChartMonthlyFlow data={porMes} />
      <ChartCategoryPie data={porCategoria} totalDespesas={totalDespesas} />

      {pessoa === 'casal' && (
        <ChartStackedByPessoa
          title="Despesas por pessoa (rateado pelo share)"
          data={despesasPorPessoa}
          stackId="d"
        />
      )}
      {pessoa === 'casal' && (
        <ChartStackedByPessoa
          title="Receitas por pessoa"
          data={receitasPorPessoa}
          stackId="r"
        />
      )}

      <ResumoTotaisCard
        totalDespesas={totalDespesas}
        totalReceitas={totalReceitas}
        totalInvestido={totalInvestido}
        saldo={saldo}
        pctInvestidoDespesas={pctInvestidoDespesas}
        despesasPorMes={totalDespesas / Math.max(1, meses.length)}
        categoriasAtivas={porCategoria.length}
      />
    </section>
  )
}
