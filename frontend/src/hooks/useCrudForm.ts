import { useState, type FormEvent } from 'react'

/**
 * Hook genérico de formulário CRUD: cuida do estado mecânico (abrir/fechar,
 * saving, erro de validação ou de API) e do pipeline do submit. As páginas
 * fornecem `emptyForm`/`validate`/`save` e ficam livres pra desenhar os campos.
 *
 * Forma típica de `save`: decide create vs update lendo `form.id` (ou outra
 * flag da própria página) e devolve uma Promise. Após sucesso, o hook fecha
 * o form e chama `onSaved`. Em erro, mantém o form aberto com `formError`.
 */
export interface UseCrudFormOptions<TForm> {
  emptyForm: () => TForm
  validate: (form: TForm) => string | null
  save: (form: TForm) => Promise<void>
  onSaved?: () => void
}

export interface UseCrudFormResult<TForm> {
  form: TForm
  setForm: (f: TForm) => void
  formOpen: boolean
  saving: boolean
  formError: string | null
  toggleNew: () => void
  openEdit: (formFromRow: TForm) => void
  closeForm: () => void
  submit: (e: FormEvent) => Promise<void>
}

export function useCrudForm<TForm>(opts: UseCrudFormOptions<TForm>): UseCrudFormResult<TForm> {
  const [form, setForm] = useState<TForm>(() => opts.emptyForm())
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function toggleNew() {
    if (formOpen) {
      setFormOpen(false)
      setFormError(null)
      return
    }
    setForm(opts.emptyForm())
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(formFromRow: TForm) {
    setForm(formFromRow)
    setFormError(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setFormError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const err = opts.validate(form)
    if (err) { setFormError(err); return }
    setSaving(true)
    setFormError(null)
    try {
      await opts.save(form)
      setFormOpen(false)
      opts.onSaved?.()
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return { form, setForm, formOpen, saving, formError, toggleNew, openEdit, closeForm, submit }
}
