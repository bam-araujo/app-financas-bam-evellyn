/**
 * Parser de fatura PDF do Nubank.
 *
 * Layout (calibrado com samples/nubank-2026-05.pdf):
 *  - Meta de vencimento na pág. 1: "Data de vencimento: DD MMM YYYY" (MMM = JAN/FEV/...)
 *  - Titular vem nos headers das págs. 2+ em CAIXA ALTA ("EVELLYN MARTINS DOS REIS")
 *  - Total da fatura: "Total a pagar R$ X.XXX,XX" (página de resumo)
 *  - Bloco de transações na seção "TRANSAÇÕES DE DD MMM A DD MMM" (pág. 5+)
 *  - Cada transação: "DD MMM [icon nu? / •••• 1234?] descrição  R$ X,XX"
 *  - Multi-linha internacional: descrição + "BRL X = USD Y" + "Conversão:..."
 *    O valor pode ficar inline ou numa linha separada à direita (mesmo Y, mas
 *    pdf-extract.ts pode dividir se a coluna de valor for >15pt distante).
 *  - Linhas IOF aparecem como transações independentes (ex.: "29 MAR IOF de
 *    \"Linktree* Linktree\" R$ 1,53") — incluímos como despesas reais.
 *  - Bloco "Pagamentos e Financiamentos" termina o parse: contém pagamentos
 *    (negativos) e ocasionalmente parcelas atrasadas que não vamos tentar
 *    distinguir automaticamente. Usuário adiciona manualmente se necessário.
 *
 * Sample em samples/nubank-2026-05.pdf (gitignored).
 */

import type { FaturaMeta, FaturaTransaction, LineInput, ParsedFatura } from './types'

const MESES_NU: Record<string, string> = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04',
  MAI: '05', JUN: '06', JUL: '07', AGO: '08',
  SET: '09', OUT: '10', NOV: '11', DEZ: '12',
}

const RE_TX_START = /^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/
// Valor no fim, opcionalmente com sinal negativo (ASCII '-' ou unicode '−' U+2212)
const RE_VALOR_END = /([-−])?\s*R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/
// Linha SÓ com valor (no caso de pdf-extract dividir descrição e valor em
// lines diferentes por coluna)
const RE_VALOR_ONLY = /^([-−])?\s*R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/

const RE_VENCIMENTO = /Data de vencimento:\s*(\d{2})\s+([A-Z]{3})\s+(\d{4})/i
const RE_TOTAL = /Total a pagar\s+R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i
// Titular: nome em CAIXA ALTA com 2-6 palavras (header das págs 2+)
const RE_TITULAR_CAPS = /^([A-ZÀ-Ý][A-ZÀ-Ý]+(?:\s+[A-ZÀ-Ý][A-ZÀ-Ý]+){1,5})\s*$/

const TERMINATORS = [
  /^Pagamentos e Financiamentos\b/i,
  /^Em cumprimento\b/i,
]

function parseValorBR(s: string): number {
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return isFinite(n) ? n : NaN
}

function inferYear(vencISO: string, mes: string): number {
  if (!vencISO) return new Date().getFullYear()
  const vy = Number(vencISO.slice(0, 4))
  const vm = Number(vencISO.slice(5, 7))
  const tm = Number(mes)
  // Mesma heurística do Itaú: tx em mês posterior ao vencimento = ano anterior.
  if (tm > vm) return vy - 1
  return vy
}

function cleanDescricao(s: string): string {
  let d = s
  // Card mask: "•••• 7844" (4+ bullets seguidos de dígitos)
  d = d.replace(/^•+\s*\d{4,}\s*/, '')
  // "nu" como token isolado no início (renderização do logo NuPay)
  d = d.replace(/^\bnu\b\s+/i, '')
  // Lixo decorativo no início
  d = d.replace(/^[•*·.\s]+/, '')
  return d.replace(/\s+/g, ' ').trim()
}

