/**
 * App de Finanças — Bam & Evellyn
 * Backend: Google Apps Script publicado como Web App.
 *
 * PR1 — apenas fundação:
 *   - roteamento por ?action= (GET) e body.action (POST)
 *   - validação de token compartilhado
 *   - endpoint ping
 *   - helpers de leitura/escrita da planilha (prontos pra usar no PR2)
 *
 * O schema das abas, initSchema e o CRUD genérico vêm no PR2.
 *
 * O token é lido via PropertiesService (Script properties) — NÃO fica no código.
 * Para definir o token, rode `setAuthToken('valor-aleatorio-longo')` uma vez no
 * editor (ou via clasp). O MESMO valor vai em VITE_API_TOKEN no frontend e no
 * Secret do GitHub Actions.
 */

// ====== CONFIG ===============================================================

function getAuthToken_() {
  const t = PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN');
  if (!t) throw new Error('auth_token_not_configured');
  return t;
}

/** Helper one-shot: rodar uma vez para gravar o token no Script Properties. */
function setAuthToken(value) {
  if (!value || String(value).length < 16) throw new Error('token_too_short');
  PropertiesService.getScriptProperties().setProperty('AUTH_TOKEN', String(value));
  return 'ok';
}

// Whitelist de actions reconhecidas no PR1. O PR2 adiciona list/get/create/update/delete.
const PUBLIC_ACTIONS = new Set([
  'ping',
]);

// ====== ENTRY POINTS =========================================================

function doGet(e) {
  return handle_(e, /* fromPost = */ false);
}

function doPost(e) {
  return handle_(e, /* fromPost = */ true);
}

function handle_(e, fromPost) {
  try {
    const params = readParams_(e, fromPost);
    const action = String(params.action || '').trim();

    if (!action) return reply_({ ok: false, error: 'missing_action' }, 400);

    // Auth obrigatória em TODA requisição.
    if (!params.token || params.token !== getAuthToken_()) {
      return reply_({ ok: false, error: 'unauthorized' }, 401);
    }

    if (!PUBLIC_ACTIONS.has(action)) {
      return reply_({ ok: false, error: 'unknown_action:' + action }, 400);
    }

    switch (action) {
      case 'ping':
        return reply_({ ok: true, data: { ts: Date.now() } });
    }

    return reply_({ ok: false, error: 'unhandled_action:' + action }, 500);
  } catch (err) {
    return reply_({ ok: false, error: String(err && err.message || err) }, 500);
  }
}

// ====== PARAMS / REPLY =======================================================

/**
 * Lê parâmetros tanto de query string (GET) quanto do corpo JSON (POST).
 * POST: enviar JSON em text/plain pra evitar preflight CORS.
 */
function readParams_(e, fromPost) {
  const fromQuery = (e && e.parameter) ? e.parameter : {};
  if (!fromPost) return fromQuery;
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!raw) return fromQuery;
  let body = {};
  try {
    body = JSON.parse(raw);
  } catch (_) {
    throw new Error('invalid_json_body');
  }
  // Query tem precedência caso ambos venham (não esperado, mas determinístico).
  return Object.assign({}, body, fromQuery);
}

/**
 * Resposta sempre JSON via ContentService.
 * O `status` é informativo (Apps Script não permite controlar HTTP status real
 * de Web Apps); o cliente decide pelo campo `ok`.
 */
function reply_(payload, _status) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====== HELPERS DE PLANILHA (prontos pro PR2) ================================

/**
 * Retorna a planilha "container" (em que o script está vinculado).
 * Se preferir uma planilha externa, use SpreadsheetApp.openById(SHEET_ID).
 */
function getSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('no_active_spreadsheet');
  return ss;
}

function getSheet_(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('sheet_not_found:' + name);
  return sh;
}

/** Lê todas as linhas de uma aba como objetos {coluna: valor}. */
function readAll_(sheetName) {
  const sh = getSheet_(sheetName);
  const values = sh.getDataRange().getValues();
  if (values.length === 0) return [];
  const header = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = values[i][c];
    }
    rows.push(row);
  }
  return rows;
}

/** Append de uma linha, respeitando a ordem do cabeçalho. Usar dentro de withLock_. */
function appendRow_(sheetName, obj) {
  const sh = getSheet_(sheetName);
  const header = sh.getDataRange().getValues()[0] || [];
  const row = header.map(function (col) {
    return Object.prototype.hasOwnProperty.call(obj, col) ? obj[col] : '';
  });
  sh.appendRow(row);
  return obj;
}

/**
 * Envolve uma escrita em LockService pra evitar corrupção com dois usuários.
 * Use SEMPRE em qualquer write (no PR2 isso vira o padrão obrigatório).
 */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // 20s
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ====== UTIL =================================================================

/** ID novo (UUID v4 do Apps Script). */
function newId_() {
  return Utilities.getUuid();
}
