// QA end-to-end via API. Cobre todos os PRs.
// Convenção: dados de teste prefixados com "QA_" pra cleanup confiável.
// Rodar: VITE_API_URL=... VITE_API_TOKEN=... node qa-e2e.mjs

const API = process.env.VITE_API_URL
const T = process.env.VITE_API_TOKEN
if (!API || !T) { console.error('faltou VITE_API_URL ou VITE_API_TOKEN'); process.exit(2) }

const TAG = 'QA_'

// ---------- helpers ----------
async function post(action, body) {
  const r = await fetch(API, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, token: T, ...body }),
  })
  return r.json()
}
async function get(action, qs = {}) {
  const u = new URL(API)
  u.searchParams.set('action', action); u.searchParams.set('token', T)
  for (const k in qs) u.searchParams.set(k, qs[k])
  return (await fetch(u)).json()
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
function round2(n) { return Math.round(n * 100) / 100 }

// ---------- cleanup helpers ----------
async function cleanupAll() {
  // Remove TUDO que tem prefixo QA_
  const tables = ['lancamentos', 'receitas', 'investimentos_saldos', 'investimentos_movimentos']
  let total = 0
  for (const table of tables) {
    const lst = await get('list', { table })
    if (!lst.ok) continue
    for (const r of lst.data) {
      const matches = (r.descricao && r.descricao.startsWith(TAG)) ||
                       (r.origem && r.origem.startsWith(TAG)) ||
                       (r.instituicao && r.instituicao.startsWith(TAG)) ||
                       (r.ativo && r.ativo.startsWith(TAG))
      if (matches) {
        await post('delete', { table, id: r.id })
        total++
      }
    }
  }
  // share_mensal: clean by competência marker (we'll fechar 9999-12 pra ser garantido único)
  return total
}

async function cleanupShareCompetencia(c) {
  await post('reopen_share', { competencia: c })
}

// ============================================================================
// Begin
// ============================================================================
console.log('=== QA E2E start ===')
console.log('Limpando dados anteriores com prefixo', TAG)
const cleaned0 = await cleanupAll()
console.log(`Removidos ${cleaned0} resíduos.\n`)

// ---------- PR1: ping ----------
console.log('\n--- PR1: ping ---')
const p = await get('ping')
check('PR1.ping ok', p.ok === true && typeof p.data.ts === 'number')

const pBad = await fetch(`${API}?action=ping`).then(r => r.json())
check('PR1.ping sem token = 401-style', pBad.ok === false && pBad.error === 'unauthorized')

// ---------- PR2: schema/CRUD ----------
console.log('\n--- PR2: schema + CRUD ---')

// seed pessoas/categorias devem existir
const pessoas = await get('list', { table: 'pessoas' })
check('PR2.pessoas seed', pessoas.ok && pessoas.data.length === 2 &&
  pessoas.data.some(p => p.nome === 'Bam') && pessoas.data.some(p => p.nome === 'Evellyn'))

const cats = await get('list', { table: 'categorias' })
check('PR2.categorias seed >0', cats.ok && cats.data.length > 0)

// Tabela inválida
const tInv = await get('list', { table: 'tabela_que_nao_existe' })
check('PR2.tabela inválida = erro', !tInv.ok && tInv.error.startsWith('invalid_table'))

// Receita sem pessoa = erro
const negR = await post('create', { table: 'receitas',
  data: { competencia: '2099-08', tipo: 'salario', valor: 1000 } })
check('PR2.receita sem pessoa rejeitada', !negR.ok && negR.error.includes('missing_required'))

// Receita com pessoa inválida = erro
const negR2 = await post('create', { table: 'receitas',
  data: { competencia: '2099-08', pessoa: 'Fulano', tipo: 'salario', valor: 1000 } })
check('PR2.receita pessoa inválida rejeitada', !negR2.ok)

// Lançamento individual sem dono
const negL = await post('create', { table: 'lancamentos',
  data: { data: '2099-08-10', descricao: TAG+'sem dono', categoria: 'Mercado',
          valor: 50, pagador: 'Bam', tipo: 'individual' } })
check('PR2.individual sem dono rejeitado', !negL.ok && negL.error.includes('dono_required'))

// Lançamento conjunto com dono = erro
const negL2 = await post('create', { table: 'lancamentos',
  data: { data: '2099-08-10', descricao: TAG+'conj+dono', categoria: 'Mercado',
          valor: 50, pagador: 'Bam', tipo: 'conjunto', dono: 'Bam' } })
check('PR2.conjunto com dono rejeitado', !negL2.ok && negL2.error.includes('dono_must_be_empty'))

// Ciclo create→get→update→delete
const c1 = await post('create', { table: 'lancamentos',
  data: { data: '2099-08-10', descricao: TAG+'ciclo', categoria: 'Mercado',
          valor: 100.50, pagador: 'Bam', tipo: 'conjunto' } })
check('PR2.create ok', c1.ok && c1.data.id && c1.data.competencia === '2099-08')
const id1 = c1.data.id
const g1 = await get('get', { table: 'lancamentos', id: id1 })
check('PR2.get ok', g1.ok && g1.data.id === id1 && g1.data.data === '2099-08-10')
const u1 = await post('update', { table: 'lancamentos', id: id1, data: { valor: 200 } })
check('PR2.update preserva campos', u1.ok && u1.data.valor === 200 && u1.data.data === '2099-08-10' && u1.data.competencia === '2099-08')
const d1 = await post('delete', { table: 'lancamentos', id: id1 })
check('PR2.delete ok', d1.ok)
const g1b = await get('get', { table: 'lancamentos', id: id1 })
check('PR2.get após delete = not_found', !g1b.ok && g1b.error === 'not_found')

// ---------- PR3: parcelado + recorrente ----------
console.log('\n--- PR3: série (parcelado/recorrente) ---')
const par = await post('create_serie', {
  table: 'lancamentos', serie_tipo: 'parcelado', parcela_total: 3,
  data: { data: '2099-08-15', descricao: TAG+'parcelado3x', categoria: 'Compras',
          valor: 100, pagador: 'Bam', tipo: 'conjunto' },
})
check('PR3.parcelado cria N linhas', par.ok && par.data.count === 3)
const datasPar = par.data.rows.map(r => r.data).sort()
check('PR3.parcelado shift mensal', JSON.stringify(datasPar) === JSON.stringify(['2099-08-15','2099-09-15','2099-10-15']))

const clamp = await post('create_serie', {
  table: 'lancamentos', serie_tipo: 'parcelado', parcela_total: 4,
  data: { data: '2099-01-31', descricao: TAG+'clamp', categoria: 'Outros',
          valor: 10, pagador: 'Bam', tipo: 'individual', dono: 'Bam' },
})
const datasClamp = clamp.data.rows.map(r => r.data).sort()
check('PR3.parcelado clamp fim do mês', JSON.stringify(datasClamp) === JSON.stringify(['2099-01-31','2099-02-28','2099-03-31','2099-04-30']))

const rec = await post('create_serie', {
  table: 'lancamentos', serie_tipo: 'recorrente',
  data: { data: '2099-08-05', descricao: TAG+'recorrente', categoria: 'Internet',
          valor: 120, pagador: 'Bam', tipo: 'conjunto' },
})
check('PR3.recorrente 24 meses', rec.ok && rec.data.count === 24)

// Edição individual de uma parcela não afeta as demais
const partId = par.data.rows[0].id
await post('update', { table: 'lancamentos', id: partId, data: { valor: 999 } })
const checkOther = await get('get', { table: 'lancamentos', id: par.data.rows[1].id })
check('PR3.editar parcela isolada', checkOther.data.valor === 100)

// ---------- PR4: share + acerto ----------
console.log('\n--- PR4: share / acerto ---')

// Cria receitas YTD pra cenário conhecido
// jan-ago/2026: Bam R$6k/mês = 48k. Evellyn R$3k/mês = 24k. Total YTD ago = 72k. Bam = 2/3.
for (let m = 1; m <= 8; m++) {
  const mm = String(m).padStart(2, '0')
  await post('create', { table: 'receitas', data: {
    competencia: `2099-${mm}`, pessoa: 'Bam', tipo: 'salario',
    origem: TAG+'rec', valor: 6000, conta_para_share: true } })
  await post('create', { table: 'receitas', data: {
    competencia: `2099-${mm}`, pessoa: 'Evellyn', tipo: 'salario',
    origem: TAG+'rec', valor: 3000, conta_para_share: true } })
}

await cleanupShareCompetencia('2099-08')  // ensure not closed
// Pequeno delay pra garantir que cleanup share + receitas seed apareçam consistentes
await new Promise(r => setTimeout(r, 500))

const sh = await get('share', { competencia: '2099-08' })
check('PR4.share YTD calcula 2/3 vs 1/3',
  sh.ok && Math.abs(sh.data.Bam - 2/3) < 0.0001 && Math.abs(sh.data.Evellyn - 1/3) < 0.0001 && !sh.data.fechado,
  `Bam=${sh.data.Bam.toFixed(4)} Eve=${sh.data.Evellyn.toFixed(4)}`)

// Fechar share
const closed = await post('close_share', { competencia: '2099-08' })
check('PR4.close_share ok', closed.ok && closed.data.fechado === true)

// Adicionar mais receita → share fechado não muda
await post('create', { table: 'receitas', data: {
  competencia: '2099-08', pessoa: 'Bam', tipo: 'bonus', origem: TAG+'bonus',
  valor: 30000, conta_para_share: true } })
const sh2 = await get('share', { competencia: '2099-08' })
check('PR4.share fechado não muda',
  sh2.data.fechado && Math.abs(sh2.data.Bam - 2/3) < 0.0001)

// Reabrir e ver recálculo
await post('reopen_share', { competencia: '2099-08' })
const sh3 = await get('share', { competencia: '2099-08' })
// Total agora: Bam 48k+30k=78k, Eve 24k. Total 102k. Bam = 78/102 = 0.7647
check('PR4.reopen recalcula com novos dados',
  !sh3.data.fechado && Math.abs(sh3.data.Bam - 78/102) < 0.0001,
  `Bam=${sh3.data.Bam.toFixed(4)}`)

// Acerto: usa 2099-12 que não tem nada de outros testes
// Cria receitas só pra 2099-12 (sem efeito YTD de outros meses misturado com novos): Bam 6k, Eve 3k → share 2/3
// MAS: share YTD considera jan→dez do ano, então as receitas de 2099-01..08 (do test anterior) ainda contam.
// Como já temos Bam 48k vs Eve 24k YTD (jan-ago), e mais Bam 6k + Eve 3k em dez = Bam 54k vs Eve 27k → 2/3 ainda.
await post('create', { table: 'receitas', data: { competencia: '2099-12', pessoa: 'Bam', tipo: 'salario', origem: TAG+'rec', valor: 6000, conta_para_share: true } })
await post('create', { table: 'receitas', data: { competencia: '2099-12', pessoa: 'Evellyn', tipo: 'salario', origem: TAG+'rec', valor: 3000, conta_para_share: true } })
// Re-deleta o bonus pra voltar a 2/3
const recs = await get('list', { table: 'receitas' })
for (const r of recs.data) if (r.origem === TAG+'bonus') await post('delete', { table: 'receitas', id: r.id })

await post('create', { table: 'lancamentos', data: {
  data: '2099-12-10', descricao: TAG+'mercado', categoria: 'Mercado',
  valor: 300, pagador: 'Bam', tipo: 'conjunto' } })
await post('create', { table: 'lancamentos', data: {
  data: '2099-12-11', descricao: TAG+'internet', categoria: 'Internet',
  valor: 150, pagador: 'Evellyn', tipo: 'conjunto' } })

const sh4 = await get('share', { competencia: '2099-12' })
check('PR4.share 2099-12 = 2/3', Math.abs(sh4.data.Bam - 2/3) < 0.0001, `Bam=${sh4.data.Bam.toFixed(4)}`)

// Calcula acerto manualmente: 2 conjuntas, R$300 (Bam pagou) + R$150 (Eve pagou). Total 450. Bam devia 2/3*450 = 300, Eve 1/3*450 = 150.
// Saldo Bam = 300 - 300 = 0. Saldo Eve = 150 - 150 = 0.
const allLanc = await get('list', { table: 'lancamentos', competencia: '2099-12' })
// Filtra só os 2 do test de acerto (recorrente do PR3 cai em 2099-12 também e contaminaria)
const conjs = allLanc.data.filter(r => r.tipo === 'conjunto' && (r.descricao === TAG+'mercado' || r.descricao === TAG+'internet'))
const totalConjs = conjs.reduce((s, r) => s + Number(r.valor), 0)
const pago = { Bam: 0, Evellyn: 0 }
for (const r of conjs) pago[r.pagador] += Number(r.valor)
// devido[outro] arredondado, devido[pagador] = V - devido[outro] (resíduo absorvido) — modelo do front
let devido = { Bam: 0, Evellyn: 0 }
for (const r of conjs) {
  const v = Number(r.valor)
  const outro = r.pagador === 'Bam' ? 'Evellyn' : 'Bam'
  const devOutro = round2(v * sh4.data[outro])
  const devPag = round2(v - devOutro)
  devido[outro] += devOutro
  devido[r.pagador] += devPag
}
const saldoBam = round2(pago.Bam - devido.Bam)
check('PR4.acerto saldo zero quando rateio bate',
  Math.abs(saldoBam) < 0.01,
  `pago=${JSON.stringify(pago)} devido=${JSON.stringify(devido)} saldo Bam=${saldoBam}`)

// ---------- PR5: batch_create ----------
console.log('\n--- PR5: batch_create ---')
const batch = await post('batch_create', {
  table: 'lancamentos',
  items: [
    { data: '2099-09-01', descricao: TAG+'batch1', categoria: 'Mercado', valor: 10, pagador: 'Bam', tipo: 'conjunto' },
    { data: '2099-09-02', descricao: TAG+'batch2', categoria: 'Mercado', valor: 20, pagador: 'Bam', tipo: 'individual', dono: 'Bam' },
    // item inválido (sem dono em individual)
    { data: '2099-09-03', descricao: TAG+'batch3', categoria: 'Mercado', valor: 30, pagador: 'Bam', tipo: 'individual' },
  ],
})
check('PR5.batch parcial — 2 ok, 1 fail', batch.ok && batch.data.count === 2 && batch.data.total === 3)
const failItem = batch.data.results.find(r => !r.ok)
check('PR5.batch erro inclui index', failItem && failItem.index === 2)

// ---------- PR7: investimentos ----------
console.log('\n--- PR7: investimentos ---')
const s1 = await post('create', { table: 'investimentos_saldos', data: {
  data: '2099-01-01', titular: 'Bam', instituicao: TAG+'XP', ativo: TAG+'Tesouro', valor_saldo: 10000 } })
const s2 = await post('create', { table: 'investimentos_saldos', data: {
  data: '2099-08-01', titular: 'Bam', instituicao: TAG+'XP', ativo: TAG+'Tesouro', valor_saldo: 13000 } })
const m1 = await post('create', { table: 'investimentos_movimentos', data: {
  data: '2099-04-01', titular: 'Bam', instituicao: TAG+'XP', ativo: TAG+'Tesouro', tipo: 'aporte', valor: 2000 } })
const m2 = await post('create', { table: 'investimentos_movimentos', data: {
  data: '2099-06-01', titular: 'Bam', instituicao: TAG+'XP', ativo: TAG+'Tesouro', tipo: 'resgate', valor: 500 } })
check('PR7.saldos+movs criados',
  s1.ok && s2.ok && m1.ok && m2.ok)

// Rendimento esperado entre 01/01 e 01/08: 13000 - 10000 - 2000 + 500 = 1500
// rentabilidade = 1500 / (10000 + 2000) = 12.5%
const saldos = await get('list', { table: 'investimentos_saldos' })
const movs = await get('list', { table: 'investimentos_movimentos' })
const sBam = saldos.data.filter(r => r.titular === 'Bam' && r.ativo === TAG+'Tesouro')
const inicial = sBam.find(s => s.data === '2099-01-01')?.valor_saldo ?? 0
const final = sBam.find(s => s.data === '2099-08-01')?.valor_saldo ?? 0
const aportes = movs.data.filter(m => m.titular === 'Bam' && m.ativo === TAG+'Tesouro' && m.tipo === 'aporte').reduce((s, m) => s + Number(m.valor), 0)
const resgates = movs.data.filter(m => m.titular === 'Bam' && m.ativo === TAG+'Tesouro' && m.tipo === 'resgate').reduce((s, m) => s + Number(m.valor), 0)
const rendimento = Number(final) - Number(inicial) - aportes + resgates
check('PR7.rendimento calculado corretamente', Math.abs(rendimento - 1500) < 0.01,
  `inicial=${inicial} final=${final} aportes=${aportes} resgates=${resgates} rendimento=${rendimento}`)

// ---------- Cleanup ----------
console.log('\n--- Cleanup ---')
await cleanupShareCompetencia('2099-08')
const cleaned = await cleanupAll()
console.log(`Limpou ${cleaned} registros.`)

// ---------- Sumário ----------
console.log('\n=========================')
console.log('RESUMO QA E2E')
console.log('=========================')
const passed = results.filter(r => r.ok).length
const failed = results.filter(r => !r.ok).length
console.log(`${passed}/${results.length} passed, ${failed} failed`)
if (failed) {
  console.log('\nFALHAS:')
  for (const r of results.filter(r => !r.ok)) console.log(`  ✗ ${r.name} — ${r.detail}`)
}
process.exit(failed ? 1 : 0)
