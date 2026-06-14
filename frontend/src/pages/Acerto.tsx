import { useEffect, useMemo, useState } from 'react'
import { closeShare, getShare, lancamentos, reopenShare } from '../api/client'
import type { LancamentoRow, Pessoa, ShareData } from '../api/types'
import { formatBRL, formatCompetenciaBR } from '../lib/format'

interface Props {
  competencia: string
}

/** Arredonda pra 2 casas. */
function r2(n: number): number {
  return Math.round(n * 100) / 100
}

interface RowRateio {
  row: LancamentoRow
  devido: { Bam: number; Evellyn: number }
}

/**
 * Para cada despesa conjunta V paga por P, devido[outro] = round(V*share_outro, 2),
 * e devido[P] absorve o resíduo de centavo: devido[P] = V - devido[outro].
 */
function calcularRateios(rows: LancamentoRow[], share: ShareData): RowRateio[] {
  return rows.map((row) => {
    const v = Number(row.valor) || 0
    const pagador = row.pagador
    const outro: Pessoa = pagador === 'Bam' ? 'Evellyn' : 'Bam'
    const shareOutro = share[outro]
    const devidoOutro = r2(v * shareOutro)
    const devidoPagador = r2(v - devidoOutro)
    return {
      row,
      devido: {
        Bam: pagador === 'Bam' ? devidoPagador : devidoOutro,
        Evellyn: pagador === 'Evellyn' ? devidoPagador : devidoOutro,
      },
    }
  })
}

export function AcertoPage({ competencia }: Props) {
  const [share, setShare] = useState<ShareData | null>(null)
  const [rows, setRows] = useState<LancamentoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  function fetchAll() {
    setLoading(true)
    setError(null)
    Promise.all([
      getShare(competencia),
      lancamentos.list({ competencia, tipo: 'conjunto' }),
    ])
      .then(([s, ls]) => {
        setShare(s)
        ls.sort((a, b) => (b.data || '').localeCompare(a.data || ''))
        setRows(ls)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia])

  const rateios = useMemo(() => {
    if (!share) return []
    return calcularRateios(rows, share)
  }, [rows, share])

  const totais = useMemo(() => {
    const pago = { Bam: 0, Evellyn: 0 }
    const devido = { Bam: 0, Evellyn: 0 }
    for (const { row, devido: d } of rateios) {
      pago[row.pagador] += Number(row.valor) || 0
      devido.Bam += d.Bam
      devido.Evellyn += d.Evellyn
    }
    const saldo = {
      Bam: r2(pago.Bam - devido.Bam),
      Evellyn: r2(pago.Evellyn - devido.Evellyn),
    }
    return {
      pago: { Bam: r2(pago.Bam), Evellyn: r2(pago.Evellyn) },
      devido: { Bam: r2(devido.Bam), Evellyn: r2(devido.Evellyn) },
      saldo,
    }
  }, [rateios])

  async function fechar() {
    if (!confirm('Fechar o mês ' + formatCompetenciaBR(competencia, 'long') + '? O share não vai mais recalcular se você inserir/editar receitas depois.')) return
    setWorking(true)
    try {
      const s = await closeShare(competencia)
      setShare(s)
    } catch (err) {
      alert('Erro: ' + (err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function reabrir() {
    if (!confirm('Reabrir o mês ' + formatCompetenciaBR(competencia, 'long') + '? O share voltará a recalcular automaticamente com base nas receitas YTD.')) return
    setWorking(true)
    try {
      await reopenShare(competencia)
      const s = await getShare(competencia)
      setShare(s)
    } catch (err) {
      alert('Erro: ' + (err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  // Frase do saldo líquido
  const credor: Pessoa | null = totais.saldo.Bam > 0 ? 'Bam' : totais.saldo.Evellyn > 0 ? 'Evellyn' : null
  const valorAcerto = credor ? Math.abs(totais.saldo[credor]) : 0
  const devedor: Pessoa | null = credor === 'Bam' ? 'Evellyn' : credor === 'Evellyn' ? 'Bam' : null

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Acerto — {formatCompetenciaBR(competencia, 'long')}</h2>
          <p className="muted">
            {rows.length} despesa{rows.length === 1 ? '' : 's'} conjunta{rows.length === 1 ? '' : 's'} · share usado nesta tela {share && (
              <span className="muted-light">
                (Bam {(share.Bam * 100).toFixed(1)}% · Evellyn {(share.Evellyn * 100).toFixed(1)}%
                {share.fechado ? ', fechado' : ', preview'})
              </span>
            )}
          </p>
        </div>
        {share && !share.fechado && (
          <button type="button" className="btn btn-primary" disabled={working} onClick={fechar}>
            {working ? 'Fechando…' : 'Fechar mês'}
          </button>
        )}
        {share && share.fechado && (
          <button type="button" className="btn" disabled={working} onClick={reabrir}>
            {working ? '…' : 'Reabrir'}
          </button>
        )}
      </header>

      {loading && <p className="muted">Carregando…</p>}
      {error && <p className="error-msg">Erro: {error}</p>}

      {share && (
        <div className="card resumo">
          {credor && devedor && valorAcerto > 0 ? (
            <p className="acerto-final">
              <strong>{devedor}</strong> deve{' '}
              <strong className="row-valor">{formatBRL(valorAcerto)}</strong> para{' '}
              <strong>{credor}</strong>.
            </p>
          ) : (
            <p className="acerto-final muted">
              {rows.length === 0
                ? 'Nada a acertar — sem despesas conjuntas neste mês.'
                : 'Saldo zerado neste mês.'}
            </p>
          )}

          <div className="resumo-grid">
            <div>
              <span className="muted">Bam pagou</span>
              <strong>{formatBRL(totais.pago.Bam)}</strong>
              <span className="muted">deve ter pago</span>
              <strong>{formatBRL(totais.devido.Bam)}</strong>
              <span className="muted">saldo</span>
              <strong className={totais.saldo.Bam >= 0 ? 'pos' : 'neg'}>{formatBRL(totais.saldo.Bam)}</strong>
            </div>
            <div>
              <span className="muted">Evellyn pagou</span>
              <strong>{formatBRL(totais.pago.Evellyn)}</strong>
              <span className="muted">deve ter pago</span>
              <strong>{formatBRL(totais.devido.Evellyn)}</strong>
              <span className="muted">saldo</span>
              <strong className={totais.saldo.Evellyn >= 0 ? 'pos' : 'neg'}>{formatBRL(totais.saldo.Evellyn)}</strong>
            </div>
          </div>
        </div>
      )}

      {!loading && rateios.length === 0 && (
        <p className="empty">Sem despesas conjuntas em {formatCompetenciaBR(competencia, 'long')}.</p>
      )}

      <ul className="rows">
        {rateios.map(({ row, devido }) => (
          <li key={row.id} className="row">
            <div className="row-main">
              <div className="row-top">
                <strong>{row.descricao}</strong>
                <span className="row-valor">{formatBRL(Number(row.valor) || 0)}</span>
              </div>
              <div className="row-meta">
                <span>pagou {row.pagador}</span>
                <span>· Bam {formatBRL(devido.Bam)}</span>
                <span>· Evellyn {formatBRL(devido.Evellyn)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
