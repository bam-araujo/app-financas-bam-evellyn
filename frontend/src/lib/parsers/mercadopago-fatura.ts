/**
 * Parser de fatura PDF do cartão Mercado Pago.
 *
 * Layout (calibrado com samples/mercadopago-2026-05.pdf):
 *  - Meta: "Vence em DD/MM/YYYY" (pág. 1) e "Vencimento: DD/MM/YYYY" (header
 *    das outras págs). Total: "Total a pagar  R$ X,XX". Titular: "Olá, <nome>".
 *  - Bloco de transações na seção "Detalhes de consumo" (pág. 2).
 *  - Sub-seções:
 *    · "Movimentações na fatura" — pode conter:
 *        · "Pagamento da fatura de abril/2026" → SKIP (não é despesa)
 *        · "Tarifa de uso do crédito emergencial" → keep (encargo real)
 *    · "Cartão Visa [************XXXX]" (uma ou mais vezes, paginado).
 *  - Cada transação: "DD/MM <descrição> [Parcela N de M] R$ X,XX"
 *  - "Parcela N de M" aparece no MEIO da linha (entre descrição e valor),
 *    não no fim como no Itaú. Capturado por regex separada.
 *  - Cada "Cartão Visa" termina com "Total R$ X,XX" → skip esses totals.
 *  - Stop em "Parcele a fatura do seu Cartão de Crédito Mercado Pago" (pág. 4).
 *
 * Datas vêm em DD/MM sem ano — inferido pelo mês do vencimento (mesma
 * heurística do Itaú: se mês da compra > mês do vencimento, ano anterior).
 *
 * Sample em samples/mercadopago-2026-05.pdf (gitignored).
 */

import type { FaturaMeta, FaturaTransaction, LineInput, ParsedFatura } from './types'

const RE_TX_START = /^(\d{2})\/(\d{2})\b/
const RE_VALOR_END = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/
// "Parcela 6 de 9" no meio da descrição
const RE_PARCELA = /\bParcela\s+(\d+)\s+de\s+(\d+)\b/i
const RE_VENCIMENTO_TOP = /Vence em\s*(\d{2})\/(\d{2})\/(\d{4})/i
const RE_VENCIMENTO_HEADER = /Vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})/i
const RE_TOTAL = /Total a pagar\s*R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i
const RE_TITULAR = /Olá,\s*(.+?)\s*$/i

const TERMINATORS = [
  /^Parcele a fatura do seu Cart[ãa]o/i,
]

// Lines em "Movimentações na fatura" que não são despesas — pagamento de
// fatura anterior, créditos devolvidos. Encargos (tarifas) NÃO entram aqui.
const SKIP_DESCRICAO = [
  /^Pagamento da fatura\b/i,
  /^Cr[ée]dito devolvido\b/i,
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
  if (tm > vm) return vy - 1
  return vy
}

function extractMeta(lines: LineInput[]): FaturaMeta {
  let vencimento = ''
  let total = 0
  let titular = ''
  for (const line of lines) {
    const t = line.text.trim()
    if (!t) continue
    if (!vencimento) {
      const m = t.match(RE_VENCIMENTO_TOP) || t.match(RE_VENCIMENTO_HEADER)
      if (m) vencimento = `${m[3]}-${m[2]}-${m[1]}`
    }
    if (!total) {
      const m = t.match(RE_TOTAL)
      if (m) {
        const v = parseValorBR(m[1])
        if (isFinite(v)) total = v
      }
    }
    if (!titular) {
      const m = t.match(RE_TITULAR)
      if (m && !/Olá/i.test(m[1])) titular = m[1].trim()
    }
  }
  return { vencimento, total, titular }
}

export function parseMercadoPagoFatura(input: LineInput[]): ParsedFatura {
  const lines = input.map((l) => ({ ...l, text: l.text.trim() }))
  const meta = extractMeta(lines)
  const txs: FaturaTransaction[] = []

  // Encontra início do bloco "Detalhes de consumo"
  let startIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/Detalhes de consumo/i.test(lines[i].text)) { startIdx = i + 1; break }
  }
  if (startIdx < 0) return { meta, transactions: txs }

  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i].text
    if (!raw) continue
    if (TERMINATORS.some((re) => re.test(raw))) break

    // Skips de header de seção/coluna/total
    if (/^Data\s+Movimenta/i.test(raw)) continue
    if (/^Cart[ãa]o Visa/i.test(raw)) continue
    if (/^Movimenta[çc][õo]es na fatura/i.test(raw)) continue
    if (/^Total\s+R\$/i.test(raw)) continue
    if (/^Vencimento:/i.test(raw)) continue
    if (meta.titular && raw.includes(meta.titular)) continue

    const dMatch = raw.match(RE_TX_START)
    if (!dMatch) continue

    const vMatch = raw.match(RE_VALOR_END)
    if (!vMatch) continue

    // Valida dia/mês
    const day = dMatch[1]
    const mes = dMatch[2]
    const dN = Number(day), mN = Number(mes)
    if (dN < 1 || dN > 31 || mN < 1 || mN > 12) continue

    const year = inferYear(meta.vencimento, mes)
    const data_compra = `${year}-${mes}-${day}`

    // Descrição = entre data e valor
    let descricao = raw.slice(dMatch[0].length, raw.length - vMatch[0].length).trim()

    if (SKIP_DESCRICAO.some((re) => re.test(descricao))) continue

    // Parcela "N de M" no meio
    let parcela_num: number | undefined
    let parcela_total: number | undefined
    const pMatch = descricao.match(RE_PARCELA)
    if (pMatch) {
      const n = Number(pMatch[1])
      const t = Number(pMatch[2])
      if (n >= 1 && t >= n && t <= 60) {
        parcela_num = n
        parcela_total = t
        descricao = descricao.replace(RE_PARCELA, '').trim()
      }
    }

    const valor = parseValorBR(vMatch[1])
    if (!isFinite(valor) || valor <= 0) continue

    txs.push({
      data_compra,
      descricao,
      valor,
      ...(parcela_num && parcela_total ? { parcela_num, parcela_total } : {}),
      raw_line: raw,
    })
  }

  return { meta, transactions: txs }
}
