/**
 * CRUD genérico: list/get/create/update/delete + batch_create.
 * Toda escrita roda dentro de withLock_ (assegurado por handle_ em Main).
 */

/**
 * list — filtros opcionais por colunas via query string.
 * Ignora chaves de controle (action, token, table).
 */
function list_(params) {
  var def = assertTable_(params.table);
  var rows = readAll_(params.table);
  var filters = {};
  Object.keys(params).forEach(function (k) {
    if (k === 'action' || k === 'token' || k === 'table') return;
    if (def.columns.indexOf(k) === -1) return;
    filters[k] = params[k];
  });
  var keys = Object.keys(filters);
  if (!keys.length) return rows;
  return rows.filter(function (r) {
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (String(r[k]) !== String(filters[k])) return false;
    }
    return true;
  });
}

function get_(params) {
  assertTable_(params.table);
  if (!params.id) throw new Error('missing_id');
  var rows = readAll_(params.table);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(params.id)) return rows[i];
  }
  throw new Error('not_found');
}

function create_(params) {
  var def = assertTable_(params.table);
  var input = params.data || {};
  var row = applyDefaultsAndCopy_(def, input);

  if (def.derive) def.derive(row);
  validateRequired_(def, row);
  validateColumns_(def, row);
  if (def.crossValidate) def.crossValidate(row);

  row.id = Utilities.getUuid();
  var sh = getOrCreateSheet_(params.table);
  var header = readHeader_(sh);
  var arr = header.map(function (c) {
    return Object.prototype.hasOwnProperty.call(row, c) ? row[c] : '';
  });
  sh.appendRow(arr);
  return row;
}

function update_(params) {
  var def = assertTable_(params.table);
  if (!params.id) throw new Error('missing_id');
  var patch = params.data || {};

  var sh = getOrCreateSheet_(params.table);
  var rowIndex = findRowIndex_(sh, params.id);
  if (rowIndex < 0) throw new Error('not_found');

  var header = readHeader_(sh);
  var values = sh.getRange(rowIndex, 1, 1, header.length).getValues()[0];
  var current = {};
  header.forEach(function (c, i) { current[c] = normalizeCell_(c, values[i]); });

  // Aplica patch só nas colunas conhecidas (e nunca id)
  def.columns.forEach(function (col) {
    if (col === 'id') return;
    if (Object.prototype.hasOwnProperty.call(patch, col)) current[col] = patch[col];
  });

  if (def.derive) def.derive(current);
  validateColumns_(def, current);
  if (def.crossValidate) def.crossValidate(current);

  var arr = header.map(function (c) { return Object.prototype.hasOwnProperty.call(current, c) ? current[c] : ''; });
  sh.getRange(rowIndex, 1, 1, header.length).setValues([arr]);
  return current;
}

function delete_(params) {
  assertTable_(params.table);
  if (!params.id) throw new Error('missing_id');
  var sh = getOrCreateSheet_(params.table);
  var rowIndex = findRowIndex_(sh, params.id);
  if (rowIndex < 0) throw new Error('not_found');
  sh.deleteRow(rowIndex);
  return { id: params.id, deleted: true };
}

/**
 * Cria várias linhas numa única transação. Retorna lista paralela de
 * resultados ({ok, data?, error?, index?}). Uma falha individual NÃO derruba o lote.
 */
function batchCreate_(params) {
  var def = assertTable_(params.table);
  var items = params.items;
  if (!Array.isArray(items)) throw new Error('items_must_be_array');
  if (items.length === 0) return { count: 0, results: [] };
  if (items.length > 500) throw new Error('batch_too_large:max=500');

  var sh = getOrCreateSheet_(params.table);
  var header = readHeader_(sh);
  var results = [];

  for (var i = 0; i < items.length; i++) {
    try {
      var input = items[i] || {};
      var row = applyDefaultsAndCopy_(def, input);
      if (def.derive) def.derive(row);
      validateRequired_(def, row);
      validateColumns_(def, row);
      if (def.crossValidate) def.crossValidate(row);
      row.id = Utilities.getUuid();
      var arr = header.map(function (c) { return Object.prototype.hasOwnProperty.call(row, c) ? row[c] : ''; });
      sh.appendRow(arr);
      results.push({ ok: true, data: row });
    } catch (e) {
      results.push({ ok: false, error: String(e && e.message || e), index: i });
    }
  }
  var okCount = 0;
  for (var k = 0; k < results.length; k++) if (results[k].ok) okCount++;
  return { count: okCount, total: items.length, results: results };
}

// ====== helpers compartilhados =============================================

/** Aplica defaults da tabela e copia somente colunas reconhecidas (skipa 'id'). */
function applyDefaultsAndCopy_(def, input) {
  var row = {};
  if (def.defaults) Object.keys(def.defaults).forEach(function (k) { row[k] = def.defaults[k]; });
  def.columns.forEach(function (col) {
    if (col === 'id') return;
    if (Object.prototype.hasOwnProperty.call(input, col)) row[col] = input[col];
  });
  return row;
}

function validateRequired_(def, row) {
  def.required.forEach(function (col) {
    if (row[col] === undefined || row[col] === null || row[col] === '') {
      throw new Error('missing_required:' + col);
    }
  });
}

function validateColumns_(def, row) {
  def.columns.forEach(function (col) {
    if (col === 'id') return;
    if (def.validators && def.validators[col]) {
      if (row[col] === undefined || row[col] === null) row[col] = '';
      try { row[col] = def.validators[col](row[col]); }
      catch (e) { throw new Error('invalid_' + col + ':' + e.message); }
    }
  });
}
