// Aplica diff de categorias na planilha viva.
const API = process.env.VITE_API_URL
const T = process.env.VITE_API_TOKEN

const REMOVE = ['Aluguel', 'Água', 'Condomínio', 'Roupas']
const ADD = [
  { nome: 'Financiamentos', grupo: 'despesa' },
  { nome: 'Serviços', grupo: 'despesa' },
  { nome: 'Compras', grupo: 'despesa' },
]

async function listAll() {
  const r = await fetch(`${API}?action=list&table=categorias&token=${T}`)
  return (await r.json()).data
}
async function del(id) {
  return fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'delete', token: T, table: 'categorias', id }),
  }).then((r) => r.json())
}
async function add(data) {
  return fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'create', token: T, table: 'categorias', data }),
  }).then((r) => r.json())
}

const existing = await listAll()
console.log('antes:', existing.length, 'categorias')

for (const name of REMOVE) {
  const row = existing.find((c) => c.nome === name && c.grupo === 'despesa')
  if (row) {
    const r = await del(row.id)
    console.log('removido:', name, r.ok ? 'ok' : r.error)
  } else {
    console.log('skip remove (não existia):', name)
  }
}

const after1 = await listAll()
for (const c of ADD) {
  if (after1.find((x) => x.nome === c.nome && x.grupo === c.grupo)) {
    console.log('skip add (já existia):', c.nome)
    continue
  }
  const r = await add(c)
  console.log('adicionado:', c.nome, r.ok ? 'ok' : r.error)
}

const after = await listAll()
console.log('depois:', after.length, 'categorias')
console.log(after.filter((c) => c.grupo === 'despesa').map((c) => c.nome).sort())
