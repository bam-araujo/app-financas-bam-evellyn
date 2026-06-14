import { useEffect, useMemo, useState } from 'react'
import { investimentosMovimentos, investimentosSaldos } from '../api/client'
import type { InvestimentoMovimentoRow, InvestimentoSaldoRow, Titular } from '../api/types'
import { EvolucaoPatrimonio } from '../components/charts/EvolucaoPatrimonio'
import type { GlobalFilters } from '../components/Filters'
import { InvestRowList } from '../components/InvestRowList'
import { useCrudForm } from '../hooks/useCrudForm'
import { useInvestimentoInsights } from '../hooks/useInvestimentoInsights'
import { todayISO } from '../lib/competencia'
import { formatBRL, formatDateBR, parseBRL } from '../lib/format'

interface Props {
  filters: GlobalFilters
}

const TITULARES_OPTIONS: Titular[] = ['Bam', 'Evellyn', 'conjunto']

const EMPTY_SALDO = {
  id: '',
  data: '',
  titular: 'Bam' as Titular,
  instituicao: '',
  ativo: '',
  valor: '',
}
const EMPTY_MOV = {
  id: '',
  data: '',
  titular: 'Bam' as Titular,
  instituicao: '',
  ativo: '',
  tipo: 'aporte' as 'aporte' | 'resgate',
  valor: '',
}
type FormSaldo = typeof EMPTY_SALDO
type FormMov = typeof EMPTY_MOV

