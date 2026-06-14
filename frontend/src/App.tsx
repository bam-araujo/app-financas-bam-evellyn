import { useEffect, useState } from 'react'
import { ping } from './api/client'
import { CompetenciaSelector } from './components/CompetenciaSelector'
import { DEFAULT_FILTERS, Filters, type GlobalFilters } from './components/Filters'
import { Tabs } from './components/Tabs'
import { useHashRoute } from './hooks/useHashRoute'
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

  useEffect(() => {
    ping()
      .then(() => setConn({ kind: 'ok' }))
      .catch((err: Error) => setConn({ kind: 'error', message: err.message }))
  }, [])

  return (
    <>
      <header className="app-header">
        <div className="app-header-row">
          <h1>Finanças</h1>
          <ConnDot status={conn} />
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
