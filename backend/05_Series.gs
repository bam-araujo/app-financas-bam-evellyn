/**
 * Series: create_serie (parcelado/recorrente) + helpers de shift.
 * Suporta `lancamentos` (ancora em data YYYY-MM-DD) e `receitas`
 * (ancora em competencia YYYY-MM — não há campo data).
 */

// Tabelas que suportam série. Inclui qual é o "âncora" — coluna que define a
// posição temporal de cada linha da série e por onde o shift mensal acontece.
var SERIE_TABLES = {
  lancamentos: { anchor: 'data', propagable: ['descricao', 'categoria', 'valor', 'pagador', 'tipo', 'dono'] },
  receitas:    { anchor: 'competencia', propagable: ['pessoa', 'tipo', 'origem', 'valor', 'conta_para_share'] },
};

function assertSerieTable_(t) {
  var meta = SERIE_TABLES[t];
  if (!meta) throw new Error('serie_apenas_em_tabelas_suportadas');
  return meta;
}

/**
 * Cria uma série de lançamentos/receitas vinculados (parcelado OU recorrente).
 *
 * params:
 *   table:        'lancamentos' | 'receitas'
 *   data:         payload base (mesmo formato do create normal)
 *   serie_tipo:   'parcelado' | 'recorrente'
 *   parcela_total: int (>0) — só relevante para parcelado
 *
 * Comportamento:
 *  - serie_id é um UUID único compartilhado por todas as linhas.
 *  - parcelado: cria `parcela_total` linhas, cada uma N meses após a base.
 *  - recorrente: cria RECORRENTE_HORIZON_MESES linhas; parcela_total fica 0.
 *  - Em lancamentos: mantém o dia da data, clamp pro último dia em meses curtos.
 *  - Em receitas: shift de competencia mês a mês.
 *  - O valor é o valor de UMA parcela (cada linha tem o mesmo valor).
 */
