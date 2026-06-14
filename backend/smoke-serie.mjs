// Smoke test: parcelado + recorrente. Confirma migration do header e shift de data.
const API = process.env.VITE_API_URL
const T = process.env.API_TOKEN

async function post(action, body) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, service_token: T, ...body }),
  })
  return r.json()
}
async function get(action, qs) {
  const u = new URL(API)
  u.searchParams.set('action', action)
  u.searchParams.set('service_token', T)
  for (const k in qs) u.searchParams.set(k, qs[k])
  return (await fetch(u)).json()
}

// 1) Parcelado: 3x começando em 2026-06-14
const par = await post('create_serie', {
  table: 'lancamentos',
  serie_tipo: 'parcelado',
  parcela_total: 3,
  data: {
    data: '2026-06-14',
    descricao: 'Notebook 3x',
    categoria: 'Compras',
    valor: 1000,
    pagador: 'Bam',
    tipo: 'individual',
    dono: 'Bam',
  },
})
console.log('parcelado:', par.ok ? par.data.count + ' linhas' : 'FAIL ' + par.error)
const parRows = par.data.rows
for (const r of parRows) console.log('   ', r.data, 'competencia', r.competencia, 'parcela', r.parcela_num + '/' + r.parcela_total)

// 2) Recorrente
const rec = await post('create_serie', {
  table: 'lancamentos',
  serie_tipo: 'recorrente',
  data: {
    data: '2026-06-10',
    descricao: 'Internet (rec)',
    categoria: 'Internet',
    valor: 120,
    pagador: 'Bam',
    tipo: 'conjunto',
  },
})
console.log('recorrente:', rec.ok ? rec.data.count + ' linhas' : 'FAIL ' + rec.error)
console.log('   primeiras 3:', rec.data.rows.slice(0, 3).map((r) => r.data).join(' | '))

// 3) Edge case: 31 -> Fev (clamp)
const edge = await post('create_serie', {
  table: 'lancamentos',
  serie_tipo: 'parcelado',
  parcela_total: 4,
  data: {
    data: '2026-01-31',
    descricao: 'TESTE clamp',
    categoria: 'Outros',
    valor: 10,
    pagador: 'Bam',
    tipo: 'individual',
    dono: 'Bam',
  },
})
console.log('clamp:', edge.ok ? edge.data.count + ' linhas' : 'FAIL ' + edge.error)
for (const r of edge.data.rows) console.log('   ', r.data)

// 4) Lista da competencia 2026-06 (deve incluir 1 do parcelado, 1 do recorrente, e o edge case jan→feb→mar→abr)
const lst = await get('list', { table: 'lancamentos', competencia: '2026-06' })
console.log('list 2026-06:', lst.data.length, 'lancamentos')

// cleanup: deleta tudo que criamos
const all = await get('list', { table: 'lancamentos' })
const ids = all.data
  .filter((r) => [par.data.serie_id, rec.data.serie_id, edge.data.serie_id].includes(r.serie_id))
  .map((r) => r.id)
for (const id of ids) await post('delete', { table: 'lancamentos', id })
console.log('cleanup:', ids.length, 'deletadas')
