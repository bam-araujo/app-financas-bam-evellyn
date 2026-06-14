/**
 * Auth: valida id_token do Google (OAuth client-side) ou service_token
 * (shared secret usado só pelos scripts .mjs locais — NUNCA no bundle).
 *
 * Pipeline padrão da request:
 *  1. verifyAndIdentify_(params)
 *  2. Se id_token presente → valida via tokeninfo + checa allowlist em /pessoas
 *  3. Se service_token presente → valida contra Script Property
 *  4. Devolve { email, nome, cor } ou throw 'unauthorized'
 */

/**
 * Cache em memória do tokeninfo do Google. id_tokens duram 1h; cacheamos
 * por 5min pra reduzir round-trips sem segurar token revogado por tempo demais.
 */
function getTokenCache_() {
  return CacheService.getScriptCache();
}

/**
 * Valida um id_token JWT do Google. Não faz verify de assinatura local
 * (Apps Script não tem libs de crypto ergonômicas) — usa o endpoint
 * oficial oauth2.googleapis.com/tokeninfo, que Google mantém e que faz
 * todas as checagens de assinatura/expiry/audience.
 *
 * Retorna { email, name, picture } ou lança Error.
 */
function verifyIdToken_(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length < 20) {
    throw new Error('invalid_id_token');
  }

  var cache = getTokenCache_();
  var cacheKey = 'idt:' + Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_1,
    idToken,
  ).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');

  var cached = cache.get(cacheKey);
  if (cached) {
    var info = JSON.parse(cached);
    if (info && info.email) return info;
  }

  var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var status = res.getResponseCode();
  if (status !== 200) {
    throw new Error('id_token_invalid:http_' + status);
  }
  var info;
  try { info = JSON.parse(res.getContentText()); }
  catch (_) { throw new Error('id_token_unparseable'); }

  // Checagens mínimas. tokeninfo já valida signature + expiry; aqui só
  // confirmamos os campos críticos. Fail-closed: qualquer ausência rejeita.
  var expectedAud = getExpectedAudience_();
  if (!expectedAud) {
    // Sem client_id configurado, recusa tudo — evita bypass silencioso se
    // a Property OAUTH_CLIENT_ID for esquecida em alguma implantação nova.
    throw new Error('oauth_client_id_not_configured');
  }
  if (info.aud !== expectedAud) {
    throw new Error('id_token_wrong_audience');
  }
  if (!info.exp || Number(info.exp) * 1000 < Date.now()) {
    throw new Error('id_token_expired_or_missing_exp');
  }
  if (!info.email_verified || info.email_verified === 'false') {
    throw new Error('id_token_email_unverified');
  }
  if (!info.email) {
    throw new Error('id_token_no_email');
  }

  var out = { email: String(info.email).toLowerCase(), name: info.name || '', picture: info.picture || '' };
  cache.put(cacheKey, JSON.stringify(out), 300);
  return out;
}

/** Audience esperada (OAuth client id). Lido de Script Property. */
function getExpectedAudience_() {
  return PropertiesService.getScriptProperties().getProperty('OAUTH_CLIENT_ID') || '';
}

/**
 * Setter pra config inicial — chamar uma vez pelo editor:
 *   setOAuthClientId('123456-xxxxxxxx.apps.googleusercontent.com')
 */
function setOAuthClientId(value) {
  if (!value || String(value).indexOf('.apps.googleusercontent.com') === -1) {
    throw new Error('client_id_invalid_format');
  }
  PropertiesService.getScriptProperties().setProperty('OAUTH_CLIENT_ID', String(value));
  return 'ok';
}

/**
 * Busca a linha de pessoas que tenha o email exato (case-insensitive).
 * Retorna { id, nome, cor, email } ou null se não autorizado.
 */
function getUserByEmail_(email) {
  if (!email) return null;
  var target = String(email).toLowerCase().trim();
  var rows = readAll_('pessoas');
  for (var i = 0; i < rows.length; i++) {
    var rowEmail = String(rows[i].email || '').toLowerCase().trim();
    if (rowEmail && rowEmail === target) return rows[i];
  }
  return null;
}

/**
 * Resolve o usuário da request. Aceita id_token OU service_token. Retorna
 * { email, nome, cor, source } onde source é 'oauth' ou 'service'.
 * Lança 'unauthorized' (ou erro mais específico) em qualquer falha.
 */
function verifyAndIdentify_(params) {
  if (params.id_token) {
    var google = verifyIdToken_(params.id_token);
    var user = getUserByEmail_(google.email);
    if (!user) throw new Error('email_not_authorized:' + google.email);
    return {
      email: google.email,
      nome: user.nome,
      cor: user.cor,
      name: google.name,
      picture: google.picture,
      source: 'oauth',
    };
  }
  if (params.service_token) {
    var svc = PropertiesService.getScriptProperties().getProperty('SERVICE_TOKEN');
    if (!svc) throw new Error('service_token_not_configured');
    if (String(params.service_token) !== svc) throw new Error('service_token_invalid');
    return { email: 'service@scripts', nome: 'service', cor: '', name: 'service', picture: '', source: 'service' };
  }
  throw new Error('unauthorized');
}

/**
 * Setter pra config inicial do service_token. Token longo (32+ chars).
 *   setServiceToken('valor-aleatório-longo')
 */
function setServiceToken(value) {
  if (!value || String(value).length < 16) throw new Error('service_token_too_short');
  PropertiesService.getScriptProperties().setProperty('SERVICE_TOKEN', String(value));
  return 'ok';
}
