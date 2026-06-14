import { useMemo, useState } from 'react'
import { batchCreate } from '../api/client'
import type { CreatePayload, Pessoa } from '../api/types'
import { useCategorias } from '../hooks/useCategorias'
import { formatBRL, formatDateBR } from '../lib/format'
import { extractPdfLines } from '../lib/parsers/pdf-extract'
import { type ParsedFatura, parseItauFatura } from '../lib/parsers/itau-fatura'

type LineState = {
  data: string
  descricao: string
  categoria: string
  valor: number
  pagador: Pessoa
  tipo: 'individual' | 'conjunto'
  dono: '' | Pessoa
  parcela_num?: number
  parcela_total?: number
  selected: boolean
}

type Phase = 'idle' | 'parsing' | 'review' | 'saving' | 'done'

export function ImportarPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedFatura | null>(null)
  const [lines, setLines] = useState<LineState[]>([])
  const [saveResult, setSaveResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null)

  const cats = useCategorias()
  const despesaCats = useMemo(
    () => cats.data.filter((c) => c.grupo === 'despesa').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [cats.data],
  )

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setSaveResult(null)
    setPhase('parsing')
    try {
      const linesText = await extractPdfLines(file)
      const result = parseItauFatura(linesText)
      if (result.transactions.length === 0) {
        throw new Error('Nenhuma transação encontrada — o PDF parece não ser uma fatura Itaú.')
      }
      setParsed(result)
      // data default = vencimento da fatura; pagador default = Bam
      const venc = result.meta.vencimento || ''
      const initial: LineState[] = result.transactions.map((tx) => ({
        data: venc,
        descricao: tx.parcela_num && tx.parcela_total
          ? `${tx.descricao} (${tx.parcela_num}/${tx.parcela_total})`
          : tx.descricao,
        categoria: '',
        valor: tx.valor,
        pagador: 'Bam',
        tipo: 'conjunto',
        dono: '',
        parcela_num: tx.parcela_num,
        parcela_total: tx.parcela_total,
        selected: true,
      }))
      setLines(initial)
      setPhase('review')
    } catch (err) {
      setError((err as Error).message)
      setPhase('idle')
    }
  }

  function update(i: number, patch: Partial<LineState>) {
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  function toggleAll(selected: boolean) {
    setLines((arr) => arr.map((l) => ({ ...l, selected })))
  }

  const selectedLines = lines.filter((l) => l.selected)
  const total = selectedLines.reduce((s, l) => s + l.valor, 0)
  const allReady = selectedLines.length > 0 && selectedLines.every((l) =>
    l.data && l.descricao.trim() && l.categoria && l.valor > 0 && l.pagador && l.tipo &&
    (l.tipo === 'individual' ? !!l.dono : !l.dono),
  )

  async function salvar() {
    setError(null)
    setPhase('saving')
    try {
      const items: CreatePayload<'lancamentos'>[] = selectedLines.map((l) => ({
        data: l.data,
        competencia: l.data.slice(0, 7),
        descricao: l.descricao.trim(),
        categoria: l.categoria,
        valor: l.valor,
        pagador: l.pagador,
        tipo: l.tipo,
        dono: (l.tipo === 'individual' ? l.dono : '') as Pessoa | '',
        serie_id: '',
        serie_tipo: '',
        parcela_num: 0,
        parcela_total: 0,
      }))
      const res = await batchCreate('lancamentos', items)
      const okN = res.results.filter((r) => r.ok).length
      const errs = res.results.filter((r) => !r.ok).map((r) => (r as { error: string }).error)
      setSaveResult({ ok: okN, fail: errs.length, errors: errs.slice(0, 5) })
      setPhase('done')
    } catch (err) {
      setError((err as Error).message)
      setPhase('review')
    }
  }

  function reset() {
    setPhase('idle')
    setParsed(null)
    setLines([])
    setError(null)
    setSaveResult(null)
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
      </header>

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
            <button type="button" className="btn btn-primary" onClick={reset}>Importar outra fatura</button>
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
            <div className="form-actions" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
              <button type="button" className="btn" onClick={() => toggleAll(true)}>Selecionar todas</button>
              <button type="button" className="btn" onClick={() => toggleAll(false)}>Limpar seleção</button>
              <button type="button" className="btn" onClick={reset}>Trocar arquivo</button>
            </div>
          </div>

          <ul className="rows import-rows">
            {lines.map((l, i) => (
              <li key={i} className={'row import-row' + (l.selected ? '' : ' import-row-off')}>
                <label className="import-check">
                  <input
                    type="checkbox"
                    checked={l.selected}
                    onChange={(e) => update(i, { selected: e.target.checked })}
                  />
                </label>
                <div className="import-row-body">
                  <div className="import-line">
                    <input
                      type="date"
                      value={l.data}
                      onChange={(e) => update(i, { data: e.target.value })}
                    />
                    <input
                      type="text"
                      value={l.descricao}
                      onChange={(e) => update(i, { descricao: e.target.value })}
                      className="grow"
                    />
                    <span className="row-valor">{formatBRL(l.valor)}</span>
                  </div>
                  <div className="import-line">
                    <select
                      value={l.categoria}
                      onChange={(e) => update(i, { categoria: e.target.value })}
                    >
                      <option value="">— categoria —</option>
                      {despesaCats.map((c) => (
                        <option key={c.id} value={c.nome}>{c.nome}</option>
                      ))}
                    </select>
                    <select
                      value={l.tipo}
                      onChange={(e) => update(i, { tipo: e.target.value as 'individual' | 'conjunto', dono: '' })}
                    >
                      <option value="conjunto">Conjunta</option>
                      <option value="individual">Individual</option>
                    </select>
                    <select
                      value={l.pagador}
                      onChange={(e) => update(i, { pagador: e.target.value as Pessoa })}
                      title="Pagador"
                    >
                      <option value="Bam">Bam</option>
                      <option value="Evellyn">Evellyn</option>
                    </select>
                    {l.tipo === 'individual' && (
                      <select
                        value={l.dono}
                        onChange={(e) => update(i, { dono: e.target.value as Pessoa })}
                        title="Dono"
                      >
                        <option value="">— dono —</option>
                        <option value="Bam">Bam</option>
                        <option value="Evellyn">Evellyn</option>
                      </select>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {error && <p className="error-msg">{error}</p>}

          <div className="form-actions" style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '0.75rem 0' }}>
            <button type="button" className="btn" onClick={reset} disabled={phase === 'saving'}>Cancelar</button>
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
