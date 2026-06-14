import { useEffect, useMemo, useState } from 'react'
import {
  createSerieParcelado,
  createSerieRecorrente,
  deleteSerieForward,
  receitas,
  updateSerieForward,
  type WhoamiData,
} from '../api/client'
import type { Pessoa, ReceitaRow } from '../api/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EntityList } from '../components/EntityList'
import type { GlobalFilters } from '../components/Filters'
import { useCrudForm } from '../hooks/useCrudForm'
import { formatBRL, formatCompetenciaBR, parseBRL } from '../lib/format'

interface Props {
  competencia: string
  filters: GlobalFilters
  me: WhoamiData | null
}

type Repeticao = 'unico' | 'parcelado' | 'recorrente'

const EMPTY_FORM = {
  id: '',
  competencia: '',
  pessoa: '' as '' | Pessoa,
  tipo: 'salario' as 'salario' | 'bonus' | 'promocao' | 'outro',
  origem: '',
  valor: '',
  conta_para_share: true,
  // Aplicável em CREATE e em CONVERSÃO via edit.
  repeticao: 'unico' as Repeticao,
  parcelas: 2,
  // Quando editando uma linha de série, guarda info read-only no form.
  edit_serie_tipo: '' as '' | 'parcelado' | 'recorrente',
  edit_parcela_num: 0,
  edit_parcela_total: 0,
}
type FormState = typeof EMPTY_FORM

