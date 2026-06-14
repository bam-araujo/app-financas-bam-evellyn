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
}

export async function extractPdfLines(file: File | ArrayBuffer): Promise<string[]> {
  const data = file instanceof File ? await file.arrayBuffer() : file
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const allLines: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const items = content.items as TextItem[]
    // Agrupa por Y (arredonda pra inteiro). Se vários itens estão a < 2pt de
    // diferença em Y, considera mesma linha.
    type Group = { y: number; items: { x: number; str: string }[] }
    const groups: Group[] = []
    for (const it of items) {
      if (!it.str) continue
      const y = Math.round(it.transform[5])
      const x = it.transform[4]
      const existing = groups.find((g) => Math.abs(g.y - y) <= 2)
      if (existing) {
        existing.items.push({ x, str: it.str })
        existing.y = (existing.y + y) / 2
      } else {
        groups.push({ y, items: [{ x, str: it.str }] })
      }
    }
    groups.sort((a, b) => b.y - a.y) // top-down
    for (const g of groups) {
      g.items.sort((a, b) => a.x - b.x)
      const line = g.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim()
      if (line) allLines.push(line)
    }
  }
  return allLines
}
