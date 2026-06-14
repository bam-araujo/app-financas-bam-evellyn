import { useMemo } from 'react'
import type { LancamentoRow, ReceitaRow, ShareData } from '../api/types'
import type { PessoaFiltro } from '../components/Filters'
import { shiftCompetencia } from '../lib/competencia'
import { lancamentoWeight } from '../lib/rateio'

/**
 * Projeção de caixa pros próximos N meses, com base nos dados já cadastrados
 * (recorrentes auto-estendidas, parcelas em aberto, etc.). NÃO inventa nada —
 * se o usuário quer que algo apareça na projeção, cadastra como recorrente.
 *
 * Regras de filtro por pessoa (reusa lancamentoWeight de lib/rateio):
 *  - casal: soma tudo
 *  - Bam/Evellyn: receitas onde pessoa=X + despesas individuais onde dono=X
 *    + (conjuntas × shareX). Share é constante = o share atual (premissa
 *    documentada no card de UI).
 *
 * Investimentos NÃO entram no fluxo (aporte é transferência entre contas, não
 * muda patrimônio total). Saldo de investimentos é somado constante no eixo Y
 * pra compor a view "Patrimônio total" no componente que consome este hook.
 */
export interface ProjectionMonth {
  competencia: string          // YYYY-MM
  entradas: number             // receitas previstas no mês, ponderadas por filtro
  saidas: number               // despesas previstas no mês, ponderadas por filtro
  fluxo: number                // entradas - saidas
  saldoConta: number           // saldoInicial + Σ fluxos até este mês
  saldoTotal: number           // saldoConta + saldoInvestimentos
}

export interface UseCashflowProjectionParams {
  lancamentos: LancamentoRow[]
  receitas: ReceitaRow[]
  saldoInicial: number
  saldoInvestimentos: number
  share: ShareData | null      // share do mês atual; aplicado constante pro futuro
  pessoa: PessoaFiltro
  competenciaAtual: string     // YYYY-MM âncora; projeção começa em +1
  mesesAhead?: number          // default 6
}

export function useCashflowProjection({
  lancamentos,
  receitas,
  saldoInicial,
  saldoInvestimentos,
  share,
  pessoa,
  competenciaAtual,
  mesesAhead = 6,
}: UseCashflowProjectionParams): ProjectionMonth[] {
  return useMemo(() => {
    // Pre-agrupa por competência pra evitar O(N×M) — uma passada por tabela.
    const receitasPorMes: Record<string, ReceitaRow[]> = {}
    for (const r of receitas) {
      const c = r.competencia
      if (!receitasPorMes[c]) receitasPorMes[c] = []
      receitasPorMes[c].push(r)
    }
    const despesasPorMes: Record<string, LancamentoRow[]> = {}
    for (const l of lancamentos) {
      const c = l.competencia
      if (!despesasPorMes[c]) despesasPorMes[c] = []
      despesasPorMes[c].push(l)
    }

    // Share constante: do mês atual. Se futuro não tem snapshot, vale o atual.
    const shareGetter = () => share

    const out: ProjectionMonth[] = []
    let acumulado = 0
    for (let i = 1; i <= mesesAhead; i++) {
      const c = shiftCompetencia(competenciaAtual, i)

      // Entradas: filtra receitas conforme pessoa. Receita individual sempre
      // entra pra quem é dono (= pessoa). conta_para_share é só pra cálculo
      // do share — pra projeção de caixa, o dinheiro entra no bolso de quem
      // recebeu independentemente desse flag.
      let entradas = 0
      for (const r of receitasPorMes[c] || []) {
        if (pessoa !== 'casal' && r.pessoa !== pessoa) continue
        entradas += Number(r.valor) || 0
      }

      // Saídas: lancamentoWeight cobre tudo (individuais por dono, conjuntas
      // pelo share). rateio=true sempre na projeção quando pessoa específica.
      let saidas = 0
      for (const l of despesasPorMes[c] || []) {
        const w = lancamentoWeight(l, pessoa, pessoa !== 'casal', shareGetter)
        if (w === 0) continue
        saidas += (Number(l.valor) || 0) * w
      }

      const fluxo = entradas - saidas
      acumulado += fluxo
      const saldoConta = saldoInicial + acumulado
      const saldoTotal = saldoConta + saldoInvestimentos

      out.push({
        competencia: c,
        entradas: round2(entradas),
        saidas: round2(saidas),
        fluxo: round2(fluxo),
        saldoConta: round2(saldoConta),
        saldoTotal: round2(saldoTotal),
      })
    }
    return out
  }, [lancamentos, receitas, saldoInicial, saldoInvestimentos, share, pessoa, competenciaAtual, mesesAhead])
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
