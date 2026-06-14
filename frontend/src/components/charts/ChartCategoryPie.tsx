import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { colorForIndex } from '../../lib/colors'
import { formatBRL } from '../../lib/format'

export interface CategoryDatum {
  nome: string
  valor: number
}

interface Props {
  data: CategoryDatum[]
  totalDespesas: number
  height?: number
}

const fmt = (v: unknown): string => formatBRL(Number(v) || 0)

/** Pie de despesas por categoria + lista detalhada com % e cor. */
export function ChartCategoryPie({ data, totalDespesas, height = 280 }: Props) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Despesas por categoria</h3>
      {data.length === 0 ? (
        <p className="muted">Sem despesas no período.</p>
      ) : (
        <>
          <div style={{ width: '100%', height }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="valor"
                  nameKey="nome"
                  innerRadius={48}
                  outerRadius={92}
                  paddingAngle={2}
                  label={(props: { name?: string; percent?: number }) =>
                    props.percent !== undefined && props.percent > 0.05 && props.name ? props.name : ''
                  }
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={colorForIndex(i)} />
                  ))}
                </Pie>
                <Tooltip formatter={fmt} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="cat-list">
            {data.slice(0, 12).map((c, i) => (
              <li key={c.nome}>
                <span className="cat-dot" style={{ background: colorForIndex(i) }} />
                <span className="grow">{c.nome}</span>
                <strong>{formatBRL(c.valor)}</strong>
                <span className="muted-light">
                  {totalDespesas > 0 ? `${((c.valor / totalDespesas) * 100).toFixed(1)}%` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
