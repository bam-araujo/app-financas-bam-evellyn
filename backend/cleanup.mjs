const API = process.env.VITE_API_URL
const T = process.env.VITE_API_TOKEN

async function listAll(table) {
  const r = await fetch(`${API}?action=list&table=${table}&token=${T}`)
  const d = await r.json()
  return d.data
}
async function del(table, id) {
  return fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'delete', token: T, table, id }),
  }).then((r) => r.json())
}

for (const table of ['lancamentos', 'receitas', 'investimentos_saldos', 'investimentos_movimentos']) {
  const rows = await listAll(table)
  console.log(`${table}: ${rows.length}`)
  for (const r of rows) console.log('  -', r.id, JSON.stringify(r).slice(0, 120))
  for (const r of rows) await del(table, r.id)
  if (rows.length) console.log(`  → ${rows.length} deletados`)
}
