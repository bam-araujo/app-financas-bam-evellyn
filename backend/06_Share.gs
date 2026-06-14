/**
 * Motor de rateio: share YTD + close/reopen do mês.
 * Regra: share_pessoa = receitas_acumuladas_jan_M_pessoa / total_acumulado_casal.
 * Só receitas com conta_para_share=true entram. Reset em janeiro de cada ano.
 */

/**
 * Calcula o share da competência. Se já fechado, retorna o snapshot;
 * senão, calcula YTD on-the-fly.
 *
 * Retorna: { Bam, Evellyn, fechado, competencia, fechado_em? }
 * Onde Bam e Evellyn são números no intervalo [0, 1] e somam ~1.
 */
function shareForCompetencia_(params) {
  var competencia = String(params.competencia || '').trim();
  if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('competencia_invalida');

  // 1) Tenta ler do share_mensal (mês fechado)
  var snap = readAll_('share_mensal').filter(function (r) { return r.competencia === competencia; });
  if (snap.length) {
    var byPessoa = {};
    snap.forEach(function (r) { byPessoa[r.pessoa] = Number(r.share) || 0; });
    return {
      competencia: competencia,
      fechado: true,
      fechado_em: String(snap[0].fechado_em || ''),
      Bam: byPessoa.Bam || 0,
      Evellyn: byPessoa.Evellyn || 0,
    };
  }

  // 2) Calcula YTD
  return Object.assign({ fechado: false, competencia: competencia }, computeShareYTD_(competencia));
}

/**
 * Soma receitas YTD (jan→M do mesmo ano) por pessoa, só conta_para_share=true,
 * e devolve { Bam, Evellyn } como fração (somam 1).
 *
 * Convenção: se total=0, devolve 0.5/0.5 (sem dados ainda — split igual).
 */
function computeShareYTD_(competencia) {
  var year = competencia.slice(0, 4);
  var rows = readAll_('receitas').filter(function (r) {
    if (!r.competencia || !r.conta_para_share) return false;
    var c = String(r.competencia);
    return c.slice(0, 4) === year && c <= competencia;
  });
  var bam = 0, eve = 0;
  rows.forEach(function (r) {
    var v = Number(r.valor) || 0;
    if (r.pessoa === 'Bam') bam += v;
    else if (r.pessoa === 'Evellyn') eve += v;
  });
  var total = bam + eve;
  if (total <= 0) return { Bam: 0.5, Evellyn: 0.5 };
  return { Bam: bam / total, Evellyn: eve / total };
}

/**
 * Fecha o mês: calcula o share atual e grava 2 linhas em share_mensal (Bam, Evellyn).
 * Se já existe snapshot para a competencia, erro (use reopen primeiro).
 */
function closeShare_(params) {
  var competencia = String(params.competencia || '').trim();
  if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('competencia_invalida');

  var existing = readAll_('share_mensal').filter(function (r) { return r.competencia === competencia; });
  if (existing.length) throw new Error('share_ja_fechado:' + competencia);

  var ytd = computeShareYTD_(competencia);
  var sh = getOrCreateSheet_('share_mensal');
  var header = readHeader_(sh);
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");

  ['Bam', 'Evellyn'].forEach(function (p) {
    var row = {
      id: Utilities.getUuid(),
      competencia: competencia,
      pessoa: p,
      share: ytd[p],
      fechado_em: now,
    };
    var arr = header.map(function (c) { return Object.prototype.hasOwnProperty.call(row, c) ? row[c] : ''; });
    sh.appendRow(arr);
  });
  return {
    competencia: competencia,
    fechado: true,
    fechado_em: now,
    Bam: ytd.Bam,
    Evellyn: ytd.Evellyn,
  };
}

/** Remove o snapshot da competência (permite recalcular). */
function reopenShare_(params) {
  var competencia = String(params.competencia || '').trim();
  if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('competencia_invalida');

  var rows = readAll_('share_mensal').filter(function (r) { return r.competencia === competencia; });
  if (!rows.length) return { competencia: competencia, deleted: 0 };

  var sh = getOrCreateSheet_('share_mensal');
  rows.forEach(function (r) {
    var idx = findRowIndex_(sh, r.id);
    if (idx > 0) sh.deleteRow(idx);
  });
  return { competencia: competencia, deleted: rows.length };
}
