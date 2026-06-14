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
 * Estende séries recorrentes até cobrir `through_competencia` + buffer.
 *
 * Modelo "infinito": em vez de criar N lançamentos fixos no início, mantemos
 * a série sempre estendida pelo menos 12 meses além da competência ativa.
 * Idempotente — se já cobre, não faz nada.
 *
 * params:
 *   through_competencia: YYYY-MM até onde garantir cobertura (default: hoje + 12m)
 *
 * Pra cada serie recorrente:
 *   1. Lê última linha (maior `data`) da série.
 *   2. Se essa data >= through + 12m: skip.
 *   3. Senão: clona a última linha N vezes shiftando o mês até cobrir target.
 *      Os campos (descricao, categoria, valor, pagador, tipo, dono) herdam
 *      da última linha — assim, se o usuário editou recentemente, a edição
 *      se propaga.
 */
function extendRecorrentes_(params) {
  var target;
  if (params && params.through_competencia && /^\d{4}-\d{2}$/.test(params.through_competencia)) {
    target = params.through_competencia;
  } else {
    var now = new Date();
    target = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
  }
  // Buffer: estendemos até 12 meses ALÉM de target.
  var targetPlus = addMonthsToCompetencia_(target, 12);

  var sh = getOrCreateSheet_('lancamentos');
  var rows = readAll_('lancamentos');
  // Agrupa por serie_id, só recorrentes
  var bySerie = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.serie_tipo !== 'recorrente' || !r.serie_id) continue;
    var sid = String(r.serie_id);
    if (!bySerie[sid]) bySerie[sid] = [];
    bySerie[sid].push(r);
  }

  var def = SCHEMA.lancamentos;
  var header = readHeader_(sh);
  var extended = 0;

  for (var sid2 in bySerie) {
    var seriesRows = bySerie[sid2];
    seriesRows.sort(function (a, b) {
      return String(a.data || '').localeCompare(String(b.data || ''));
    });
    var last = seriesRows[seriesRows.length - 1];
    var lastCompetencia = String(last.data || '').slice(0, 7);
    if (lastCompetencia >= targetPlus) continue;

    // Estende mês a mês até passar targetPlus.
    var nextNum = (Number(last.parcela_num) || seriesRows.length) + 1;
    var currentData = String(last.data);
    while (true) {
      currentData = shiftDateMonth_(currentData, 1);
      var competencia = currentData.slice(0, 7);
      if (competencia > targetPlus) break;
      var row = {
        data: currentData,
        competencia: competencia,
        descricao: last.descricao,
        categoria: last.categoria,
        valor: Number(last.valor) || 0,
        pagador: last.pagador,
        tipo: last.tipo,
        dono: last.dono || '',
        serie_id: sid2,
        serie_tipo: 'recorrente',
        parcela_num: nextNum,
        parcela_total: 0,
      };
      validateRequired_(def, row);
      validateColumns_(def, row);
      if (def.crossValidate) def.crossValidate(row);
      row.id = Utilities.getUuid();
      var arr = header.map(function (c) { return Object.prototype.hasOwnProperty.call(row, c) ? row[c] : ''; });
      sh.appendRow(arr);
      extended++;
      nextNum++;
      // Safety: nunca expande mais que 60 meses numa chamada.
      if (nextNum - (Number(last.parcela_num) || seriesRows.length) > 60) break;
    }
  }
  return { extended: extended, through: targetPlus };
}

/** Helper local: soma N meses a YYYY-MM. */
function addMonthsToCompetencia_(yyyymm, n) {
  var parts = String(yyyymm).split('-').map(Number);
  var y = parts[0], m = parts[1];
  var total = y * 12 + (m - 1) + n;
  var ty = Math.floor(total / 12);
  var tm = total - ty * 12;
  var mm = String(tm + 1);
  if (mm.length < 2) mm = '0' + mm;
  return ty + '-' + mm;
}

/**
 * Deleta uma linha (scope='this') OU a linha + todas as futuras da mesma série
 * (scope='forward'). Forward = mesma serie_id E data >= data da linha alvo.
 */
function deleteSerieForward_(params) {
  if (params.table !== 'lancamentos') throw new Error('serie_apenas_em_lancamentos');
  var id = String(params.id || '');
  if (!id) throw new Error('missing_required:id');
  var scope = String(params.scope || 'this');
  var sh = getOrCreateSheet_('lancamentos');
  var rows = readAll_('lancamentos');
  var target = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === id) { target = rows[i]; break; }
  }
  if (!target) throw new Error('not_found');

  // Sem série OU scope=this: comportamento idêntico ao delete normal (uma linha).
  if (scope === 'this' || !target.serie_id) {
    var rIdx = findRowIndex_(sh, id);
    if (rIdx === -1) throw new Error('not_found');
    sh.deleteRow(rIdx);
    return { id: id, deleted: 1 };
  }

  // scope = 'forward' + tem serie_id
  var sid = String(target.serie_id);
  var fromData = String(target.data);
  var toDelete = [];
  for (var j = 0; j < rows.length; j++) {
    if (String(rows[j].serie_id) === sid && String(rows[j].data) >= fromData) {
      toDelete.push(String(rows[j].id));
    }
  }
  // Deleta de baixo pra cima pra não invalidar índices.
  var deleted = 0;
  for (var k = 0; k < toDelete.length; k++) {
    var idx = findRowIndex_(sh, toDelete[k]);
    if (idx !== -1) { sh.deleteRow(idx); deleted++; }
  }
  return { id: id, deleted: deleted, serie_id: sid };
}

/**
 * Atualiza uma linha (scope='this') OU a linha + todas as futuras (scope='forward').
 * Em scope='forward', propaga só os campos passados em `fields` (descricao,
 * categoria, valor, pagador, tipo, dono) — data e competencia continuam por linha.
 */
function updateSerieForward_(params) {
  if (params.table !== 'lancamentos') throw new Error('serie_apenas_em_lancamentos');
  var id = String(params.id || '');
  if (!id) throw new Error('missing_required:id');
  var scope = String(params.scope || 'this');
  var fields = params.fields || params.data || {};

  var sh = getOrCreateSheet_('lancamentos');
  var rows = readAll_('lancamentos');
  var target = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === id) { target = rows[i]; break; }
  }
  if (!target) throw new Error('not_found');

  // Sem série OU scope=this: update normal.
  if (scope === 'this' || !target.serie_id) {
    return update_({ table: 'lancamentos', id: id, data: fields });
  }

  // scope='forward' + tem serie_id: propaga aos campos seguros (não data/competencia).
  var safeFields = {};
  var propagable = ['descricao', 'categoria', 'valor', 'pagador', 'tipo', 'dono'];
  for (var p = 0; p < propagable.length; p++) {
    var key = propagable[p];
    if (Object.prototype.hasOwnProperty.call(fields, key)) safeFields[key] = fields[key];
  }
  if (Object.keys(safeFields).length === 0) {
    // Nada a propagar — só update na linha alvo.
    return update_({ table: 'lancamentos', id: id, data: fields });
  }

  var sid = String(target.serie_id);
  var fromData = String(target.data);
  var ids = [];
  for (var j = 0; j < rows.length; j++) {
    if (String(rows[j].serie_id) === sid && String(rows[j].data) >= fromData) {
      ids.push(String(rows[j].id));
    }
  }
  var updated = 0;
  for (var k = 0; k < ids.length; k++) {
    try {
      update_({ table: 'lancamentos', id: ids[k], data: safeFields });
      updated++;
    } catch (e) { /* skip linha problemática mas continua o lote */ }
  }
  return { id: id, updated: updated, serie_id: sid };
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
