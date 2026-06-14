import { useEffect, useMemo, useState } from 'react'
import { lancamentos as lancamentosApi, orcamento as orcamentoApi } from '../api/client'
import type { LancamentoRow, OrcamentoRow } from '../api/types'
import { BudgetProgress } from '../components/BudgetProgress'
import { useCategorias } from '../hooks/useCategorias'
import { formatBRL, formatCompetenciaBR, parseBRL } from '../lib/format'

interface Props {
  competencia: string
}

/** Mês anterior em YYYY-MM. */
function competenciaAnterior(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  let mm = m - 1
  let yy = y
  if (mm <= 0) { mm = 12; yy -= 1 }
  return `${yy}-${String(mm).padStart(2, '0')}`
}

export function OrcamentoPage({ competencia }: Props) {
  const [orcamentos, setOrcamentos] = useState<OrcamentoRow[]>([])
  const [lancs, setLancs] = useState<LancamentoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  // edits: categoria -> string do valor digitado (parseBRL aceita 1.234,56 ou 1234.56)
  const [edits, setEdits] = useState<Record<string, string>>({})

  const cats = useCategorias()
  const despesaCats = useMemo(
    () => cats.data.filter((c) => c.grupo === 'despesa').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [cats.data],
  )

  function fetchAll() {
    setLoading(true)
    setError(null)
    Promise.all([
      orcamentoApi.list({ competencia }),
      lancamentosApi.list({ competencia }),
    ])
      .then(([os, ls]) => {
        setOrcamentos(os)
        setLancs(ls)
        // Sincroniza edits com os limites atuais — facilita edição inline.
        const e: Record<string, string> = {}
        for (const o of os) {
          e[o.categoria] = String(Number(o.limite) || 0).replace('.', ',')
        }
        setEdits(e)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia])

  /** Gasto total por categoria na competência atual. Considera valor cheio. */
  const gastoPorCat = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lancs) {
      const c = String(l.categoria || '')
      if (!c) continue
      m.set(c, (m.get(c) || 0) + (Number(l.valor) || 0))
    }
    return m
  }, [lancs])

  const orcPorCat = useMemo(() => {
    const m = new Map<string, OrcamentoRow>()
    for (const o of orcamentos) m.set(o.categoria, o)
    return m
  }, [orcamentos])

  async function saveCategoria(categoria: string) {
    const raw = edits[categoria] || ''
    const limite = parseBRL(raw)
    if (limite < 0) { alert('Limite inválido.'); return }
    setWorking(true)
    try {
      const existing = orcPorCat.get(categoria)
      if (existing) {
        if (limite === 0) {
          await orcamentoApi.remove(existing.id)
        } else {
          await orcamentoApi.update(existing.id, { limite })
        }
      } else if (limite > 0) {
        await orcamentoApi.create({ competencia, categoria, limite })
      }
      fetchAll()
    } catch (err) {
      alert('Erro: ' + (err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function copiarMesAnterior() {
    const fonte = competenciaAnterior(competencia)
    if (!confirm(`Copiar orçamento de ${formatCompetenciaBR(fonte, 'long')} para ${formatCompetenciaBR(competencia, 'long')}? Categorias com orçamento já definido aqui serão MANTIDAS.`)) return
    setWorking(true)
    try {
      const prev = await orcamentoApi.list({ competencia: fonte })
      if (prev.length === 0) {
        alert(`Não havia orçamento em ${formatCompetenciaBR(fonte, 'long')}.`)
        return
      }
      let criados = 0
      for (const p of prev) {
        if (orcPorCat.has(p.categoria)) continue
        await orcamentoApi.create({
          competencia,
          categoria: p.categoria,
          limite: Number(p.limite) || 0,
        })
        criados++
      }
      fetchAll()
      alert(`${criados} categoria${criados === 1 ? '' : 's'} copiada${criados === 1 ? '' : 's'}.`)
    } catch (err) {
      alert('Erro: ' + (err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  const totalLimite = orcamentos.reduce((s, o) => s + (Number(o.limite) || 0), 0)
  const totalGasto = orcamentos.reduce((s, o) => s + (gastoPorCat.get(o.categoria) || 0), 0)
  const semOrcamento = despesaCats.filter((c) => !orcPorCat.has(c.nome))

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Orçamento — {formatCompetenciaBR(competencia, 'long')}</h2>
          <p className="muted">
            {orcamentos.length} categoria{orcamentos.length === 1 ? '' : 's'} com limite · total planejado {formatBRL(totalLimite)} · gasto {formatBRL(totalGasto)}
          </p>
        </div>
        <button type="button" className="btn" onClick={copiarMesAnterior} disabled={working}>
          Copiar mês anterior
        </button>
      </header>

      {loading && <p className="muted">Carregando…</p>}
      {error && <p className="error-msg">Erro: {error}</p>}

      {!loading && (
        <div className="orcamento-list">
          {despesaCats.map((c) => {
            const gasto = gastoPorCat.get(c.nome) || 0
            const existing = orcPorCat.get(c.nome)
            const limite = existing ? Number(existing.limite) || 0 : 0
            return (
              <div key={c.id} className="card orcamento-item">
                <BudgetProgress categoria={c.nome} gasto={gasto} limite={limite} />
                <div className="orcamento-edit">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={edits[c.nome] ?? ''}
                    onChange={(e) => setEdits({ ...edits, [c.nome]: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => saveCategoria(c.nome)}
                    disabled={working}
                  >
                    Salvar
                  </button>
                </div>
              </div>
            )
          })}
          {despesaCats.length === 0 && (
            <p className="empty">Nenhuma categoria de despesa cadastrada.</p>
          )}
          {semOrcamento.length === despesaCats.length && (
            <p className="muted-light" style={{ marginTop: '1rem' }}>
              Dica: clique <strong>Copiar mês anterior</strong> pra começar com base no que você já planejou antes.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