export function InvestimentosPage({ filters }: Props) {
  const [saldos, setSaldos] = useState<InvestimentoSaldoRow[]>([])
  const [movs, setMovs] = useState<InvestimentoMovimentoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Período pra análise — últimos 12 meses (rolling)
  const fimAnalise = todayISO()
  const inicioAnalise = useMemo(() => {
    const d = new Date(fimAnalise)
    d.setFullYear(d.getFullYear() - 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }, [fimAnalise])

  function fetchAll() {
    setLoading(true)
    setError(null)
    Promise.all([investimentosSaldos.list(), investimentosMovimentos.list()])
      .then(([s, m]) => { setSaldos(s); setMovs(m) })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchAll() }, [])

  // Filtra por titular global. 'casal' = mostra tudo.
  const titularFilter: Titular | null = filters.pessoa === 'casal' ? null : (filters.pessoa as Titular)
  const saldosF = useMemo(() => titularFilter ? saldos.filter((s) => s.titular === titularFilter) : saldos, [saldos, titularFilter])
  const movsF = useMemo(() => titularFilter ? movs.filter((m) => m.titular === titularFilter) : movs, [movs, titularFilter])

  const { patrimonioAtual, analise, evolucao } = useInvestimentoInsights(saldosF, movsF, inicioAnalise, fimAnalise)

  const presetTitular: Titular = filters.pessoa === 'casal' ? 'Bam' : (filters.pessoa as Titular)

  const saldoForm = useCrudForm<FormSaldo>({
    emptyForm: () => ({ ...EMPTY_SALDO, data: todayISO(), titular: presetTitular }),
    validate: (f) => {
      if (!f.data || !f.titular || !f.instituicao.trim() || !f.ativo.trim()) {
        return 'preencha data, titular, instituição e ativo'
      }
      const v = parseBRL(f.valor)
      if (!v || v < 0) return 'valor inválido'
      return null
    },
    save: async (f) => {
      const payload = {
        data: f.data, titular: f.titular,
        instituicao: f.instituicao.trim(), ativo: f.ativo.trim(),
        valor_saldo: parseBRL(f.valor),
      }
      if (f.id) await investimentosSaldos.update(f.id, payload)
      else await investimentosSaldos.create(payload)
    },
    onSaved: fetchAll,
  })

  const movForm = useCrudForm<FormMov>({
    emptyForm: () => ({ ...EMPTY_MOV, data: todayISO(), titular: presetTitular }),
    validate: (f) => {
      if (!f.data || !f.titular || !f.instituicao.trim() || !f.ativo.trim()) {
        return 'preencha data, titular, instituição e ativo'
      }
      const v = parseBRL(f.valor)
      if (!v || v <= 0) return 'valor inválido'
      return null
    },
    save: async (f) => {
      const payload = {
        data: f.data, titular: f.titular,
        instituicao: f.instituicao.trim(), ativo: f.ativo.trim(),
        tipo: f.tipo, valor: parseBRL(f.valor),
      }
      if (f.id) await investimentosMovimentos.update(f.id, payload)
      else await investimentosMovimentos.create(payload)
    },
    onSaved: fetchAll,
  })

  // Abrir um form fecha o outro (UX: cabem só um na tela por vez).
  function toggleNewSaldo() {
    if (movForm.formOpen) movForm.closeForm()
    saldoForm.toggleNew()
  }
  function toggleNewMov() {
    if (saldoForm.formOpen) saldoForm.closeForm()
    movForm.toggleNew()
  }
  function editSaldoFromRow(s: InvestimentoSaldoRow) {
    if (movForm.formOpen) movForm.closeForm()
    saldoForm.openEdit({
      id: s.id, data: s.data, titular: s.titular,
      instituicao: s.instituicao, ativo: s.ativo,
      valor: String(s.valor_saldo).replace('.', ','),
    })
  }
  function editMovFromRow(m: InvestimentoMovimentoRow) {
    if (saldoForm.formOpen) saldoForm.closeForm()
    movForm.openEdit({
      id: m.id, data: m.data, titular: m.titular,
      instituicao: m.instituicao, ativo: m.ativo,
      tipo: m.tipo, valor: String(m.valor).replace('.', ','),
    })
  }

  async function deleteSaldo(s: InvestimentoSaldoRow) {
    if (!confirm('Excluir esse snapshot de saldo?')) return
    try { await investimentosSaldos.remove(s.id); fetchAll() }
    catch (err) { alert('Erro: ' + (err as Error).message) }
  }
  async function deleteMov(m: InvestimentoMovimentoRow) {
    if (!confirm('Excluir esse movimento?')) return
    try { await investimentosMovimentos.remove(m.id); fetchAll() }
    catch (err) { alert('Erro: ' + (err as Error).message) }
  }

  const saldosOrdenados = useMemo(
    () => [...saldosF].sort((a, b) => (b.data || '').localeCompare(a.data || '')),
    [saldosF],
  )
  const movsOrdenados = useMemo(
    () => [...movsF].sort((a, b) => (b.data || '').localeCompare(a.data || '')),
    [movsF],
  )

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Investimentos</h2>
          <p className="muted">
            {filters.pessoa === 'casal' ? 'visão consolidada' : `titular ${filters.pessoa}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            type="button"
            className={'btn' + (movForm.formOpen ? ' btn-active' : '')}
            onClick={toggleNewMov}
          >
            {movForm.formOpen ? '× Fechar' : '+ Aporte/Resgate'}
          </button>
          <button
            type="button"
            className={'btn btn-primary' + (saldoForm.formOpen ? ' btn-active' : '')}
            onClick={toggleNewSaldo}
          >
            {saldoForm.formOpen ? '× Fechar' : '+ Saldo'}
          </button>
        </div>
      </header>

      {loading && <p className="muted">Carregando…</p>}
      {error && <p className="error-msg">Erro: {error}</p>}

      {saldoForm.formOpen && (
        <FormSaldoComponent
          form={saldoForm.form} setForm={saldoForm.setForm}
          saving={saldoForm.saving} formError={saldoForm.formError}
          onSubmit={saldoForm.submit} onCancel={saldoForm.closeForm}
        />
      )}
      {movForm.formOpen && (
        <FormMovComponent
          form={movForm.form} setForm={movForm.setForm}
          saving={movForm.saving} formError={movForm.formError}
          onSubmit={movForm.submit} onCancel={movForm.closeForm}
        />
      )}

      <div className="card resumo" style={{ marginBottom: '1rem' }}>
        <p className="muted" style={{ marginTop: 0 }}>
          Análise dos últimos 12 meses ({formatDateBR(inicioAnalise)} → {formatDateBR(fimAnalise)})
        </p>
        <div className="resumo-grid">
          <div>
            <span className="muted">Patrimônio atual</span>
            <strong>{formatBRL(patrimonioAtual.total)}</strong>
            <span className="muted">Saldo no início</span>
            <strong>{formatBRL(analise.saldoInicial)}</strong>
            <span className="muted">Aportes</span>
            <strong>{formatBRL(analise.aportes)}</strong>
            <span className="muted">Resgates</span>
            <strong>{formatBRL(analise.resgates)}</strong>
          </div>
          <div>
            <span className="muted">Rendimento</span>
            <strong className={analise.rendimento >= 0 ? 'pos' : 'neg'}>{formatBRL(analise.rendimento)}</strong>
            <span className="muted">Rentabilidade aprox.</span>
            <strong className={(analise.rentPct ?? 0) >= 0 ? 'pos' : 'neg'}>
              {analise.rentPct == null ? '—' : `${analise.rentPct.toFixed(1)}%`}
            </strong>
            <span className="muted">Ativos rastreados</span>
            <strong>{patrimonioAtual.ativos}</strong>
          </div>
        </div>
        <p className="muted-light" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
          rendimento = saldo_final − saldo_inicial − aportes + resgates (rentabilidade é aproximação, não TIR)
        </p>
      </div>

      <EvolucaoPatrimonio data={evolucao.data} titulares={evolucao.titulares} />

      <InvestRowList
        title="Saldos"
        items={saldosOrdenados}
        emptyMsg={<>Nenhum snapshot cadastrado ainda. Use <strong>+ Saldo</strong> pra começar.</>}
        itemKey={(s) => s.id}
        onEdit={editSaldoFromRow}
        onDelete={deleteSaldo}
        renderRow={(s) => (
          <>
            <div className="row-top">
              <strong>{s.ativo} <span className="muted-light">· {s.instituicao}</span></strong>
              <span className="row-valor">{formatBRL(Number(s.valor_saldo) || 0)}</span>
            </div>
            <div className="row-meta">
              <span>{formatDateBR(s.data)}</span>
              <span>· {s.titular}</span>
            </div>
          </>
        )}
      />

      <InvestRowList
        title="Aportes & resgates"
        items={movsOrdenados}
        emptyMsg="Nenhum aporte/resgate cadastrado."
        itemKey={(m) => m.id}
        onEdit={editMovFromRow}
        onDelete={deleteMov}
        renderRow={(m) => (
          <>
            <div className="row-top">
              <strong>
                {m.tipo === 'aporte' ? '↑ Aporte' : '↓ Resgate'} — {m.ativo}
                <span className="muted-light"> · {m.instituicao}</span>
              </strong>
              <span className={'row-valor ' + (m.tipo === 'aporte' ? 'pos' : 'neg')}>
                {m.tipo === 'aporte' ? '+' : '−'}{formatBRL(Number(m.valor) || 0)}
              </span>
            </div>
            <div className="row-meta">
              <span>{formatDateBR(m.data)}</span>
              <span>· {m.titular}</span>
            </div>
          </>
        )}
      />
    </section>
  )
}

// --- Sub-componentes dos forms ---

interface FormSaldoCompProps {
  form: FormSaldo
  setForm: (f: FormSaldo) => void
  saving: boolean
  formError: string | null
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
}
function FormSaldoComponent({ form, setForm, saving, formError, onSubmit, onCancel }: FormSaldoCompProps) {
  return (
    <form className="card form" onSubmit={onSubmit}>
      <h3>{form.id ? 'Editar saldo' : 'Novo snapshot de saldo'}</h3>
      <label>
        <span>Data</span>
        <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
      </label>
      <label>
        <span>Titular</span>
        <div className="seg-group">
          {TITULARES_OPTIONS.map((t) => (
            <button key={t} type="button"
              className={'seg' + (form.titular === t ? ' seg-active' : '')}
              onClick={() => setForm({ ...form, titular: t })}
            >{t}</button>
          ))}
        </div>
      </label>
      <label>
        <span>Instituição</span>
        <input type="text" value={form.instituicao} placeholder="Itaú, NuInvest, XP, ..."
          onChange={(e) => setForm({ ...form, instituicao: e.target.value })} />
      </label>
      <label>
        <span>Ativo</span>
        <input type="text" value={form.ativo} placeholder="Tesouro Selic 2029, CDB, FII XYZ, ..."
          onChange={(e) => setForm({ ...form, ativo: e.target.value })} />
      </label>
      <label>
        <span>Valor do saldo nessa data</span>
        <input type="text" inputMode="decimal" placeholder="0,00" value={form.valor}
          onChange={(e) => setForm({ ...form, valor: e.target.value })} />
      </label>
      {formError && <p className="error-msg">{formError}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  )
}

interface FormMovCompProps {
  form: FormMov
  setForm: (f: FormMov) => void
  saving: boolean
  formError: string | null
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
}
function FormMovComponent({ form, setForm, saving, formError, onSubmit, onCancel }: FormMovCompProps) {
  return (
    <form className="card form" onSubmit={onSubmit}>
      <h3>{form.id ? 'Editar movimento' : 'Novo aporte/resgate'}</h3>
      <label>
        <span>Data</span>
        <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
      </label>
      <label>
        <span>Titular</span>
        <div className="seg-group">
          {TITULARES_OPTIONS.map((t) => (
            <button key={t} type="button"
              className={'seg' + (form.titular === t ? ' seg-active' : '')}
              onClick={() => setForm({ ...form, titular: t })}
            >{t}</button>
          ))}
        </div>
      </label>
      <label>
        <span>Tipo</span>
        <div className="seg-group">
          <button type="button" className={'seg' + (form.tipo === 'aporte' ? ' seg-active' : '')}
            onClick={() => setForm({ ...form, tipo: 'aporte' })}>Aporte</button>
          <button type="button" className={'seg' + (form.tipo === 'resgate' ? ' seg-active' : '')}
            onClick={() => setForm({ ...form, tipo: 'resgate' })}>Resgate</button>
        </div>
      </label>
      <label>
        <span>Instituição</span>
        <input type="text" value={form.instituicao}
          onChange={(e) => setForm({ ...form, instituicao: e.target.value })} />
      </label>
      <label>
        <span>Ativo</span>
        <input type="text" value={form.ativo}
          onChange={(e) => setForm({ ...form, ativo: e.target.value })} />
      </label>
      <label>
        <span>Valor</span>
        <input type="text" inputMode="decimal" placeholder="0,00" value={form.valor}
          onChange={(e) => setForm({ ...form, valor: e.target.value })} />
      </label>
      {formError && <p className="error-msg">{formError}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  )
}