function createSerie_(params) {
  var tableName = String(params.table || '');
  var meta = assertSerieTable_(tableName);
  var def = SCHEMA[tableName];
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

  var anchor = meta.anchor;
  if (!input[anchor]) throw new Error('missing_required:' + anchor);

  var serieId = Utilities.getUuid();
  var sh = getOrCreateSheet_(tableName);
  var header = readHeader_(sh);
  var created = [];

  for (var i = 0; i < qtd; i++) {
    var row = applyDefaultsAndCopy_(def, input);
    // shift do âncora (data ou competencia) + competencia derivada quando aplicável
    if (anchor === 'data') {
      row.data = shiftDateMonth_(String(input.data), i);
      row.competencia = String(row.data).slice(0, 7);
    } else {
      row.competencia = addMonthsToCompetencia_(String(input.competencia), i);
    }
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
 * Itera sobre TODAS as tabelas que suportam série (lancamentos + receitas).
 * Modelo "infinito": mantém cada série recorrente sempre estendida pelo menos
 * 12 meses além da competência alvo. Idempotente.
 *
 * Pra cada serie recorrente:
 *   1. Lê última linha (maior `anchor`) da série.
 *   2. Se essa âncora >= target+12m: skip.
 *   3. Senão: clona a última linha N vezes shiftando o mês até cobrir target.
 *      Os campos propagáveis herdam da última linha — assim, se o usuário
 *      editou recentemente, a edição se propaga.
 */
function extendRecorrentes_(params) {
  var target;
  if (params && params.through_competencia && /^\d{4}-\d{2}$/.test(params.through_competencia)) {
    target = params.through_competencia;
  } else {
    var now = new Date();
    target = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
  }
  var targetPlus = addMonthsToCompetencia_(target, 12);

  var totalExtended = 0;
  for (var tableName in SERIE_TABLES) {
    totalExtended += extendRecorrentesForTable_(tableName, targetPlus);
  }
  return { extended: totalExtended, through: targetPlus };
}

function extendRecorrentesForTable_(tableName, targetPlus) {
  var meta = SERIE_TABLES[tableName];
  var def = SCHEMA[tableName];
  var sh = getOrCreateSheet_(tableName);
  var header = readHeader_(sh);
  var anchor = meta.anchor;
  var rows = readAll_(tableName);

  var bySerie = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.serie_tipo !== 'recorrente' || !r.serie_id) continue;
    var sid = String(r.serie_id);
    if (!bySerie[sid]) bySerie[sid] = [];
    bySerie[sid].push(r);
  }

  var extended = 0;
  for (var sid2 in bySerie) {
    var seriesRows = bySerie[sid2];
    seriesRows.sort(function (a, b) {
      return String(a[anchor] || '').localeCompare(String(b[anchor] || ''));
    });
    var last = seriesRows[seriesRows.length - 1];
    var lastCompetencia = anchor === 'data' ? String(last.data || '').slice(0, 7) : String(last.competencia || '');
    if (lastCompetencia >= targetPlus) continue;

    var nextNum = (Number(last.parcela_num) || seriesRows.length) + 1;
    var currentAnchor = String(last[anchor]);
    var stepsAdded = 0;
    while (true) {
      currentAnchor = anchor === 'data'
        ? shiftDateMonth_(currentAnchor, 1)
        : addMonthsToCompetencia_(currentAnchor, 1);
      var competencia = anchor === 'data' ? currentAnchor.slice(0, 7) : currentAnchor;
      if (competencia > targetPlus) break;

      var row = {};
      for (var p = 0; p < meta.propagable.length; p++) {
        var k = meta.propagable[p];
        row[k] = last[k];
      }
      if (anchor === 'data') {
        row.data = currentAnchor;
        row.competencia = competencia;
      } else {
        row.competencia = currentAnchor;
      }
      row.serie_id = sid2;
      row.serie_tipo = 'recorrente';
      row.parcela_num = nextNum;
      row.parcela_total = 0;

      validateRequired_(def, row);
      validateColumns_(def, row);
      if (def.crossValidate) def.crossValidate(row);
      row.id = Utilities.getUuid();
      var arr = header.map(function (c) { return Object.prototype.hasOwnProperty.call(row, c) ? row[c] : ''; });
      sh.appendRow(arr);
      extended++;
      nextNum++;
      stepsAdded++;
      // Safety: nunca expande mais que 60 meses numa chamada.
      if (stepsAdded > 60) break;
    }
  }
  return extended;
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
 * (scope='forward'). Forward = mesma serie_id E âncora >= âncora da linha alvo.
 */
function deleteSerieForward_(params) {
  var tableName = String(params.table || '');
  var meta = assertSerieTable_(tableName);
  var id = String(params.id || '');
  if (!id) throw new Error('missing_required:id');
  var scope = String(params.scope || 'this');
  var sh = getOrCreateSheet_(tableName);
  var rows = readAll_(tableName);
  var target = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === id) { target = rows[i]; break; }
  }
  if (!target) throw new Error('not_found');

  if (scope === 'this' || !target.serie_id) {
    var rIdx = findRowIndex_(sh, id);
    if (rIdx === -1) throw new Error('not_found');
    sh.deleteRow(rIdx);
    return { id: id, deleted: 1 };
  }

  var anchor = meta.anchor;
  var sid = String(target.serie_id);
  var fromAnchor = String(target[anchor]);
  var toDelete = [];
  for (var j = 0; j < rows.length; j++) {
    if (String(rows[j].serie_id) === sid && String(rows[j][anchor]) >= fromAnchor) {
      toDelete.push(String(rows[j].id));
    }
  }
  var deleted = 0;
  for (var k = 0; k < toDelete.length; k++) {
    var idx = findRowIndex_(sh, toDelete[k]);
    if (idx !== -1) { sh.deleteRow(idx); deleted++; }
  }
  return { id: id, deleted: deleted, serie_id: sid };
}

/**
 * Atualiza uma linha (scope='this') OU a linha + todas as futuras (scope='forward').
 * Em scope='forward', propaga só os campos definidos em SERIE_TABLES[t].propagable.
 * Âncora (data/competencia) NUNCA propaga — fica por linha.
 */
function updateSerieForward_(params) {
  var tableName = String(params.table || '');
  var meta = assertSerieTable_(tableName);
  var id = String(params.id || '');
  if (!id) throw new Error('missing_required:id');
  var scope = String(params.scope || 'this');
  var fields = params.fields || params.data || {};

  var sh = getOrCreateSheet_(tableName);
  var rows = readAll_(tableName);
  var target = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === id) { target = rows[i]; break; }
  }
  if (!target) throw new Error('not_found');

  if (scope === 'this' || !target.serie_id) {
    return update_({ table: tableName, id: id, data: fields });
  }

  var safeFields = {};
  for (var p = 0; p < meta.propagable.length; p++) {
    var key = meta.propagable[p];
    if (Object.prototype.hasOwnProperty.call(fields, key)) safeFields[key] = fields[key];
  }
  if (Object.keys(safeFields).length === 0) {
    return update_({ table: tableName, id: id, data: fields });
  }

  var anchor = meta.anchor;
  var sid = String(target.serie_id);
  var fromAnchor = String(target[anchor]);
  var ids = [];
  for (var j = 0; j < rows.length; j++) {
    if (String(rows[j].serie_id) === sid && String(rows[j][anchor]) >= fromAnchor) {
      ids.push(String(rows[j].id));
    }
  }
  var updated = 0;
  for (var k = 0; k < ids.length; k++) {
    try {
      update_({ table: tableName, id: ids[k], data: safeFields });
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
