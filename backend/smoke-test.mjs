// Smoke test do CRUD via fetch (Node 18+/20+/24).
// Rodar: VITE_API_URL=... VITE_API_TOKEN=... node smoke-test.mjs

const URL = process.env.VITE_API_URL
const TOKEN = process.env.VITE_API_TOKEN
if (!URL || !TOKEN) {
  console.error('faltou VITE_API_URL ou VITE_API_TOKEN no env')
  process.exit(2)
}

async function call(method, action, body = {}, query = {}) {
  if (method === 'GET') {
    const qs = new URLSearchParams({ action, token: TOKEN, ...query })
    const res = await fetch(`${URL}?${qs}`)
    return res.json()
  } else {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: TOKEN, ...body }),
    })
    return res.json()
  }
}

function show(label, val) {
  console.log(`\n=== ${label}:`)
  console.log(JSON.stringify(val).slice(0, 400))
}

function assertOk(label, res) {
  if (!res || res.ok !== true) {
    console.error(`✗ ${label} expected ok:true, got ${JSON.stringify(res)}`)
    process.exitCode = 1
  } else {
    console.log(`✓ ${label}`)
  }
}
function assertErr(label, res, errSubstr) {
  if (!res || res.ok !== false || (errSubstr && !String(res.error).includes(errSubstr))) {
    console.error(`✗ ${label} expected ok:false matching "${errSubstr}", got ${JSON.stringify(res)}`)
    process.exitCode = 1
  } else {
    console.log(`✓ ${label} → ${res.error}`)
  }
}

const r1 = await call('GET', 'list', {}, { table: 'pessoas' })
show('list pessoas', r1)
assertOk('list pessoas', r1)
if (r1.data?.length !== 2) console.error(`✗ esperava 2 pessoas, achei ${r1.data?.length}`)

const r2 = await call('GET', 'list', {}, { table: 'categorias' })
show('list categorias (count)', { count: r2.data?.length })
assertOk('list categorias', r2)

const created = await call('POST', 'create', {
  table: 'lancamentos',
  data: { data: '2026-06-14', descricao: 'Mercado teste', categoria: 'Mercado', valor: 250.5, pagador: 'Bam', tipo: 'conjunto' },
})
show('create lancamento conjunto', created)
assertOk('create lancamento', created)
const id = created.data?.id
if (!id) process.exit(1)
if (created.data.competencia !== '2026-06') console.error(`✗ competencia esperada 2026-06, recebida ${created.data.competencia}`)
else console.log('✓ competencia derivada corretamente')

const got = await call('GET', 'get', {}, { table: 'lancamentos', id })
show('get by id', got)
assertOk('get', got)

const upd = await call('POST', 'update', { table: 'lancamentos', id, data: { valor: 300 } })
show('update valor=300', upd)
assertOk('update', upd)
if (upd.data?.valor !== 300) console.error(`✗ update não persistiu valor`)

const listed = await call('GET', 'list', {}, { table: 'lancamentos', competencia: '2026-06' })
show('list competencia=2026-06', { count: listed.data?.length })
assertOk('list filtered', listed)

const del = await call('POST', 'delete', { table: 'lancamentos', id })
show('delete', del)
assertOk('delete', del)

const gone = await call('GET', 'get', {}, { table: 'lancamentos', id })
show('get após delete', gone)
assertErr('get após delete', gone, 'not_found')

const negDono = await call('POST', 'create', {
  table: 'lancamentos',
  data: { data: '2026-06-14', descricao: 'x', categoria: 'Mercado', valor: 10, pagador: 'Bam', tipo: 'individual' },
})
show('NEG individual sem dono', negDono)
assertErr('individual sem dono', negDono, 'dono_required')

const negPessoa = await call('POST', 'create', {
  table: 'receitas',
  data: { competencia: '2026-06', tipo: 'salario', valor: 1000 },
})
show('NEG receita sem pessoa', negPessoa)
assertErr('receita sem pessoa', negPessoa, 'missing_required:pessoa')

const negTable = await call('GET', 'list', {}, { table: 'naoexiste' })
show('NEG tabela inválida', negTable)
assertErr('tabela inválida', negTable, 'invalid_table')

const okReceita = await call('POST', 'create', {
  table: 'receitas',
  data: { competencia: '2026-06', pessoa: 'Bam', tipo: 'salario', origem: 'Empresa', valor: 5000 },
})
show('create receita (default conta_para_share)', okReceita)
assertOk('create receita', okReceita)
if (okReceita.data?.conta_para_share !== true) console.error('✗ default conta_para_share não aplicado')
else console.log('✓ default conta_para_share=true aplicado')

// limpa receita criada
await call('POST', 'delete', { table: 'receitas', id: okReceita.data.id })

console.log('\n=== fim do smoke test')
if (process.exitCode) console.log('falhas detectadas (ver acima)')
else console.log('tudo verde')
