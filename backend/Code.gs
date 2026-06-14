/**
 * App de Finanças — Bam & Evellyn
 * Backend: Google Apps Script publicado como Web App.
 *
 * PR2 — schema das 6 abas + CRUD genérico:
 *   - SCHEMA com colunas, tipos, obrigatórios e regras cross-coluna
 *   - initSchema(): cria abas e popula pessoas + categorias iniciais
 *   - actions: ping, list, get, create, update, delete
 *   - validação no create/update; LockService em toda escrita
 *
 * Token continua via PropertiesService.
 */

// ====== CONFIG ===============================================================

function getAuthToken_() {
  const t = PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN');
  if (!t) throw new Error('auth_token_not_configured');
  return t;
}

function setAuthToken(value) {
  if (!value || String(value).length < 16) throw new Error('token_too_short');
  PropertiesService.getScriptProperties().setProperty('AUTH_TOKEN', String(value));
  return 'ok';
}

const PUBLIC_ACTIONS = new Set([
  'ping',
  'list',
  'get',
  'create',
  'update',
  'delete',
]);

// ====== SCHEMA ===============================================================

const PESSOAS_VALIDAS = ['Bam', 'Evellyn'];
const TITULARES_VALIDOS = ['Bam', 'Evellyn', 'conjunto'];

/**
 * Tipos primitivos (string|number|boolean|enum|date|month).
 * Validators retornam o valor coercido OU lançam Error.
 */
const V = {
  string: function (v) {
    if (v === null || v === undefined || v === '') return '';
    return String(v);
  },
  stringRequired: function (v) {
    if (v === null || v === undefined || String(v).trim() === '') throw new Error('required');
    return String(v).trim();
  },
  number: function (v) {
    if (v === null || v === undefined || v === '') throw new Error('required');
    var n = Number(v);
    if (!isFinite(n)) throw new Error('not_a_number');
    return n;
  },
  bool: function (v) {
    if (v === true || v === false) return v;
    if (v === 'TRUE' || v === 'true' || v === 1 || v === '1') return true;
    if (v === 'FALSE' || v === 'false' || v === 0 || v === '0' || v === '' || v === null || v === undefined) return false;
    throw new Error('not_a_bool');
  },
  enum: function (allowed) {
    return function (v) {
      var s = String(v);
      if (allowed.indexOf(s) === -1) throw new Error('not_in_enum:' + allowed.join('|'));
      return s;
    };
  },
  date: function (v) {
    // Espera YYYY-MM-DD. Aceita Date também.
    if (v instanceof Date) {
      var y = v.getFullYear(), m = ('0' + (v.getMonth() + 1)).slice(-2), d = ('0' + v.getDate()).slice(-2);
      return y + '-' + m + '-' + d;
    }
    var s = String(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('invalid_date:expected_YYYY-MM-DD');
    return s;
  },
  month: function (v) {
    if (v instanceof Date) {
      return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2);
    }
    var s = String(v);
    if (!/^\d{4}-\d{2}$/.test(s)) throw new Error('invalid_competencia:expected_YYYY-MM');
    return s;
  },
  monthOptional: function (v) {
    if (v === null || v === undefined || v === '') return '';
    return V.month(v);
  },
  stringOptional: function (v) {
    if (v === null || v === undefined) return '';
    return String(v);
  },
};

