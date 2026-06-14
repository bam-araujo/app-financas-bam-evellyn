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

// Estratégia: agrupar items por Y na mesma página. Dentro de cada grupo Y,
// ordena por X e quebra em sub-linhas quando há gap horizontal grande
// (split por coluna em fatura multi-col).
//
// Também emite um dump diagnóstico (window.__pdfDebug__ = items) pra
// permitir inspecionar coordenadas via console no celular se precisar.

const COLUMN_GAP_PT = 15  // gap mínimo entre items pra considerar coluna diferente

export interface DebugItem {
  page: number
  x: number
  y: number
  w: number
  str: string
}

export interface ExtractedLine {
  text: string
  x: number   // x onde a linha COMEÇA na página
  y: number
  page: number
}

let lastDebug: DebugItem[] = []
export function getLastExtractionDebug(): DebugItem[] {
  return lastDebug
}

/** API antiga: só os textos, na ordem de leitura (top→bottom em cada página). */
export async function extractPdfLines(file: File | ArrayBuffer): Promise<string[]> {
  const r = await extractPdfLinesWithMeta(file)
  return r.map((l) => l.text)
}

/** Mesma coisa que extractPdfLines mas carrega x/y/page por linha. */
export async function extractPdfLinesWithMeta(file: File | ArrayBuffer): Promise<ExtractedLine[]> {
  const data = file instanceof File ? await file.arrayBuffer() : file
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const allLines: ExtractedLine[] = []
  lastDebug = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const items = content.items as TextItem[]

    type Group = { y: number; items: { x: number; w: number; str: string }[] }
    const groups: Group[] = []
    for (const it of items) {
      if (!it.str) continue
      const y = Math.round(it.transform[5])
      const x = it.transform[4]
      const w = it.width ?? 0
      lastDebug.push({ page: p, x, y, w, str: it.str })
      const existing = groups.find((g) => Math.abs(g.y - y) <= 2)
      if (existing) {
        existing.items.push({ x, w, str: it.str })
        existing.y = (existing.y + y) / 2
      } else {
        groups.push({ y, items: [{ x, w, str: it.str }] })
      }
    }

    groups.sort((a, b) => b.y - a.y) // top-down
    for (const g of groups) {
      g.items.sort((a, b) => a.x - b.x)
      let buffer: { x: number; str: string }[] = []
      let prevEnd = -Infinity
      for (const it of g.items) {
        if (it.x - prevEnd > COLUMN_GAP_PT && buffer.length) {
          const line = buffer.map((b) => b.str).join(' ').replace(/\s+/g, ' ').trim()
          if (line) allLines.push({ text: line, x: buffer[0].x, y: g.y, page: p })
          buffer = []
        }
        buffer.push({ x: it.x, str: it.str })
        prevEnd = it.x + it.w
      }
      if (buffer.length) {
        const line = buffer.map((b) => b.str).join(' ').replace(/\s+/g, ' ').trim()
        if (line) allLines.push({ text: line, x: buffer[0].x, y: g.y, page: p })
      }
    }
  }
  return allLines
}
