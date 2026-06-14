/**
 * Helpers de competência (YYYY-MM). Default = mês corrente.
 * Implementado sem Intl porque queremos a competência local pt-BR (São Paulo TZ
 * pra usuário, mas para o caso 2 usuários no Brasil basta o timezone do device).
 */

export function currentCompetencia(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Deriva YYYY-MM de uma data YYYY-MM-DD. */
export function competenciaFromDate(yyyymmdd: string): string {
  return (yyyymmdd || '').slice(0, 7)
}

/** Hoje em formato YYYY-MM-DD (timezone local). */
export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function shiftCompetencia(yyyymm: string, delta: number): string {
  const [y, m] = yyyymm.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  const ny = d.getFullYear()
  const nm = String(d.getMonth() + 1).padStart(2, '0')
  return `${ny}-${nm}`
}
