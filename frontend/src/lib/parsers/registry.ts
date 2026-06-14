/**
 * Registry de parsers de fatura por banco/emissor. A UI de Importar é
 * banco-agnóstica: pede `parseFatura(bank, lines)` ou roda `detectBank(lines)`
 * pra inferir o emissor automaticamente.
 *
 * Pra adicionar um parser novo:
 *  1. Criar arquivo `parsers/<banco>-fatura.ts` exportando uma função
 *     `(lines: LineInput[]) => ParsedFatura`.
 *  2. Adicionar entrada em `BANKS` abaixo com `detect` e `parse`.
 *  3. (Opcional) Refinar a regex de detect baseado em frases únicas da fatura.
 *
 * Padrão de calibração: precisa de pelo menos 1 PDF de exemplo do banco
 * (com coords X/Y) pra entender layout. Veja `samples/` (gitignored).
 */

import { parseItauFatura } from './itau-fatura'
import { parseMercadoPagoFatura } from './mercadopago-fatura'
import { parseNubankFatura } from './nubank-fatura'
import { parseSantanderFatura } from './santander-fatura'
import type { LineInput, ParsedFatura } from './types'

export type Bank = 'itau' | 'nubank' | 'santander' | 'mercadopago'
export type BankSelection = 'auto' | Bank

export interface BankInfo {
  id: Bank
  label: string
  /** Heurística de detecção: scaneia linhas em busca de assinatura do emissor.
   *  Falso positivo é pior que falso negativo (parser errado destrói parse),
   *  então prefira regex específicas de cada banco (nome legal, slogan, etc.). */
  detect: (lines: LineInput[]) => boolean
  parse: (lines: LineInput[]) => ParsedFatura
  /** Mensagem mostrada na UI quando o parser ainda é stub (não implementado). */
  pending?: boolean
}

export const BANKS: Record<Bank, BankInfo> = {
  itau: {
    id: 'itau',
    label: 'Itaú',
    detect: (lines) =>
      lines.some((l) => /ita[uú]card|fatura\s+do\s+seu\s+cart[ãa]o|banco\s+ita[uú]/i.test(l.text)),
    parse: parseItauFatura,
  },
  nubank: {
    id: 'nubank',
    label: 'Nubank',
    detect: (lines) =>
      lines.some((l) => /\bnubank\b|nu\s+pagamentos|nupay/i.test(l.text)),
    parse: parseNubankFatura,
    pending: true,
  },
  santander: {
    id: 'santander',
    label: 'Santander',
    detect: (lines) => lines.some((l) => /\bsantander\b/i.test(l.text)),
    parse: parseSantanderFatura,
    pending: true,
  },
  mercadopago: {
    id: 'mercadopago',
    label: 'Mercado Pago',
    detect: (lines) =>
      lines.some((l) => /mercado\s*pago|mercadopago/i.test(l.text)),
    parse: parseMercadoPagoFatura,
    pending: true,
  },
}

/** Lista pra UI (dropdown). Ordem fixa: Itaú primeiro (default). */
export const BANK_ORDER: Bank[] = ['itau', 'nubank', 'santander', 'mercadopago']

/** Tenta detectar o emissor pela 1ª assinatura que bate. Devolve null se
 *  nenhuma bater — UI sugere o usuário escolher manualmente. */
export function detectBank(lines: LineInput[]): Bank | null {
  for (const id of BANK_ORDER) {
    if (BANKS[id].detect(lines)) return id
  }
  return null
}

export function parseFatura(bank: Bank, lines: LineInput[]): ParsedFatura {
  return BANKS[bank].parse(lines)
}
