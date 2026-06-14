/**
 * Parser de fatura PDF do Santander.
 *
 * STUB — não implementado. Precisa de pelo menos 1 PDF real (com dados
 * sensíveis redigidos) em `samples/santander-*.pdf` pra calibrar layout.
 * Ver `itau-fatura.ts` como referência da forma final.
 */

import type { LineInput, ParsedFatura } from './types'

export function parseSantanderFatura(_lines: LineInput[]): ParsedFatura {
  throw new Error(
    'Parser Santander ainda não foi implementado — falta um PDF de exemplo pra calibrar. Coloque em samples/santander-*.pdf e peça pra um agente terminar.',
  )
}
