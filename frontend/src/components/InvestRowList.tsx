import type { ReactNode } from 'react'

/**
 * Lista em card pra Investimentos: card + título com count + .row clicável +
 * delete. É um wrapper específico da página (card+h3+empty-text customizado),
 * por isso não usa o EntityList genérico.
 *
 * Limita render aos primeiros `maxRows` itens (default 30) — a fonte completa
 * fica na planilha; aqui é só preview da home.
 */
interface Props<T> {
  title: string
  items: T[]
  emptyMsg: ReactNode
  itemKey: (item: T) => string
  renderRow: (item: T) => ReactNode
  onEdit: (item: T) => void
  onDelete: (item: T) => void
  maxRows?: number
}

export function InvestRowList<T>({
  title,
  items,
  emptyMsg,
  itemKey,
  renderRow,
  onEdit,
  onDelete,
  maxRows = 30,
}: Props<T>) {
  const visible = items.slice(0, maxRows)
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>{title} ({items.length})</h3>
      {items.length === 0 ? (
        <p className="muted">{emptyMsg}</p>
      ) : (
        <ul className="rows">
          {visible.map((item) => (
            <li key={itemKey(item)} className="row">
              <button type="button" className="row-main" onClick={() => onEdit(item)}>
                {renderRow(item)}
              </button>
              <button type="button" className="row-del" onClick={() => onDelete(item)} aria-label="Excluir">×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
