/**
 * Leitura/escrita da planilha + migration idempotente de header.
 * Tudo que toca uma aba passa por aqui.
 */

function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('no_active_spreadsheet');
  return ss;
}

/**
 * Retorna a aba (cria se não existir). Sempre que chamada, garante que:
 *  - A aba existe (cria com header SCHEMA.columns)
 *  - Header tem todas as colunas do SCHEMA atual (adiciona colunas faltantes)
 *  - Colunas em TEXT_COLS estão com formato Plain Text (idempotente)
 * Assim, qualquer mudança de schema é migrada na próxima operação.
 */
function getOrCreateSheet_(name) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  var created = false;
  var expectedHeader = SCHEMA[name].columns;
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]).setFontWeight('bold');
    sh.setFrozenRows(1);
    created = true;
  } else {
    // Migration: adiciona colunas novas do SCHEMA ao final do header. Idempotente.
    var actualHeader = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
    var missing = [];
    for (var k = 0; k < expectedHeader.length; k++) {
      if (actualHeader.indexOf(expectedHeader[k]) === -1) missing.push(expectedHeader[k]);
    }
    if (missing.length) {
      var startCol = actualHeader.length + 1;
      sh.getRange(1, startCol, 1, missing.length).setValues([missing]).setFontWeight('bold');
    }
  }
  // Plain Text nas colunas que guardam string de data/competencia/cor — idempotente.
  // Sheets converte "2026-06-14" em Date object sem isso.
  var currentHeader = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var i = 0; i < currentHeader.length; i++) {
    if (TEXT_COLS[currentHeader[i]]) {
      sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    }
  }
  if (created) {
    sh.getRange(1, 1, 1, expectedHeader.length).setNumberFormat('').setFontWeight('bold');
  }
  return sh;
}

/** Header atual da aba, em ordem. Usado por create/update pra alinhar com a planilha real. */
function readHeader_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

/**
 * Se o valor vindo do Sheets veio como Date object (cell auto-parsed), formata
 * de volta pra string YYYY-MM-DD ou YYYY-MM usando o TZ do script — determinístico.
 */
function normalizeCell_(col, value) {
  if (!(value instanceof Date)) return value;
  var tz = Session.getScriptTimeZone();
  if (col === 'competencia') return Utilities.formatDate(value, tz, 'yyyy-MM');
  if (col === 'data') return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  return value;
}

function readAll_(table) {
  assertTable_(table);
  var sh = getOrCreateSheet_(table);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var c = 0; c < header.length; c++) row[header[c]] = normalizeCell_(header[c], values[i][c]);
    out.push(row);
  }
  return out;
}

/** Acha o índice (1-based, incluindo header em row 1) da linha cujo id bate. */
function findRowIndex_(sh, id) {
  var values = sh.getDataRange().getValues();
  // values[0] = header; data começa em values[1] = linha 2 da planilha
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 1;
  }
  return -1;
}
