import { useEffect, useMemo, useState } from 'react'
import { lancamentos } from '../api/client'
import type { LancamentoRow, Pessoa } from '../api/types'
import { useCategorias } from '../hooks/useCategorias'
import { formatBRL, formatCompetenciaBR, formatDateBR, parseBRL } from '../lib/format'
import { competenciaFromDate, todayISO } from '../lib/competencia'

interface Props {
  competencia: string
}

type FilterTipo = '' | 'individual' | 'conjunto'
type FilterPessoa = '' | Pessoa

const EMPTY_FORM = {
  id: '',
  data: '',
  descricao: '',
  categoria: '',
  valor: '',
  pagador: '' as '' | Pessoa,
  tipo: '' as '' | 'individual' | 'conjunto',
  dono: '' as '' | Pessoa,
}
type FormState = typeof EMPTY_FORM

export function DespesasPage({ competencia }: Props) {
  const [rows, setRows] = useState<LancamentoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterTipo, setFilterTipo] = useState<FilterTipo>('')
  const [filterPessoa, setFilterPessoa] = useState<FilterPessoa>('')
  const [filterCategoria, setFilterCategoria] = useState<string>('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, data: todayISO() })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const cats = useCategorias()
  const despesaCats = useMemo(
    () => cats.data.filter((c) => c.grupo === 'despesa').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [cats.data],
  )

  function fetchList() {
    setLoading(true)
    setError(null)
    lancamentos
      .list({ competencia })
      .then((r) => {
        // Ordenação local por data desc (mais novo primeiro), tie-break por descricao
        r.sort((a, b) => (b.data || '').localeCompare(a.data || '') || a.descricao.localeCompare(b.descricao, 'pt-BR'))
        setRows(r)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterTipo && r.tipo !== filterTipo) return false
      if (filterPessoa) {
        if (r.tipo === 'individual') {
          if (r.dono !== filterPessoa) return false
        } else {
          // Conjunto: aplica filtro de pessoa = pagador
          if (r.pagador !== filterPessoa) return false
        }
      }
      if (filterCategoria && r.categoria !== filterCategoria) return false
      return true
    })
  }, [rows, filterTipo, filterPessoa, filterCategoria])

  function openNew() {
    setForm({ ...EMPTY_FORM, data: todayISO() })
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(r: LancamentoRow) {
    setForm({
      id: r.id,
      data: r.data,
      descricao: r.descricao,
      categoria: r.categoria,
      valor: String(r.valor).replace('.', ','),
      pagador: r.pagador,
      tipo: r.tipo,
      dono: r.dono || '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setFormError(null)
  }

  function validateForm(): string | null {
    if (!form.data) return 'data obrigatória'
    if (!form.descricao.trim()) return 'descrição obrigatória'
    if (!form.categoria) return 'categoria obrigatória'
    const v = parseBRL(form.valor)
    if (!v || v <= 0) return 'valor inválido'
    if (!form.pagador) return 'pagador obrigatório'
    if (!form.tipo) return 'tipo obrigatório'
    if (form.tipo === 'individual' && !form.dono) return 'dono obrigatório quando tipo=individual'
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const err = validateForm()
    if (err) { setFormError(err); return }
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        data: form.data,
        competencia: competenciaFromDate(form.data),
        descricao: form.descricao.trim(),
        categoria: form.categoria,
        valor: parseBRL(form.valor),
        pagador: form.pagador as Pessoa,
        tipo: form.tipo as 'individual' | 'conjunto',
        dono: (form.tipo === 'individual' ? (form.dono as Pessoa) : '') as Pessoa | '',
      }
      if (form.id) {
        await lancamentos.update(form.id, payload)
      } else {
        await lancamentos.create(payload)
      }
      closeForm()
      fetchList()
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Excluir esse lançamento?')) return
    try {
      await lancamentos.remove(id)
      fetchList()
    } catch (err) {
      alert('Erro ao excluir: ' + (err as Error).message)
    }
  }

  const totalDespesas = filtered.reduce((s, r) => s + (Number(r.valor) || 0), 0)
  const totalConjuntas = filtered.filter((r) => r.tipo === 'conjunto').reduce((s, r) => s + (Number(r.valor) || 0), 0)

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Despesas — {formatCompetenciaBR(competencia, 'long')}</h2>
          <p className="muted">
            {filtered.length} lançamento{filtered.length === 1 ? '' : 's'} · total {formatBRL(totalDespesas)}{' '}
            <span className="muted-light">(conjuntas {formatBRL(totalConjuntas)})</span>
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openNew}>
          + Novo
        </button>
      </header>

      {formOpen && (
        <form className="card form" onSubmit={submit}>
          <h3>{form.id ? 'Editar despesa' : 'Nova despesa'}</h3>

          <label>
            <span>Data</span>
            <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
          </label>

          <label>
            <span>Descrição</span>
            <input
              type="text"
              value={form.descricao}
              maxLength={120}
              placeholder="Mercado, Uber, etc."
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </label>

          <label>
            <span>Categoria</span>
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              <option value="">— escolher —</option>
              {despesaCats.map((c) => (
                <option key={c.id} value={c.nome}>{c.nome}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Valor</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
            />
          </label>

          <label>
            <span>Pagador (quem pagou)</span>
            <div className="seg-group">
              {(['Bam', 'Evellyn'] as Pessoa[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={'seg' + (form.pagador === p ? ' seg-active' : '')}
                  onClick={() => setForm({ ...form, pagador: p })}
                >
                  {p}
                </button>
              ))}
            </div>
          </label>

          <label>
            <span>Tipo</span>
            <div className="seg-group">
              <button
                type="button"
                className={'seg' + (form.tipo === 'conjunto' ? ' seg-active' : '')}
                onClick={() => setForm({ ...form, tipo: 'conjunto', dono: '' })}
              >
                Conjunta (vai pro rateio)
              </button>
              <button
                type="button"
                className={'seg' + (form.tipo === 'individual' ? ' seg-active' : '')}
                onClick={() => setForm({ ...form, tipo: 'individual' })}
              >
                Individual
              </button>
            </div>
          </label>

          {form.tipo === 'individual' && (
            <label>
              <span>Dono (de quem é a despesa)</span>
              <div className="seg-group">
                {(['Bam', 'Evellyn'] as Pessoa[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={'seg' + (form.dono === p ? ' seg-active' : '')}
                    onClick={() => setForm({ ...form, dono: p })}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </label>
          )}

          {formError && <p className="error-msg">{formError}</p>}

          <div className="form-actions">
            <button type="button" className="btn" onClick={closeForm} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </form>
      )}

      <details className="filters" open>
        <summary>Filtros</summary>
        <div className="filters-body">
          <label>
            <span>Tipo</span>
            <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value as FilterTipo)}>
              <option value="">Todos</option>
              <option value="conjunto">Só conjuntas</option>
              <option value="individual">Só individuais</option>
            </select>
          </label>
          <label>
            <span>Pessoa</span>
            <select value={filterPessoa} onChange={(e) => setFilterPessoa(e.target.value as FilterPessoa)}>
              <option value="">Todas</option>
              <option value="Bam">Bam</option>
              <option value="Evellyn">Evellyn</option>
            </select>
          </label>
          <label>
            <span>Categoria</span>
            <select value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)}>
              <option value="">Todas</option>
              {despesaCats.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            </select>
          </label>
        </div>
      </details>

      {loading && <p className="muted">Carregando…</p>}
      {error && <p className="error-msg">Erro: {error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="empty">Nenhum lançamento para {formatCompetenciaBR(competencia, 'long')}.</p>
      )}

      <ul className="rows">
        {filtered.map((r) => (
          <li key={r.id} className="row">
            <button type="button" className="row-main" onClick={() => openEdit(r)}>
              <div className="row-top">
                <strong>{r.descricao}</strong>
                <span className="row-valor">{formatBRL(Number(r.valor) || 0)}</span>
              </div>
              <div className="row-meta">
                <span>{formatDateBR(r.data)}</span>
                <span>· {r.categoria}</span>
                <span>· {r.tipo === 'conjunto' ? 'conjunta' : `${r.dono}`}</span>
                <span>· pagou {r.pagador}</span>
              </div>
            </button>
            <button type="button" className="row-del" onClick={() => remove(r.id)} aria-label="Excluir">×</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
