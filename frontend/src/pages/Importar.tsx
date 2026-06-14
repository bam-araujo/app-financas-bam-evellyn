import { useMemo, useReducer, useState } from 'react'
import { batchCreate, createSerieParcelado, createSerieRecorrente, lancamentos as lancamentosApi, type WhoamiData } from '../api/client'
import type { CreatePayload, LancamentoRow, Pessoa } from '../api/types'
import { useAutoCategorias } from '../hooks/useAutoCategorias'
import { useCategorias } from '../hooks/useCategorias'
import { formatBRL, formatDateBR, parseBRL } from '../lib/format'
import { extractPdfLinesWithMeta, getLastExtractionDebug } from '../lib/parsers/pdf-extract'
import { BANKS, BANK_ORDER, detectBank, parseFatura, type Bank, type BankSelection } from '../lib/parsers/registry'
import { importarReducer, initialImportarState, type LineState } from './importarReducer'

/**
 * Hash de match pro dedupe: data + valor.
 *
 * Por que NÃO usar descrição: o usuário renomeia (ex.: 'PG*POSTOOSCAR' →
 * 'Posto') depois do save, e a próxima fatura traz o nome bruto do parser
 * de novo — sem match em descrição, falso negativo. Aqui aceitamos falso
 * positivo (dois gastos de R$50 no mesmo dia em lojas diferentes) que é
 * raro e custa só um clique pra remarcar manualmente.
 */
function dupeKey(data: string, valor: number): string {
  return `${data}|${valor.toFixed(2)}`
}

/**
 * Infere pessoa (Bam/Evellyn) a partir do titular da fatura. Cartão de
 * crédito é pessoal — pagador e dono são quem está no nome da fatura,
 * NÃO o usuário logado (importar a fatura da Evellyn estando logado como
 * Bam é caso comum: o Ivan importa a fatura da esposa).
 *
 * Heurística por primeiro nome / apelido — funciona pros nomes desse casal.
 * Se quiser estender (terceiros, mudança de apelido), adicionar uma coluna
 * `aliases` na tabela `pessoas` e plugar aqui.
 */
function inferPessoaFromTitular(titular: string, fallback: Pessoa): Pessoa {
  if (!titular) return fallback
  if (/\bevellyn\b|\beve\b/i.test(titular)) return 'Evellyn'
  if (/\bivan\b|\bbam\b/i.test(titular)) return 'Bam'
  return fallback
}

interface Props {
  me: WhoamiData | null
}

