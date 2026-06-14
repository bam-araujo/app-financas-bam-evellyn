import { useCategorias } from '../hooks/useCategorias'
import type { Pessoa } from '../api/types'

export type PessoaFiltro = 'casal' | Pessoa
export type TipoFiltro = '' | 'individual' | 'conjunto'

export interface GlobalFilters {
  pessoa: PessoaFiltro
  tipo: TipoFiltro
  categoria: string
  rateio: boolean
}

export const DEFAULT_FILTERS: GlobalFilters = {
  pessoa: 'casal',
  tipo: '',
  categoria: '',
  rateio: true,
}

interface Props {
  value: GlobalFilters
  onChange: (next: GlobalFilters) => void
}

export function Filters({ value, onChange }: Props) {
  const cats = useCategorias()
  const set = <K extends keyof GlobalFilters>(k: K, v: GlobalFilters[K]) => onChange({ ...value, [k]: v })

  // Resumo curto do que está aplicado (mostrado fechado, só no desktop).
  const summaryParts: string[] = []
  if (value.pessoa !== 'casal') summaryParts.push(value.pessoa)
  if (value.tipo) summaryParts.push(value.tipo === 'conjunto' ? 'conjuntas' : 'individuais')
  if (value.categoria) summaryParts.push(value.categoria)
  if (value.pessoa !== 'casal' && value.rateio) summaryParts.push('rateado')
  const summary = summaryParts.length ? summaryParts.join(' · ') : 'sem filtros'
  // Contador pro badge — 'rateio' não conta porque depende de pessoa estar setada.
  const activeCount = (value.pessoa !== 'casal' ? 1 : 0)
    + (value.tipo ? 1 : 0)
    + (value.categoria ? 1 : 0)

  return (
    <details className="filters filters-global">
      <summary>
        <svg
          className="filter-icon"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span className="filter-label">Filtros</span>
        {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
        <span className="filter-summary muted">— {summary}</span>
      </summary>
      <div className="filters-body">
        <label>
          <span>Pessoa</span>
          <select value={value.pessoa} onChange={(e) => set('pessoa', e.target.value as PessoaFiltro)}>
            <option value="casal">Casal (tudo)</option>
            <option value="Bam">Bam</option>
            <option value="Evellyn">Evellyn</option>
          </select>
        </label>
        <label>
          <span>Tipo</span>
          <select value={value.tipo} onChange={(e) => set('tipo', e.target.value as TipoFiltro)}>
            <option value="">Todos</option>
            <option value="conjunto">Só conjuntas</option>
            <option value="individual">Só individuais</option>
          </select>
        </label>
        <label>
          <span>Categoria</span>
          <select value={value.categoria} onChange={(e) => set('categoria', e.target.value)}>
            <option value="">Todas</option>
            {cats.data
              .filter((c) => c.grupo === 'despesa')
              .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
              .map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
        </label>
      </div>
      {value.pessoa !== 'casal' && (
        <label className="checkbox-label" style={{ marginTop: '0.5rem' }}>
          <input type="checkbox" checked={value.rateio} onChange={(e) => set('rateio', e.target.checked)} />
          <span>Ratear conjuntas pelo share da competência (consumo efetivo de {value.pessoa})</span>
        </label>
      )}
    </details>
  )
}
