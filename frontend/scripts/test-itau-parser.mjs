// Unit test offline do parser de fatura Itaú — usa linhas hardcoded do PDF que o user mandou.
// Confere: total transações, parcelas detectadas, valores, vencimento.

import { parseItauFatura } from '../src/lib/parsers/itau-fatura.ts'

// Linhas do PDF Fatura_Itau_20260613-225120.pdf (vencimento 05/06/2026, total R$1.793,72)
const LINES = `
itaú
VISA
Platinum
Resumo da fatura em R$
Total da fatura anterior 1.779,82
Pagamento efetuado em 04/05/2026 -1.779,82
Saldo financiado 0,00
Lançamentos atuais 1.793,72
Total desta fatura 1.793,72
Postagem: 28/05/2026
Vencimento: 05/06/2026
Emissão: 28/05/2026
Previsão próx. Fechamento: 27/06/2026
Titular IVAN FERREIRA DE ARAUJO
Cartão 4705.XXXX.XXXX.3959
O total da sua fatura é:
R$ 1.793,72
Com vencimento em:
05/06/2026
Limite total de crédito:
R$ 28.000,00
Pagamentos efetuados
DATA VALOR EM R$
04/05 PAGAMENTO DEB AUTOMATIC -1.779,82
Total dos pagamentos -1.779,82
Lançamentos: compras e saques
IVAN FERREIRA DE ARAUJO
DATA ESTABELECIMENTO VALOR EM R$
05/02 MCLARTY MAIA 04/05 678,00
19/02 DL*Starlink Br 04/06 290,70
23/02 SODIMAC 00 04/06 259,16
25/02 SODIMAC 00 03/06 262,54
07/05 DL *Starlink BrazilSao 235,52
ELETRONICS Sao Paulo
21/05 Google YouTubePremiumSA 53,90
serviços SAO PAULO
25/05 2 cartoes 24OYC3SAO PAU 13,90
outros SAO PAULO
Lançamentos no cartão 1.793,72
Total dos lançamentos atuais 1.793,72
Compras parceladas - próximas faturas
DATA ESTABELECIMENTO VALOR EM R$
05/02 MCLARTY MAIA 05/05 678,00
19/02 DL*Starlink Br 05/06 290,70
23/02 SODIMAC 00 05/06 259,16
25/02 SODIMAC 00 04/06 262,54
Próxima fatura 1.490,40
`.trim().split('\n').map((s) => s.trim()).filter(Boolean)

const result = parseItauFatura(LINES)

console.log('META:', result.meta)
console.log('\nTRANSACTIONS:', result.transactions.length)
let pass = 0, fail = 0
for (const tx of result.transactions) {
  const parcela = tx.parcela_num ? ` (${tx.parcela_num}/${tx.parcela_total})` : ''
  console.log(`  ${tx.data_compra}  ${tx.descricao}${parcela}  R$${tx.valor.toFixed(2)}`)
}

function expect(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + label + (ok ? '' : ` expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`))
  if (ok) pass++; else fail++
}

console.log('\n--- assertions:')
expect('total transactions', result.transactions.length, 7)
expect('vencimento', result.meta.vencimento, '2026-06-05')
expect('total fatura', result.meta.total, 1793.72)
expect('parcela MCLARTY', { n: result.transactions[0].parcela_num, t: result.transactions[0].parcela_total }, { n: 4, t: 5 })
expect('parcela SODIMAC 2nd', { n: result.transactions[3].parcela_num, t: result.transactions[3].parcela_total }, { n: 3, t: 6 })
expect('Starlink 07/05 sem parcela', result.transactions[4].parcela_num, undefined)
expect('Starlink descricao com continuação', /ELETRONICS Sao Paulo/.test(result.transactions[4].descricao), true)
expect('valor Starlink 07/05', result.transactions[4].valor, 235.52)
expect('valor Google YouTube', result.transactions[5].valor, 53.90)
expect('soma valores = total', Math.abs(result.transactions.reduce((s, t) => s + t.valor, 0) - 1793.72) < 0.01, true)
expect('inferYear MCLARTY 05/02 = 2026', result.transactions[0].data_compra, '2026-02-05')

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