export function ImportarPage({ me }: Props) {
  const [state, dispatch] = useReducer(importarReducer, initialImportarState)
  const { phase, error, parsed, rawLines, lines, saveResult } = state
  const [showOnlyDupes, setShowOnlyDupes] = useState(false)
  // Banco selecionado no dropdown. 'auto' = roda detectBank() pelas linhas
  // extraídas e decide; específico = ignora detecção e usa o parser pedido.
  const [bankSel, setBankSel] = useState<BankSelection>('auto')
  // Banco efetivamente usado no último parse (mostrado no resumo da fatura).
  const [bankUsed, setBankUsed] = useState<Bank | null>(null)

  const cats = useCategorias()
  const despesaCats = useMemo(
    () => cats.data.filter((c) => c.grupo === 'despesa').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [cats.data],
  )
  const autoCat = useAutoCategorias()

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    dispatch({ type: 'PARSE_START' })
    try {
      const linesMeta = await extractPdfLinesWithMeta(file)
      const rawLines = linesMeta.map((l) => l.text)
      const lineInputs = linesMeta.map((l) => ({ text: l.text, x: l.x }))
      // Resolve qual parser usar. Auto = detecção pela assinatura do emissor;
      // explícito = respeita a escolha do usuário (útil quando detect falha).
      let bank: Bank
      if (bankSel === 'auto') {
        const detected = detectBank(lineInputs)
        if (!detected) {
          throw new Error('Não consegui detectar o banco automaticamente — escolha manualmente no dropdown acima.')
        }
        bank = detected
      } else {
        bank = bankSel
      }
      setBankUsed(bank)
      const result = parseFatura(bank, lineInputs)
      if (result.transactions.length === 0) {
        throw new Error(`Nenhuma transação encontrada — o PDF parece não ser uma fatura ${BANKS[bank].label}.`)
      }
      const venc = result.meta.vencimento || ''
      // Prefill de pagador/dono baseado no TITULAR da fatura, não no usuário
      // logado. Importar a fatura da Evellyn estando logado como Bam é caso
      // comum — sem isso, dono ficaria errado pra todas as linhas.
      const ownerFromFatura = inferPessoaFromTitular(result.meta.titular || '', (me?.nome as Pessoa) || 'Bam')
      const initial: LineState[] = result.transactions.map((tx) => {
        const detectouParcela = !!(tx.parcela_num && tx.parcela_total)
        const descTxt = detectouParcela
          ? `${tx.descricao} (${tx.parcela_num}/${tx.parcela_total})`
          : tx.descricao
        return {
          data: venc,
          descricao: descTxt,
          // Pré-categoriza se houver mapping aprendido (não-bloqueante; user
          // pode trocar antes de salvar).
          categoria: autoCat.suggest(descTxt),
          valor_input: tx.valor > 0 ? String(tx.valor).replace('.', ',') : '',
          // Pagador e dono = titular da fatura (cartão é pessoal).
          pagador: ownerFromFatura,
          tipo: 'individual',
          dono: ownerFromFatura,
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

      // Dedupe assíncrono: busca lançamentos da competência do vencimento
      // (e da anterior, pra cobrir casos onde a data da compra é mês passado),
      // monta um set de chaves data+valor+descricao, e marca as linhas batidas.
      // Não bloqueia o usuário — se falhar, o import segue sem dedupe.
      try {
        const comp = (venc || '').slice(0, 7)
        const compAnterior = comp ? shiftCompetencia(comp, -1) : ''
        const lookups: Promise<LancamentoRow[]>[] = []
        if (comp) lookups.push(lancamentosApi.list({ competencia: comp }))
        if (compAnterior) lookups.push(lancamentosApi.list({ competencia: compAnterior }))
        const existing = (await Promise.all(lookups)).flat()
        const existingKeys = new Set(
          existing.map((r) => dupeKey(r.data, Number(r.valor) || 0)),
        )
        const dupeIdx: number[] = []
        initial.forEach((line, i) => {
          const k = dupeKey(line.data, parseBRL(line.valor_input))
          if (existingKeys.has(k)) dupeIdx.push(i)
        })
        if (dupeIdx.length > 0) {
          dispatch({ type: 'SET_DUPE_FLAGS', dupeIndexes: dupeIdx })
        }
      } catch {
        // Silenciar — dedupe é melhor-esforço; lookup pode falhar transient.
      }
    } catch (err) {
      dispatch({ type: 'PARSE_FAIL', error: (err as Error).message })
    }
  }

  function shiftCompetencia(yyyymm: string, delta: number): string {
    const [yStr, mStr] = yyyymm.split('-')
    let y = Number(yStr), m = Number(mStr) + delta
    while (m <= 0) { m += 12; y -= 1 }
    while (m > 12) { m -= 12; y += 1 }
    return `${y}-${String(m).padStart(2, '0')}`
  }

  const selectedLines = lines.filter((l) => l.selected)
  const total = selectedLines.reduce((s, l) => s + parseBRL(l.valor_input), 0)
  const dupeCount = lines.filter((l) => l.dupe).length
  const visibleLines = lines
    .map((l, i) => ({ line: l, index: i }))
    .filter(({ line }) => (showOnlyDupes ? line.dupe : true))
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
          const r = await createSerieParcelado('lancamentos', {
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
          const r = await createSerieRecorrente('lancamentos', {
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

      // Registra mappings das linhas salvas pra próximas importações.
      // Dedupe em memória primeiro (mesma descricao+categoria não precisa
      // gravar 2x) e roda em paralelo — antes era serial com refetch a cada
      // record, custando ~1min em fatura com 30 linhas.
      const seen = new Set<string>()
      const recordJobs: Array<Promise<void>> = []
      for (const l of selectedLines) {
        const key = `${l.descricao.trim().toLowerCase()}|${l.categoria}`
        if (seen.has(key)) continue
        seen.add(key)
        recordJobs.push(autoCat.record(l.descricao.trim(), l.categoria).catch(() => undefined))
      }
      Promise.all(recordJobs).then(() => autoCat.refetch())
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
            Sobe o PDF da fatura do cartão. Parser roda no celular — o arquivo não vai pro servidor.
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
          <label style={{ display: 'block', marginBottom: '0.75rem' }}>
            <span style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem' }}>Banco</span>
            <select
              value={bankSel}
              onChange={(e) => setBankSel(e.target.value as BankSelection)}
              style={{ width: '100%' }}
            >
              <option value="auto">Detectar automaticamente</option>
              {BANK_ORDER.map((id) => (
                <option key={id} value={id}>
                  {BANKS[id].label}{BANKS[id].pending ? ' (em breve — precisa de PDF de exemplo)' : ''}
                </option>
              ))}
            </select>
          </label>
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
              Fatura {bankUsed && <span className="muted-light">({BANKS[bankUsed].label})</span>}: <strong>{parsed.meta.titular || (bankUsed ? BANKS[bankUsed].label : '—')}</strong>
              {parsed.meta.vencimento && <> · venc <strong>{formatDateBR(parsed.meta.vencimento)}</strong></>}
              {parsed.meta.total > 0 && <> · total fatura <strong>{formatBRL(parsed.meta.total)}</strong></>}
            </p>
            {parsed.meta.titular && (
              <p className="muted-light" style={{ fontSize: '0.78rem', margin: '0.25rem 0 0' }}>
                Pagador e dono pré-preenchidos como <strong>{inferPessoaFromTitular(parsed.meta.titular, (me?.nome as Pessoa) || 'Bam')}</strong> (titular da fatura). Confira em cada linha.
              </p>
            )}
            <p className="muted">
              {selectedLines.length}/{lines.length} selecionado{selectedLines.length === 1 ? '' : 's'} · soma {formatBRL(total)}
              {Math.abs(total - parsed.meta.total) > 0.05 && parsed.meta.total > 0 && (
                <span className="muted-light"> (≠ total da fatura — confere)</span>
              )}
              {dupeCount > 0 && (
                <> · <span className="muted-light">{dupeCount} duplicada{dupeCount === 1 ? '' : 's'} (desmarcadas por padrão)</span></>
              )}
            </p>
            <div className="form-actions" style={{ justifyContent: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => dispatch({ type: 'TOGGLE_ALL', selected: true })}>Selecionar todas</button>
              <button type="button" className="btn" onClick={() => dispatch({ type: 'TOGGLE_ALL', selected: false })}>Limpar seleção</button>
              {dupeCount > 0 && (
                <button
                  type="button"
                  className={'btn' + (showOnlyDupes ? ' btn-active' : '')}
                  onClick={() => setShowOnlyDupes((v) => !v)}
                >
                  {showOnlyDupes ? 'Mostrar todas' : `Só duplicadas (${dupeCount})`}
                </button>
              )}
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
            {visibleLines.map(({ line: l, index: i }) => (
              <li key={i} className={'row import-row' + (l.selected ? '' : ' import-row-off') + (l.dupe ? ' import-row-dupe' : '')}>
                <label className="import-check">
                  <input
                    type="checkbox"
                    checked={l.selected}
                    onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { selected: e.target.checked } })}
                  />
                </label>
                <div className="import-row-body">
                  {l.dupe && (
                    <p className="muted-light" style={{ margin: 0, fontSize: '0.7rem' }}>
                      ⚠ provável duplicada — já existe lançamento com mesma data + valor + descrição
                    </p>
                  )}
                  <div className="import-line">
                    <ImportField label="Data">
                      <input
                        type="date"
                        value={l.data}
                        onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { data: e.target.value } })}
                      />
                    </ImportField>
                    <ImportField label="Descrição" grow>
                      <input
                        type="text"
                        value={l.descricao}
                        onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { descricao: e.target.value } })}
                        className="grow"
                      />
                    </ImportField>
                    <ImportField label="Valor">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={l.valor_input}
                        onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { valor_input: e.target.value } })}
                        className="valor"
                      />
                    </ImportField>
                  </div>
                  <div className="import-line">
                    <ImportField label="Categoria">
                      <select
                        value={l.categoria}
                        onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { categoria: e.target.value } })}
                      >
                        <option value="">— escolher —</option>
                        {despesaCats.map((c) => (
                          <option key={c.id} value={c.nome}>{c.nome}</option>
                        ))}
                      </select>
                    </ImportField>
                    <ImportField label="Tipo">
                      <select
                        value={l.tipo}
                        onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { tipo: e.target.value as 'individual' | 'conjunto', dono: '' } })}
                      >
                        <option value="conjunto">Conjunta</option>
                        <option value="individual">Individual</option>
                      </select>
                    </ImportField>
                    <ImportField label="Pagador (quem pagou)">
                      <select
                        value={l.pagador}
                        onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { pagador: e.target.value as Pessoa } })}
                      >
                        <option value="Bam">Bam</option>
                        <option value="Evellyn">Evellyn</option>
                      </select>
                    </ImportField>
                    {l.tipo === 'individual' && (
                      <ImportField label="Dono (de quem é)">
                        <select
                          value={l.dono}
                          onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { dono: e.target.value as Pessoa } })}
                        >
                          <option value="">— escolher —</option>
                          <option value="Bam">Bam</option>
                          <option value="Evellyn">Evellyn</option>
                        </select>
                      </ImportField>
                    )}
                  </div>
                  <div className="import-line">
                    <ImportField label="Repetição">
                      <select
                        value={l.repeticao}
                        onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { repeticao: e.target.value as 'unico' | 'parcelado' | 'recorrente' } })}
                      >
                        <option value="unico">Único</option>
                        <option value="parcelado">Parcelado</option>
                        <option value="recorrente">Recorrente</option>
                      </select>
                    </ImportField>
                    {l.repeticao === 'parcelado' && (
                      <ImportField label="Nº de parcelas">
                        <input
                          type="number"
                          min={2}
                          max={60}
                          value={l.parcelas}
                          onChange={(e) => dispatch({ type: 'UPDATE_LINE', index: i, patch: { parcelas: Math.max(2, Math.min(60, Number(e.target.value) || 2)) } })}
                          className="parcelas"
                        />
                      </ImportField>
                    )}
                    {l.repeticao === 'recorrente' && (
                      <span className="muted-light" style={{ fontSize: '0.75rem', alignSelf: 'flex-end', paddingBottom: '0.45rem' }}>24 meses</span>
                    )}
                    {l.parser_parcela_num && l.parser_parcela_total && (
                      <span className="muted-light" style={{ fontSize: '0.75rem', alignSelf: 'flex-end', paddingBottom: '0.45rem' }}>
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

/** Wrapper de campo no review da tela de Importar — label pequena em cima
 *  do input/select pra distinguir visualmente Pagador vs Dono (ambos
 *  mostram "Bam"/"Evellyn" no select). Usa flex vertical pra não bagunçar
 *  o layout horizontal do `.import-line`. */
function ImportField({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <label style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      flex: grow ? '1 1 12rem' : '0 0 auto',
      minWidth: 0,
    }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--muted)', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        {label}
      </span>
      {children}
    </label>
  )
}
