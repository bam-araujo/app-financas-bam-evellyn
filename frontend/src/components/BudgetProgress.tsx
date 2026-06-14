import { formatBRL } from '../lib/format'

/**
 * Barra de progresso por categoria pra orçamento.
 *  - < 80%: verde
 *  - 80% a 100%: amarelo
 *  - > 100%: vermelho
 *
 * Se `limite` é 0, mostra como "sem orçamento" (cinza).
 */
interface Props {
  categoria: string
  gasto: number
  limite: number
  compact?: boolean
}

export function BudgetProgress({ categoria, gasto, limite, compact = false }: Props) {
  const pct = limite > 0 ? Math.min(gasto / limite, 1.5) : 0
  const restante = limite - gasto
  const color =
    limite <= 0 ? 'none' :
    pct > 1 ? 'over' :
    pct >= 0.8 ? 'warn' :
    'ok'

  return (
    <div className={'budget-progress' + (compact ? ' compact' : '')}>
      <div className="budget-row">
        <strong>{categoria}</strong>
        <span className="budget-numbers">
          {formatBRL(gasto)}
          {limite > 0 && (
            <>
              {' / '}
              <span className="muted">{formatBRL(limite)}</span>
            </>
          )}
        </span>
      </div>
      {limite > 0 && (
        <div className="budget-bar">
          <div
            className={`budget-bar-fill budget-${color}`}
            style={{ width: `${Math.min(pct * 100, 100)}%` }}
          />
          {pct > 1 && <div className="budget-bar-over" style={{ width: `${Math.min((pct - 1) * 100, 50)}%` }} />}
        </div>
      )}
      {limite > 0 && (
        <p className="muted-light budget-status">
          {restante >= 0
            ? `Restante: ${formatBRL(restante)} · ${(pct * 100).toFixed(0)}% usado`
            : `Excedeu em ${formatBRL(-restante)} (${(pct * 100).toFixed(0)}%)`}
        </p>
      )}
      {limite <= 0 && (
        <p className="muted-light budget-status">Sem orçamento definido</p>
      )}
    </div>
  )
}
