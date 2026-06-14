/**
 * Dicionário de schema das tabelas e validators primitivos.
 * Toda regra de validação on-write passa por aqui.
 */

const PESSOAS_VALIDAS = ['Bam', 'Evellyn'];
const TITULARES_VALIDOS = ['Bam', 'Evellyn', 'conjunto'];

// Colunas que armazenam strings parecidas com datas e que o Sheets, se deixado
// solto, auto-converte em Date — preciso forçar formato de texto pra preservar
// o valor original. Aplicado por Sheets.getOrCreateSheet_.
var TEXT_COLS = { data: true, competencia: true, cor: true };

/**
 * Tipos primitivos (string|number|boolean|enum|date|month).
 * Cada validator retorna o valor coercido OU lança Error.
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
  numberOptional: function (v) {
    if (v === null || v === undefined || v === '') return 0;
    var n = Number(v);
    if (!isFinite(n)) throw new Error('not_a_number');
    return n;
  },
};

const SCHEMA = {
  pessoas: {
    // email = Gmail do usuário, usado pelo backend pra allowlist do OAuth.
    // Preencher manualmente na planilha após initSchema. Sem email = sem acesso.
    columns: ['id', 'nome', 'cor', 'email'],
    required: ['nome'],
    validators: {
      nome: V.enum(PESSOAS_VALIDAS),
      cor: V.stringRequired,
      email: V.stringOptional,
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
    columns: [
      'id', 'competencia', 'pessoa', 'tipo', 'origem', 'valor', 'conta_para_share',
      // Série (parcelado ou recorrente). Standalone = todos vazios/0.
      // Ancora em competencia (não há campo data — receita é mensal).
      'serie_id', 'serie_tipo', 'parcela_num', 'parcela_total',
    ],
    required: ['competencia', 'pessoa', 'tipo', 'valor'],
    validators: {
      competencia: V.month,
      pessoa: V.enum(PESSOAS_VALIDAS),
      tipo: V.enum(['salario', 'bonus', 'promocao', 'outro']),
      origem: V.stringOptional,
      valor: V.number,
      conta_para_share: V.bool,
      serie_id: V.stringOptional,
      serie_tipo: function (v) {
        if (v === null || v === undefined || v === '') return '';
        var s = String(v);
        if (['parcelado', 'recorrente'].indexOf(s) === -1) throw new Error('serie_tipo_invalido');
        return s;
      },
      parcela_num: V.numberOptional,
      parcela_total: V.numberOptional,
    },
    defaults: { conta_para_share: true },
  },
  lancamentos: {
    columns: [
      'id', 'data', 'competencia', 'descricao', 'categoria', 'valor',
      'pagador', 'tipo', 'dono',
      // Série (parcelado ou recorrente). Standalone = todos vazios/0.
      'serie_id', 'serie_tipo', 'parcela_num', 'parcela_total',
    ],
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
        // Permite vazio aqui; a regra de presença é cross-coluna.
        if (v === null || v === undefined || v === '') return '';
        var s = String(v);
        if (PESSOAS_VALIDAS.indexOf(s) === -1) throw new Error('dono_invalido');
        return s;
      },
      serie_id: V.stringOptional,
      serie_tipo: function (v) {
        if (v === null || v === undefined || v === '') return '';
        var s = String(v);
        if (['parcelado', 'recorrente'].indexOf(s) === -1) throw new Error('serie_tipo_invalido');
        return s;
      },
      parcela_num: V.numberOptional,
      parcela_total: V.numberOptional,
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
  // Snapshot do share apurado quando o usuário "fecha o mês". Existência de
  // (competencia, pessoa) aqui significa share fechado — não recalcula.
  share_mensal: {
    columns: ['id', 'competencia', 'pessoa', 'share', 'fechado_em'],
    required: ['competencia', 'pessoa', 'share'],
    validators: {
      competencia: V.month,
      pessoa: V.enum(PESSOAS_VALIDAS),
      share: V.number,
      fechado_em: V.stringOptional,
    },
  },
  // Limite de gasto planejado por (competencia, categoria). Página de
  // Orçamento define; Dashboard e Despesas mostram barra de progresso.
  orcamento: {
    columns: ['id', 'competencia', 'categoria', 'limite'],
    required: ['competencia', 'categoria', 'limite'],
    validators: {
      competencia: V.month,
      categoria: V.stringRequired,
      limite: V.number,
    },
  },
  // Mapeamentos "substring → categoria" aprendidos com o histórico.
  // Usado pra sugerir categoria automaticamente no Import e no form de
  // Despesas. Substring sempre minúscula, trimmed. Hits incrementado a
  // cada uso confirmado (não-obrigatório usar pra ordenar).
  auto_categorias: {
    columns: ['id', 'substring', 'categoria', 'hits'],
    required: ['substring', 'categoria'],
    validators: {
      substring: V.stringRequired,
      categoria: V.stringRequired,
      hits: V.numberOptional,
    },
  },
  // Acertos efetivamente pagos entre o casal. Subtraídos do saldo
  // calculado no Acerto pra zerar quando alguém quita o que devia.
  acertos_pagos: {
    columns: ['id', 'data', 'competencia', 'de', 'para', 'valor', 'descricao'],
    required: ['data', 'de', 'para', 'valor'],
    validators: {
      data: V.date,
      competencia: V.monthOptional,
      de: V.enum(PESSOAS_VALIDAS),
      para: V.enum(PESSOAS_VALIDAS),
      valor: V.number,
      descricao: V.stringOptional,
    },
    derive: function (row) {
      if ((!row.competencia || row.competencia === '') && row.data) {
        row.competencia = String(row.data).slice(0, 7);
      }
    },
    crossValidate: function (row) {
      if (row.de === row.para) {
        throw new Error('de_e_para_devem_ser_diferentes');
      }
      if (Number(row.valor) <= 0) {
        throw new Error('valor_deve_ser_positivo');
      }
    },
  },
};

const TABLES = Object.keys(SCHEMA);

function assertTable_(name) {
  if (!name || TABLES.indexOf(name) === -1) throw new Error('invalid_table:' + name);
  return SCHEMA[name];
}
