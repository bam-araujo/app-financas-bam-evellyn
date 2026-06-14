import { useMemo } from 'react'
import type { InvestimentoMovimentoRow, InvestimentoSaldoRow, Titular } from '../api/types'
import { formatDateBR } from '../lib/format'

/**
 * Cálculos puros pra tela de Investimentos:
 *  - patrimônio atual (soma do saldo mais recente por chave inst+ativo)
 *  - análise da janela [inicio,fim] (saldo inicial/final, aportes, resgates,
 *    rendimento e rentabilidade aproximada)
 *  - evolução por titular (uma linha do chart por titular)
 *
 * Convenção de chave: titular|instituicao|ativo (mesmo padrão do backend).
 */

export interface InvestimentoInsights {
  patrimonioAtual: { total: number; ativos: number }
  analise: {
    saldoInicial: number
    saldoFinal: number
    aportes: number
    resgates: number
    rendimento: number
    rentPct: number | null
  }
  evolucao: {
    data: Array<Record<string, string | number>>
    titulares: Titular[]
  }
}

export function useInvestimentoInsights(
  saldos: InvestimentoSaldoRow[],
  movs: InvestimentoMovimentoRow[],
  inicio: string,
  fim: string,
): InvestimentoInsights {
  const patrimonioAtual = useMemo(() => {
    const latest = new Map<string, InvestimentoSaldoRow>()
    for (const s of saldos) {
      const k = `${s.titular}|${s.instituicao}|${s.ativo}`
      const cur = latest.get(k)
      if (!cur || (s.data || '').localeCompare(cur.data || '') > 0) latest.set(k, s)
    }
    let total = 0
    for (const s of latest.values()) total += Number(s.valor_saldo) || 0
    return { total, ativos: latest.size }
  }, [saldos])

  const analise = useMemo(() => {
    const saldoInicialMap = new Map<string, InvestimentoSaldoRow>()
    const saldoFinalMap = new Map<string, InvestimentoSaldoRow>()
    for (const s of saldos) {
      const k = `${s.titular}|${s.instituicao}|${s.ativo}`
      if ((s.data || '').localeCompare(inicio) <= 0) {
        const cur = saldoInicialMap.get(k)
        if (!cur || (s.data || '').localeCompare(cur.data || '') > 0) saldoInicialMap.set(k, s)
      }
      if ((s.data || '').localeCompare(fim) <= 0) {
        const cur = saldoFinalMap.get(k)
        if (!cur || (s.data || '').localeCompare(cur.data || '') > 0) saldoFinalMap.set(k, s)
      }
    }
    let saldoInicial = 0, saldoFinal = 0
    for (const s of saldoInicialMap.values()) saldoInicial += Number(s.valor_saldo) || 0
    for (const s of saldoFinalMap.values()) saldoFinal += Number(s.valor_saldo) || 0

    let aportes = 0, resgates = 0
    for (const m of movs) {
      const data = String(m.data || '')
      if (data < inicio || data > fim) continue
      const v = Number(m.valor) || 0
      if (m.tipo === 'aporte') aportes += v
      else resgates += v
    }
    const rendimento = saldoFinal - saldoInicial - aportes + resgates
    const base = saldoInicial + aportes
    const rentPct = base > 0 ? (rendimento / base) * 100 : null

    return { saldoInicial, saldoFinal, aportes, resgates, rendimento, rentPct }
  }, [saldos, movs, inicio, fim])

  // Evolução: pra cada data com snapshot, soma saldos mais recentes <= aquela data
  // por (titular, instituicao+ativo). Resultado vira uma row do LineChart.
  const evolucao = useMemo(() => {
    const datas = Array.from(new Set(saldos.map((s) => s.data))).sort()
    const titulares = Array.from(new Set(saldos.map((s) => s.titular))) as Titular[]
    const out: Array<Record<string, string | number>> = []
    for (const d of datas) {
      const row: Record<string, string | number> = { data: formatDateBR(d) }
      for (const t of titulares) {
        const latest = new Map<string, InvestimentoSaldoRow>()
        for (const s of saldos) {
          if (s.titular !== t) continue
          if ((s.data || '').localeCompare(d) > 0) continue
          const k = `${s.instituicao}|${s.ativo}`
          const cur = latest.get(k)
          if (!cur || (s.data || '').localeCompare(cur.data || '') > 0) latest.set(k, s)
        }
        let sum = 0
        for (const s of latest.values()) sum += Number(s.valor_saldo) || 0
        row[t] = Math.round(sum * 100) / 100
      }
      out.push(row)
    }
    return { data: out, titulares }
  }, [saldos])

  return { patrimonioAtual, analise, evolucao }
}
