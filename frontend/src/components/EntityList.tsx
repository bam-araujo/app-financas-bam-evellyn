import type { ReactNode } from 'react'

/**
 * Lista padrão de entidades: estados de loading/erro/vazio + linha clicável
 * (abre edição) com botão de excluir. O conteúdo de cada row é desenhado
 * pelo caller via `renderRow` — tipicamente um `.row-top` e um `.row-meta`.
 */
interface Props<T> {
  loading: boolean
  error: string | null
  emptyMsg: string
  items: T[]
  itemKey: (item: T) => string
  renderRow: (item: T) => ReactNode
  onEdit: (item: T) => void
  onDelete: (item: T) => void
  deleteAriaLabel?: string
}

export function EntityList<T>({
  loading,
  error,
  emptyMsg,
  items,
  itemKey,
  renderRow,
  onEdit,
  onDelete,
  deleteAriaLabel = 'Excluir',
}: Props<T>) {
  return (
    <>
      {loading && <p className="muted">Carregando…</p>}
      {error && <p className="error-msg">Erro: {error}</p>}
      {!loading && !error && items.length === 0 && <p className="empty">{emptyMsg}</p>}

      <ul className="rows">
        {items.map((item) => (
          <li key={itemKey(item)} className="row">
            <button type="button" className="row-main" onClick={() => onEdit(item)}>
              {renderRow(item)}
            </button>
            <button
              type="button"
              className="row-del"
              onClick={() => onDelete(item)}
              aria-label={deleteAriaLabel}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
