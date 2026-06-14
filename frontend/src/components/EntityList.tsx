import { Fragment, type ReactNode } from 'react'

/**
 * Lista padrão de entidades: estados de loading/erro/vazio + linha clicável
 * (abre edição) com botão de excluir. O conteúdo de cada row é desenhado
 * pelo caller via `renderRow` — tipicamente um `.row-top` e um `.row-meta`.
 *
 * `renderAfterRow` é opcional: se retornar JSX, é renderizado logo depois
 * da linha. Útil pra exibir o form de edição inline (no contexto do registro
 * clicado) em vez de longe no topo da página.
 */
interface Props<T> {
  loading: boolean
  error: string | null
  emptyMsg: string
  items: T[]
  itemKey: (item: T) => string
  renderRow: (item: T) => ReactNode
  renderAfterRow?: (item: T) => ReactNode
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
  renderAfterRow,
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
          <Fragment key={itemKey(item)}>
            <li className="row">
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
            {renderAfterRow?.(item)}
          </Fragment>
        ))}
      </ul>
    </>
  )
}
