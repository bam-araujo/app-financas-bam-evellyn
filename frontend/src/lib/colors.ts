/**
 * Paleta pra gráficos. Cores de pessoa lidas da aba `pessoas` quando disponíveis;
 * paleta de categorias é fixa (suficiente pra ~14 categorias).
 */

export const COLOR_BAM = '#2563eb'      // azul (default — sobrepõe se pessoas tiver outra)
export const COLOR_EVELLYN = '#db2777'  // rosa

// Paleta categórica — escolhida pra contrastar entre si, OK em light/dark.
export const CATEGORY_PALETTE = [
  '#2563eb', '#db2777', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#14b8a6', '#f97316', '#06b6d4', '#a855f7',
  '#84cc16', '#ec4899', '#0ea5e9', '#eab308', '#22c55e',
]

export function colorForIndex(i: number): string {
  return CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]
}
