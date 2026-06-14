/**
 * App de Finanças — Bam & Evellyn · Backend
 *
 * Backend organizado em módulos (compartilham namespace global no Apps Script).
 * Ordem de carregamento por nome alfabético — numeração 0X_ é defensiva
 * pra garantir que constantes em Schema/Sheets estejam disponíveis quando
 * os módulos de domínio (Crud, Series, Share) referenciam.
 *
 * Mapa:
 *  00_Config.gs     — whitelist de actions + constantes globais
 *  01_Schema.gs     — V (validators), SCHEMA das tabelas, TABLES, TEXT_COLS
 *  02_Sheets.gs     — leitura/escrita da planilha, migration, normalizeCell
 *  03_Main.gs       — doGet/doPost, roteador handle_, reply_, withLock_, helpers
 *  04_Crud.gs       — list/get/create/update/delete + batch_create
 *  05_Series.gs     — create_serie (parcelado/recorrente) + shiftDateMonth_
 *  06_Share.gs      — share YTD + close/reopen
 *  07_InitSchema.gs — initSchema() one-shot pra criar abas e seed
 *  08_Auth.gs       — verifyIdToken (OAuth Google) + service_token (scripts)
 */

const PUBLIC_ACTIONS = new Set([
  'ping',
  'whoami',
  'list',
  'get',
  'create',
  'update',
  'delete',
  'create_serie',
  'extend_recorrentes',
  'delete_serie_forward',
  'update_serie_forward',
  'share',
  'close_share',
  'reopen_share',
  'batch_create',
]);

// Quantos meses materializar quando o lançamento é marcado como recorrente.
// Quando o usuário navegar pra perto do fim, posso estender automaticamente.
var RECORRENTE_HORIZON_MESES = 24;
