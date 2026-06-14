import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatBRL } from '../../lib/format'

export interface MonthlyFlowRow {
  mes: string
  Despesas: number
  Receitas: number
  Investimentos: number
}

interface Props {
  data: MonthlyFlowRow[]
  height?: number
}

const fmt = (v: unknown): string => formatBRL(Number(v) || 0)

/** Bar chart com 3 barras lado a lado por mês: Despesas, Receitas, Investimentos. */
export function ChartMonthlyFlow({ data, height = 240 }: Props) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Despesas × Receitas × Investimentos por mês</h3>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={fmt} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Despesas" fill="#ef4444" />
            <Bar dataKey="Receitas" fill="#10b981" />
            <Bar dataKey="Investimentos" fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
