interface Tab {
  key: string
  label: string
}

interface Props {
  tabs: Tab[]
  current: string
  onChange: (key: string) => void
}

export function Tabs({ tabs, current, onChange }: Props) {
  return (
    <nav className="tabs" aria-label="Seções">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={'tab' + (current === t.key ? ' tab-active' : '')}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
