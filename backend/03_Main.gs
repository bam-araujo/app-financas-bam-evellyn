/**
 * Entry points (doGet/doPost) + roteador por action + helpers de
 * resposta e concorrência.
 */

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

    // ping não exige auth — usado pra checar conectividade antes do login.
    if (action === 'ping') {
      return reply_({ ok: true, data: { ts: Date.now() } });
    }

    // Auth obrigatória pra todo o resto. user fica disponível pras actions
    // (whoami devolve direto, outras só usam pra audit/personalização futura).
    var user;
    try { user = verifyAndIdentify_(params); }
    catch (err) { return reply_({ ok: false, error: String(err && err.message || 'unauthorized') }); }

    if (action === 'whoami') {
      return reply_({ ok: true, data: {
        email: user.email, nome: user.nome, cor: user.cor,
        name: user.name, picture: user.picture, source: user.source,
      } });
    }

    if (!PUBLIC_ACTIONS.has(action)) {
      return reply_({ ok: false, error: 'unknown_action:' + action });
    }

    switch (action) {
      case 'list':         return reply_({ ok: true, data: list_(params) });
      case 'get':          return reply_({ ok: true, data: get_(params) });
      case 'create':       return reply_({ ok: true, data: withLock_(function () { return create_(params); }) });
      case 'update':       return reply_({ ok: true, data: withLock_(function () { return update_(params); }) });
      case 'delete':       return reply_({ ok: true, data: withLock_(function () { return delete_(params); }) });
      case 'create_serie': return reply_({ ok: true, data: withLock_(function () { return createSerie_(params); }) });
      case 'share':        return reply_({ ok: true, data: shareForCompetencia_(params) });
      case 'close_share':  return reply_({ ok: true, data: withLock_(function () { return closeShare_(params); }) });
      case 'reopen_share': return reply_({ ok: true, data: withLock_(function () { return reopenShare_(params); }) });
      case 'batch_create': return reply_({ ok: true, data: withLock_(function () { return batchCreate_(params); }) });
    }
    return reply_({ ok: false, error: 'unhandled_action:' + action });
  } catch (err) {
    return reply_({ ok: false, error: String(err && err.message || err) });
  }
}

/**
 * Lê parâmetros de query (GET) ou body JSON (POST). Body tem precedência —
 * normalmente o payload do POST vem todo em JSON.
 */
function readParams_(e, fromPost) {
  var fromQuery = (e && e.parameter) ? e.parameter : {};
  if (!fromPost) return fromQuery;
  var raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!raw) return fromQuery;
  var body = {};
  try { body = JSON.parse(raw); }
  catch (_) { throw new Error('invalid_json_body'); }
  return Object.assign({}, fromQuery, body);
}

function reply_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Envolve uma função em LockService de script. Toda escrita deve usar isso. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); }
  finally { try { lock.releaseLock(); } catch (_) {} }
}

function newId_() {
  return Utilities.getUuid();
}