const SCHEMA = {
  pessoas: {
    columns: ['id', 'nome', 'cor'],
    required: ['nome'],
    validators: {
      nome: V.enum(PESSOAS_VALIDAS),
      cor: V.stringRequired,
    },
  },
  categorias: {
    columns: ['id', 'nome', 'grupo'],
    required: ['nome', 'grupo'],
    validators: {
      nome: V.stringRequired,
      grupo: V.enum(['despesa', 'receita']),
    },
  },
  receitas: {
    columns: ['id', 'competencia', 'pessoa', 'tipo', 'origem', 'valor', 'conta_para_share'],
    required: ['competencia', 'pessoa', 'tipo', 'valor'],
    validators: {
      competencia: V.month,
      pessoa: V.enum(PESSOAS_VALIDAS),
      tipo: V.enum(['salario', 'bonus', 'promocao', 'outro']),
      origem: V.stringOptional,
      valor: V.number,
      conta_para_share: V.bool,
    },
    defaults: { conta_para_share: true },
  },
  lancamentos: {
    columns: ['id', 'data', 'competencia', 'descricao', 'categoria', 'valor', 'pagador', 'tipo', 'dono'],
    required: ['data', 'descricao', 'categoria', 'valor', 'pagador', 'tipo'],
    validators: {
      data: V.date,
      competencia: V.monthOptional,
      descricao: V.stringRequired,
      categoria: V.stringRequired,
      valor: V.number,
      pagador: V.enum(PESSOAS_VALIDAS),
      tipo: V.enum(['individual', 'conjunto']),
      dono: function (v) {
        // Permite vazio aqui; a regra de presença é cross-coluna (validateRow_).
        if (v === null || v === undefined || v === '') return '';
        var s = String(v);
        if (PESSOAS_VALIDAS.indexOf(s) === -1) throw new Error('dono_invalido');
        return s;
      },
    },
    derive: function (row) {
      // competencia derivada de data se não vier.
      if ((!row.competencia || row.competencia === '') && row.data) {
        row.competencia = String(row.data).slice(0, 7);
      }
    },
    crossValidate: function (row) {
      if (row.tipo === 'individual' && !row.dono) {
        throw new Error('dono_required_when_individual');
      }
      if (row.tipo === 'conjunto' && row.dono) {
        throw new Error('dono_must_be_empty_when_conjunto');
      }
    },
  },
  investimentos_saldos: {
    columns: ['id', 'data', 'titular', 'instituicao', 'ativo', 'valor_saldo'],
    required: ['data', 'titular', 'instituicao', 'ativo', 'valor_saldo'],
    validators: {
      data: V.date,
      titular: V.enum(TITULARES_VALIDOS),
      instituicao: V.stringRequired,
      ativo: V.stringRequired,
      valor_saldo: V.number,
    },
  },
  investimentos_movimentos: {
    columns: ['id', 'data', 'titular', 'instituicao', 'ativo', 'tipo', 'valor'],
    required: ['data', 'titular', 'instituicao', 'ativo', 'tipo', 'valor'],
    validators: {
      data: V.date,
      titular: V.enum(TITULARES_VALIDOS),
      instituicao: V.stringRequired,
      ativo: V.stringRequired,
      tipo: V.enum(['aporte', 'resgate']),
      valor: V.number,
    },
  },
};

const TABLES = Object.keys(SCHEMA);

// ====== ENTRY POINTS =========================================================

function doGet(e) {
  return handle_(e, false);
}

function doPost(e) {
  return handle_(e, true);
}

function handle_(e, fromPost) {
  try {
    var params = readParams_(e, fromPost);
    var action = String(params.action || '').trim();

    if (!action) return reply_({ ok: false, error: 'missing_action' });
    if (!params.token || params.token !== getAuthToken_()) {
      return reply_({ ok: false, error: 'unauthorized' });
    }
    if (!PUBLIC_ACTIONS.has(action)) {
      return reply_({ ok: false, error: 'unknown_action:' + action });
    }

    switch (action) {
      case 'ping':   return reply_({ ok: true, data: { ts: Date.now() } });
      case 'list':   return reply_({ ok: true, data: list_(params) });
      case 'get':    return reply_({ ok: true, data: get_(params) });
      case 'create': return reply_({ ok: true, data: withLock_(function () { return create_(params); }) });
      case 'update': return reply_({ ok: true, data: withLock_(function () { return update_(params); }) });
      case 'delete': return reply_({ ok: true, data: withLock_(function () { return delete_(params); }) });
    }
    return reply_({ ok: false, error: 'unhandled_action:' + action });
  } catch (err) {
    return reply_({ ok: false, error: String(err && err.message || err) });
  }
}

// ====== PARAMS / REPLY =======================================================

function readParams_(e, fromPost) {
  var fromQuery = (e && e.parameter) ? e.parameter : {};
  if (!fromPost) return fromQuery;
  var raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!raw) return fromQuery;
  var body = {};
  try { body = JSON.parse(raw); }
  catch (_) { throw new Error('invalid_json_body'); }
  // Body tem precedência (POST normalmente carrega o payload via JSON).
  return Object.assign({}, fromQuery, body);
}

function reply_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====== TABLES & ROWS ========================================================

function assertTable_(name) {
  if (!name || TABLES.indexOf(name) === -1) throw new Error('invalid_table:' + name);
  return SCHEMA[name];
}

function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('no_active_spreadsheet');
  return ss;
}

// Colunas que armazenam strings parecidas com datas e que o Sheets, se deixado solto,
// auto-converte em Date — preciso forçar formato de texto pra preservar o valor original.
var TEXT_COLS = { data: true, competencia: true, cor: true };

function getOrCreateSheet_(name) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  var created = false;
  if (!sh) {
    sh = ss.insertSheet(name);
    var header = SCHEMA[name].columns;
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
    created = true;
  }
  // Plain Text nas colunas que guardam string de data/competencia/cor — idempotente
  // (sempre garantido, mesmo em planilhas pré-existentes). Sheets converte
  // "2026-06-14" em Date object sem isso.
  var headerNames = SCHEMA[name].columns;
  for (var i = 0; i < headerNames.length; i++) {
    if (TEXT_COLS[headerNames[i]]) {
      sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    }
  }
  if (created) {
    // Reset format do header pra default (não precisa ser plain text — só os dados)
    sh.getRange(1, 1, 1, headerNames.length).setNumberFormat('').setFontWeight('bold');
  }
  return sh;
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

// ====== CRUD =================================================================

