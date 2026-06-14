import { useEffect, useMemo, useState } from 'react'
import { lancamentos as lancamentosApi, orcamento as orcamentoApi } from '../../api/client'
import type { LancamentoRow, OrcamentoRow } from '../../api/types'
import { formatCompetenciaBR } from '../../lib/format'
import { BudgetProgress } from '../BudgetProgress'

/**
 * Card de orçamento no Dashboard. Mostra as top categorias da competência
 * atual com barra de progresso. Faz fetch próprio pra não acoplar com o
 * pacote pesado do DashboardPage (que opera em range histórico).
 */
interface Props {
  competencia: string
  topN?: number
}

export function OrcamentoCard({ competencia, topN = 6 }: Props) {
  const [orcs, setOrcs] = useState<OrcamentoRow[]>([])
  const [lancs, setLancs] = useState<LancamentoRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      orcamentoApi.list({ competencia }),
      lancamentosApi.list({ competencia }),
    ])
      .then(([os, ls]) => { setOrcs(os); setLancs(ls) })
      .catch(() => { setOrcs([]); setLancs([]) })
      .finally(() => setLoading(false))
  }, [competencia])

  const items = useMemo(() => {
    const gastos = new Map<string, number>()
    for (const l of lancs) {
      const c = String(l.categoria || '')
      if (!c) continue
      gastos.set(c, (gastos.get(c) || 0) + (Number(l.valor) || 0))
    }
    // Mostra todas as categorias com orçamento; ordena por % usado (descendente).
    const rows = orcs.map((o) => {
      const gasto = gastos.get(o.categoria) || 0
      const limite = Number(o.limite) || 0
      return { categoria: o.categoria, gasto, limite, pct: limite > 0 ? gasto / limite : 0 }
    })
    rows.sort((a, b) => b.pct - a.pct)
    return rows.slice(0, topN)
  }, [orcs, lancs, topN])

  if (loading) return null
  if (orcs.length === 0) {
    return (
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Orçamento — {formatCompetenciaBR(competencia, 'long')}</h3>
        <p className="muted">
          Sem orçamento definido. Defina limites em <a href="#/orcamento">Orçamento</a> pra acompanhar o progresso aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>Orçamento — {formatCompetenciaBR(competencia, 'long')}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {items.map((it) => (
          <BudgetProgress
            key={it.categoria}
            categoria={it.categoria}
            gasto={it.gasto}
            limite={it.limite}
            compact
          />
        ))}
      </div>
      {orcs.length > topN && (
        <p className="muted-light" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
          mostrando top {topN} · veja todos em <a href="#/orcamento">Orçamento</a>
        </p>
      )}
    </div>
  )
}
