/**
 * Tipos compartilhados pelos parsers de fatura. Todo parser (Itaú, Nubank,
 * Santander, Mercado Pago, …) devolve o mesmo formato — `ParsedFatura` —
 * pra que a UI de Importar não precise saber de qual banco veio o PDF.
 */

/** Linha extraída do PDF, com coordenada X opcional pra parsers que precisam
 *  filtrar por coluna (ex.: Itaú tem coluna de encargos à direita que deve
 *  ser ignorada). Parsers que não usam X tratam tudo como coluna única. */
export interface LineInput {
  text: string
  x?: number
}

export interface FaturaTransaction {
  /** Data da compra/lançamento em YYYY-MM-DD. '' se não foi possível inferir. */
  data_compra: string
  descricao: string
  /** Valor sempre positivo (despesa). Pagamentos/estornos são filtrados pelo parser. */
  valor: number
  /** Detectada quando a linha indica "N/M" (parcelado). Opcional. */
  parcela_num?: number
  parcela_total?: number
  /** Linha bruta do PDF, pra debug/inspeção. */
  raw_line: string
}

export interface FaturaMeta {
  /** Vencimento da fatura em YYYY-MM-DD. '' se não encontrado. */
  vencimento: string
  /** "Total desta fatura" — usado pelo UI pra comparar com a soma das selecionadas. */
  total: number
  /** Nome do titular do cartão, se o parser conseguir extrair. */
  titular: string
}

export interface ParsedFatura {
  meta: FaturaMeta
  transactions: FaturaTransaction[]
}
