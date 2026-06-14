/**
 * Parser da fatura PDF do cartão Itaú.
 *
 * Entrada: lista de linhas de texto extraídas do PDF (na ordem visual top-down).
 * Saída: lista de transações ({ data_compra, descricao, valor, parcela?, parcela_total? })
 *        + metadata da fatura ({ vencimento, total }).
 *
 * Regras:
 *  - Bloco "Lançamentos: compras e saques" é o alvo. Termina em "Lançamentos no
 *    cartão" / "Total dos lançamentos atuais" / "Compras parceladas".
 *  - Linha de transação: começa com DD/MM seguido de descrição e termina em VALOR.
 *  - DD/DD no meio (último, antes do valor) = parcela atual/total. Vai pra
 *    descrição como "(N/M)".
 *  - Linhas sem data são continuação da descrição da transação anterior
 *    (subtítulo/categoria/cidade) — anexadas com espaço.
 *  - "PAGAMENTO DEB AUTOMATIC" e tudo dentro de "Compras parceladas — próximas
 *    faturas" é ignorado.
 */

export interface FaturaTransaction {
  /** Data DD/MM como aparece na fatura. O ano é inferido pela data de vencimento. */
  data_compra: string                 // YYYY-MM-DD ou '' se não foi possível
  descricao: string
  valor: number                       // sempre positivo
  parcela_num?: number                // se detectada
  parcela_total?: number
  raw_line: string
}

export interface FaturaMeta {
  vencimento: string                  // YYYY-MM-DD (data do vencimento)
  total: number                       // total da fatura ('Total desta fatura' / 'Lançamentos no cartão')
  titular: string
}

export interface ParsedFatura {
  meta: FaturaMeta
  transactions: FaturaTransaction[]
}

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
function extractMeta(lines: string[]): FaturaMeta {
  let vencimento = ''
  let total = 0
  let titular = ''
  for (const line of lines) {
    if (!vencimento) {
      const m = line.match(RE_VENCIMENTO)
      if (m) {
        const [d, mo, y] = m[1].split('/')
        vencimento = `${y}-${mo}-${d}`
      }
    }
    if (!titular) {
      const m = line.match(RE_TITULAR)
      if (m) titular = m[1].trim()
    }
    if (!total) {
      const m = line.match(/Total desta fatura\s*([\d.,]+)/i)
      if (m) {
        const v = parseValorBR(m[1])
        if (isFinite(v)) total = v
      }
    }
  }
  return { vencimento, total, titular }
}

export function parseItauFatura(lines: string[]): ParsedFatura {
  const meta = extractMeta(lines)

  // Acha início da seção "Lançamentos: compras e saques"
  let startIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/Lan[çc]amentos:\s*compras\s+e\s+saques/i.test(lines[i])) { startIdx = i + 1; break }
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
      if (TERMINATORS.some((re) => re.test(lines[i]))) { endIdx = i; break }
    }
  }

  const txs: FaturaTransaction[] = []
  if (startIdx < 0) return { meta, transactions: txs }

  let current: FaturaTransaction | null = null
  for (let i = startIdx; i < endIdx; i++) {
    const raw = lines[i].trim()
    if (!raw) continue
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
      // Continuação da descrição (cidade/categoria sem data)
      current.descricao = `${current.descricao} ${raw}`.replace(/\s+/g, ' ').trim()
      current.raw_line = `${current.raw_line} | ${raw}`
    }
  }

  return { meta, transactions: txs }
}
