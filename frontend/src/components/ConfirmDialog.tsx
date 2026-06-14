import { useEffect } from 'react'

/**
 * Modal de confirmação genérico com N botões. Mais flexível que o `confirm()`
 * nativo (que é binário), útil pra decisões "esta / esta + futuras / cancelar"
 * sobre séries.
 *
 * Esc fecha; click no overlay fecha. Cada opção é um botão; quando clicado,
 * roda `onClick` (caller é responsável por fechar via `onClose`).
 */
export interface DialogOption {
  label: string
  onClick: () => void
  primary?: boolean
  danger?: boolean
}

interface Props {
  open: boolean
  title: string
  message?: React.ReactNode
  options: DialogOption[]
  onClose: () => void
}

export function ConfirmDialog({ open, title, message, options, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">{title}</h3>
        {message && <div className="dialog-message">{message}</div>}
        <div className="dialog-actions">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              className={
                'btn' +
                (opt.primary ? ' btn-primary' : '') +
                (opt.danger ? ' btn-danger' : '')
              }
              onClick={opt.onClick}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
