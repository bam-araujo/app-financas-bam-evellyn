// Smoke test do PR4 — share YTD + fechamento.
const API = process.env.VITE_API_URL
const T = process.env.API_TOKEN

const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d

async function post(action, body) {
  const r = await fetch(API, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, service_token: T, ...body }),
  })
  return r.json()
}
async function get(action, qs = {}) {
  const u = new URL(API)
  u.searchParams.set('action', action); u.searchParams.set('service_token', T)
  for (const k in qs) u.searchParams.set(k, qs[k])
  return (await fetch(u)).json()
}

// Limpa receitas e share_mensal antes de começar
const r0 = await get('list', { table: 'receitas' })
for (const r of r0.data) await post('delete', { table: 'receitas', id: r.id })
const s0 = await get('list', { table: 'share_mensal' }).catch(() => ({ data: [] }))
for (const s of s0.data || []) await post('delete', { table: 'share_mensal', id: s.id })

console.log('=== sem receitas: deve dar 0.5/0.5 ===')
const empty = await get('share', { competencia: '2026-06' })
console.log(empty.data)

// Insere: jan/fev/mar Bam 10k cada, Evellyn 5k cada; abr/mai/jun: bônus pra Evellyn 30k em jun
console.log('=== insere receitas ===')
const meses = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
for (const m of meses) {
  await post('create', { table: 'receitas', data: { competencia: m, pessoa: 'Bam', tipo: 'salario', origem: 'Empresa', valor: 10000, conta_para_share: true } })
  await post('create', { table: 'receitas', data: { competencia: m, pessoa: 'Evellyn', tipo: 'salario', origem: 'Empresa', valor: 5000, conta_para_share: true } })
}
// Bônus Evellyn jun
await post('create', { table: 'receitas', data: { competencia: '2026-06', pessoa: 'Evellyn', tipo: 'bonus', origem: 'Empresa', valor: 30000, conta_para_share: true } })

// Bônus que NÃO conta pro share
await post('create', { table: 'receitas', data: { competencia: '2026-06', pessoa: 'Bam', tipo: 'bonus', origem: 'Extra', valor: 50000, conta_para_share: false } })

console.log('=== share 2026-03 (esperado: Bam=2/3, Evellyn=1/3) ===')
const m3 = await get('share', { competencia: '2026-03' })
console.log('Bam:', round(m3.data.Bam), 'Evellyn:', round(m3.data.Evellyn), 'fechado:', m3.data.fechado)
console.log('esperado Bam=0.6667 Evellyn=0.3333')

console.log('=== share 2026-06 YTD (Bam=60k, Evellyn=30k+30k bônus=60k → 50/50; o bônus de Bam NÃO conta) ===')
const m6 = await get('share', { competencia: '2026-06' })
console.log('Bam:', round(m6.data.Bam), 'Evellyn:', round(m6.data.Evellyn), 'fechado:', m6.data.fechado)
console.log('esperado Bam=0.5 Evellyn=0.5')

console.log('=== fecha share 2026-06 ===')
const closed = await post('close_share', { competencia: '2026-06' })
console.log(closed.data)

console.log('=== insere mais uma receita Bam em jun (não deveria mexer no share fechado) ===')
await post('create', { table: 'receitas', data: { competencia: '2026-06', pessoa: 'Bam', tipo: 'salario', origem: 'Bicos', valor: 100000, conta_para_share: true } })

console.log('=== share 2026-06 depois da nova receita: deve ser 50/50 ainda (fechado) ===')
const reread = await get('share', { competencia: '2026-06' })
console.log('Bam:', round(reread.data.Bam), 'Evellyn:', round(reread.data.Evellyn), 'fechado:', reread.data.fechado)

console.log('=== reabre share 2026-06 ===')
const reop = await post('reopen_share', { competencia: '2026-06' })
console.log(reop.data)

console.log('=== share 2026-06 reaberto: agora considera a nova receita ===')
const m6b = await get('share', { competencia: '2026-06' })
console.log('Bam:', round(m6b.data.Bam), 'Evellyn:', round(m6b.data.Evellyn), 'fechado:', m6b.data.fechado)
console.log('Bam agora 160k, Evellyn 60k → Bam=0.7273, Evellyn=0.2727')

// Cleanup
console.log('=== cleanup ===')
const r9 = await get('list', { table: 'receitas' })
for (const r of r9.data) await post('delete', { table: 'receitas', id: r.id })
const s9 = await get('list', { table: 'share_mensal' })
for (const s of s9.data) await post('delete', { table: 'share_mensal', id: s.id })
console.log('limpo.')