export function ReceitasPage({ competencia, filters, me }: Props) {
  const [rows, setRows] = useState<ReceitaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dialog imperativo (mesmo padrão de Despesas) — pergunta scope this/forward
  // quando edita/exclui linha de série.
  type DialogChoice<T> = { label: string; value: T; primary?: boolean; danger?: boolean }
  interface DialogState {
    title: string
    message?: React.ReactNode
    options: { label: string; onClick: () => void; primary?: boolean; danger?: boolean }[]
    onClose: () => void
  }
  const [dialogState, setDialogState] = useState<DialogState | null>(null)
  function openDialog<T>(config: { title: string; message?: React.ReactNode; choices: DialogChoice<T>[] }): Promise<T | null> {
    return new Promise((resolve) => {
      const close = () => { setDialogState(null); resolve(null) }
      setDialogState({
        title: config.title,
        message: config.message,
        options: config.choices.map((c) => ({
          label: c.label,
          primary: c.primary,
          danger: c.danger,
          onClick: () => { setDialogState(null); resolve(c.value) },
        })),
        onClose: close,
      })
    })
  }

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
      // Parcelas: validar quando criar OU converter standalone em parcelado.
      const isConverting = form.id && !form.edit_serie_tipo && form.repeticao === 'parcelado'
      if ((!form.id || isConverting) && form.repeticao === 'parcelado') {
        if (!form.parcelas || form.parcelas < 2) return 'nº de parcelas deve ser >= 2'
        if (form.parcelas > 60) return 'nº de parcelas muito alto (máx 60)'
      }
      return null
    },
    save: async (form) => {
      const base = {
        competencia: form.competencia,
        pessoa: form.pessoa as Pessoa,
        tipo: form.tipo,
        origem: form.origem.trim(),
        valor: parseBRL(form.valor),
        conta_para_share: form.conta_para_share,
      }
      if (form.id && form.edit_serie_tipo && form.repeticao === form.edit_serie_tipo) {
        // Edit numa linha de série, mantendo o tipo de série → scope dialog.
        const scope = await openDialog<'this' | 'forward'>({
          title: 'Aplicar mudança a quais receitas?',
          message: (
            <>
              Essa é {form.edit_serie_tipo === 'parcelado'
                ? `a parcela ${form.edit_parcela_num}/${form.edit_parcela_total}`
                : `uma receita recorrente`}. Mudanças em pessoa, tipo, origem,
              valor ou rateio podem ser propagadas pras receitas futuras da série.
            </>
          ),
          choices: [
            { label: 'Esta + todas as futuras', value: 'forward', primary: true },
            { label: 'Só esta linha', value: 'this' },
          ],
        })
        if (scope === null) throw new Error('cancelado')
        await updateSerieForward('receitas', form.id, scope, base)
      } else if (form.id && form.edit_serie_tipo) {
        // CONVERSÃO série → outro tipo (única / outra série).
        const newTypeLabel =
          form.repeticao === 'unico' ? 'receita única'
            : form.repeticao === 'parcelado' ? `parcelada em ${form.parcelas}×`
            : 'recorrente'
        const confirmed = await openDialog<'go'>({
          title: `Converter em ${newTypeLabel}?`,
          message: (
            <>
              Vou apagar esta receita <strong>e as futuras</strong> dessa série,
              e criar uma {newTypeLabel} no lugar. As passadas ficam preservadas.
              Continuar?
            </>
          ),
          choices: [
            { label: 'Sim, converter', value: 'go', primary: true },
          ],
        })
        if (confirmed === null) throw new Error('cancelado')
        await deleteSerieForward('receitas', form.id, 'forward')
        if (form.repeticao === 'unico') {
          await receitas.create({
            ...base,
            serie_id: '',
            serie_tipo: '',
            parcela_num: 0,
            parcela_total: 0,
          })
        } else if (form.repeticao === 'parcelado') {
          await createSerieParcelado('receitas', base, form.parcelas)
        } else {
          await createSerieRecorrente('receitas', base)
        }
      } else if (form.id && form.repeticao !== 'unico') {
        // CONVERSÃO standalone → série (única → parcelada/recorrente).
        const confirmed = await openDialog<'go'>({
          title: 'Converter em ' + (form.repeticao === 'parcelado' ? 'parcelada' : 'recorrente') + '?',
          message: (
            <>
              Vou apagar esta linha e criar uma nova série a partir dela.
              Os dados (pessoa, tipo, origem, valor, rateio) viram base pra
              todas as linhas geradas. Continuar?
            </>
          ),
          choices: [
            { label: 'Sim, converter', value: 'go', primary: true },
          ],
        })
        if (confirmed === null) throw new Error('cancelado')
        await receitas.remove(form.id)
        if (form.repeticao === 'parcelado') {
          await createSerieParcelado('receitas', base, form.parcelas)
        } else {
          await createSerieRecorrente('receitas', base)
        }
      } else if (form.id) {
        // Edit linha standalone, sem conversão.
        await receitas.update(form.id, base)
      } else if (form.repeticao === 'parcelado') {
        await createSerieParcelado('receitas', base, form.parcelas)
      } else if (form.repeticao === 'recorrente') {
        await createSerieRecorrente('receitas', base)
      } else {
        await receitas.create({
          ...base,
          serie_id: '',
          serie_tipo: '',
          parcela_num: 0,
          parcela_total: 0,
        })
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
    // Toggle: clicar de novo na mesma row com form aberto = fecha.
    if (formOpen && form.id === r.id) {
      closeForm()
      return
    }
    openEdit({
      id: r.id,
      competencia: r.competencia,
      pessoa: r.pessoa,
      tipo: r.tipo,
      origem: r.origem || '',
      valor: String(r.valor).replace('.', ','),
      conta_para_share: r.conta_para_share,
      // Pré-seleciona repetição = tipo atual da série. Salvar sem mudar =
      // edit no mesmo tipo (scope dialog). Mudar = conversão.
      repeticao: r.serie_tipo === 'parcelado' ? 'parcelado'
        : r.serie_tipo === 'recorrente' ? 'recorrente'
        : 'unico',
      parcelas: r.parcela_total && r.parcela_total >= 2 ? r.parcela_total : 2,
      edit_serie_tipo: (r.serie_tipo as '' | 'parcelado' | 'recorrente') || '',
      edit_parcela_num: r.parcela_num || 0,
      edit_parcela_total: r.parcela_total || 0,
    })
  }

  async function remove(r: ReceitaRow) {
    if (r.serie_id && r.serie_tipo) {
      const scope = await openDialog<'this' | 'forward'>({
        title: 'Excluir quais receitas?',
        message: (
          <>
            Essa é {r.serie_tipo === 'parcelado'
              ? `a parcela ${r.parcela_num}/${r.parcela_total}`
              : `uma receita recorrente`}. Você pode excluir só esta linha ou
            propagar a exclusão pras futuras da mesma série.
          </>
        ),
        choices: [
          { label: 'Esta + todas as futuras', value: 'forward', danger: true },
          { label: 'Só esta linha', value: 'this', danger: true },
        ],
      })
      if (scope === null) return
      try {
        await deleteSerieForward('receitas', r.id, scope)
        fetchList()
      } catch (err) {
        alert('Erro ao excluir: ' + (err as Error).message)
      }
      return
    }
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

      {/* Form de CRIAÇÃO no topo. Edição inline via renderAfterRow. */}
      {formOpen && !form.id && renderForm()}

      <EntityList
        loading={loading}
        error={error}
        emptyMsg={`Nenhuma receita para ${formatCompetenciaBR(competencia, 'long')}.`}
        items={filtered}
        itemKey={(r) => r.id}
        onEdit={editFromRow}
        onDelete={remove}
        renderAfterRow={(r) => (formOpen && form.id === r.id ? renderForm() : null)}
        renderRow={(r) => (
          <>
            <div className="row-top">
              <strong>
                {r.pessoa} · {r.tipo}
                {r.serie_tipo === 'parcelado' && (
                  <span className="badge" title={`Parcela ${r.parcela_num} de ${r.parcela_total}`}>
                    {r.parcela_num}/{r.parcela_total}
                  </span>
                )}
                {r.serie_tipo === 'recorrente' && (
                  <span className="badge" title="Receita recorrente">↻</span>
                )}
              </strong>
              <span className="row-valor">{formatBRL(Number(r.valor) || 0)}</span>
            </div>
            <div className="row-meta">
              {r.origem && <span>{r.origem} · </span>}
              <span>{r.conta_para_share ? 'conta pro share' : 'fora do share'}</span>
            </div>
          </>
        )}
      />

      <ConfirmDialog
        open={!!dialogState}
        title={dialogState?.title || ''}
        message={dialogState?.message}
        options={dialogState?.options || []}
        onClose={() => dialogState?.onClose()}
      />
    </section>
  )

  function renderForm() {
    return (
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

        <label>
          <span>Repetição</span>
          <div className="seg-group">
            <button
              type="button"
              className={'seg' + (form.repeticao === 'unico' ? ' seg-active' : '')}
              onClick={() => setForm({ ...form, repeticao: 'unico' })}
            >
              Única
            </button>
            <button
              type="button"
              className={'seg' + (form.repeticao === 'parcelado' ? ' seg-active' : '')}
              onClick={() => setForm({ ...form, repeticao: 'parcelado' })}
            >
              Parcelada
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

        {form.repeticao === 'parcelado' && (
          <label>
            <span>Nº de parcelas (valor digitado = valor de UMA parcela)</span>
            <input
              type="number"
              min={2}
              max={60}
              inputMode="numeric"
              value={form.parcelas || ''}
              onChange={(e) => {
                // Permite campo vazio/transient durante edição.
                // Validator no submit garante >= 2. Só clampa o teto aqui.
                const raw = e.target.value
                if (raw === '') { setForm({ ...form, parcelas: 0 }); return }
                const n = Number(raw)
                if (!isFinite(n) || n < 0) return
                setForm({ ...form, parcelas: Math.min(60, n) })
              }}
              onBlur={() => {
                if (!form.parcelas || form.parcelas < 2) setForm({ ...form, parcelas: 2 })
              }}
            />
          </label>
        )}

        {/* Hints contextuais explicando o que vai acontecer ao salvar. */}
        {!form.id && form.repeticao === 'recorrente' && (
          <p className="hint">
            Cria 24 receitas pra começar; conforme o tempo passa, o app
            estende automaticamente pra manter sempre os próximos 12 meses cobertos.
          </p>
        )}

        {form.id && !form.edit_serie_tipo && form.repeticao === 'parcelado' && (
          <p className="hint">
            Vai apagar esta linha e criar {form.parcelas} parcelas mensais
            a partir da competência acima. Valor digitado = valor de UMA parcela.
          </p>
        )}

        {form.id && !form.edit_serie_tipo && form.repeticao === 'recorrente' && (
          <p className="hint">
            Vai apagar esta linha e criar uma série recorrente baseada nela.
            Conforme o tempo passa, o app estende automaticamente.
          </p>
        )}

        {form.id && form.edit_serie_tipo && form.repeticao === form.edit_serie_tipo && (
          <p className="hint">
            Editando {form.edit_serie_tipo === 'parcelado'
              ? `parcela ${form.edit_parcela_num}/${form.edit_parcela_total}`
              : `mês ${form.edit_parcela_num} de uma recorrência`}.
            Ao salvar, você escolhe se a mudança vai só nesta linha ou
            propaga pra todas as futuras.
          </p>
        )}

        {form.id && form.edit_serie_tipo && form.repeticao !== form.edit_serie_tipo && (
          <p className="hint">
            Mudar a repetição vai apagar esta receita e as futuras da
            série, e criar uma nova conforme o tipo escolhido. As passadas
            da série ficam preservadas.
          </p>
        )}

        {formError && <p className="error-msg">{formError}</p>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={closeForm} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    )
  }
}
