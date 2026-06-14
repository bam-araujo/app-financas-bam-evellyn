/**
 * Series: create_serie (parcelado/recorrente) + helper de shift de data.
 * Só aplicável à tabela `lancamentos`.
 */

/**
 * Cria uma série de lançamentos vinculados (parcelado OU recorrente).
 *
 * params:
 *   table:        deve ser 'lancamentos' (whitelist)
 *   data:         payload base (mesmo formato do create normal)
 *   serie_tipo:   'parcelado' | 'recorrente'
 *   parcela_total: int (>0) — só relevante para parcelado
 *
 * Comportamento:
 *  - serie_id é um UUID único compartilhado por todas as linhas.
 *  - parcelado: cria `parcela_total` linhas, cada uma N meses após a data base.
 *  - recorrente: cria RECORRENTE_HORIZON_MESES linhas; parcela_total fica 0 ("indefinido").
 *  - O dia da data é mantido em cada mês, com clamp para o último dia do mês curto.
 *  - O valor é o valor de UMA parcela (cada linha tem o mesmo valor).
 */
function createSerie_(params) {
  if (params.table !== 'lancamentos') throw new Error('serie_apenas_em_lancamentos');
  var def = SCHEMA.lancamentos;
  var input = params.data || {};
  var tipo = String(params.serie_tipo || '').trim();
  if (tipo !== 'parcelado' && tipo !== 'recorrente') throw new Error('serie_tipo_invalido');

  var qtd;
  if (tipo === 'parcelado') {
    qtd = parseInt(params.parcela_total, 10);
    if (!qtd || qtd < 1 || qtd > 480) throw new Error('parcela_total_invalido');
  } else {
    qtd = RECORRENTE_HORIZON_MESES;
  }

  if (!input.data) throw new Error('missing_required:data');

  var serieId = Utilities.getUuid();
  var sh = getOrCreateSheet_('lancamentos');
  var header = readHeader_(sh);
  var created = [];

  for (var i = 0; i < qtd; i++) {
    var row = applyDefaultsAndCopy_(def, input);
    // shift de data + competencia derivada
    row.data = shiftDateMonth_(String(input.data), i);
    row.competencia = String(row.data).slice(0, 7);
    row.serie_id = serieId;
    row.serie_tipo = tipo;
    row.parcela_num = i + 1;
    row.parcela_total = tipo === 'parcelado' ? qtd : 0;

    validateRequired_(def, row);
    validateColumns_(def, row);
    if (def.crossValidate) def.crossValidate(row);

    row.id = Utilities.getUuid();
    var arr = header.map(function (c) { return Object.prototype.hasOwnProperty.call(row, c) ? row[c] : ''; });
    sh.appendRow(arr);
    created.push(row);
  }
  return { serie_id: serieId, count: created.length, rows: created };
}

/**
 * Soma `delta` meses a uma data YYYY-MM-DD mantendo o dia.
 * Se o mês destino for menor que o dia (ex.: 31 jan + 1 mês), faz clamp pro
 * último dia. Aritmético — não usa Date() pra evitar drift de TZ.
 */
function shiftDateMonth_(yyyymmdd, delta) {
  var parts = String(yyyymmdd).split('-').map(Number);
  var y = parts[0], m = parts[1], d = parts[2];
  var total = y * 12 + (m - 1) + delta;
  var ty = Math.floor(total / 12);
  var tm = total - ty * 12; // 0..11
  // último dia do mês destino (truque: Date(y, m, 0) = último dia do mês m-1)
  var lastDay = new Date(ty, tm + 1, 0).getDate();
  var day = Math.min(d, lastDay);
  var mm = String(tm + 1);
  if (mm.length < 2) mm = '0' + mm;
  var dd = String(day);
  if (dd.length < 2) dd = '0' + dd;
  return ty + '-' + mm + '-' + dd;
}
