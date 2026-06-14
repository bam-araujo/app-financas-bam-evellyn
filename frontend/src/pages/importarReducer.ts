import type { Pessoa } from '../api/types'
import type { ParsedFatura } from '../lib/parsers/itau-fatura'

/**
 * Estado e transições da tela de Importar fatura. Sai de um pacote de
 * 6 useStates correlatos pra um único reducer — cada transição vira uma
 * action nomeada, e a página fica focada em render.
 */

export type LineState = {
  data: string
  descricao: string
  categoria: string
  valor_input: string
  pagador: Pessoa
  tipo: 'individual' | 'conjunto'
  dono: '' | Pessoa
  // Repetição da linha (independente do que o parser detectou):
  // 'unico' = cria 1 row; 'parcelado' = cria N rows mensais; 'recorrente' = 24 meses.
  repeticao: 'unico' | 'parcelado' | 'recorrente'
  parcelas: number
  selected: boolean
  // Dedup: setado quando há lançamento existente com mesma data+valor+inicio-de-descricao.
  // Quando true, vem desmarcado por padrão (selected=false) pra evitar duplicar.
  dupe?: boolean
  // info do parser, só pra contexto/badge
  parser_parcela_num?: number
  parser_parcela_total?: number
}

export type Phase = 'idle' | 'parsing' | 'review' | 'saving' | 'done'

export interface SaveResult {
  /** Lançamentos criados nesta fatura (1 por linha selecionada — não conta
   *  parcelas futuras nem meses recorrentes que o backend materializa). */
  ok: number
  /** Lançamentos adicionais criados pra parcelas futuras e meses recorrentes.
   *  Mostrados separadamente pra não assustar com "24 lançamentos criados"
   *  quando o user só importou 1 linha recorrente. */
  extras: number
  fail: number
  errors: string[]
}

export interface ImportarState {
  phase: Phase
  error: string | null
  parsed: ParsedFatura | null
  rawLines: string[]
  lines: LineState[]
  saveResult: SaveResult | null
}

export const initialImportarState: ImportarState = {
  phase: 'idle',
  error: null,
  parsed: null,
  rawLines: [],
  lines: [],
  saveResult: null,
}

export type ImportarAction =
  | { type: 'PARSE_START' }
  | { type: 'PARSE_OK'; rawLines: string[]; parsed: ParsedFatura; lines: LineState[] }
  | { type: 'PARSE_FAIL'; error: string }
  | { type: 'UPDATE_LINE'; index: number; patch: Partial<LineState> }
  | { type: 'TOGGLE_ALL'; selected: boolean }
  | { type: 'SET_DUPE_FLAGS'; dupeIndexes: number[] }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_OK'; result: SaveResult }
  | { type: 'SAVE_FAIL'; error: string }
  | { type: 'RESET' }

export function importarReducer(state: ImportarState, action: ImportarAction): ImportarState {
  switch (action.type) {
    case 'PARSE_START':
      return { ...state, phase: 'parsing', error: null, saveResult: null }
    case 'PARSE_OK':
      return {
        ...state,
        phase: 'review',
        rawLines: action.rawLines,
        parsed: action.parsed,
        lines: action.lines,
      }
    case 'PARSE_FAIL':
      return { ...state, phase: 'idle', error: action.error }
    case 'UPDATE_LINE':
      return {
        ...state,
        lines: state.lines.map((l, i) => (i === action.index ? { ...l, ...action.patch } : l)),
      }
    case 'TOGGLE_ALL':
      return { ...state, lines: state.lines.map((l) => ({ ...l, selected: action.selected })) }
    case 'SET_DUPE_FLAGS': {
      // Linhas marcadas como dupe ficam desmarcadas por padrão.
      const dupes = new Set(action.dupeIndexes)
      return {
        ...state,
        lines: state.lines.map((l, i) =>
          dupes.has(i) ? { ...l, dupe: true, selected: false } : { ...l, dupe: false },
        ),
      }
    }
    case 'SAVE_START':
      return { ...state, phase: 'saving', error: null }
    case 'SAVE_OK':
      return { ...state, phase: 'done', saveResult: action.result }
    case 'SAVE_FAIL':
      return { ...state, phase: 'review', error: action.error }
    case 'RESET':
      return initialImportarState
  }
}
