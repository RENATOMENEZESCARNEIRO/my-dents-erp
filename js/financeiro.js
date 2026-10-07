/* Financeiro: lançamentos, previsões, cartões a receber, contas, fluxo de caixa e resultado (DRE).
   Saldos nunca são digitados: vêm dos lançamentos. Aporte, empréstimo e transferência ficam no escopo "Grupo". */
(() => {
  'use strict';
  const { db, $, $$, esc, brl, num, today, monthStart, monthEnd, fmtD, daysTo, toast, state, opts, rows, table, badge, can, rpc, q, modal, tabs, register, refresh, porUnidade } = window.MD;

  const SETORES = ['Clínico', 'Ortodontia', 'Administrativo/Geral', 'Convênios'];
  const ENTRADA = ['receita', 'aporte', 'emprestimo', 'transferencia_entrada'];
  const TIPO_LABEL = { receita: 'Receita', despesa: 'Despesa', aporte: 'Aporte de sócio', emprestimo: 'Empréstimo de sócio', devolucao_emprestimo: 'Devolução de empréstimo',
    transferencia_entrada: 'Transferência (entrada)', transferencia_saida: 'Transferência (saída)', devolucao_credito: 'Devolução de crédito' };
  const GRUPO = ['aporte', 'emprestimo', 'devolucao_emprestimo'];
  const setoresOpts = (sel) => opts(SETORES.map((s) => ({ id: s })), (x) => x.id, 'Setor…', sel);
  const needFin = () => (can('financeiro') ? '' : 'disabled title="Requer permissão financeira"');

  /* ----- lançar movimentação ----- */
  function novaMovimentacao() {
    modal({
      title: 'Lançar movimentação', wide: true,
      body: `<div class="form-row"><label>Tipo<select name="tipo" required>${opts(['receita', 'despesa', 'aporte', 'emprestimo', 'devolucao_emprestimo'].map((t) => ({ id: t })), (x) => TIPO_LABEL[x.id], 'Selecione…')}</select></label>
          <label>Data<input name="data" type="date" required value="${today()}"></label></div>
        <div class="form-row"><label>Valor<input name="valor" type="number" step="0.01" min="0.01" required></label>
          <label>Banco / conta<select name="conta" required>${opts(state.contas, (c) => c.nome)}</select></label></div>
        <div class="form-row" id="escopo"><label>Unidade<select name="unidade">${opts(state.unidades, (u) => u.nome, 'Selecione…', state.unidadeId)}</select></label>
          <label>Setor<select name="setor">${setoresOpts('')}</select></label></div>
        <p class="hint" id="grupo-hint" hidden>Aporte, empréstimo e devolução ficam no escopo "Grupo" (sem unidade). Aporte não é receita, mas aparece no resultado.</p>
        <label>Categoria<select name="categoria"><option value="">Sem categoria</option></select></label>
        <div class="form-row"><label>NF-e<input name="nfe"></label><label>Descrição<input name="descricao"></label></div>
        <label>Observação<textarea name="obs" rows="2"></textarea></label>`,
      onOpen: async (form) => {
        const cats = await q(db.from('categorias').select('*').eq('ativo', true).order('grupo').order('nome')).catch(() => []);
        const pintar = () => {
          const t = form.tipo.value === 'receita' ? 'receita' : form.tipo.value === 'despesa' ? 'despesa' : null;
          const l = cats.filter((c) => !t || c.tipo === t);
          form.categoria.innerHTML = '<option value="">Sem categoria</option>' + l.map((c) => `<option value="${esc(c.id)}">${esc(c.grupo)} › ${esc(c.nome)}</option>`).join('');
        };
        form.tipo.onchange = () => { const g = GRUPO.includes(form.tipo.value); $('#escopo', form).hidden = g; $('#grupo-hint', form).hidden = !g; pintar(); };
        form._cats = cats; pintar();
      },
      onSubmit: async (v, form) => {
        const cat = (form._cats || []).find((c) => c.id === v.categoria);
        await rpc('lancar_movimentacao', { p_tipo: v.tipo, p_data: v.data, p_valor: num(v.valor), p_conta: v.conta, p_unidade: v.unidade, p_setor: v.setor,
          p_grupo: cat?.grupo ?? null, p_subgrupo: cat?.nome ?? null, p_nfe: v.nfe, p_desc: v.descricao, p_obs: v.obs });
        toast('Movimentação lançada.');
        refresh();
      },
    });
  }

  function transferencia() {
    modal({
      title: 'Transferência entre contas', submit: 'Transferir',
      body: `<p class="hint">Transferência não é receita nem despesa: só move saldo entre contas.</p>
        <div class="form-row"><label>De<select name="de" required>${opts(state.contas, (c) => c.nome)}</select></label><label>Para<select name="para" required>${opts(state.contas, (c) => c.nome)}</select></label></div>
        <div class="form-row"><label>Valor<input name="valor" type="number" step="0.01" min="0.01" required></label><label>Data<input name="data" type="date" value="${today()}" required></label></div>
        <label>Descrição<input name="descricao"></label>`,
      onSubmit: async (v) => { await rpc('transferir', { p_origem: v.de, p_destino: v.para, p_valor: num(v.valor), p_data: v.data, p_desc: v.descricao }); toast('Transferência registrada.'); refresh(); },
    });
  }

  /* ----- lista de lançamentos (usada em Lançamentos e Fluxo) ----- */
  async function listaLancamentos(host, { ini, fim, conta, unidade, tipo }) {
    let qy = db.from('lancamentos').select('*, contas_bancarias!conta_id(nome), unidades!unidade_id(nome)').gte('data', ini).lte('data', fim).eq('estornado', false)
      .order('data', { ascending: false }).order('codigo', { ascending: false }).limit(500);
    if (conta) qy = qy.eq('conta_id', conta);
    if (unidade) qy = qy.eq('unidade_id', unidade);
    if (tipo) qy = qy.eq('tipo', tipo);
    const data = await q(qy);
    host.innerHTML = table(['#', 'Data', 'Tipo', 'Conta', 'Unidade', 'Setor', 'Valor', 'Origem', 'Descrição'], rows(data, (l) =>
      `<tr><td>${l.codigo}</td><td>${fmtD(l.data)}</td><td>${esc(TIPO_LABEL[l.tipo])}</td><td>${esc(l.contas_bancarias?.nome)}</td><td>${esc(l.unidades?.nome || 'Grupo')}</td><td>${esc(l.setor)}</td>
       <td class="${ENTRADA.includes(l.tipo) ? 'txt-ok' : 'txt-vencido'}">${ENTRADA.includes(l.tipo) ? '+' : '−'}${brl(l.valor)}</td>
       <td>${esc(l.origem)}${l.pagamento_codigo ? ` · ${esc(l.pagamento_codigo)}` : ''}</td><td>${esc(l.descricao)}</td></tr>`, 'Nenhum lançamento no período.', 9));
  }

  const filtroPeriodo = (extra = '') => `<div class="actions" style="margin-bottom:1rem"><label class="inline">De <input type="date" id="ini" value="${monthStart()}"></label>
    <label class="inline">Até <input type="date" id="fim" value="${monthEnd()}"></label>${extra}</div>`;

  register('financeiro', 'Financeiro', (el) => tabs(el, 'financeiro', [
    { id: 'lancamentos', label: 'Lançamentos', render: async (b) => {
      b.innerHTML = filtroPeriodo(`<select id="tp">${opts(Object.entries(TIPO_LABEL).map(([id, n]) => ({ id, n })), (x) => x.n, 'Todos os tipos')}</select>
        <button class="btn" id="mov" ${needFin()}>+ Movimentação</button><button class="btn ghost" id="tr" ${needFin()}>Transferência</button>`) + '<div id="l"></div>';
      $('#mov', b).onclick = novaMovimentacao;
      $('#tr', b).onclick = transferencia;
      const draw = () => listaLancamentos($('#l', b), { ini: $('#ini', b).value, fim: $('#fim', b).value, unidade: state.unidadeId, tipo: $('#tp', b).value }).catch((e) => toast(e.message, true));
      ['ini', 'fim', 'tp'].forEach((i) => ($('#' + i, b).onchange = draw));
      draw();
    } },
    { id: 'transacoes', label: 'Transações', render: async (b) => {
      const hoje = today();
      b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><label class="inline">De <input type="date" id="ini" value="${hoje}"></label><label class="inline">Até <input type="date" id="fim" value="${hoje}"></label>
        <label class="inline">Visualizar por <select id="vis">${opts([{ id: 'meio', n: 'Meio de pagamento' }, { id: 'conta', n: 'Conta' }, { id: 'categoria', n: 'Categoria' }], (x) => x.n, null, 'meio')}</select></label>
        <button class="btn ghost sm" id="hj">Hoje</button><button class="btn ghost sm" id="mes">Mês</button></div><div id="l"></div>`;
      const MEIO = { dinheiro: 'Dinheiro', pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito' };
      const draw = async () => {
        const ini = $('#ini', b).value, fim = $('#fim', b).value, vis = $('#vis', b).value;
        const [rec, lan] = await Promise.all([
          q(porUnidade(db.from('recebimentos').select('*, pacientes!paciente_id(nome), contas_bancarias!conta_id(nome)').gte('data_pagamento', ini).lte('data_pagamento', fim).neq('status', 'estornado').order('data_pagamento'))),
          q(porUnidade(db.from('lancamentos').select('*, contas_bancarias!conta_id(nome)').eq('tipo', 'despesa').eq('estornado', false).gte('data', ini).lte('data', fim).order('data'))),
        ]);
        const itens = [
          ...rec.map((r) => ({ tabela: 'recebimentos', id: r.id, tipo: 'receita', data: r.data_pagamento, desc: `${r.pacientes?.nome || ''}${r.meio === 'credito' ? ` · ${r.parcelas}×` : ''}`, valor: Number(r.valor), prev: r.status === 'previsto', conf: r.conferido,
            grupo: vis === 'meio' ? MEIO[r.meio] || r.meio : vis === 'conta' ? r.contas_bancarias?.nome : 'Recebimentos' })),
          ...lan.map((l) => ({ tabela: 'lancamentos', id: l.id, tipo: 'despesa', data: l.data, desc: l.descricao || l.subgrupo || '', valor: Number(l.valor), conf: l.conferido,
            grupo: vis === 'meio' ? 'Despesas' : vis === 'conta' ? l.contas_bancarias?.nome : `${l.grupo || 'Sem categoria'}${l.subgrupo ? ' › ' + l.subgrupo : ''}` })),
        ];
        const g = {};
        itens.forEach((i) => { const o = (g[i.grupo || '—'] ||= { rec: 0, desp: 0, prev: 0, itens: [] }); if (i.tipo === 'receita') { if (i.prev) o.prev += i.valor; else o.rec += i.valor; } else o.desp += i.valor; o.itens.push(i); });
        const tot = Object.values(g).reduce((s, o) => ({ rec: s.rec + o.rec, desp: s.desp + o.desp, prev: s.prev + o.prev }), { rec: 0, desp: 0, prev: 0 });
        const pend = itens.filter((i) => !i.conf).length;
        $('#l', b).innerHTML = `<div class="grid"><div class="card stat"><span>Receitas</span><b class="txt-ok">${brl(tot.rec)}</b><small>A receber (cartão previsto): ${brl(tot.prev)}</small></div>
          <div class="card stat"><span>Despesas</span><b class="txt-vencido">${brl(tot.desp)}</b></div><div class="card stat"><span>Saldo</span><b>${brl(tot.rec - tot.desp)}</b></div>
          <div class="card stat"><span>Conferência</span><b>${itens.length - pend}/${itens.length}</b><small>${pend ? pend + ' pendente(s)' : 'tudo conferido'}</small></div></div>` +
          table([vis === 'meio' ? 'Meio de pagamento' : vis === 'conta' ? 'Conta' : 'Categoria', 'Receitas', 'A receber', 'Despesas', 'Saldo', ''], rows(Object.entries(g).sort(), ([nome, o], k) =>
            `<tr><td><b>${esc(nome)}</b></td><td class="txt-ok">${brl(o.rec)}</td><td>${brl(o.prev)}</td><td class="txt-vencido">${brl(o.desp)}</td><td><b>${brl(o.rec - o.desp)}</b></td>
             <td><button class="btn ghost sm" data-ver="${esc(nome)}">Ver</button></td></tr><tr class="det" hidden data-det="${esc(nome)}"><td colspan="6"></td></tr>`, 'Nenhuma transação no período.', 6));
        $$('[data-ver]', b).forEach((x) => (x.onclick = () => {
          const nome = x.dataset.ver; const tr = $$('[data-det]', b).find((r) => r.dataset.det === nome); const o = g[nome];
          if (!tr.hidden) { tr.hidden = true; return; }
          tr.hidden = false;
          tr.firstElementChild.innerHTML = `<div class="actions" style="margin:.4rem 0">${can('financeiro') ? `<button class="btn sm" data-conf-todos>Conferir todos</button>` : ''}</div>` +
            table(['', 'Data', 'Descrição', 'Valor', 'Situação'], rows(o.itens, (i) =>
              `<tr><td><input type="checkbox" style="width:auto" data-conf="${i.tabela}|${esc(i.id)}" ${i.conf ? 'checked' : ''} ${can('financeiro') ? '' : 'disabled'}></td><td>${fmtD(i.data)}</td><td>${esc(i.desc)}</td>
               <td class="${i.tipo === 'receita' ? 'txt-ok' : 'txt-vencido'}">${i.tipo === 'receita' ? '+' : '−'}${brl(i.valor)}</td><td>${i.prev ? badge('agendado') + ' previsto' : i.conf ? badge('realizado') + ' conferido' : 'a conferir'}</td></tr>`, '', 5));
          const salvar = async (tabela, ids, val) => { try { await rpc('conferir_transacoes', { p_tabela: tabela, p_ids: ids, p_valor: val }); await draw(); } catch (e) { toast(e.message, true); } };
          $$('[data-conf]', tr).forEach((c) => (c.onchange = () => { const [t, id] = c.dataset.conf.split('|'); salvar(t, [id], c.checked); }));
          const todos = $('[data-conf-todos]', tr);
          if (todos) todos.onclick = async () => { for (const t of ['recebimentos', 'lancamentos']) { const ids = o.itens.filter((i) => i.tabela === t && !i.conf).map((i) => i.id); if (ids.length) await rpc('conferir_transacoes', { p_tabela: t, p_ids: ids, p_valor: true }); } toast('Conferido.'); draw(); };
        }));
      };
      ['ini', 'fim', 'vis'].forEach((i) => ($('#' + i, b).onchange = () => draw().catch((e) => toast(e.message, true))));
      $('#hj', b).onclick = () => { $('#ini', b).value = $('#fim', b).value = today(); draw(); };
      $('#mes', b).onclick = () => { $('#ini', b).value = monthStart(); $('#fim', b).value = monthEnd(); draw(); };
      await draw();
    } },
    { id: 'previsoes', label: 'Previsões', render: async (b) => {
      b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><select id="st">${opts([{ id: 'prevista', n: 'Em aberto' }, { id: 'paga', n: 'Pagas' }, { id: '', n: 'Todas' }], (x) => x.n, null, 'prevista')}</select>
        <button class="btn" id="nova" ${needFin()}>+ Nova previsão</button></div><div id="l"></div>`;
      $('#nova', b).onclick = () => modal({
        title: 'Nova previsão de pagamento', submit: 'Salvar',
        body: `<div class="form-row"><label>Fornecedor<input name="fornecedor" required></label><label>Valor<input name="valor" type="number" step="0.01" min="0.01" required></label></div>
          <div class="form-row"><label>Vencimento<input name="vencimento" type="date" required value="${today()}"></label><label>Unidade<select name="unidade_id" required>${opts(state.unidades, (u) => u.nome, 'Selecione…', state.unidadeId)}</select></label></div>
          <div class="form-row"><label>Setor<select name="setor" required>${setoresOpts('')}</select></label><label>Grupo<input name="grupo"></label></div>
          <label>Descrição<input name="descricao"></label>`,
        onSubmit: async (v) => { await q(db.from('previsoes').insert({ ...v, valor: num(v.valor), origem: 'manual', tipo: 'despesa' })); toast('Previsão criada.'); refresh(); },
      });
      const draw = async () => {
        let qy = db.from('previsoes').select('*, dentistas!dentista_id(nome), unidades!unidade_id(nome)').order('vencimento').limit(300);
        if ($('#st', b).value) qy = qy.eq('status', $('#st', b).value);
        const data = await q(qy);
        $('#l', b).innerHTML = table(['Vencimento', 'Favorecido', 'Descrição', 'Origem', 'Unidade', 'Valor', 'Situação', ''], rows(data, (p) => {
          const d = daysTo(p.vencimento), cls = p.status === 'prevista' ? (d < 0 ? 'txt-vencido' : d <= 5 ? 'txt-atencao' : '') : '';
          return `<tr><td class="${cls}">${fmtD(p.vencimento)}${p.status === 'prevista' && d < 0 ? ' ⚠' : ''}</td><td>${esc(p.dentistas?.nome || p.fornecedor)}</td><td>${esc(p.descricao)}</td><td>${esc(p.origem)}</td>
            <td>${esc(p.unidades?.nome || 'Agrupado')}</td><td>${brl(p.valor)}</td><td>${badge(p.status === 'paga' ? 'realizado' : 'agendado')} ${esc(p.status)}${p.pagamento_codigo ? ' · ' + esc(p.pagamento_codigo) : ''}</td>
            <td>${p.status !== 'prevista' ? '' : p.origem === 'producao' ? '<small>pagar em Produção</small>' : can('financeiro') ? `<button class="btn sm" data-pagar="${esc(p.id)}">Pagar</button>` : ''}</td></tr>`;
        }, 'Nenhuma previsão.', 8));
        $$('[data-pagar]', b).forEach((x) => (x.onclick = () => modal({
          title: 'Pagar previsão', submit: 'Confirmar pagamento',
          body: `<div class="form-row"><label>Conta<select name="conta" required>${opts(state.contas, (c) => c.nome)}</select></label><label>Data<input name="data" type="date" value="${today()}" required></label></div>`,
          onSubmit: async (v) => { await rpc('pagar_previsao', { p_id: x.dataset.pagar, p_conta: v.conta, p_data: v.data }); toast('Previsão paga e lançada.'); refresh(); },
        })));
      };
      $('#st', b).onchange = draw;
      await draw();
    } },
    { id: 'cartoes', label: 'Cartões a receber', render: async (b) => {
      const data = await q(porUnidade(db.from('recebimentos').select('*, pacientes!paciente_id(nome), contas_bancarias!conta_id(nome), unidades!unidade_id(nome)').eq('status', 'previsto').in('meio', ['credito', 'debito']).order('data_pagamento')));
      b.innerHTML = `<p class="hint">O paciente já quitou. Aqui o dinheiro do cartão entra de fato: ao realizar você pode ajustar o líquido (a taxa varia por bandeira).</p>` +
        table(['Pagamento', 'Paciente', 'Unidade', 'Meio', 'CV', 'Bruto', 'Taxa prevista', 'Líquido previsto', 'Conta', ''], rows(data, (r) =>
          `<tr><td>${fmtD(r.data_pagamento)}</td><td>${esc(r.pacientes?.nome)}</td><td>${esc(r.unidades?.nome)}</td><td>${esc(r.meio)}${r.meio === 'credito' ? ' ' + r.parcelas + '×' : ''}</td><td>${esc(r.cv)}</td>
           <td>${brl(r.valor)}</td><td>${brl(r.valor_taxa)}${r.taxa_percentual ? ` (${esc(r.taxa_percentual)}%)` : ''}</td><td>${brl(r.valor_liquido)}</td><td>${esc(r.contas_bancarias?.nome)}</td>
           <td>${can('financeiro') ? `<button class="btn sm" data-real="${esc(r.id)}">Realizar</button>` : ''}</td></tr>`, 'Nenhum cartão a receber.', 10));
      $$('[data-real]', b).forEach((x) => (x.onclick = () => {
        const r = data.find((y) => y.id === x.dataset.real);
        modal({
          title: 'Realizar recebimento de cartão', submit: 'Realizar',
          body: `<p class="hint">${esc(r.pacientes?.nome)} · bruto ${brl(r.valor)} · CV ${esc(r.cv || '–')}</p>
            <div class="form-row"><label>Data do recebimento<input name="data" type="date" value="${today()}" required></label>
            <label>Valor líquido recebido<input name="liquido" type="number" step="0.01" min="0.01" max="${r.valor}" required value="${Number(r.valor_liquido).toFixed(2)}"></label></div>
            <p class="hint">A diferença entre bruto e líquido é registrada como taxa de cartão (despesa).</p>`,
          onSubmit: async (v) => { await rpc('realizar_recebimento', { p_id: r.id, p_data: v.data, p_liquido: num(v.liquido) }); toast('Recebimento realizado.'); refresh(); },
        });
      }));
    } },
    { id: 'contas', label: 'Contas', render: async (b) => {
      const data = await q(db.from('v_saldo_contas').select('*').order('nome'));
      const tot = data.reduce((s, c) => s + Number(c.saldo), 0);
      b.innerHTML = table(['Conta', 'Tipo', 'Saldo inicial', 'Entradas', 'Saídas', 'Saldo'], rows(data, (c) =>
        `<tr><td>${esc(c.nome)}</td><td>${esc(c.tipo)}</td><td>${brl(c.saldo_inicial)}</td><td class="txt-ok">${brl(c.entradas)}</td><td class="txt-vencido">${brl(c.saidas)}</td><td><b>${brl(c.saldo)}</b></td></tr>`, 'Sem contas.', 6)) +
        `<div class="total">Saldo total: <b>${brl(tot)}</b></div><p class="hint">Saldo = saldo inicial + entradas − saídas. Inclui aporte e empréstimo de sócio; a devolução de empréstimo subtrai.</p>`;
    } },
    { id: 'fluxo', label: 'Realizado x Previsto', render: async (b) => {
      b.innerHTML = filtroPeriodo(`<select id="cc">${opts(state.contas, (c) => c.nome, 'Todas as contas')}</select>`) + '<div id="res"></div><div id="l"></div>';
      const draw = async () => {
        const ini = $('#ini', b).value, fim = $('#fim', b).value, conta = $('#cc', b).value || null;
        const [f] = await q(db.rpc('fluxo_caixa', { p_ini: ini, p_fim: fim, p_conta: conta, p_unidade: state.unidadeId || null }));
        $('#res', b).innerHTML = `<div class="grid"><div class="card stat"><span>Saldo inicial</span><b>${brl(f.saldo_inicial)}</b></div><div class="card stat"><span>Entradas</span><b class="txt-ok">${brl(f.entradas)}</b></div>
          <div class="card stat"><span>Saídas</span><b class="txt-vencido">${brl(f.saidas)}</b></div><div class="card stat"><span>Saldo final</span><b>${brl(f.saldo_final)}</b></div></div>`;
        await listaLancamentos($('#l', b), { ini, fim, conta, unidade: state.unidadeId });
      };
      ['ini', 'fim', 'cc'].forEach((i) => ($('#' + i, b).onchange = () => draw().catch((e) => toast(e.message, true))));
      await draw();
    } },
    { id: 'dre', label: 'Resultado (DRE)', render: async (b) => {
      b.innerHTML = filtroPeriodo(`<select id="sc">${opts(SETORES.map((s) => ({ id: s })), (x) => x.id, 'Todos os setores')}</select>`) + '<div id="res"></div>';
      const draw = async () => {
        const rowsDre = await q(db.rpc('dre_resumo', { p_ini: $('#ini', b).value, p_fim: $('#fim', b).value, p_unidade: state.unidadeId || null, p_setor: $('#sc', b).value || null }));
        const soma = (f) => rowsDre.filter(f).reduce((s, r) => s + Number(r.total), 0);
        const rec = soma((r) => r.tipo === 'receita'), ded = soma((r) => r.tipo === 'devolucao_credito'), desp = soma((r) => r.tipo === 'despesa');
        const liq = rec - ded, res = liq - desp, margem = liq > 0 ? (res / liq) * 100 : 0;
        const aporte = soma((r) => r.tipo === 'aporte'), emp = soma((r) => r.tipo === 'emprestimo'), dev = soma((r) => r.tipo === 'devolucao_emprestimo');
        const agrupa = (campo, nomeFn) => {
          const m = {};
          rowsDre.filter((r) => ['receita', 'devolucao_credito', 'despesa'].includes(r.tipo)).forEach((r) => {
            const k = nomeFn(r), x = (m[k] ||= { rec: 0, desp: 0 });
            if (r.tipo === 'despesa') x.desp += Number(r.total); else x.rec += r.tipo === 'receita' ? Number(r.total) : -Number(r.total);
          });
          return Object.entries(m).map(([k, x]) => `<tr><td>${esc(k)}</td><td>${brl(x.rec)}</td><td>${brl(x.desp)}</td><td><b class="${x.rec - x.desp < 0 ? 'txt-vencido' : ''}">${brl(x.rec - x.desp)}</b></td></tr>`).join('') || `<tr><td colspan="4" class="empty">Sem dados.</td></tr>`;
        };
        const un = (id) => state.unidades.find((u) => u.id === id)?.nome || 'Sem unidade';
        b.querySelector('#res').innerHTML = `<div class="card"><table class="dre"><tbody>
            <tr><td>Receita bruta</td><td>${brl(rec)}</td></tr><tr><td>(−) Deduções / devoluções de crédito</td><td>${brl(ded)}</td></tr>
            <tr class="sub"><td>Receita líquida</td><td>${brl(liq)}</td></tr><tr><td>(−) Despesas</td><td>${brl(desp)}</td></tr>
            <tr class="sub ${res < 0 ? 'neg' : ''}"><td>Resultado operacional</td><td>${brl(res)}</td></tr><tr><td>Margem</td><td>${margem.toFixed(1)}%</td></tr></tbody></table></div>
          <div class="card" style="margin-top:1rem"><h4 style="margin-top:0">Fora do resultado operacional (escopo Grupo)</h4><table class="dre"><tbody>
            <tr><td>Aporte de sócios</td><td>${brl(aporte)}</td></tr><tr><td>Empréstimo de sócios</td><td>${brl(emp)}</td></tr><tr><td>(−) Devolução de empréstimo</td><td>${brl(dev)}</td></tr>
            <tr class="sub"><td>Resultado + aportes/empréstimos (variação real de caixa)</td><td>${brl(res + aporte + emp - dev)}</td></tr></tbody></table>
            <p class="hint">Aporte não é receita, mas aparece aqui para mostrar o que sustentou o caixa. Transferências entre contas não entram.</p></div>
          <h4>Por unidade</h4>${table(['Unidade', 'Receita líquida', 'Despesas', 'Resultado'], `${agrupa('u', (r) => un(r.unidade_id))}`)}
          <h4>Por setor</h4>${table(['Setor', 'Receita líquida', 'Despesas', 'Resultado'], `${agrupa('s', (r) => r.setor || 'Sem setor')}`)}`;
      };
      ['ini', 'fim', 'sc'].forEach((i) => ($('#' + i, b).onchange = () => draw().catch((e) => toast(e.message, true))));
      await draw();
    } },
  ]), 80);
})();
