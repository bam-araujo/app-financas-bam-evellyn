import { formatCompetenciaBR } from '../lib/format'
import { shiftCompetencia } from '../lib/competencia'

interface Props {
  value: string                 // YYYY-MM
  onChange: (v: string) => void
}

export function CompetenciaSelector({ value, onChange }: Props) {
  return (
    <div className="competencia">
      <button
        type="button"
        className="comp-arrow"
        onClick={() => onChange(shiftCompetencia(value, -1))}
        aria-label="Mês anterior"
      >
        ‹
      </button>
      <input
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value || value)}
        className="comp-input"
        aria-label="Competência"
      />
      <button
        type="button"
        className="comp-arrow"
        onClick={() => onChange(shiftCompetencia(value, 1))}
        aria-label="Próximo mês"
      >
        ›
      </button>
      <span className="comp-label">{formatCompetenciaBR(value, 'short')}</span>
    </div>
  )
}
