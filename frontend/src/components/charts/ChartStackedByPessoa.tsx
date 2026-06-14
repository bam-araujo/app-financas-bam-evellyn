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
import { COLOR_BAM, COLOR_EVELLYN } from '../../lib/colors'
import { formatBRL } from '../../lib/format'

export interface StackedRow {
  mes: string
  Bam: number
  Evellyn: number
}

interface Props {
  title: string
  data: StackedRow[]
  /** Para evitar interferência entre dois charts empilhados na mesma página. */
  stackId: string
  height?: number
}

const fmt = (v: unknown): string => formatBRL(Number(v) || 0)

/** Bar chart empilhado: Bam + Evellyn por mês. Reutilizável (despesas, receitas, etc.). */
export function ChartStackedByPessoa({ title, data, stackId, height = 220 }: Props) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>{title}</h3>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={fmt} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Bam" stackId={stackId} fill={COLOR_BAM} />
            <Bar dataKey="Evellyn" stackId={stackId} fill={COLOR_EVELLYN} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
