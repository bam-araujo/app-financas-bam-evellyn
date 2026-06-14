/**
 * Helpers de formatação pt-BR. Centralizado pra manter o app inteiro consistente
 * (moeda, datas, competência). Sem libs externas — só Intl.
 */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(value: number): string {
  if (!isFinite(value)) return BRL.format(0)
  return BRL.format(value)
}

/** Converte "1.234,56" ou "1234.56" ou "1234,56" em number. Aceita também `number`. */
export function parseBRL(input: string | number): number {
  if (typeof input === 'number') return input
  if (!input) return 0
  const cleaned = input
    .replace(/\s/g, '')
    .replace(/R\$/i, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = Number(cleaned)
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