/**
 * list — filtros opcionais por colunas via query string.
 * Ignora: action, token, table.
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
      // Compare como string para alinhar com query-string.
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
  var row = {};

  // Aplica defaults
  if (def.defaults) {
    Object.keys(def.defaults).forEach(function (k) { row[k] = def.defaults[k]; });
  }
  // Copia somente colunas conhecidas
  def.columns.forEach(function (col) {
    if (col === 'id') return;
    if (Object.prototype.hasOwnProperty.call(input, col)) row[col] = input[col];
  });

  // Deriva (ex.: competencia a partir de data)
  if (def.derive) def.derive(row);

  // Valida obrigatórios
  def.required.forEach(function (col) {
    if (row[col] === undefined || row[col] === null || row[col] === '') {
      throw new Error('missing_required:' + col);
    }
  });

  // Valida cada coluna
  def.columns.forEach(function (col) {
    if (col === 'id') return;
    if (def.validators && def.validators[col]) {
      // Trata ausência: se opcional e ausente, mantém vazio.
      if (row[col] === undefined || row[col] === null) row[col] = '';
      try {
        row[col] = def.validators[col](row[col]);
      } catch (e) {
        throw new Error('invalid_' + col + ':' + e.message);
      }
    }
  });

  // Cross-coluna
  if (def.crossValidate) def.crossValidate(row);

  row.id = Utilities.getUuid();

  // Append na ordem do header
  var sh = getOrCreateSheet_(params.table);
  var arr = def.columns.map(function (c) {
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
  var rowIndex = findRowIndex_(sh, params.id); // 1-based, ignorando header
  if (rowIndex < 0) throw new Error('not_found');

  var values = sh.getRange(rowIndex, 1, 1, def.columns.length).getValues()[0];
  var current = {};
  def.columns.forEach(function (c, i) { current[c] = normalizeCell_(c, values[i]); });

  // Aplica patch só nas colunas conhecidas (e nunca id)
  def.columns.forEach(function (col) {
    if (col === 'id') return;
    if (Object.prototype.hasOwnProperty.call(patch, col)) current[col] = patch[col];
  });

  if (def.derive) def.derive(current);

  // Re-valida o estado final
  def.columns.forEach(function (col) {
    if (col === 'id') return;
    if (def.validators && def.validators[col]) {
      if (current[col] === undefined || current[col] === null) current[col] = '';
      try {
        current[col] = def.validators[col](current[col]);
      } catch (e) {
        throw new Error('invalid_' + col + ':' + e.message);
      }
    }
  });
  if (def.crossValidate) def.crossValidate(current);

  var arr = def.columns.map(function (c) { return current[c]; });
  sh.getRange(rowIndex, 1, 1, def.columns.length).setValues([arr]);
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

function findRowIndex_(sh, id) {
  var values = sh.getDataRange().getValues();
  // values[0] = header; data começa em values[1] = linha 2 da planilha
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

// ====== INIT SCHEMA ==========================================================

/**
 * Rodar UMA vez no editor (ou via clasp). Cria as 6 abas com cabeçalho,
 * popula pessoas (Bam, Evellyn) e um conjunto inicial de categorias.
 * Idempotente: linhas já existentes não são duplicadas.
 */
function initSchema() {
  withLock_(function () {
    // Garante TZ da planilha alinhado com o do script — evita drift entre data
    // exibida e data interpretada quando alguém edita à mão.
    var ss = getSpreadsheet_();
    if (ss.getSpreadsheetTimeZone() !== 'America/Sao_Paulo') {
      ss.setSpreadsheetTimeZone('America/Sao_Paulo');
    }
    TABLES.forEach(function (t) { getOrCreateSheet_(t); });

    seedRow_('pessoas', { nome: 'Bam' }, { nome: 'Bam', cor: '#2563eb' });
    seedRow_('pessoas', { nome: 'Evellyn' }, { nome: 'Evellyn', cor: '#db2777' });

    var cats = [
      { nome: 'Aluguel', grupo: 'despesa' },
      { nome: 'Condomínio', grupo: 'despesa' },
      { nome: 'Energia', grupo: 'despesa' },
      { nome: 'Água', grupo: 'despesa' },
      { nome: 'Internet', grupo: 'despesa' },
      { nome: 'Mercado', grupo: 'despesa' },
      { nome: 'Restaurante', grupo: 'despesa' },
      { nome: 'Transporte', grupo: 'despesa' },
      { nome: 'Saúde', grupo: 'despesa' },
      { nome: 'Lazer', grupo: 'despesa' },
      { nome: 'Assinaturas', grupo: 'despesa' },
      { nome: 'Educação', grupo: 'despesa' },
      { nome: 'Roupas', grupo: 'despesa' },
      { nome: 'Presentes', grupo: 'despesa' },
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

// ====== UTIL =================================================================

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); }
  finally { try { lock.releaseLock(); } catch (_) {} }
}

function newId_() {
  return Utilities.getUuid();
}
