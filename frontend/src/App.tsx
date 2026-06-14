import { useEffect, useState } from 'react'
import { ping } from './api/client'
import { CompetenciaSelector } from './components/CompetenciaSelector'
import { Tabs } from './components/Tabs'
import { useHashRoute } from './hooks/useHashRoute'
import { currentCompetencia } from './lib/competencia'
import { AcertoPage } from './pages/Acerto'
import { DespesasPage } from './pages/Despesas'
import { ReceitasPage } from './pages/Receitas'

type ConnStatus =
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string }

const TABS = [
  { key: 'despesas', label: 'Despesas' },
  { key: 'receitas', label: 'Receitas' },
  { key: 'acerto', label: 'Acerto' },
]

export default function App() {
  const [conn, setConn] = useState<ConnStatus>({ kind: 'loading' })
  const [competencia, setCompetencia] = useState<string>(currentCompetencia())
  const [route, navigate] = useHashRoute('despesas')

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
        <Tabs tabs={TABS} current={route} onChange={navigate} />
      </header>

      <main>
        {conn.kind === 'error' && (
          <p className="error-msg">Sem conexão com a API: {conn.message}</p>
        )}
        {route === 'despesas' && <DespesasPage competencia={competencia} />}
        {route === 'receitas' && <ReceitasPage competencia={competencia} />}
        {route === 'acerto' && <AcertoPage competencia={competencia} />}
        {route !== 'despesas' && route !== 'receitas' && route !== 'acerto' && (
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
