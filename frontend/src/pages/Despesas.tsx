import { useEffect, useMemo, useState } from 'react'
import { createSerieParcelado, createSerieRecorrente, getShare, lancamentos, type WhoamiData } from '../api/client'
import type { LancamentoRow, Pessoa, ShareData } from '../api/types'
import { EntityList } from '../components/EntityList'
import type { GlobalFilters } from '../components/Filters'
import { useAutoCategorias } from '../hooks/useAutoCategorias'
import { useCategorias } from '../hooks/useCategorias'
import { useCrudForm } from '../hooks/useCrudForm'
import { competenciaFromDate, todayISO } from '../lib/competencia'
import { formatBRL, formatCompetenciaBR, formatDateBR, parseBRL } from '../lib/format'
import { lancamentoWeight } from '../lib/rateio'

interface Props {
  competencia: string
  filters: GlobalFilters
  me: WhoamiData | null
}

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

export function DespesasPage({ competencia, filters, me }: Props) {
  const [rows, setRows] = useState<LancamentoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [share, setShare] = useState<ShareData | null>(null)

  const cats = useCategorias()
  const despesaCats = useMemo(
    () => cats.data.filter((c) => c.grupo === 'despesa').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [cats.data],
  )
  const autoCat = useAutoCategorias()

  function fetchList() {
    setLoading(true)
    setError(null)
    Promise.all([
      lancamentos.list({ competencia }),
      getShare(competencia).catch(() => null),
    ])
      .then(([r, s]) => {
        r.sort((a, b) => (b.data || '').localeCompare(a.data || '') || a.descricao.localeCompare(b.descricao, 'pt-BR'))
        setRows(r)
        setShare(s)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia])

  const crud = useCrudForm<FormState>({
    // Prefill: data = hoje; pagador = usuário logado (cobre o caso comum
    // "eu tô lançando uma compra que eu mesmo paguei").
    emptyForm: () => ({ ...EMPTY_FORM, data: todayISO(), pagador: (me?.nome || '') as '' | Pessoa }),
    validate: (form) => {
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
    },
    save: async (form) => {
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
        await lancamentos.update(form.id, { ...base, competencia: competenciaFromDate(form.data) })
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
      // Registra mapping pra próximas vezes (não-bloqueante).
      autoCat.record(base.descricao, base.categoria).catch(() => undefined)
    },
    onSaved: fetchList,
  })
  const { form, setForm, formOpen, saving, formError, toggleNew, openEdit, closeForm, submit } = crud

  /** Aplica filtros globais à lista. Lógica:
   *  - tipo: match exato se setado
   *  - pessoa: 'casal' = tudo; pessoa específica = individuais.dono=pessoa + todas conjuntas
   *  - categoria: match exato se setado
   */
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filters.tipo && r.tipo !== filters.tipo) return false
      if (filters.pessoa !== 'casal') {
        if (r.tipo === 'individual' && r.dono !== filters.pessoa) return false
        // conjuntas sempre passam quando pessoa é específica
      }
      if (filters.categoria && r.categoria !== filters.categoria) return false
      return true
    })
  }, [rows, filters])

  /** Peso aplicado à despesa pro cálculo de totais.
   *  Toda página de Despesas opera em uma competência só, então o shareGetter
   *  ignora o argumento e devolve o mesmo share (ou null se ainda não chegou). */
  const weight = (r: LancamentoRow) => lancamentoWeight(r, filters.pessoa, filters.rateio, () => share)

  function editFromRow(r: LancamentoRow) {
    openEdit({
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
  }

  async function remove(r: LancamentoRow) {
    if (!confirm('Excluir esse lançamento?')) return
    try {
      await lancamentos.remove(r.id)
      fetchList()
    } catch (err) {
      alert('Erro ao excluir: ' + (err as Error).message)
    }
  }

  const totalDespesas = filtered.reduce((s, r) => s + (Number(r.valor) || 0) * weight(r), 0)
  const totalConjuntas = filtered
    .filter((r) => r.tipo === 'conjunto')
    .reduce((s, r) => s + (Number(r.valor) || 0) * weight(r), 0)
  const rateadoAtivo = filters.pessoa !== 'casal' && filters.rateio

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Despesas — {formatCompetenciaBR(competencia, 'long')}</h2>
          <p className="muted">
            {filtered.length} lançamento{filtered.length === 1 ? '' : 's'} · total {formatBRL(totalDespesas)}{' '}
            <span className="muted-light">
              {rateadoAtivo
                ? `(rateado por ${filters.pessoa})`
                : `(conjuntas ${formatBRL(totalConjuntas)})`}
            </span>
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
          <button type="button" className="btn btn-primary" onClick={toggleNew}>
            {formOpen ? '× Fechar' : '+ Novo'}
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
              onChange={(e) => {
                const v = e.target.value
                // Auto-sugere categoria quando ainda não há uma. Só sugere
                // se o user está digitando algo razoável (>= 4 chars).
                const suggestion = !form.categoria && v.trim().length >= 4
                  ? autoCat.suggest(v)
                  : ''
                setForm({ ...form, descricao: v, categoria: suggestion || form.categoria })
              }}
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

      <EntityList
        loading={loading}
        error={error}
        emptyMsg={`Nenhum lançamento para ${formatCompetenciaBR(competencia, 'long')}.`}
        items={filtered}
        itemKey={(r) => r.id}
        onEdit={editFromRow}
        onDelete={remove}
        renderRow={(r) => (
          <>
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
          </>
        )}
      />
    </section>
  )
}
