/**
 * Setup inicial (one-shot pelo editor). Cria todas as abas do SCHEMA com
 * cabeçalho, popula `pessoas` (Bam, Evellyn) e categorias iniciais.
 * Idempotente — pode ser re-rodado sem duplicar.
 *
 * Rodar pela UI do Apps Script: dropdown → initSchema → Executar.
 */

function initSchema() {
  withLock_(function () {
    var ss = getSpreadsheet_();
    if (ss.getSpreadsheetTimeZone() !== 'America/Sao_Paulo') {
      ss.setSpreadsheetTimeZone('America/Sao_Paulo');
    }
    TABLES.forEach(function (t) { getOrCreateSheet_(t); });

    seedRow_('pessoas', { nome: 'Bam' }, { nome: 'Bam', cor: '#f97316' });
    seedRow_('pessoas', { nome: 'Evellyn' }, { nome: 'Evellyn', cor: '#262626' });

    var cats = [
      { nome: 'Energia', grupo: 'despesa' },
      { nome: 'Internet', grupo: 'despesa' },
      { nome: 'Mercado', grupo: 'despesa' },
      { nome: 'Restaurante', grupo: 'despesa' },
      { nome: 'Transporte', grupo: 'despesa' },
      { nome: 'Saúde', grupo: 'despesa' },
      { nome: 'Lazer', grupo: 'despesa' },
      { nome: 'Assinaturas', grupo: 'despesa' },
      { nome: 'Educação', grupo: 'despesa' },
      { nome: 'Presentes', grupo: 'despesa' },
      { nome: 'Financiamentos', grupo: 'despesa' },
      { nome: 'Serviços', grupo: 'despesa' },
      { nome: 'Compras', grupo: 'despesa' },
      { nome: 'Reformas', grupo: 'despesa' },
      { nome: 'Pets', grupo: 'despesa' },
      { nome: 'Outros', grupo: 'despesa' },
      { nome: 'Salário', grupo: 'receita' },
      { nome: 'Bônus', grupo: 'receita' },
      { nome: 'Outros', grupo: 'receita' },
    ];
    cats.forEach(function (c) { seedRow_('categorias', c, c); });
  });
  return 'initSchema_ok';
}

/**
 * Insere `payload` em `table` se nenhuma linha satisfizer `match` (exact match
 * em todas as colunas de match). Garante idempotência do seed.
 */
function seedRow_(table, match, payload) {
  var def = SCHEMA[table];
  var sh = getOrCreateSheet_(table);
  var rows = readAll_(table);
  var keys = Object.keys(match);
  var exists = rows.some(function (r) {
    for (var i = 0; i < keys.length; i++) {
      if (String(r[keys[i]]) !== String(match[keys[i]])) return false;
    }
    return true;
  });
  if (exists) return;
  var row = Object.assign({}, payload);
  row.id = Utilities.getUuid();
  var arr = def.columns.map(function (c) {
    return Object.prototype.hasOwnProperty.call(row, c) ? row[c] : '';
  });
  sh.appendRow(arr);
}
