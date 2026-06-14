/**
 * Extrai linhas de texto de um PDF client-side via pdfjs-dist.
 *
 * Agrupa text items por coordenada Y (≈ mesma linha visual). Ordena top-down
 * (Y decresce em PDF coords) e left-right.
 */
import * as pdfjsLib from 'pdfjs-dist'
// Worker shipado pelo pdfjs-dist; Vite resolve o ?url e gera um asset
// próprio no build.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface TextItem {
  str: string
  transform: number[]   // [a, b, c, d, e, f] — e = x, f = y
  width?: number
  height?: number
}

// Estratégia: pra cada página, primeiro CLASSIFICA cada item em "coluna" pelo
// X (esquerda ou direita do meio da página). Depois agrupa por Y dentro de
// cada coluna separadamente. Assim items que estão na mesma altura mas em
// colunas diferentes (típico em fatura Itaú: Lançamentos à esquerda + Encargos
// à direita) viram linhas distintas, mesmo quando o gap horizontal é pequeno.
//
// Saída: linhas da coluna esquerda (top→bottom), depois coluna direita (top→bottom)
// — preserva o sentido de leitura do documento.

const COLUMN_GAP_PT = 12  // gap mínimo entre items pra split dentro da mesma coluna

export async function extractPdfLines(file: File | ArrayBuffer): Promise<string[]> {
  const data = file instanceof File ? await file.arrayBuffer() : file
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const allLines: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const items = content.items as TextItem[]

    // Calcula o boundary de coluna baseado na página. page.view = [x0,y0,x1,y1].
    const view = page.view as number[]
    const pageMid = (view[0] + view[2]) / 2

    // Separa items em 2 colunas
    type Item = { x: number; y: number; w: number; str: string }
    const leftItems: Item[] = []
    const rightItems: Item[] = []
    for (const it of items) {
      if (!it.str) continue
      const x = it.transform[4]
      const y = it.transform[5]
      const w = it.width ?? 0
      // Centro horizontal do item determina a coluna (mais robusto que só o start)
      const centerX = x + w / 2
      const col = centerX < pageMid ? leftItems : rightItems
      col.push({ x, y, w, str: it.str })
    }

    for (const colItems of [leftItems, rightItems]) {
      // Agrupa por Y (tolerância 2pt)
      type Group = { y: number; items: Item[] }
      const groups: Group[] = []
      for (const it of colItems) {
        const y = Math.round(it.y)
        const existing = groups.find((g) => Math.abs(g.y - y) <= 2)
        if (existing) {
          existing.items.push(it)
          existing.y = (existing.y + y) / 2
        } else {
          groups.push({ y, items: [it] })
        }
      }
      groups.sort((a, b) => b.y - a.y) // top-down
      for (const g of groups) {
        g.items.sort((a, b) => a.x - b.x)
        // Mesmo dentro da coluna pode haver pequenos sub-blocos — split por gap
        let buffer: string[] = []
        let prevEnd = -Infinity
        for (const it of g.items) {
          if (it.x - prevEnd > COLUMN_GAP_PT && buffer.length) {
            const line = buffer.join(' ').replace(/\s+/g, ' ').trim()
            if (line) allLines.push(line)
            buffer = []
          }
          buffer.push(it.str)
          prevEnd = it.x + it.w
        }
        if (buffer.length) {
          const line = buffer.join(' ').replace(/\s+/g, ' ').trim()
          if (line) allLines.push(line)
        }
      }
    }
  }
  return allLines
}
