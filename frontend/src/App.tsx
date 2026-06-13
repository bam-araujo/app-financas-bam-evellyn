import { useEffect, useState } from 'react'
import { ping } from './api/client'

type Status =
  | { kind: 'loading' }
  | { kind: 'ok'; ts: number }
  | { kind: 'error'; message: string }

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' })

  useEffect(() => {
    ping()
      .then((data) => setStatus({ kind: 'ok', ts: data.ts }))
      .catch((err: Error) => setStatus({ kind: 'error', message: err.message }))
  }, [])

  return (
    <main>
      <h1>Finanças — Bam &amp; Evellyn</h1>
      <p>Status da conexão com a API:</p>
      <StatusBadge status={status} />
      <hr style={{ margin: '2rem 0', border: 0, borderTop: '1px solid #e5e7eb' }} />
      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
        PR1 — fundação. As telas reais (lançamentos, rateio, dashboards, investimentos) virão nos PRs seguintes.
      </p>
    </main>
  )
}

function StatusBadge({ status }: { status: Status }) {
  if (status.kind === 'loading') {
    return (
      <span className="status load">
        <span className="dot" /> Verificando…
      </span>
    )
  }
  if (status.kind === 'ok') {
    const when = new Date(status.ts).toLocaleString('pt-BR')
    return (
      <span className="status ok" title={`servidor: ${when}`}>
        <span className="dot" /> Conectado
      </span>
    )
  }
  return (
    <span className="status err" title={status.message}>
      <span className="dot" /> Erro: {status.message}
    </span>
  )
}
