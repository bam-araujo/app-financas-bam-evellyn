import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LancamentoRow, ReceitaRow, ShareData } from '../../api/types'
import type { PessoaFiltro } from '../Filters'
import { useCashflowProjection } from '../../hooks/useCashflowProjection'
import { formatBRL, formatCompetenciaBR, parseBRL } from '../../lib/format'

interface Props {
  competenciaAtual: string
  lancamentos: LancamentoRow[]
  receitas: ReceitaRow[]
  saldoInvestimentos: number
  share: ShareData | null
  pessoa: PessoaFiltro
  mesesAhead?: number
}

// Chave do localStorage por pessoa: filtro casal/Bam/Evellyn pode ter saldo
// inicial diferente (cada um digita o que tem na conta dele). Default 0.
function lsKey(pessoa: PessoaFiltro): string {
  return `dueto:saldoInicial:${pessoa}`
}

function readSaldoInicial(pessoa: PessoaFiltro): number {
  try {
    const raw = localStorage.getItem(lsKey(pessoa))
    if (!raw) return 0
    const n = Number(raw)
    return isFinite(n) ? n : 0
  } catch { return 0 }
}

function writeSaldoInicial(pessoa: PessoaFiltro, valor: number): void {
  try { localStorage.setItem(lsKey(pessoa), String(valor)) } catch { /* ignore */ }
}

type Modo = 'conta' | 'total'

export function PrevisaoCaixa({
  competenciaAtual,
  lancamentos,
  receitas,
  saldoInvestimentos,
  share,
  pessoa,
  mesesAhead = 6,
}: Props) {
  const [saldoInicial, setSaldoInicial] = useState<number>(() => readSaldoInicial(pessoa))
  const [saldoInput, setSaldoInput] = useState<string>(() => String(readSaldoInicial(pessoa) || ''))
  const [editing, setEditing] = useState(false)
  const [modo, setModo] = useState<Modo>('conta')

  // Quando o filtro de pessoa muda, recarrega o saldo do localStorage daquela
  // pessoa. Cada pessoa tem o próprio saldo inicial cadastrado.
  useEffect(() => {
    const v = readSaldoInicial(pessoa)
    setSaldoInicial(v)
    setSaldoInput(String(v || ''))
    setEditing(false)
  }, [pessoa])

  const proj = useCashflowProjection({
    lancamentos,
    receitas,
    saldoInicial,
    saldoInvestimentos,
    share,
    pessoa,
    competenciaAtual,
    mesesAhead,
  })

  const chartData = useMemo(
    () => proj.map((p) => ({
      mes: formatCompetenciaBR(p.competencia, 'short'),
      saldo: modo === 'conta' ? p.saldoConta : p.saldoTotal,
    })),
    [proj, modo],
  )

  function commitSaldo() {
    const v = parseBRL(saldoInput) || 0
    setSaldoInicial(v)
    setSaldoInput(String(v || ''))
    writeSaldoInicial(pessoa, v)
    setEditing(false)
  }

  const ultimoSaldo = proj.length ? (modo === 'conta' ? proj[proj.length - 1].saldoConta : proj[proj.length - 1].saldoTotal) : saldoInicial
  const ultimaCompetencia = proj.length ? proj[proj.length - 1].competencia : competenciaAtual

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>Previsão de caixa — {mesesAhead} meses</h3>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            {pessoa === 'casal' ? 'visão do casal' : `visão de ${pessoa}`}
            {' · '}até {formatCompetenciaBR(ultimaCompetencia, 'short')}: <strong className={ultimoSaldo < 0 ? 'neg' : 'pos'}>{formatBRL(ultimoSaldo)}</strong>
          </p>
        </div>
        <div className="seg-group" style={{ flexShrink: 0 }}>
          <button
            type="button"
            className={'seg' + (modo === 'conta' ? ' seg-active' : '')}
            onClick={() => setModo('conta')}
            title="Saldo da conta corrente projetado"
          >
            Conta
          </button>
          <button
            type="button"
            className={'seg' + (modo === 'total' ? ' seg-active' : '')}
            onClick={() => setModo('total')}
            title="Conta + saldo dos investimentos (patrimônio total)"
          >
            Patrimônio total
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <span className="muted" style={{ fontSize: '0.85rem' }}>Saldo em conta hoje:</span>
        {editing ? (
          <>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={saldoInput}
              onChange={(e) => setSaldoInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitSaldo() }}
              style={{ width: '8rem' }}
              autoFocus
            />
            <button type="button" className="btn" onClick={commitSaldo}>Salvar</button>
          </>
        ) : (
          <>
            <strong>{formatBRL(saldoInicial)}</strong>
            <button type="button" className="btn" onClick={() => setEditing(true)} style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}>Editar</button>
          </>
        )}
        {modo === 'total' && saldoInvestimentos > 0 && (
          <span className="muted-light" style={{ fontSize: '0.8rem' }}>
            + {formatBRL(saldoInvestimentos)} em investimentos
          </span>
        )}
      </div>

      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: unknown) => formatBRL(Number(v) || 0)} />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="saldo" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
        <table className="previsao-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(127,127,127,0.3)' }}>
              <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem' }}>Mês</th>
              <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem' }}>Entradas</th>
              <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem' }}>Saídas</th>
              <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem' }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {proj.map((p) => {
              const saldo = modo === 'conta' ? p.saldoConta : p.saldoTotal
              return (
                <tr key={p.competencia} style={{ borderBottom: '1px solid rgba(127,127,127,0.1)' }}>
                  <td style={{ padding: '0.4rem 0.5rem' }}>{formatCompetenciaBR(p.competencia, 'short')}</td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }} className="pos">{formatBRL(p.entradas)}</td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }} className="neg">{formatBRL(p.saidas)}</td>
                  <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }} className={saldo < 0 ? 'neg' : 'pos'}>
                    <strong>{formatBRL(saldo)}</strong>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="muted-light" style={{ fontSize: '0.75rem', marginTop: '0.6rem', marginBottom: 0 }}>
        Baseado em recorrentes/parceladas já cadastradas. Sem adivinhação por média.
        Share usado pra ratear conjuntas é o do mês atual, aplicado constante pros próximos meses.
      </p>
    </div>
  )
}
