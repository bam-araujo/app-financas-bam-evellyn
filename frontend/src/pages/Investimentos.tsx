import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { investimentosMovimentos, investimentosSaldos } from '../api/client'
import type { InvestimentoMovimentoRow, InvestimentoSaldoRow, Titular } from '../api/types'
import type { GlobalFilters } from '../components/Filters'
import { COLOR_BAM, COLOR_EVELLYN } from '../lib/colors'
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

const COLOR_CONJUNTO = '#10b981'
const colorPara = (t: Titular): string => t === 'Bam' ? COLOR_BAM : t === 'Evellyn' ? COLOR_EVELLYN : COLOR_CONJUNTO

// --- Sub-componentes dos forms (extraídos pra poder render no topo) ---

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

export function InvestimentosPage({ filters }: Props) {
  const [saldos, setSaldos] = useState<InvestimentoSaldoRow[]>([])
  const [movs, setMovs] = useState<InvestimentoMovimentoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formSaldoOpen, setFormSaldoOpen] = useState(false)
  const [formSaldo, setFormSaldo] = useState<FormSaldo>({ ...EMPTY_SALDO, data: todayISO() })
  const [formMovOpen, setFormMovOpen] = useState(false)
  const [formMov, setFormMov] = useState<FormMov>({ ...EMPTY_MOV, data: todayISO() })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Período pra análise — últimos 12 meses (rolling)
  const fimAnalise = todayISO()
  const inicioAnalise = (() => {
    const d = new Date(fimAnalise)
    d.setFullYear(d.getFullYear() - 1)
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  })()

  function fetchAll() {
    setLoading(true)
    setError(null)
    Promise.all([investimentosSaldos.list(), investimentosMovimentos.list()])
      .then(([s, m]) => {
        setSaldos(s)
        setMovs(m)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchAll() }, [])

  // Filtra por titular global (pessoa). 'casal' = mostra tudo (Bam + Evellyn + conjunto).
  const titularFilter: Titular | null = filters.pessoa === 'casal' ? null : (filters.pessoa as Titular)
  const saldosF = useMemo(() => titularFilter ? saldos.filter((s) => s.titular === titularFilter) : saldos, [saldos, titularFilter])
  const movsF = useMemo(() => titularFilter ? movs.filter((m) => m.titular === titularFilter) : movs, [movs, titularFilter])

  // Patrimônio atual = soma do saldo mais recente por (titular, instituicao, ativo)
  const patrimonioAtual = useMemo(() => {
    const latest = new Map<string, InvestimentoSaldoRow>()
    for (const s of saldosF) {
      const k = `${s.titular}|${s.instituicao}|${s.ativo}`
      const cur = latest.get(k)
      if (!cur || (s.data || '').localeCompare(cur.data || '') > 0) latest.set(k, s)
    }
    let total = 0
    for (const s of latest.values()) total += Number(s.valor_saldo) || 0
    return { total, ativos: latest.size }
  }, [saldosF])

  // Análise no período (últimos 12 meses)
  const analise = useMemo(() => {
    // saldo inicial = soma do saldo mais recente ANTES de inicioAnalise por (titular,inst,ativo)
    const saldoInicialMap = new Map<string, InvestimentoSaldoRow>()
    const saldoFinalMap = new Map<string, InvestimentoSaldoRow>()
    for (const s of saldosF) {
      const k = `${s.titular}|${s.instituicao}|${s.ativo}`
      if ((s.data || '').localeCompare(inicioAnalise) <= 0) {
        const cur = saldoInicialMap.get(k)
        if (!cur || (s.data || '').localeCompare(cur.data || '') > 0) saldoInicialMap.set(k, s)
      }
      if ((s.data || '').localeCompare(fimAnalise) <= 0) {
        const cur = saldoFinalMap.get(k)
        if (!cur || (s.data || '').localeCompare(cur.data || '') > 0) saldoFinalMap.set(k, s)
      }
    }
    let saldoInicial = 0, saldoFinal = 0
    for (const s of saldoInicialMap.values()) saldoInicial += Number(s.valor_saldo) || 0
    for (const s of saldoFinalMap.values()) saldoFinal += Number(s.valor_saldo) || 0

    let aportes = 0, resgates = 0
    for (const m of movsF) {
      const data = String(m.data || '')
      if (data < inicioAnalise || data > fimAnalise) continue
      const v = Number(m.valor) || 0
      if (m.tipo === 'aporte') aportes += v
      else resgates += v
    }
    const rendimento = saldoFinal - saldoInicial - aportes + resgates
    const base = saldoInicial + aportes
    const rentPct = base > 0 ? (rendimento / base) * 100 : null

    return { saldoInicial, saldoFinal, aportes, resgates, rendimento, rentPct }
  }, [saldosF, movsF, inicioAnalise, fimAnalise])

  // Evolução por titular ao longo do tempo (uma linha por titular).
  // Pra cada data com snapshot, calcula soma dos saldos mais recentes <= aquela data por (titular,inst,ativo).
  const evolucao = useMemo(() => {
    const datas = Array.from(new Set(saldosF.map((s) => s.data))).sort()
    const titulares = Array.from(new Set(saldosF.map((s) => s.titular))) as Titular[]
    const out: Array<Record<string, string | number>> = []
    for (const d of datas) {
      const row: Record<string, string | number> = { data: formatDateBR(d) }
      for (const t of titulares) {
        const latest = new Map<string, InvestimentoSaldoRow>()
        for (const s of saldosF) {
          if (s.titular !== t) continue
          if ((s.data || '').localeCompare(d) > 0) continue
          const k = `${s.instituicao}|${s.ativo}`
          const cur = latest.get(k)
          if (!cur || (s.data || '').localeCompare(cur.data || '') > 0) latest.set(k, s)
        }
        let sum = 0
        for (const s of latest.values()) sum += Number(s.valor_saldo) || 0
        row[t] = Math.round(sum * 100) / 100
      }
      out.push(row)
    }
    return { data: out, titulares }
  }, [saldosF])

  // ----- forms -----
  function openNewSaldo() {
    const presetTitular = filters.pessoa === 'casal' ? 'Bam' : (filters.pessoa as Titular)
    setFormSaldo({ ...EMPTY_SALDO, data: todayISO(), titular: presetTitular })
    setFormError(null)
    setFormSaldoOpen(true); setFormMovOpen(false)
  }
  function openEditSaldo(s: InvestimentoSaldoRow) {
    setFormSaldo({
      id: s.id, data: s.data, titular: s.titular,
      instituicao: s.instituicao, ativo: s.ativo,
      valor: String(s.valor_saldo).replace('.', ','),
    })
    setFormError(null); setFormSaldoOpen(true); setFormMovOpen(false)
  }
  function openNewMov() {
    const presetTitular = filters.pessoa === 'casal' ? 'Bam' : (filters.pessoa as Titular)
    setFormMov({ ...EMPTY_MOV, data: todayISO(), titular: presetTitular })
    setFormError(null)
    setFormMovOpen(true); setFormSaldoOpen(false)
  }
  function openEditMov(m: InvestimentoMovimentoRow) {
    setFormMov({
      id: m.id, data: m.data, titular: m.titular,
      instituicao: m.instituicao, ativo: m.ativo,
      tipo: m.tipo, valor: String(m.valor).replace('.', ','),
    })
    setFormError(null); setFormMovOpen(true); setFormSaldoOpen(false)
  }

  async function saveSaldo(e: React.FormEvent) {
    e.preventDefault()
    if (!formSaldo.data || !formSaldo.titular || !formSaldo.instituicao.trim() || !formSaldo.ativo.trim()) {
      setFormError('preencha data, titular, instituição e ativo'); return
    }
    const v = parseBRL(formSaldo.valor)
    if (!v || v < 0) { setFormError('valor inválido'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        data: formSaldo.data, titular: formSaldo.titular,
        instituicao: formSaldo.instituicao.trim(), ativo: formSaldo.ativo.trim(),
        valor_saldo: v,
      }
      if (formSaldo.id) await investimentosSaldos.update(formSaldo.id, payload)
      else await investimentosSaldos.create(payload)
      setFormSaldoOpen(false); fetchAll()
    } catch (err) { setFormError((err as Error).message) } finally { setSaving(false) }
  }

  async function saveMov(e: React.FormEvent) {
    e.preventDefault()
    if (!formMov.data || !formMov.titular || !formMov.instituicao.trim() || !formMov.ativo.trim()) {
      setFormError('preencha data, titular, instituição e ativo'); return
    }
    const v = parseBRL(formMov.valor)
    if (!v || v <= 0) { setFormError('valor inválido'); return }
    setSaving(true); setFormError(null)
    try {
      const payload = {
        data: formMov.data, titular: formMov.titular,
        instituicao: formMov.instituicao.trim(), ativo: formMov.ativo.trim(),
        tipo: formMov.tipo, valor: v,
      }
      if (formMov.id) await investimentosMovimentos.update(formMov.id, payload)
      else await investimentosMovimentos.create(payload)
      setFormMovOpen(false); fetchAll()
    } catch (err) { setFormError((err as Error).message) } finally { setSaving(false) }
  }

  async function deleteSaldo(id: string) {
    if (!confirm('Excluir esse snapshot de saldo?')) return
    try { await investimentosSaldos.remove(id); fetchAll() }
    catch (err) { alert('Erro: ' + (err as Error).message) }
  }
  async function deleteMov(id: string) {
    if (!confirm('Excluir esse movimento?')) return
    try { await investimentosMovimentos.remove(id); fetchAll() }
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
          <button type="button" className="btn" onClick={openNewMov}>+ Aporte/Resgate</button>
          <button type="button" className="btn btn-primary" onClick={openNewSaldo}>+ Saldo</button>
        </div>
      </header>

      {loading && <p className="muted">Carregando…</p>}
      {error && <p className="error-msg">Erro: {error}</p>}

      {/* Forms (logo abaixo dos botões pra não perder contexto) */}
      {formSaldoOpen && (
        <FormSaldoComponent
          form={formSaldo} setForm={setFormSaldo}
          saving={saving} formError={formError}
          onSubmit={saveSaldo}
          onCancel={() => setFormSaldoOpen(false)}
        />
      )}
      {formMovOpen && (
        <FormMovComponent
          form={formMov} setForm={setFormMov}
          saving={saving} formError={formError}
          onSubmit={saveMov}
          onCancel={() => setFormMovOpen(false)}
        />
      )}

      {/* Insights */}
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

      {/* Evolução */}
      {evolucao.data.length > 1 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Evolução do patrimônio</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={evolucao.data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: unknown) => formatBRL(Number(v) || 0)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {evolucao.titulares.map((t) => (
                  <Line key={t} type="monotone" dataKey={t} stroke={colorPara(t)} strokeWidth={2} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Lista de saldos */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Saldos ({saldosOrdenados.length})</h3>
        {saldosOrdenados.length === 0 ? (
          <p className="muted">Nenhum snapshot cadastrado ainda. Use <strong>+ Saldo</strong> pra começar.</p>
        ) : (
          <ul className="rows">
            {saldosOrdenados.slice(0, 30).map((s) => (
              <li key={s.id} className="row">
                <button type="button" className="row-main" onClick={() => openEditSaldo(s)}>
                  <div className="row-top">
                    <strong>{s.ativo} <span className="muted-light">· {s.instituicao}</span></strong>
                    <span className="row-valor">{formatBRL(Number(s.valor_saldo) || 0)}</span>
                  </div>
                  <div className="row-meta">
                    <span>{formatDateBR(s.data)}</span>
                    <span>· {s.titular}</span>
                  </div>
                </button>
                <button type="button" className="row-del" onClick={() => deleteSaldo(s.id)} aria-label="Excluir">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Lista de movimentos */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Aportes & resgates ({movsOrdenados.length})</h3>
        {movsOrdenados.length === 0 ? (
          <p className="muted">Nenhum aporte/resgate cadastrado.</p>
        ) : (
          <ul className="rows">
            {movsOrdenados.slice(0, 30).map((m) => (
              <li key={m.id} className="row">
                <button type="button" className="row-main" onClick={() => openEditMov(m)}>
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
                </button>
                <button type="button" className="row-del" onClick={() => deleteMov(m.id)} aria-label="Excluir">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
