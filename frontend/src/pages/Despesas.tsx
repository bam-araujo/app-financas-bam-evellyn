import { useEffect, useMemo, useState } from 'react'
import { createSerieParcelado, createSerieRecorrente, lancamentos } from '../api/client'
import type { LancamentoRow, Pessoa } from '../api/types'
import { useCategorias } from '../hooks/useCategorias'
import { formatBRL, formatCompetenciaBR, formatDateBR, parseBRL } from '../lib/format'
import { competenciaFromDate, todayISO } from '../lib/competencia'

interface Props {
  competencia: string
}

type FilterTipo = '' | 'individual' | 'conjunto'
type FilterPessoa = '' | Pessoa

type Repeticao = 'unico' | 'parcelado' | 'recorrente'

const EMPTY_FORM = {
  id: '',
  data: '',
  descricao: '',
  categoria: '',
  valor: '',
  pagador: '' as '' | Pessoa,
  tipo: '' as '' | 'individual' | 'conjunto',
  dono: '' as '' | Pessoa,
  // Só aplicável em CREATE — ignorado no edit.
  repeticao: 'unico' as Repeticao,
  parcelas: 2,
  // Quando editando uma linha de série, mostra info read-only no form.
  edit_serie_tipo: '' as '' | 'parcelado' | 'recorrente',
  edit_parcela_num: 0,
  edit_parcela_total: 0,
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
      repeticao: 'unico',
      parcelas: 2,
      edit_serie_tipo: (r.serie_tipo as '' | 'parcelado' | 'recorrente') || '',
      edit_parcela_num: r.parcela_num || 0,
      edit_parcela_total: r.parcela_total || 0,
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
    if (!form.id && form.repeticao === 'parcelado') {
      if (!form.parcelas || form.parcelas < 2) return 'nº de parcelas deve ser >= 2'
      if (form.parcelas > 60) return 'nº de parcelas muito alto (máx 60)'
    }
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const err = validateForm()
    if (err) { setFormError(err); return }
    setSaving(true)
    setFormError(null)
    try {
      const base = {
        data: form.data,
        descricao: form.descricao.trim(),
        categoria: form.categoria,
        valor: parseBRL(form.valor),
        pagador: form.pagador as Pessoa,
        tipo: form.tipo as 'individual' | 'conjunto',
        dono: (form.tipo === 'individual' ? (form.dono as Pessoa) : '') as Pessoa | '',
      }
      if (form.id) {
        // Edit: sempre uma linha por vez (mesmo se for parcela de série)
        await lancamentos.update(form.id, {
          ...base,
          competencia: competenciaFromDate(form.data),
        })
      } else if (form.repeticao === 'parcelado') {
        await createSerieParcelado(base, form.parcelas)
      } else if (form.repeticao === 'recorrente') {
        await createSerieRecorrente(base)
      } else {
        await lancamentos.create({
          ...base,
          competencia: competenciaFromDate(form.data),
          serie_id: '',
          serie_tipo: '',
          parcela_num: 0,
          parcela_total: 0,
        })
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
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            type="button"
            className="btn"
            onClick={() => { window.location.hash = '#/importar' }}
            title="Importar fatura do cartão (PDF)"
          >
            Importar
          </button>
          <button type="button" className="btn btn-primary" onClick={openNew}>
            + Novo
          </button>
        </div>
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

          {!form.id && (
            <label>
              <span>Repetição</span>
              <div className="seg-group">
                <button
                  type="button"
                  className={'seg' + (form.repeticao === 'unico' ? ' seg-active' : '')}
                  onClick={() => setForm({ ...form, repeticao: 'unico' })}
                >
                  Único
                </button>
                <button
                  type="button"
                  className={'seg' + (form.repeticao === 'parcelado' ? ' seg-active' : '')}
                  onClick={() => setForm({ ...form, repeticao: 'parcelado' })}
                >
                  Parcelado
                </button>
                <button
                  type="button"
                  className={'seg' + (form.repeticao === 'recorrente' ? ' seg-active' : '')}
                  onClick={() => setForm({ ...form, repeticao: 'recorrente' })}
                >
                  Recorrente
                </button>
              </div>
            </label>
          )}

          {!form.id && form.repeticao === 'parcelado' && (
            <label>
              <span>Nº de parcelas (valor digitado = valor de UMA parcela)</span>
              <input
                type="number"
                min={2}
                max={60}
                inputMode="numeric"
                value={form.parcelas}
                onChange={(e) => setForm({ ...form, parcelas: Math.max(2, Math.min(60, Number(e.target.value) || 2)) })}
              />
            </label>
          )}

          {!form.id && form.repeticao === 'recorrente' && (
            <p className="hint">
              Vai criar 24 lançamentos (próximos 24 meses, mesmo dia).
            </p>
          )}

          {form.id && form.edit_serie_tipo && (
            <p className="hint">
              Editando {form.edit_serie_tipo === 'parcelado'
                ? `parcela ${form.edit_parcela_num}/${form.edit_parcela_total}`
                : `mês ${form.edit_parcela_num} de uma recorrência`}.
              Mudanças só afetam essa linha.
            </p>
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
                <strong>
                  {r.descricao}
                  {r.serie_tipo === 'parcelado' && (
                    <span className="badge" title={`Parcela ${r.parcela_num} de ${r.parcela_total}`}>
                      {r.parcela_num}/{r.parcela_total}
                    </span>
                  )}
                  {r.serie_tipo === 'recorrente' && (
                    <span className="badge" title="Lançamento recorrente">↻</span>
                  )}
                </strong>
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
