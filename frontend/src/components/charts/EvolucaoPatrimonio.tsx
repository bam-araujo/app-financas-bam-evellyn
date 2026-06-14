import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Titular } from '../../api/types'
import { COLOR_BAM, COLOR_EVELLYN } from '../../lib/colors'
import { formatBRL } from '../../lib/format'

const COLOR_CONJUNTO = '#10b981'
const colorPara = (t: Titular): string =>
  t === 'Bam' ? COLOR_BAM : t === 'Evellyn' ? COLOR_EVELLYN : COLOR_CONJUNTO

interface Props {
  data: Array<Record<string, string | number>>
  titulares: Titular[]
}

export function EvolucaoPatrimonio({ data, titulares }: Props) {
  if (data.length < 2) return null
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Evolução do patrimônio</h3>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.2)" />
            <XAxis dataKey="data" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: unknown) => formatBRL(Number(v) || 0)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {titulares.map((t) => (
              <Line key={t} type="monotone" dataKey={t} stroke={colorPara(t)} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
