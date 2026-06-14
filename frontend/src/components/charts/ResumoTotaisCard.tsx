import { formatBRL } from '../../lib/format'

interface Props {
  totalDespesas: number
  totalReceitas: number
  totalInvestido: number
  saldo: number
  pctInvestidoDespesas: number
  despesasPorMes: number
  categoriasAtivas: number
}

/** Card de resumo agregado do período. Pares (label, valor) em 2 colunas. */
export function ResumoTotaisCard({
  totalDespesas, totalReceitas, totalInvestido, saldo,
  pctInvestidoDespesas, despesasPorMes, categoriasAtivas,
}: Props) {
  const pctGasto = totalReceitas > 0 ? ((totalDespesas / totalReceitas) * 100).toFixed(0) : '—'
  return (
    <div className="card resumo" style={{ marginBottom: '1rem' }}>
      <div className="resumo-grid">
        <div>
          <span className="muted">Despesas</span>
          <strong>{formatBRL(totalDespesas)}</strong>
          <span className="muted">Receitas</span>
          <strong>{formatBRL(totalReceitas)}</strong>
          <span className="muted">Investido (líquido)</span>
          <strong className={totalInvestido >= 0 ? 'pos' : 'neg'}>{formatBRL(totalInvestido)}</strong>
          <span className="muted">Saldo</span>
          <strong className={saldo >= 0 ? 'pos' : 'neg'}>{formatBRL(saldo)}</strong>
        </div>
        <div>
          <span className="muted">% gasto da receita</span>
          <strong>{pctGasto}%</strong>
          <span className="muted">Investido / Despesas</span>
          <strong>{totalDespesas > 0 ? `${pctInvestidoDespesas.toFixed(0)}%` : '—'}</strong>
          <span className="muted">Despesas/mês (média)</span>
          <strong>{formatBRL(despesasPorMes)}</strong>
          <span className="muted">Categorias ativas</span>
          <strong>{categoriasAtivas}</strong>
        </div>
      </div>
    </div>
  )
}
