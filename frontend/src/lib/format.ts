/**
 * Helpers de formatação pt-BR. Centralizado pra manter o app inteiro consistente
 * (moeda, datas, competência). Sem libs externas — só Intl.
 */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(value: number): string {
  if (!isFinite(value)) return BRL.format(0)
  return BRL.format(value)
}

/**
 * Converte texto BR/US em number. Aceita também `number`.
 * Regras:
 *  - se tem `.` e `,`, o ÚLTIMO é o decimal; o outro é separador de milhar
 *  - se tem só `,` → decimal BR ("100,50" → 100.5)
 *  - se tem só `.` → decimal US ("100.50" → 100.5)
 *  - "1.234,56" → 1234.56 / "1,234.56" → 1234.56
 *  - aceita "R$" e espaços
 */
export function parseBRL(input: string | number): number {
  if (typeof input === 'number') return input
  if (!input) return 0
  let s = String(input).replace(/\s/g, '').replace(/R\$/i, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // BR: 1.234,56 → tira pontos, troca vírgula por ponto
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // US: 1,234.56 → tira vírgulas
      s = s.replace(/,/g, '')
    }
  } else if (lastComma >= 0) {
    s = s.replace(',', '.')
  }
  // se só tem ponto, fica como está (decimal US)
  const n = Number(s)
  return isFinite(n) ? n : 0
}

/** YYYY-MM-DD → "14/06/2026". Aceita string vazia → "". */
export function formatDateBR(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length < 10) return yyyymmdd || ''
  const [y, m, d] = yyyymmdd.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** YYYY-MM → "jun/2026" (style:'short') ou "junho/2026" ('long'). */
export function formatCompetenciaBR(yyyymm: string, style: 'short' | 'long' = 'short'): string {
  if (!yyyymm || !/^\d{4}-\d{2}$/.test(yyyymm)) return yyyymm || ''
  const [y, m] = yyyymm.split('-')
  const idx = Number(m) - 1
  const list = style === 'short' ? MESES_ABREV : MESES_FULL
  return `${list[idx] ?? m}/${y}`
}