function extractMeta(lines: LineInput[]): FaturaMeta {
  let vencimento = ''
  let total = 0
  let titular = ''
  for (const line of lines) {
    const t = line.text.trim()
    if (!t) continue
    if (!vencimento) {
      const m = t.match(RE_VENCIMENTO)
      if (m) {
        const d = m[1]
        const mes = MESES_NU[m[2].toUpperCase()] || '01'
        vencimento = `${m[3]}-${mes}-${d}`
      }
    }
    if (!total) {
      const m = t.match(RE_TOTAL)
      if (m) {
        const v = parseValorBR(m[1])
        if (isFinite(v)) total = v
      }
    }
    if (!titular) {
      const m = t.match(RE_TITULAR_CAPS)
      if (m && !/CNPJ|FATURA|EMIS|TRANSA|PAGAMENTO|RESUMO|PR[ÓO]XIMA|LIMITE|VALOR/i.test(m[1])) {
        titular = m[1].trim()
      }
    }
  }
  return { vencimento, total, titular }
}

export function parseNubankFatura(input: LineInput[]): ParsedFatura {
  const lines = input.map((l) => ({ ...l, text: l.text.trim() }))
  const meta = extractMeta(lines)
  const txs: FaturaTransaction[] = []

  // Acha início do bloco de transações.
  let startIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/TRANSA[ÇC][ÕO]ES\s+DE\b/i.test(lines[i].text)) { startIdx = i + 1; break }
  }
  if (startIdx < 0) return { meta, transactions: txs }

  let current: FaturaTransaction | null = null
  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i].text
    if (!raw) continue
    if (TERMINATORS.some((re) => re.test(raw))) break
    // Skips de cabeçalho de página
    if (/^TRANSA[ÇC][ÕO]ES/i.test(raw)) continue
    if (/^FATURA\s+\d{2}/i.test(raw)) continue
    if (/EMISS[AÃ]O E ENVIO/i.test(raw)) continue
    if (meta.titular && raw.toUpperCase() === meta.titular.toUpperCase()) continue

    const dMatch = raw.match(RE_TX_START)
    if (dMatch) {
      // Se havia uma tx pendente sem valor, dropa (ruído defensivo).
      current = null

      const day = dMatch[1]
      const mes = MESES_NU[dMatch[2].toUpperCase()] || '01'
      const year = inferYear(meta.vencimento, mes)
      const data_compra = `${year}-${mes}-${day}`

      // Valor inline?
      const vMatch = raw.match(RE_VALOR_END)
      let valor: number | null = null
      let isNegative = false
      let descricao = raw.slice(dMatch[0].length).trim()
      if (vMatch) {
        isNegative = vMatch[1] === '-' || vMatch[1] === '−'
        valor = parseValorBR(vMatch[2])
        descricao = descricao.slice(0, descricao.length - vMatch[0].length).trim()
      }

      descricao = cleanDescricao(descricao)

      // Pula pagamentos (negativos) e linhas zeradas.
      if (valor !== null && (isNegative || valor <= 0)) continue
      // Defensivo: descrição "Pagamento em DD MMM" mesmo sem sinal negativo.
      if (/^Pagamento em\b/i.test(descricao)) continue

      const tx: FaturaTransaction = { data_compra, descricao, valor: valor ?? 0, raw_line: raw }
      if (valor !== null && valor > 0) {
        txs.push(tx)
      } else {
        // Valor virá em linha separada à direita.
        current = tx
      }
    } else if (current) {
      // Tx pendente: pode ser linha-só-com-valor (column split) ou continuação.
      const only = raw.match(RE_VALOR_ONLY)
      if (only) {
        const isNeg = only[1] === '-' || only[1] === '−'
        const v = parseValorBR(only[2])
        if (isFinite(v) && v > 0 && !isNeg) {
          current.valor = v
          current.raw_line += ` | ${raw}`
          txs.push(current)
        }
        current = null
      } else {
        // Continuação da descrição (ex.: card mask em linha própria).
        current.descricao = cleanDescricao(`${current.descricao} ${raw}`)
        current.raw_line += ` | ${raw}`
      }
    }
    // else: linha de continuação após uma tx já fechada (info de conversão
    // em compras internacionais). Skip — descrição da tx já tem o essencial.
  }

  return { meta, transactions: txs }
}
