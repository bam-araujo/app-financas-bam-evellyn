import { useMemo, useReducer } from 'react'
import { batchCreate, createSerieParcelado, createSerieRecorrente } from '../api/client'
import type { CreatePayload, Pessoa } from '../api/types'
import { useCategorias } from '../hooks/useCategorias'
import { formatBRL, formatDateBR, parseBRL } from '../lib/format'
import { extractPdfLinesWithMeta, getLastExtractionDebug } from '../lib/parsers/pdf-extract'
import { parseItauFatura } from '../lib/parsers/itau-fatura'
import { importarReducer, initialImportarState, type LineState } from './importarReducer'

export function ImportarPage() {
  const [state, dispatch] = useReducer(importarReducer, initialImportarState)
  const { phase, error, parsed, rawLines, lines, saveResult } = state

  const cats = useCategorias()
  const despesaCats = useMemo(
    () => cats.data.filter((c) => c.grupo === 'despesa').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [cats.data],
  )

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    dispatch({ type: 'PARSE_START' })
    try {
      const linesMeta = await extractPdfLinesWithMeta(file)
      const rawLines = linesMeta.map((l) => l.text)
      const result = parseItauFatura(linesMeta.map((l) => ({ text: l.text, x: l.x })))
      if (result.transactions.length === 0) {
        throw new Error('Nenhuma transação encontrada — o PDF parece não ser uma fatura Itaú.')
      }
      const venc = result.meta.vencimento || ''
      const initial: LineState[] = result.transactions.map((tx) => {
        const detectouParcela = !!(tx.parcela_num && tx.parcela_total)
        return {
          data: venc,
          descricao: detectouParcela
            ? `${tx.descricao} (${tx.parcela_num}/${tx.parcela_total})`
            : tx.descricao,
          categoria: '',
          valor_input: tx.valor > 0 ? String(tx.valor).replace('.', ',') : '',
          pagador: 'Bam',
          tipo: 'conjunto',
          dono: '',
          // Se o parser detectou parcela, pré-marca como parcelado com total
          // de parcelas restantes (parcela_total - parcela_num + 1) — assim
          // o import cria essa parcela + as próximas N que ainda não vieram.
          repeticao: detectouParcela ? 'parcelado' : 'unico',
          parcelas: detectouParcela
            ? Math.max(1, (tx.parcela_total! - tx.parcela_num! + 1))
            : 2,
          selected: true,
          parser_parcela_num: tx.parcela_num,
          parser_parcela_total: tx.parcela_total,
        }
      })
      dispatch({ type: 'PARSE_OK', rawLines, parsed: result, lines: initial })
    } catch (err) {
      dispatch({ type: 'PARSE_FAIL', error: (err as Error).message })
    }
  }

  const selectedLines = lines.filter((l) => l.selected)
  const total = selectedLines.reduce((s, l) => s + parseBRL(l.valor_input), 0)
  function lineReady(l: LineState): boolean {
    const v = parseBRL(l.valor_input)
    if (!l.data || !l.descricao.trim() || !l.categoria || !v || v <= 0) return false
    if (!l.pagador || !l.tipo) return false
    if (l.tipo === 'individual' && !l.dono) return false
    if (l.tipo === 'conjunto' && l.dono) return false
    if (l.repeticao === 'parcelado' && (l.parcelas < 2 || l.parcelas > 60)) return false
    return true
  }
  const anyRecorrente = lines.filter((l) => l.selected && l.repeticao === 'recorrente').length
  const allReady = selectedLines.length > 0 && selectedLines.every(lineReady)

  async function salvar() {
    dispatch({ type: 'SAVE_START' })
    try {
      // Separa em 3 grupos: únicos (batch), parcelados (1 chamada/linha), recorrentes (1 chamada/linha)
      const unicos: { line: LineState; payload: CreatePayload<'lancamentos'> }[] = []
      const parcelados: LineState[] = []
      const recorrentes: LineState[] = []
      for (const l of selectedLines) {
        if (l.repeticao === 'parcelado' && l.parcelas >= 2) {
          parcelados.push(l)
        } else if (l.repeticao === 'recorrente') {
          recorrentes.push(l)
        } else {
          unicos.push({
            line: l,
            payload: {
              data: l.data,
              competencia: l.data.slice(0, 7),
              descricao: l.descricao.trim(),
              categoria: l.categoria,
              valor: parseBRL(l.valor_input),
              pagador: l.pagador,
              tipo: l.tipo,
              dono: (l.tipo === 'individual' ? l.dono : '') as Pessoa | '',
              serie_id: '',
              serie_tipo: '',
              parcela_num: 0,
              parcela_total: 0,
            },
          })
        }
      }

      let ok = 0
      const errs: string[] = []

      if (unicos.length) {
        const res = await batchCreate('lancamentos', unicos.map((u) => u.payload))
        ok += res.results.filter((r) => r.ok).length
        for (const r of res.results) if (!r.ok) errs.push((r as { error: string }).error)
      }

      for (const l of parcelados) {
        try {
          const r = await createSerieParcelado({
            data: l.data,
            descricao: l.descricao.trim(),
            categoria: l.categoria,
            valor: parseBRL(l.valor_input),
            pagador: l.pagador,
            tipo: l.tipo,
            dono: (l.tipo === 'individual' ? l.dono : '') as Pessoa | '',
          }, l.parcelas)
          ok += r.count
        } catch (err) {
          errs.push(`série "${l.descricao}": ${(err as Error).message}`)
        }
      }

      for (const l of recorrentes) {
        try {
          const r = await createSerieRecorrente({
            data: l.data,
            descricao: l.descricao.trim(),
            categoria: l.categoria,
            valor: parseBRL(l.valor_input),
            pagador: l.pagador,
            tipo: l.tipo,
            dono: (l.tipo === 'individual' ? l.dono : '') as Pessoa | '',
          })
          ok += r.count
        } catch (err) {
          errs.push(`recorrente "${l.descricao}": ${(err as Error).message}`)
        }
      }

      dispatch({ type: 'SAVE_OK', result: { ok, fail: errs.length, errors: errs.slice(0, 5) } })
    } catch (err) {
      dispatch({ type: 'SAVE_FAIL', error: (err as Error).message })
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Importar fatura</h2>
          <p className="muted">
            Sobe o PDF da fatura do cartão Itaú. Parser roda no celular — o arquivo não vai pro servidor.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => { window.location.hash = '#/despesas' }}
        >
          ← Despesas
        </button>
      </header>

      {anyRecorrente > 0 && (
        <p className="hint">
          {anyRecorrente} linha{anyRecorrente === 1 ? '' : 's'} marcada{anyRecorrente === 1 ? '' : 's'} como recorrente — cada uma vai gerar 24 lançamentos mensais.
        </p>
      )}

      {phase === 'idle' && (
        <div className="card">
          <label className="upload">
            <input type="file" accept="application/pdf,.pdf" onChange={onFile} />
            <span>Selecionar PDF da fatura</span>
          </label>
          {error && <p className="error-msg" style={{ marginTop: '0.75rem' }}>{error}</p>}
        </div>
      )}

      {phase === 'parsing' && (
        <div className="card">
          <p className="muted">Lendo o PDF…</p>
        </div>
      )}

      {phase === 'done' && saveResult && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Importação concluída</h3>
          <p>
            <strong>{saveResult.ok}</strong> lançamento{saveResult.ok === 1 ? '' : 's'} criado{saveResult.ok === 1 ? '' : 's'}.
            {saveResult.fail > 0 && <> <span className="error-msg" style={{ display: 'inline-block' }}>{saveResult.fail} falharam.</span></>}
          </p>
          {saveResult.errors.length > 0 && (
            <ul>
              {saveResult.errors.map((e, idx) => <li key={idx}><code>{e}</code></li>)}
            </ul>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'RESET' })}>Importar outra fatura</button>
          </div>
        </div>
      )}

      {(phase === 'review' || phase === 'saving') && parsed && (
        <>
          <div className="card">
            <p>
              Fatura: <strong>{parsed.meta.titular || 'Itaú'}</strong>
              {parsed.meta.vencimento && <> · venc <strong>{formatDateBR(parsed.meta.vencimento)}</strong></>}
              {parsed.meta.total > 0 && <> · total fatura <strong>{formatBRL(parsed.meta.total)}</strong></>}
            </p>
            <p className="muted">
              {selectedLines.length}/{lines.length} selecionado{selectedLines.length === 1 ? '' : 's'} · soma {formatBRL(total)}
              {Math.abs(total - parsed.meta.total) > 0.05 && parsed.meta.total > 0 && (
                <span className="muted-light"> (≠ total da fatura — confere)</span>
              )}
            </p>
            <div className="form-actions" style={{ justifyContent: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => dispatch({ type: 'TOGGLE_ALL', selected: true })}>Selecionar todas</button>
              <button type="button" className="btn" onClick={() => dispatch({ type: 'TOGGLE_ALL', selected: false })}>Limpar seleção</button>
              <button type="button" className="btn" onClick={() => dispatch({ type: 'RESET' })}>Trocar arquivo</button>
            </div>
            {rawLines.length > 0 && (
              <details style={{ marginTop: '0.75rem' }}>
                <summary className="muted" style={{ cursor: 'pointer', fontSize: '0.825rem' }}>
                  Ver texto bruto extraído ({rawLines.length} linhas) — útil pra reportar problema de parser
                </summary>
                <pre style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem',
                  background: 'var(--row-hover)',
                  borderRadius: '0.4rem',
                  fontSize: '0.75rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '20rem',
                  overflowY: 'auto',
                }}>
                  {rawLines.map((l, i) => `${String(i + 1).padStart(3, ' ')}: ${l}`).join('\n')}
                </pre>
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}
                  onClick={async () => {
                    const items = getLastExtractionDebug()
                    const dump = items
                      .map((it) => `p${it.page} y=${it.y.toFixed(0)} x=${it.x.toFixed(0)} w=${it.w.toFixed(0)} | ${it.str}`)
                      .join('\n')
                    try {
                      await navigator.clipboard.writeText(dump)
                      alert(`Copiado ${items.length} items pra clipboard.`)
                    } catch {
                      // fallback: log
                      console.log(dump)
                      alert('Não consegui copiar. Itens estão no console (F12).')
                    }
                  }}
                >
                  Copiar items com coordenadas (pra debug)
                </button>
              </details>
            )}
          </div>

          <ul className="rows import-rows">
            {lines.map((l, i) => (
              <li key={i} className={'row import-row' + (l.selected ? '' : ' import-row-off')}>
                <label className="import-check">
                  <input
                    type="checkbox"
                    checked={l.selected}
                    onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { selected: e.target.checked } })}
                  />
                </label>
                <div className="import-row-body">
                  <div className="import-line">
                    <input
                      type="date"
                      value={l.data}
                      onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { data: e.target.value } })}
                    />
                    <input
                      type="text"
                      value={l.descricao}
                      onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { descricao: e.target.value } })}
                      className="grow"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={l.valor_input}
                      onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { valor_input: e.target.value } })}
                      className="valor"
                      title="Valor (editável)"
                    />
                  </div>
                  <div className="import-line">
                    <select
                      value={l.categoria}
                      onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { categoria: e.target.value } })}
                    >
                      <option value="">— categoria —</option>
                      {despesaCats.map((c) => (
                        <option key={c.id} value={c.nome}>{c.nome}</option>
                      ))}
                    </select>
                    <select
                      value={l.tipo}
                      onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { tipo: e.target.value as 'individual' | 'conjunto', dono: '' } })}
                    >
                      <option value="conjunto">Conjunta</option>
                      <option value="individual">Individual</option>
                    </select>
                    <select
                      value={l.pagador}
                      onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { pagador: e.target.value as Pessoa } })}
                      title="Pagador"
                    >
                      <option value="Bam">Bam</option>
                      <option value="Evellyn">Evellyn</option>
                    </select>
                    {l.tipo === 'individual' && (
                      <select
                        value={l.dono}
                        onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { dono: e.target.value as Pessoa } })}
                        title="Dono"
                      >
                        <option value="">— dono —</option>
                        <option value="Bam">Bam</option>
                        <option value="Evellyn">Evellyn</option>
                      </select>
                    )}
                  </div>
                  <div className="import-line">
                    <select
                      value={l.repeticao}
                      onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { repeticao: e.target.value as 'unico' | 'parcelado' | 'recorrente' } })}
                      title="Repetição"
                    >
                      <option value="unico">Único</option>
                      <option value="parcelado">Parcelado</option>
                      <option value="recorrente">Recorrente</option>
                    </select>
                    {l.repeticao === 'parcelado' && (
                      <input
                        type="number"
                        min={2}
                        max={60}
                        value={l.parcelas}
                        onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { parcelas: Math.max(2, Math.min(60, Number(e.target.value) || 2)) } })}
                        title="Nº de parcelas (cria N linhas mensais a partir desta data)"
                        className="parcelas"
                      />
                    )}
                    {l.repeticao === 'recorrente' && (
                      <span className="muted-light" style={{ fontSize: '0.75rem' }}>24 meses</span>
                    )}
                    {l.parser_parcela_num && l.parser_parcela_total && (
                      <span className="muted-light" style={{ fontSize: '0.75rem' }}>
                        parser detectou {l.parser_parcela_num}/{l.parser_parcela_total}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {error && <p className="error-msg">{error}</p>}

          <div className="form-actions" style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '0.75rem 0' }}>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'RESET' })} disabled={phase === 'saving'}>Cancelar</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!allReady || phase === 'saving'}
              onClick={salvar}
            >
              {phase === 'saving' ? 'Salvando…' : `Salvar ${selectedLines.length} lançamento${selectedLines.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
