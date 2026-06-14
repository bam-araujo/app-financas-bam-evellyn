/**
 * Parser da fatura PDF do cartão Itaú.
 *
 * Entrada: lista de linhas extraídas do PDF (com coordenadas X opcionais).
 * Saída: lista de transações ({ data_compra, descricao, valor, parcela?, parcela_total? })
 *        + metadata da fatura ({ vencimento, total }).
 *
 * Regras:
 *  - Bloco "Lançamentos: compras e saques" é o alvo. Termina em "Lançamentos no
 *    cartão" / "Total dos lançamentos atuais" / "Compras parceladas".
 *  - Linha de transação: começa com DD/MM seguido de descrição e termina em VALOR.
 *  - DD/DD no meio (último, antes do valor) = parcela atual/total. Vai pra
 *    descrição como "(N/M)".
 *  - Linhas sem data são continuação (cidade/categoria) — só se estiverem na
 *    coluna esquerda (X < LEFT_COLUMN_MAX_X). Lixo da coluna direita (encargos,
 *    limites etc.) é ignorado.
 *  - "PAGAMENTO DEB AUTOMATIC" e tudo dentro de "Compras parceladas — próximas
 *    faturas" é ignorado.
 */

// Linhas que começam em X >= isso são consideradas coluna direita e ignoradas
// pelo parser. Na fatura Itaú, coluna esquerda começa em x≈133 e direita em
// x≈350; valor 250 cobre folga em ambos os lados.
const LEFT_COLUMN_MAX_X = 250

// Tipos compartilhados pelos parsers vivem em ./types — todo banco devolve
// o mesmo formato pra UI de Importar ser banco-agnóstica.
import type { FaturaMeta, FaturaTransaction, LineInput, ParsedFatura } from './types'
export type { FaturaMeta, FaturaTransaction, LineInput, ParsedFatura }

const RE_DATA_INICIO = /^(\d{2})\/(\d{2})\b/
const RE_VALOR_FINAL = /(-?\d{1,3}(?:\.\d{3})*,\d{2})$/
// Última ocorrência de DD/DD no fim da descrição (antes do valor)
const RE_PARCELA_FINAL = /(\d{2})\/(\d{2})$/
const RE_VENCIMENTO = /Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/i
const RE_TITULAR = /Titular\s+(.+?)\s+Cart[aã]o/i

function parseValorBR(s: string): number {
  // "1.234,56" → 1234.56; "678,00" → 678; "-1.779,82" → -1779.82
  const cleaned = s.replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  return isFinite(n) ? n : NaN
}

function parseDataBR(s: string, year: number): string {
  // "05/02" + 2026 → "2026-02-05"
  const [d, m] = s.split('/')
  if (!d || !m) return ''
  return `${year}-${m}-${d}`
}

function inferYear(vencISO: string, dataMM: string): number {
  // Vencimento Y-M; data tem mes MM. Se MM > M, é do ano anterior;
  // caso contrário, é do mesmo ano. (parcelas podem vir de meses passados)
  if (!vencISO) return new Date().getFullYear()
  const vy = Number(vencISO.slice(0, 4))
  const vm = Number(vencISO.slice(5, 7))
  const tm = Number(dataMM)
  if (tm > vm) return vy - 1
  return vy
}

/**
 * Lê a metadata da fatura (vencimento, total, titular) varrendo todas as linhas.
 */
function extractMeta(lines: LineInput[]): FaturaMeta {
  let vencimento = ''
  let total = 0
  let titular = ''
  for (const line of lines) {
    const text = line.text
    if (!vencimento) {
      const m = text.match(RE_VENCIMENTO)
      if (m) {
        const [d, mo, y] = m[1].split('/')
        vencimento = `${y}-${mo}-${d}`
      }
    }
    if (!titular) {
      const m = text.match(RE_TITULAR)
      if (m) titular = m[1].trim()
    }
    if (!total) {
      const m = text.match(/Total desta fatura\s*([\d.,]+)/i)
      if (m) {
        const v = parseValorBR(m[1])
        if (isFinite(v)) total = v
      }
    }
  }
  return { vencimento, total, titular }
}

