/* Produção e comissões: evolução clínica, produção por dentista, lotes mensais e pagamento de dentistas.
   O dentista recebe por três fontes — comissão de VENDA, de EXECUÇÃO e CONVÊNIO — sempre separadas. */
(() => {
  'use strict';
  const { db, $, $$, esc, brl, num, today, fmtD, daysTo, toast, state, opts, rows, table, badge, can, rpc, q, modal, tabs, register, refresh, porUnidade } = window.MD;

  const TIPO = { venda: 'Venda', execucao: 'Execução', convenio: 'Convênio' };
  const PREV_TIPO = { comissao_venda: 'Comissão de venda', comissao_execucao: 'Comissão de execução', convenio: 'Convênio' };
  const mesLabel = (d) => `${String(d).slice(5, 7)}/${String(d).slice(0, 4)}`;

  /* ----- detalhe de um dentista dentro da competência ----- */
  async function detalhe(dentistaId, competencia, dentistaNome) {
    const sel = '*, pacientes!paciente_id(nome), lotes!inner(competencia,status), recebimentos(meio,data_pagamento,valor,valor_aplicado), orcamento_itens(orcamentos(debitos(vencimento,saldo)))';
    let r = await db.from('comissoes').select(sel).eq('dentista_id', dentistaId).eq('lotes.competencia', competencia).order('data_ref');
    if (r.error) r = await db.from('comissoes').select('*, pacientes!paciente_id(nome), lotes!inner(competencia,status)').eq('dentista_id', dentistaId).eq('lotes.competencia', competencia).order('data_ref');
    if (r.error) return toast(r.error.message, true);
    const list = r.data;
    const debVenc = (c) => { const d = c.orcamento_itens?.orcamentos?.debitos; const x = Array.isArray(d) ? d[0] : d; return x && Number(x.saldo) > 0 && x.vencimento < today(); };
    const bloco = (tipo) => {
      const ls = list.filter((c) => c.tipo === tipo);
      if (!ls.length) return '';
      const total = ls.reduce((s, c) => s + Number(c.valor), 0);
      const cab = tipo === 'venda' ? ['Paciente', 'Recebido', 'Meio', 'Pago em', '%', 'Comissão', ''] : tipo === 'execucao' ? ['Paciente', 'Procedimento', 'Concluído em', 'Valor', ''] : ['Descrição', 'Data', 'Valor', ''];
      const edit = (c) => (can('alterar_comissao') && c.status === 'aberta' && !c.estornada ? `<button class="btn ghost sm" data-edit="${esc(c.id)}">Alterar valor</button>` : '');
      const flags = (c) => `${c.estornada ? ' <span class="badge cancelada">estorno</span>' : ''}${c.editado ? ' <span class="badge em_atendimento">editada</span>' : ''}${c.status === 'encerrada' ? ' <span class="badge realizado">no previsto</span>' : ''}`;
      const linha = (c) => tipo === 'venda'
        ? `<tr><td>${esc(c.pacientes?.nome)}</td><td>${c.base != null ? brl(c.base) : '–'}</td><td>${esc(c.recebimentos?.meio?.replace('_', ' '))}</td><td>${fmtD(c.recebimentos?.data_pagamento || c.data_ref)}</td><td>${c.percentual != null ? esc(c.percentual) + '%' : ''}</td><td>${brl(c.valor)}${flags(c)}</td><td>${edit(c)}</td></tr>`
        : tipo === 'execucao'
          ? `<tr><td>${esc(c.pacientes?.nome)}</td><td>${esc(c.descricao)}${debVenc(c) ? ' <span class="badge em_atendimento" title="Débito do paciente vencido: apenas sinalização, o pagamento não é bloqueado">débito vencido</span>' : ''}</td><td>${fmtD(c.data_ref)}</td><td>${brl(c.valor)}${flags(c)}</td><td>${edit(c)}</td></tr>`
          : `<tr><td>${esc(c.descricao)}</td><td>${fmtD(c.data_ref)}</td><td>${brl(c.valor)}${flags(c)}</td><td>${edit(c)}</td></tr>`;
      return `<h4>${TIPO[tipo]} — ${brl(total)}</h4>${table(cab, ls.map(linha).join(''))}`;
    };
    modal({
      title: `${dentistaNome} — ${mesLabel(competencia)}`, wide: true,
      body: (bloco('venda') + bloco('execucao') + bloco('convenio')) || '<p class="empty">Sem lançamentos na competência.</p>',
      onOpen: (form, dlg) => $$('[data-edit]', form).forEach((b) => (b.onclick = () => {
        const c = list.find((x) => x.id === b.dataset.edit);
        dlg.close();
        modal({
          title: 'Alterar valor da comissão', submit: 'Salvar alteração',
          body: `<p class="hint">Valor calculado pelo sistema: <b>${brl(c.valor_calculado)}</b>. A alteração fica registrada.</p>
            <label>Novo valor<input name="valor" type="number" step="0.01" min="0" required value="${esc(c.valor)}"></label>
            <label>Justificativa<input name="just" required placeholder="Ex.: permuta, venda não comissionada…"></label>`,
          onSubmit: async (v) => { await rpc('alterar_comissao', { p_id: c.id, p_valor: num(v.valor), p_just: v.just }); toast('Comissão alterada.'); refresh(); },
        });
      })),
    });
  }

  function convenioForm() {
    modal({
      title: 'Acrescentar produção de convênio', submit: 'Lançar',
      body: `<p class="hint">Uma linha por unidade. Os cálculos vêm do sistema da operadora; aqui só se registra o valor.</p>
        <div class="form-row"><label>Dentista<select name="dentista" required>${opts(state.dentistas, (d) => d.nome)}</select></label>
        <label>Unidade<select name="unidade" required>${opts(state.unidades, (u) => u.nome, 'Selecione…', state.unidadeId)}</select></label></div>
        <div class="form-row"><label>Operadora<input name="operadora" required placeholder="Hapvida, Unimed, OdontoArt…"></label>
        <label>Valor<input name="valor" type="number" step="0.01" min="0.01" required></label></div>
        <div class="form-row"><label>Data<input name="data" type="date" value="${today()}" required></label><label>Descrição<input name="descricao"></label></div>`,
      onSubmit: async (v) => {
        await rpc('acrescentar_producao_convenio', { p_dentista: v.dentista, p_unidade: v.unidade, p_operadora: v.operadora, p_valor: num(v.valor), p_desc: v.descricao, p_data: v.data });
        toast('Produção de convênio lançada.');
        refresh();
      },
    });
  }

  /* ----- evolução clínica ----- */
  function evoluir(item) {
    modal({
      title: `Evoluir — ${item.procedimentos?.nome}${item.dente ? ' (' + item.dente + ')' : ''}`, submit: 'Registrar evolução',
      body: `<p class="hint">${esc(item.orcamentos?.pacientes?.nome)} · orçamento #${esc(item.orcamentos?.codigo)}. Só "executado" gera a comissão de execução (${brl(item.valor_execucao)}).</p>
        <div class="form-row"><label>Situação<select name="status">${opts([{ id: 'em_andamento', n: 'Em andamento' }, { id: 'executado', n: 'Executado' }, { id: 'cancelado', n: 'Cancelado' }], (x) => x.n, null, 'executado')}</select></label>
        <label>Data<input name="data" type="date" value="${today()}" required></label></div>
        <label>Dentista que executou<select name="dentista" required>${opts(state.dentistas, (d) => d.nome)}</select></label>
        <label>Observação<textarea name="obs" rows="2"></textarea></label>`,
      onSubmit: async (v) => { await rpc('evoluir_item', { p_item: item.id, p_status: v.status, p_dentista: v.dentista, p_obs: v.obs, p_data: v.data }); toast('Evolução registrada.'); refresh(); },
    });
  }

  /* ----- lote ----- */
  async function abrirLote(lote) {
    const cs = await q(db.from('comissoes').select('dentista_id, tipo, valor, status').eq('lote_id', lote.id));
    const mapa = {};
    cs.forEach((c) => { const k = c.dentista_id + '|' + c.tipo; (mapa[k] ||= { dentista_id: c.dentista_id, tipo: c.tipo, aberto: 0, fechado: 0 })[c.status === 'aberta' ? 'aberto' : 'fechado'] += Number(c.valor); });
    const linhas = Object.values(mapa);
    const nome = (id) => state.dentistas.find((d) => d.id === id)?.nome || '—';
    modal({
      title: `Lote ${mesLabel(lote.competencia)} — ${lote.status}`, wide: true,
      body: `<p class="hint">Lote aberto serve para conferência. Encerre perto do pagamento: cada dentista/tipo vira uma previsão separada. Estornos e saldos negativos acertam no lote seguinte.</p>` +
        table(['Dentista', 'Tipo', 'A encerrar', 'Já no previsto', ''], rows(linhas, (l) =>
          `<tr><td>${esc(nome(l.dentista_id))}</td><td>${TIPO[l.tipo]}</td><td>${brl(l.aberto)}</td><td>${brl(l.fechado)}</td>
           <td>${l.aberto !== 0 && lote.status === 'aberto' && can('financeiro') ? `<button class="btn ghost sm" data-enc="${esc(l.dentista_id)}|${l.tipo}">Encerrar só este</button>` : ''}</td></tr>`, 'Sem comissões neste lote.', 5)),
      extra: lote.status === 'aberto' && can('financeiro') ? '<button type="button" class="btn" id="enc-todo" style="margin-right:auto">Encerrar lote inteiro</button>' : '',
      onOpen: (form, dlg) => {
        const run = async (d, t, msg) => {
          if (!confirm(msg)) return;
          try { const n = await rpc('encerrar_lote', { p_lote: lote.id, p_dentista: d, p_tipo: t }); dlg.close(); toast(`${n} previsão(ões) gerada(s).`); refresh(); } catch (e) { toast(e.message, true); }
        };
        const all = $('#enc-todo', form);
        if (all) all.onclick = () => run(null, null, 'Encerrar o lote inteiro? As comissões vão para a previsão de pagamento.');
        $$('[data-enc]', form).forEach((b) => (b.onclick = () => { const [d, t] = b.dataset.enc.split('|'); run(d, t, 'Encerrar somente este dentista e tipo?'); }));
      },
    });
  }

  /* ----- pagamento ----- */
  function pagarDentista(dentistaId, nome, prevs) {
    const total = prevs.reduce((s, p) => s + Number(p.valor), 0);
    modal({
      title: `Pagar ${nome}`, submit: 'Confirmar pagamento',
      body: `<p class="hint">Pagamento único de <b>${brl(total)}</b>. No Financeiro o lançamento é separado por unidade, com o mesmo código PGD.</p>
        ${table(['Previsão', 'Valor'], rows(prevs, (p) => `<tr><td>${esc(p.descricao)}</td><td>${brl(p.valor)}</td></tr>`, '', 2))}
        <div class="form-row" style="margin-top:1rem"><label>Conta de pagamento<select name="conta" required>${opts(state.contas, (c) => c.nome)}</select></label>
        <label>Data<input name="data" type="date" value="${today()}" required></label></div>
        <label>Observação<input name="obs"></label>`,
      onSubmit: async (v) => {
        const cod = await rpc('pagar_dentista', { p_dentista: dentistaId, p_previsoes: prevs.map((p) => p.id), p_conta: v.conta, p_data: v.data, p_obs: v.obs });
        toast(`Pagamento ${cod} registrado.`);
        refresh();
      },
    });
  }

  register('producao', 'Produção', (el) => tabs(el, 'producao', [
    { id: 'producao', label: 'Produção por dentista', render: async (b) => {
      const comp = state.compProducao || today().slice(0, 7);
      b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><input type="month" id="mes" value="${comp}">
        <button class="btn ghost" id="conv" ${can('financeiro') ? '' : 'disabled'}>Acrescentar produção (convênio)</button></div><div id="l"></div>`;
      $('#conv', b).onclick = convenioForm;
      const draw = async () => {
        state.compProducao = $('#mes', b).value;
        const competencia = state.compProducao + '-01';
        const cs = await q(porUnidade(db.from('comissoes').select('dentista_id, tipo, valor, estornada, lotes!inner(competencia)').eq('lotes.competencia', competencia)));
        const g = {};
        cs.forEach((c) => { const x = (g[c.dentista_id] ||= { venda: 0, execucao: 0, convenio: 0, n: 0 }); x[c.tipo] += Number(c.valor); if (!c.estornada) x.n++; });
        const lista = Object.entries(g).map(([id, x]) => ({ id, ...x, nome: state.dentistas.find((d) => d.id === id)?.nome || '—' })).sort((a, c) => a.nome.localeCompare(c.nome));
        $('#l', b).innerHTML = table(['Dentista', 'Linhas', 'Venda', 'Execução', 'Convênio', 'Total a receber'], rows(lista, (x) =>
          `<tr class="clicavel" data-det="${esc(x.id)}"><td>${esc(x.nome)}</td><td>${x.n}</td><td>${brl(x.venda)}</td><td>${brl(x.execucao)}</td><td>${brl(x.convenio)}</td><td><b>${brl(x.venda + x.execucao + x.convenio)}</b></td></tr>`,
          'Sem produção nesta competência.', 6));
        $$('[data-det]', b).forEach((tr) => (tr.onclick = () => detalhe(tr.dataset.det, competencia, state.dentistas.find((d) => d.id === tr.dataset.det)?.nome)));
      };
      $('#mes', b).onchange = draw;
      await draw();
    } },
    { id: 'lotes', label: 'Lotes', render: async (b) => {
      await rpc('abrir_lote_do_mes').catch(() => {});
      const [lotes, cs, prevs] = await Promise.all([
        q(db.from('lotes').select('*').order('competencia', { ascending: false }).limit(24)),
        q(db.from('comissoes').select('lote_id, valor, status')),
        q(db.from('previsoes').select('lote_id, status, vencimento').eq('origem', 'producao').eq('status', 'prevista')),
      ]);
      b.innerHTML = table(['Competência', 'Situação', 'A encerrar', 'No previsto', 'Pagamentos pendentes', ''], rows(lotes, (l) => {
        const mine = cs.filter((c) => c.lote_id === l.id);
        const abertoV = mine.filter((c) => c.status === 'aberta').reduce((s, c) => s + Number(c.valor), 0);
        const fechV = mine.filter((c) => c.status !== 'aberta').reduce((s, c) => s + Number(c.valor), 0);
        const pend = prevs.filter((p) => p.lote_id === l.id);
        const atraso = pend.some((p) => daysTo(p.vencimento) < 0);
        return `<tr><td>${mesLabel(l.competencia)}</td><td>${badge(l.status === 'aberto' ? 'agendado' : 'realizado')} ${esc(l.status)}</td><td>${brl(abertoV)}</td><td>${brl(fechV)}</td>
          <td>${pend.length ? `<span class="badge ${atraso ? 'cancelada' : 'em_atendimento'}">${pend.length} a pagar${atraso ? ' · atrasado' : ''}</span>` : '–'}</td>
          <td><button class="btn ghost sm" data-lote="${esc(l.id)}">Abrir</button></td></tr>`;
      }, 'Nenhum lote ainda.', 6));
      $$('[data-lote]', b).forEach((x) => (x.onclick = () => abrirLote(lotes.find((l) => l.id === x.dataset.lote))));
    } },
    { id: 'evolucao', label: 'Evolução clínica', render: async (b) => {
      const data = await q(porUnidade(db.from('orcamento_itens').select('*, procedimentos(nome), orcamentos!inner(codigo,status,unidade_id,pacientes!paciente_id(nome))')
        .eq('orcamentos.status', 'aprovado').in('status_exec', ['planejado', 'em_andamento']).order('criado_em').limit(300), 'orcamentos.unidade_id'));
      b.innerHTML = `<p class="hint">Procedimentos aprovados aguardando execução. Marque "executado" informando o dentista: isso libera a comissão de execução.</p>` +
        table(['Paciente', 'Orç.', 'Procedimento', 'Dente', 'Situação', 'Execução', ''], rows(data, (i) =>
          `<tr><td>${esc(i.orcamentos?.pacientes?.nome)}</td><td>#${esc(i.orcamentos?.codigo)}</td><td>${esc(i.procedimentos?.nome)}</td><td>${esc(i.dente)}</td>
           <td>${badge(i.status_exec)}</td><td>${brl(i.valor_execucao)}</td><td><button class="btn sm" data-ev="${esc(i.id)}">Evoluir</button></td></tr>`, 'Nada pendente de execução.', 7));
      $$('[data-ev]', b).forEach((x) => (x.onclick = () => evoluir(data.find((i) => i.id === x.dataset.ev))));
    } },
    { id: 'pagamentos', label: 'Pagamento de dentistas', render: async (b) => {
      const [prevs, pagos] = await Promise.all([
        q(db.from('previsoes').select('*').eq('origem', 'producao').eq('status', 'prevista').order('vencimento')),
        q(db.from('pagamentos_dentista').select('*, dentistas!dentista_id(nome)').order('codigo', { ascending: false }).limit(15)),
      ]);
      const g = {};
      prevs.forEach((p) => (g[p.dentista_id] ||= []).push(p));
      const dent = Object.entries(g).map(([id, ps]) => ({ id, ps, nome: state.dentistas.find((d) => d.id === id)?.nome || '—', total: ps.reduce((s, p) => s + Number(p.valor), 0), venc: ps[0].vencimento }));
      b.innerHTML = `<p class="hint">Previsões de produção são pagas só por aqui, em pagamento único agrupado. Amarelo = faltam 5 dias ou menos; vermelho = vencido.</p>` +
        table(['Dentista', 'Previsões', 'Total', 'Vencimento', ''], rows(dent, (x) => {
          const d = daysTo(x.venc), cls = d < 0 ? 'vencido' : d <= 5 ? 'atencao' : '';
          return `<tr><td>${esc(x.nome)}</td><td>${x.ps.map((p) => esc(PREV_TIPO[p.tipo] || p.tipo)).join(', ')}</td><td><b>${brl(x.total)}</b></td>
            <td><span class="alerta ${cls}" style="display:inline-block">${fmtD(x.venc)}${d < 0 ? ' · vencido' : d <= 5 ? ` · em ${d} dia(s)` : ''}</span></td>
            <td>${can('financeiro') ? `<button class="btn sm" data-pg="${esc(x.id)}">Pagar</button>` : ''}</td></tr>`;
        }, 'Nada a pagar.', 5)) +
        `<h3>Últimos pagamentos</h3>` + table(['Código', 'Dentista', 'Data', 'Total'], rows(pagos, (p) => `<tr><td>PGD-${p.codigo}</td><td>${esc(p.dentistas?.nome)}</td><td>${fmtD(p.data)}</td><td>${brl(p.total)}</td></tr>`, 'Nenhum pagamento.', 4));
      $$('[data-pg]', b).forEach((x) => (x.onclick = () => { const d = dent.find((y) => y.id === x.dataset.pg); pagarDentista(d.id, d.nome, d.ps); }));
    } },
  ]), 70);
})();
