/**
 * Parser de fatura PDF do Nubank.
 *
 * STUB — não implementado. Precisa de pelo menos 1 PDF real de fatura
 * Nubank (com valores/CPF redigidos) em `samples/nubank-*.pdf` pra
 * calibrar:
 *  - Onde começa/termina o bloco de lançamentos (regex de cabeçalho/total).
 *  - Formato da data de cada transação.
 *  - Como o Nubank representa parcelas (ex.: "PARCELA N/M" no fim?).
 *  - Estrutura de coluna (X mín/máx) pra ignorar lateral de juros/encargos.
 *  - Regex de "Vencimento" e "Total a pagar".
 *
 * Veja `itau-fatura.ts` como referência da forma final.
 */

import type { LineInput, ParsedFatura } from './types'

export function parseNubankFatura(_lines: LineInput[]): ParsedFatura {
  throw new Error(
    'Parser Nubank ainda não foi implementado — falta um PDF de exemplo pra calibrar. Coloque em samples/nubank-*.pdf e peça pra um agente terminar.',
  )
}
