// Limpa todas as linhas das tabelas de dados (deixa pessoas/categorias).
// Rodar: VITE_API_URL=... API_TOKEN=... node cleanup.mjs

const API = process.env.VITE_API_URL
const T = process.env.API_TOKEN
if (!API || !T) { console.error('faltou VITE_API_URL ou API_TOKEN'); process.exit(2) }

async function listAll(table) {
  const r = await fetch(`${API}?action=list&table=${table}&service_token=${T}`)
  const d = await r.json()
  return d.data
}
async function del(table, id) {
  return fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'delete', service_token: T, table, id }),
  }).then((r) => r.json())
}

for (const table of ['lancamentos', 'receitas', 'investimentos_saldos', 'investimentos_movimentos']) {
  const rows = await listAll(table)
  console.log(`${table}: ${rows.length}`)
  for (const r of rows) console.log('  -', r.id, JSON.stringify(r).slice(0, 120))
  for (const r of rows) await del(table, r.id)
  if (rows.length) console.log(`  → ${rows.length} deletados`)
}
