/**
 * Helpers de rateio: como ponderar uma despesa quando o usuário filtra
 * por pessoa específica. Compartilhado entre Despesas (totais do header),
 * Dashboard (todos os charts e métricas) e qualquer outra tela que
 * precise raciocinar sobre "minha parte" de uma conjunta.
 */

import type { LancamentoRow, ShareData } from '../api/types'
import type { PessoaFiltro } from '../components/Filters'

/** Resolução de share por competência. Para tela mono-competência basta retornar
 *  o mesmo share ignorando o argumento. */
export type ShareGetter = (competencia: string) => ShareData | null

/**
 * Peso a aplicar a uma despesa, dadas as escolhas de filtro de pessoa + rateio.
 * Retorna 0 quando a despesa NÃO deve entrar no total (ex.: individual de outra
 * pessoa quando o filtro é pessoa específica).
 *
 * Regras:
 *  - pessoa = 'casal'           → peso 1 (entra cheio)
 *  - row.tipo='individual':
 *      dono = pessoa            → 1
 *      dono ≠ pessoa            → 0 (não é da pessoa, exclui)
 *  - row.tipo='conjunto':
 *      rateio off               → 1 (valor cheio)
 *      rateio on + share existe → share[pessoa]
 *      rateio on + share faltando → 0.5 (assume split igual)
 */
export function lancamentoWeight(
  row: LancamentoRow,
  pessoa: PessoaFiltro,
  rateio: boolean,
  shareGetter: ShareGetter,
): number {
  if (pessoa === 'casal') return 1
  if (row.tipo === 'individual') return row.dono === pessoa ? 1 : 0
  if (!rateio) return 1
  const s = shareGetter(row.competencia)
  if (!s) return 0.5
  return s[pessoa]
}
