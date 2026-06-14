import { useEffect, useMemo, useState } from 'react'
import { receitas, type WhoamiData } from '../api/client'
import type { Pessoa, ReceitaRow } from '../api/types'
import { EntityList } from '../components/EntityList'
import type { GlobalFilters } from '../components/Filters'
import { useCrudForm } from '../hooks/useCrudForm'
import { formatBRL, formatCompetenciaBR, parseBRL } from '../lib/format'

interface Props {
  competencia: string
  filters: GlobalFilters
  me: WhoamiData | null
}

const EMPTY_FORM = {
  id: '',
  competencia: '',
  pessoa: '' as '' | Pessoa,
  tipo: 'salario' as 'salario' | 'bonus' | 'promocao' | 'outro',
  origem: '',
  valor: '',
  conta_para_share: true,
}
type FormState = typeof EMPTY_FORM

export function ReceitasPage({ competencia, filters, me }: Props) {
  const [rows, setRows] = useState<ReceitaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function fetchList() {
    setLoading(true)
    setError(null)
    receitas
      .list({ competencia })
      .then((r) => {
        r.sort((a, b) => a.pessoa.localeCompare(b.pessoa, 'pt-BR') || a.origem.localeCompare(b.origem, 'pt-BR'))
        setRows(r)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia])

  const crud = useCrudForm<FormState>({
    // Prefill: competência atual + pessoa = usuário logado.
    emptyForm: () => ({ ...EMPTY_FORM, competencia, pessoa: (me?.nome || '') as '' | Pessoa }),
    validate: (form) => {
      if (!form.competencia || !/^\d{4}-\d{2}$/.test(form.competencia)) return 'competência obrigatória (YYYY-MM)'
      if (!form.pessoa) return 'pessoa obrigatória'
      if (!form.tipo) return 'tipo obrigatório'
      const v = parseBRL(form.valor)
      if (!v || v <= 0) return 'valor inválido'
      return null
    },
    save: async (form) => {
      const payload = {
        competencia: form.competencia,
        pessoa: form.pessoa as Pessoa,
        tipo: form.tipo,
        origem: form.origem.trim(),
        valor: parseBRL(form.valor),
        conta_para_share: form.conta_para_share,
      }
      if (form.id) {
        await receitas.update(form.id, payload)
      } else {
        await receitas.create(payload)
      }
    },
    onSaved: fetchList,
  })
  const { form, setForm, formOpen, saving, formError, toggleNew, openEdit, closeForm, submit } = crud

  const filtered = useMemo(() => {
    if (filters.pessoa === 'casal') return rows
    return rows.filter((r) => r.pessoa === filters.pessoa)
  }, [rows, filters.pessoa])

  function editFromRow(r: ReceitaRow) {
    openEdit({
      id: r.id,
      competencia: r.competencia,
      pessoa: r.pessoa,
      tipo: r.tipo,
      origem: r.origem || '',
      valor: String(r.valor).replace('.', ','),
      conta_para_share: r.conta_para_share,
    })
  }

  async function remove(r: ReceitaRow) {
    if (!confirm('Excluir essa receita?')) return
    try {
      await receitas.remove(r.id)
      fetchList()
    } catch (err) {
      alert('Erro ao excluir: ' + (err as Error).message)
    }
  }

  const total = filtered.reduce((s, r) => s + (Number(r.valor) || 0), 0)
  const totalShare = filtered.filter((r) => r.conta_para_share).reduce((s, r) => s + (Number(r.valor) || 0), 0)

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Receitas — {formatCompetenciaBR(competencia, 'long')}</h2>
          <p className="muted">
            {filtered.length} entrada{filtered.length === 1 ? '' : 's'} · total {formatBRL(total)}{' '}
            <span className="muted-light">(conta pro share {formatBRL(totalShare)})</span>
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={toggleNew}>
          {formOpen ? '× Fechar' : '+ Nova'}
        </button>
      </header>

      {formOpen && (
        <form className="card form" onSubmit={submit}>
          <h3>{form.id ? 'Editar receita' : 'Nova receita'}</h3>

          <label>
            <span>Competência</span>
            <input
              type="month"
              value={form.competencia}
              onChange={(e) => setForm({ ...form, competencia: e.target.value })}
            />
          </label>

          <label>
            <span>Pessoa</span>
            <div className="seg-group">
              {(['Bam', 'Evellyn'] as Pessoa[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={'seg' + (form.pessoa === p ? ' seg-active' : '')}
                  onClick={() => setForm({ ...form, pessoa: p })}
                >
                  {p}
                </button>
              ))}
            </div>
          </label>

          <label>
            <span>Tipo</span>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as FormState['tipo'] })}
            >
              <option value="salario">Salário</option>
              <option value="bonus">Bônus</option>
              <option value="promocao">Promoção</option>
              <option value="outro">Outro</option>
            </select>
          </label>

          <label>
            <span>Origem (empresa, fonte, etc.)</span>
            <input
              type="text"
              value={form.origem}
              maxLength={120}
              onChange={(e) => setForm({ ...form, origem: e.target.value })}
            />
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

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.conta_para_share}
              onChange={(e) => setForm({ ...form, conta_para_share: e.target.checked })}
            />
            <span>Contar para o cálculo de share (rateio)</span>
          </label>

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
        emptyMsg={`Nenhuma receita para ${formatCompetenciaBR(competencia, 'long')}.`}
        items={filtered}
        itemKey={(r) => r.id}
        onEdit={editFromRow}
        onDelete={remove}
        renderRow={(r) => (
          <>
            <div className="row-top">
              <strong>{r.pessoa} · {r.tipo}</strong>
              <span className="row-valor">{formatBRL(Number(r.valor) || 0)}</span>
            </div>
            <div className="row-meta">
              {r.origem && <span>{r.origem} · </span>}
              <span>{r.conta_para_share ? 'conta pro share' : 'fora do share'}</span>
            </div>
          </>
        )}
      />
    </section>
  )
}
