/**
 * Tipos das entidades — mirror manual do SCHEMA em `backend/Code.gs`.
 * Quando o schema mudar (novo PR), atualizar os dois lados.
 */

export type Pessoa = 'Bam' | 'Evellyn'
export type Titular = 'Bam' | 'Evellyn' | 'conjunto'

export interface RowBase {
  id: string
}

export interface PessoaRow extends RowBase {
  nome: Pessoa
  cor: string
}

export interface CategoriaRow extends RowBase {
  nome: string
  grupo: 'despesa' | 'receita'
}

export interface ReceitaRow extends RowBase {
  competencia: string          // YYYY-MM
  pessoa: Pessoa
  tipo: 'salario' | 'bonus' | 'promocao' | 'outro'
  origem: string
  valor: number
  conta_para_share: boolean
}

export interface LancamentoRow extends RowBase {
  data: string                 // YYYY-MM-DD
  competencia: string          // YYYY-MM (derivada se ausente)
  descricao: string
  categoria: string
  valor: number
  pagador: Pessoa
  tipo: 'individual' | 'conjunto'
  dono: Pessoa | ''
}

export interface InvestimentoSaldoRow extends RowBase {
  data: string
  titular: Titular
  instituicao: string
  ativo: string
  valor_saldo: number
}

export interface InvestimentoMovimentoRow extends RowBase {
  data: string
  titular: Titular
  instituicao: string
  ativo: string
  tipo: 'aporte' | 'resgate'
  valor: number
}

export interface TableMap {
  pessoas: PessoaRow
  categorias: CategoriaRow
  receitas: ReceitaRow
  lancamentos: LancamentoRow
  investimentos_saldos: InvestimentoSaldoRow
  investimentos_movimentos: InvestimentoMovimentoRow
}

export type TableName = keyof TableMap

/** Para create: id é gerado pelo backend; demais opcionais quando tiverem default. */
export type CreatePayload<T extends TableName> = Omit<TableMap[T], 'id'>
export type UpdatePayload<T extends TableName> = Partial<Omit<TableMap[T], 'id'>>
