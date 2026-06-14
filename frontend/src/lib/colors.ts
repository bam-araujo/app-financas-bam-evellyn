/**
 * Paleta pra gráficos — identidade visual Dueto: laranja + preto.
 * Pessoas viram laranja vivo (Bam) e grafite (Evellyn) — contrastam bem
 * em barras empilhadas e estão alinhadas com a marca.
 */

export const COLOR_BAM = '#f97316'      // laranja vivo (orange-500)
export const COLOR_EVELLYN = '#262626'  // grafite (neutral-800)

// Paleta categórica — variedade necessária pra ~14 categorias. Mantém o laranja
// como cor primária mas garante distinção visual entre fatias adjacentes.
export const CATEGORY_PALETTE = [
  '#f97316', '#262626', '#fb923c', '#525252', '#ea580c',
  '#737373', '#fdba74', '#404040', '#9a3412', '#171717',
  '#fed7aa', '#a3a3a3', '#c2410c', '#0a0a0a', '#d4d4d4',
]

export function colorForIndex(i: number): string {
  return CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]
}
