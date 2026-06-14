import { useEffect, useState } from 'react'
import { ping } from './api/client'
import { CompetenciaSelector } from './components/CompetenciaSelector'
import { DEFAULT_FILTERS, Filters, type GlobalFilters } from './components/Filters'
import { Tabs } from './components/Tabs'
import { useHashRoute } from './hooks/useHashRoute'
import { useTheme } from './hooks/useTheme'
import { currentCompetencia } from './lib/competencia'
import { AcertoPage } from './pages/Acerto'
import { DashboardPage } from './pages/Dashboard'
import { DespesasPage } from './pages/Despesas'
import { ImportarPage } from './pages/Importar'
import { InvestimentosPage } from './pages/Investimentos'
import { ReceitasPage } from './pages/Receitas'

type ConnStatus =
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string }

const TABS = [
  { key: 'home', label: 'Home' },
  { key: 'despesas', label: 'Despesas' },
  { key: 'receitas', label: 'Receitas' },
  { key: 'acerto', label: 'Acerto' },
  { key: 'investimentos', label: 'Investimentos' },
]

export default function App() {
  const [conn, setConn] = useState<ConnStatus>({ kind: 'loading' })
  const [competencia, setCompetencia] = useState<string>(currentCompetencia())
  const [filters, setFilters] = useState<GlobalFilters>(DEFAULT_FILTERS)
  const [route, navigate] = useHashRoute('home')
  const { theme, toggle: toggleTheme } = useTheme()

  useEffect(() => {
    ping()
      .then(() => setConn({ kind: 'ok' }))
      .catch((err: Error) => setConn({ kind: 'error', message: err.message }))
  }, [])

  return (
    <>
      <header className="app-header">
        <div className="app-header-row">
          <div className="brand">
            <h1>Dueto</h1>
            <span className="tagline">app de finanças</span>
          </div>
          <div className="app-header-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            >
              {theme === 'dark' ? (
                /* sol — clica pra ir pro claro */
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                /* lua — clica pra ir pro escuro */
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <ConnDot status={conn} />
          </div>
        </div>
        <CompetenciaSelector value={competencia} onChange={setCompetencia} />
        <Filters value={filters} onChange={setFilters} />
        <Tabs tabs={TABS} current={route} onChange={navigate} />
      </header>

      <main>
        {conn.kind === 'error' && (
          <p className="error-msg">Sem conexão com a API: {conn.message}</p>
        )}
        {(route === 'home' || route === 'dashboard') && <DashboardPage competencia={competencia} filters={filters} />}
        {route === 'despesas' && <DespesasPage competencia={competencia} filters={filters} />}
        {route === 'receitas' && <ReceitasPage competencia={competencia} filters={filters} />}
        {route === 'acerto' && <AcertoPage competencia={competencia} />}
        {route === 'investimentos' && <InvestimentosPage filters={filters} />}
        {route === 'importar' && <ImportarPage />}
        {!['home', 'dashboard', 'despesas', 'receitas', 'acerto', 'investimentos', 'importar'].includes(route) && (
          <p className="muted">Página desconhecida.</p>
        )}
      </main>
    </>
  )
}

function ConnDot({ status }: { status: ConnStatus }) {
  const cls = status.kind === 'ok' ? 'ok' : status.kind === 'error' ? 'err' : 'load'
  const title =
    status.kind === 'ok' ? 'Conectado' :
    status.kind === 'error' ? `Erro: ${status.message}` :
    'Verificando conexão…'
  return (
    <span className={`status ${cls}`} title={title} aria-label={title}>
      <span className="dot" />
    </span>
  )
}
