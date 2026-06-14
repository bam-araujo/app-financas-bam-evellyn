/**
 * Parser de fatura PDF do Mercado Pago.
 *
 * STUB — não implementado. Precisa de pelo menos 1 PDF real (com dados
 * sensíveis redigidos) em `samples/mercadopago-*.pdf` pra calibrar layout.
 * Ver `itau-fatura.ts` como referência da forma final.
 */

import type { LineInput, ParsedFatura } from './types'

export function parseMercadoPagoFatura(_lines: LineInput[]): ParsedFatura {
  throw new Error(
    'Parser Mercado Pago ainda não foi implementado — falta um PDF de exemplo pra calibrar. Coloque em samples/mercadopago-*.pdf e peça pra um agente terminar.',
  )
}
