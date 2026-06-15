import { useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'

/**
 * Hook genérico de diálogo modal Promise-based. Substitui o `window.confirm()`
 * binário por um modal com N opções, ideal pra decisões "esta linha / esta +
 * futuras / cancelar" que aparecem ao editar ou excluir item de série.
 *
 * Uso típico:
 *   const { dialog, openDialog } = useDialog()
 *   ...
 *   const scope = await openDialog<'this' | 'forward'>({
 *     title: 'Aplicar a quais lançamentos?',
 *     message: <>Esta é parcela 3/12...</>,
 *     choices: [
 *       { label: 'Esta + futuras', value: 'forward', primary: true },
 *       { label: 'Só esta', value: 'this' },
 *     ],
 *   })
 *   if (scope === null) throw new Error('cancelado')  // Esc / overlay fechou
 *   ...
 *
 *   return (<>{...UI...} {dialog}</>)
 *
 * Antes esse wrapper estava duplicado dentro de Despesas.tsx e Receitas.tsx.
 * Centralizar aqui reduz ~30 linhas/página e garante comportamento idêntico.
 */
export interface DialogChoice<T> {
  label: string
  value: T
  primary?: boolean
  danger?: boolean
}

interface DialogState {
  title: string
  message?: ReactNode
  options: { label: string; onClick: () => void; primary?: boolean; danger?: boolean }[]
  onClose: () => void
}

export interface UseDialogResult {
  /** Elemento JSX a ser renderizado uma vez na página (renderiza nada se fechado). */
  dialog: ReactNode
  /** Abre o diálogo. Promise resolve com o `value` da escolha clicada, ou
   *  `null` se fechou via Esc/overlay (cancelar). */
  openDialog: <T>(config: { title: string; message?: ReactNode; choices: DialogChoice<T>[] }) => Promise<T | null>
}

export function useDialog(): UseDialogResult {
  const [state, setState] = useState<DialogState | null>(null)

  function openDialog<T>(config: { title: string; message?: ReactNode; choices: DialogChoice<T>[] }): Promise<T | null> {
    return new Promise((resolve) => {
      const close = () => { setState(null); resolve(null) }
      setState({
        title: config.title,
        message: config.message,
        options: config.choices.map((c) => ({
          label: c.label,
          primary: c.primary,
          danger: c.danger,
          onClick: () => { setState(null); resolve(c.value) },
        })),
        onClose: close,
      })
    })
  }

  const dialog = (
    <ConfirmDialog
      open={!!state}
      title={state?.title || ''}
      message={state?.message}
      options={state?.options || []}
      onClose={() => state?.onClose()}
    />
  )

  return { dialog, openDialog }
}
