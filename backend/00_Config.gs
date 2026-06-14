/**
 * App de Finanças — Bam & Evellyn · Backend
 *
 * Backend organizado em módulos (compartilham namespace global no Apps Script).
 * Ordem de carregamento por nome alfabético — numeração 0X_ é defensiva
 * pra garantir que constantes em Schema/Sheets estejam disponíveis quando
 * os módulos de domínio (Crud, Series, Share) referenciam.
 *
 * Mapa:
 *  00_Config.gs     — auth token + whitelist de actions + constantes globais
 *  01_Schema.gs     — V (validators), SCHEMA das tabelas, TABLES, TEXT_COLS
 *  02_Sheets.gs     — leitura/escrita da planilha, migration, normalizeCell
 *  03_Main.gs       — doGet/doPost, roteador handle_, reply_, withLock_, helpers
 *  04_Crud.gs       — list/get/create/update/delete + batch_create
 *  05_Series.gs     — create_serie (parcelado/recorrente) + shiftDateMonth_
 *  06_Share.gs      — share YTD + close/reopen
 *  07_InitSchema.gs — initSchema() one-shot pra criar abas e seed
 */

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
  'create_serie',
  'share',
  'close_share',
  'reopen_share',
  'batch_create',
]);

// Quantos meses materializar quando o lançamento é marcado como recorrente.
// Quando o usuário navegar pra perto do fim, posso estender automaticamente.
var RECORRENTE_HORIZON_MESES = 24;