/** Aceita string[] (back-compat) ou LineInput[]. */
export function parseItauFatura(input: string[] | LineInput[]): ParsedFatura {
  const lines: LineInput[] = (input as unknown[]).map((l) =>
    typeof l === 'string' ? { text: l } : (l as LineInput),
  )
  const meta = extractMeta(lines)

  // Acha início da seção "Lançamentos: compras e saques" (texto que aparece na
  // esquerda, mas pode chegar em qualquer coluna do extrator — não filtra X aqui).
  let startIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/Lan[çc]amentos:\s*compras\s+e\s+saques/i.test(lines[i].text)) { startIdx = i + 1; break }
  }
  // Acha fim — primeira ocorrência de qualquer terminator
  const TERMINATORS = [
    /^Lan[çc]amentos no cart[ãa]o\b/i,
    /^Total dos lan[çc]amentos atuais\b/i,
    /^Compras parceladas/i,
  ]
  let endIdx = lines.length
  if (startIdx >= 0) {
    for (let i = startIdx; i < lines.length; i++) {
      if (TERMINATORS.some((re) => re.test(lines[i].text))) { endIdx = i; break }
    }
  }

  const txs: FaturaTransaction[] = []
  if (startIdx < 0) return { meta, transactions: txs }

  let current: FaturaTransaction | null = null
  for (let i = startIdx; i < endIdx; i++) {
    const line = lines[i]
    const raw = line.text.trim()
    if (!raw) continue
    // Ignora qualquer linha da coluna direita (encargos, limites, etc.)
    // que tenha X conhecido — só lidamos com a coluna de lançamentos.
    if (line.x !== undefined && line.x >= LEFT_COLUMN_MAX_X) continue
    // ignora linhas de cabeçalho de coluna ou nome do titular
    if (/^DATA\b/i.test(raw)) continue
    if (/^ESTABELECIMENTO\b/i.test(raw)) continue
    if (meta.titular && raw.toUpperCase() === meta.titular.toUpperCase()) continue
    // Pagamento DEB AUTOMATIC: ignora (é pagamento da fatura anterior, não despesa)
    if (/PAGAMENTO DEB AUTOMATIC/i.test(raw)) { current = null; continue }
    // Total/sub-total: encerra
    if (TERMINATORS.some((re) => re.test(raw))) break

    const dMatch = raw.match(RE_DATA_INICIO)
    if (dMatch) {
      // Nova transação
      // Cabe valor no fim?
      const vMatch = raw.match(RE_VALOR_FINAL)
      if (!vMatch) {
        // Linha começa com data mas não tem valor — provavelmente lixo. Skip.
        current = null
        continue
      }
      const dataStr = `${dMatch[1]}/${dMatch[2]}`
      const valor = Math.abs(parseValorBR(vMatch[1]))
      // tudo entre data e valor
      const afterDate = raw.slice(dMatch[0].length).trim()
      let descricao = afterDate.slice(0, afterDate.length - vMatch[1].length).trim()

      // Detecta parcela DD/DD no FIM da descrição
      let parcelaNum: number | undefined
      let parcelaTotal: number | undefined
      const pMatch = descricao.match(RE_PARCELA_FINAL)
      if (pMatch) {
        const n = Number(pMatch[1])
        const t = Number(pMatch[2])
        if (n >= 1 && t >= 1 && t >= n && t <= 60) {
          parcelaNum = n
          parcelaTotal = t
          descricao = descricao.slice(0, descricao.length - pMatch[0].length).trim()
        }
      }

      const year = inferYear(meta.vencimento, dMatch[2])
      const data_compra = parseDataBR(dataStr, year)

      current = {
        data_compra,
        descricao,
        valor,
        ...(parcelaNum && parcelaTotal ? { parcela_num: parcelaNum, parcela_total: parcelaTotal } : {}),
        raw_line: raw,
      }
      txs.push(current)
    } else if (current) {
      // Continuação da descrição (cidade/categoria sem data) — só anexa se
      // não parece linha de encargo/juros (defesa extra além do filtro de X).
      if (/\d+,\d{2}/.test(raw) && /%/.test(raw)) continue
      current.descricao = `${current.descricao} ${raw}`.replace(/\s+/g, ' ').trim()
      current.raw_line = `${current.raw_line} | ${raw}`
    }
  }

  return { meta, transactions: txs }
}
