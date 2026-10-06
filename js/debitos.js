/* Débitos e recebimentos. O paciente quita o débito ao pagar (mesmo no cartão); o dinheiro do cartão
   só entra no Financeiro quando for "realizado". Três datas sempre visíveis: lançamento, pagamento e recebimento. */
(() => {
  'use strict';
  const { db, $, $$, esc, brl, num, today, fmtD, toast, state, opts, rows, table, badge, can, rpc, q, modal, tabs, register, refresh, porUnidade } = window.MD;

  const contaPadrao = (meio) => {
    const c = state.contas.find((x) => (meio === 'dinheiro' ? x.tipo === 'caixa' : x.tipo === 'banco'));
    return c ? c.id : '';
  };

  async function receber(debitoId) {
    const d = await q(db.from('debitos').select('*, pacientes!paciente_id(nome), unidades!unidade_id(nome), orcamentos(codigo, dentista_id, orcamento_itens(valor_negociado, procedimentos(nome)))').eq('id', debitoId).single());
    const [taxas, cfg, cred] = await Promise.all([
      q(db.from('taxas_cartao').select('*')), q(db.from('config').select('*').eq('chave', 'taxas_cartao_ativas')),
      q(db.from('creditos_paciente').select('saldo').eq('paciente_id', d.paciente_id).eq('unidade_id', d.unidade_id)),
    ]);
    const taxasOn = cfg[0] ? String(cfg[0].valor) === 'true' : true;
    const saldo = Number(d.saldo);
    const carteira = cred[0] ? Number(cred[0].saldo) : 0;
    const itens = d.orcamentos?.orcamento_itens || [];

    modal({
      title: `Receber — ${d.pacientes?.nome}`, wide: true, submit: 'Confirmar recebimento',
      body: `<p class="hint">Orçamento #${esc(d.orcamentos?.codigo)} · ${esc(d.unidades?.nome)} · saldo ${brl(saldo)}${carteira > 0 ? ` · crédito do paciente ${brl(carteira)}` : ''}</p>
        ${table(['Procedimento', 'Valor negociado'], rows(itens, (i) => `<tr><td>${esc(i.procedimentos?.nome)}</td><td>${brl(i.valor_negociado)}</td></tr>`, 'Sem itens.', 2))}
        <div class="form-row" style="margin-top:1rem">
          <label>Desconto (quita o débito)<input name="desconto" type="number" step="0.01" min="0" value="0"></label>
          <label>Valor recebido<input name="valor" type="number" step="0.01" min="0.01" required value="${saldo.toFixed(2)}"></label>
        </div>
        <div class="form-row">
          <label>Meio de pagamento<select name="meio">${opts([{ id: 'pix', n: 'PIX' }, { id: 'dinheiro', n: 'Dinheiro' }, { id: 'credito', n: 'Cartão de crédito' }, { id: 'debito', n: 'Cartão de débito' }], (x) => x.n, null, 'pix')}</select></label>
          <label>Banco / conta de destino<select name="conta" required>${opts(state.contas, (c) => c.nome, 'Selecione…', contaPadrao('pix'))}</select></label>
        </div>
        <div class="form-row" id="cartao" hidden>
          <label id="l-parc">Parcelas<input name="parcelas" type="number" min="1" max="12" value="1"></label>
          <label>CV (comprovante de venda)<input name="cv"></label>
        </div>
        <div class="hint" id="liq"></div>
        <div class="form-row">
          <label>Data do recebimento<input name="data" type="date" required value="${today()}"></label>
          <label>Dentista responsável pela venda<select name="dentista" required>${opts(state.dentistas, (x) => x.nome, 'Selecione…', d.orcamentos?.dentista_id)}</select></label>
        </div>
        <label>Descrição<input name="descricao"></label>`,
      extra: carteira > 0 ? '<button type="button" class="btn ghost" id="usar-cred" style="margin-right:auto">Usar crédito do paciente</button>' : '',
      onOpen: (form, dlg) => {
        const calc = () => {
          const meio = form.meio.value, card = meio === 'credito' || meio === 'debito';
          $('#cartao', form).hidden = !card;
          $('#l-parc', form).hidden = meio !== 'credito';
          const r = Math.max(0, saldo - num(form.desconto.value));
          if (num(form.valor.value) > r && card) $('#liq', form).textContent = 'Valor acima do saldo: o excedente só pode virar crédito em dinheiro ou PIX.';
          else if (card) {
            const t = taxasOn ? taxas.find((x) => x.modalidade === meio && x.parcelas === (meio === 'debito' ? 1 : parseInt(form.parcelas.value || 1, 10))) : null;
            const pc = t ? Number(t.percentual) : 0, tx = Math.round(num(form.valor.value) * pc) / 100;
            $('#liq', form).textContent = `Vai para o PREVISTO. Taxa ${pc.toLocaleString('pt-BR')}% = ${brl(tx)} · líquido previsto ${brl(num(form.valor.value) - tx)} (editável ao realizar).`;
          } else $('#liq', form).textContent = num(form.valor.value) > r ? `Excedente de ${brl(num(form.valor.value) - r)} vira crédito do paciente.` : '';
        };
        form.meio.onchange = () => { form.conta.value = contaPadrao(form.meio.value); calc(); };
        ['desconto', 'valor', 'parcelas'].forEach((n) => (form[n].oninput = calc));
        form.desconto.oninput = () => { form.valor.value = Math.max(0, saldo - num(form.desconto.value)).toFixed(2); calc(); };
        calc();
        const u = $('#usar-cred', form);
        if (u) u.onclick = () => { dlg.close(); usarCredito(d, Math.min(carteira, saldo)); };
      },
      onSubmit: async (v) => {
        if (v.data !== today() && !confirm('Tem certeza sobre a data do recebimento? Ela é diferente de hoje.')) throw { cancel: true };
        await rpc('receber_debito', {
          p_debito: debitoId, p_valor: num(v.valor), p_desconto: num(v.desconto), p_meio: v.meio, p_conta: v.conta, p_dentista: v.dentista,
          p_data: v.data, p_parcelas: parseInt(v.parcelas || 1, 10), p_cv: v.cv, p_descricao: v.descricao,
        });
        toast(v.meio === 'credito' || v.meio === 'debito' ? 'Recebimento registrado (cartão no previsto).' : 'Recebimento registrado.');
        refresh();
      },
    });
  }

  function usarCredito(d, max) {
    modal({
      title: 'Usar crédito do paciente', submit: 'Aplicar crédito',
      body: `<p class="hint">Não gera lançamento de caixa nem nova receita (o dinheiro já foi contado quando entrou).</p>
        <label>Valor<input name="valor" type="number" step="0.01" min="0.01" max="${max}" required value="${max.toFixed(2)}"></label>
        <label>Dentista responsável pela venda<select name="dentista" required>${opts(state.dentistas, (x) => x.nome, 'Selecione…', d.orcamentos?.dentista_id)}</select></label>`,
      onSubmit: async (v) => {
        await rpc('usar_credito', { p_debito: d.id, p_valor: num(v.valor), p_dentista: v.dentista, p_data: today() });
        toast('Crédito aplicado.');
        refresh();
      },
    });
  }

  const vencido = (d) => d.saldo > 0 && d.vencimento < today();

  register('debitos', 'Débitos', (el) => tabs(el, 'debitos', [
    { id: 'debitos', label: 'Débitos', render: async (b) => {
      b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><select id="st">${opts([{ id: 'aberto', n: 'Em aberto' }, { id: 'pago', n: 'Quitados' }, { id: '', n: 'Todos' }], (x) => x.n, null, 'aberto')}</select></div><div id="l"></div>`;
      const draw = async () => {
        let qy = porUnidade(db.from('debitos').select('*, pacientes!paciente_id(nome), unidades!unidade_id(nome), orcamentos(codigo)').order('vencimento').limit(300));
        const st = $('#st', b).value;
        if (st === 'aberto') qy = qy.in('status', ['pendente', 'parcial']); else if (st) qy = qy.eq('status', st);
        const data = await q(qy);
        $('#l', b).innerHTML = table(['Paciente', 'Orç.', 'Unidade', 'Original', 'Desconto', 'Pago', 'Saldo', 'Lançado', 'Vencimento', 'Situação', ''], rows(data, (d) =>
          `<tr><td>${esc(d.pacientes?.nome)}</td><td>#${esc(d.orcamentos?.codigo)}</td><td>${esc(d.unidades?.nome)}</td><td>${brl(d.valor_original)}</td>
           <td>${brl(d.desconto)}</td><td>${brl(d.valor_pago)}</td><td><b>${brl(d.saldo)}</b></td><td>${fmtD(d.data_lancamento)}</td>
           <td class="${vencido(d) ? 'txt-vencido' : ''}">${fmtD(d.vencimento)}${vencido(d) ? ' ⚠' : ''}</td><td>${badge(d.status)}</td>
           <td>${d.status === 'pago' || d.status === 'cancelado' ? '' : `<button class="btn sm" data-receber="${esc(d.id)}">Receber</button>`}</td></tr>`, 'Nenhum débito.', 11));
        $$('[data-receber]', b).forEach((x) => (x.onclick = () => receber(x.dataset.receber)));
      };
      $('#st', b).onchange = draw;
      await draw();
    } },
    { id: 'recebimentos', label: 'Recebimentos', render: async (b) => {
      const data = await q(porUnidade(db.from('recebimentos').select('*, pacientes!paciente_id(nome), dentistas!dentista_id(nome), unidades!unidade_id(nome), contas_bancarias!conta_id(nome)').order('codigo', { ascending: false }).limit(200)));
      b.innerHTML = table(['#', 'Paciente', 'Unidade', 'Meio', 'Valor', 'Líquido', 'Lançamento', 'Pagamento', 'Recebimento', 'Conta', 'Dentista', 'Situação', ''], rows(data, (r) =>
        `<tr><td>${r.codigo}</td><td>${esc(r.pacientes?.nome)}</td><td>${esc(r.unidades?.nome)}</td>
         <td>${esc(r.meio.replace('_', ' '))}${r.meio === 'credito' ? ` ${r.parcelas}×` : ''}${r.cv ? `<br><small>CV ${esc(r.cv)}</small>` : ''}</td>
         <td>${brl(r.valor)}${Number(r.desconto) > 0 ? `<br><small>desc. ${brl(r.desconto)}</small>` : ''}</td><td>${brl(r.valor_liquido)}</td>
         <td>${fmtD(r.data_lancamento)}</td><td>${fmtD(r.data_pagamento)}</td><td>${fmtD(r.data_recebimento)}</td>
         <td>${esc(r.contas_bancarias?.nome)}</td><td>${esc(r.dentistas?.nome)}</td><td>${badge(r.status === 'previsto' ? 'agendado' : r.status === 'estornado' ? 'cancelado' : 'realizado')} ${esc(r.status)}</td>
         <td>${r.status === 'estornado' ? '' : `<button class="btn ghost sm" data-estornar="${esc(r.id)}">Estornar</button>`}</td></tr>`, 'Nenhum recebimento.', 13));
      $$('[data-estornar]', b).forEach((x) => (x.onclick = async () => {
        if (!confirm('Estornar este recebimento? O débito volta a ficar em aberto.')) return;
        try { await rpc('estornar_recebimento', { p_id: x.dataset.estornar }); toast('Recebimento estornado.'); refresh(); } catch (e) { toast(e.message, true); }
      }));
    } },
    { id: 'credito', label: 'Crédito de pacientes', render: async (b) => {
      const data = await q(porUnidade(db.from('creditos_paciente').select('*, pacientes!paciente_id(nome), unidades!unidade_id(nome)').gt('saldo', 0)));
      b.innerHTML = `<p class="hint">Crédito é receita no momento em que o dinheiro entra. Devolvê-lo é dedução da receita, nunca despesa.</p>` +
        table(['Paciente', 'Unidade', 'Saldo', ''], rows(data, (c) =>
          `<tr><td>${esc(c.pacientes?.nome)}</td><td>${esc(c.unidades?.nome)}</td><td>${brl(c.saldo)}</td>
           <td>${can('financeiro') ? `<button class="btn ghost sm" data-dev="${esc(c.paciente_id)}|${esc(c.unidade_id)}|${esc(c.saldo)}">Devolver</button>` : ''}</td></tr>`, 'Nenhum paciente com crédito.', 4));
      $$('[data-dev]', b).forEach((x) => (x.onclick = () => {
        const [pac, uni, saldo] = x.dataset.dev.split('|');
        modal({
          title: 'Devolver crédito', submit: 'Devolver',
          body: `<label>Valor<input name="valor" type="number" step="0.01" min="0.01" max="${saldo}" required value="${saldo}"></label>
            <div class="form-row"><label>Conta de saída<select name="conta" required>${opts(state.contas, (c) => c.nome)}</select></label>
            <label>Data<input type="date" name="data" value="${today()}" required></label></div>
            <label>Descrição<input name="descricao"></label>`,
          onSubmit: async (v) => { await rpc('devolver_credito', { p_paciente: pac, p_unidade: uni, p_valor: num(v.valor), p_conta: v.conta, p_data: v.data, p_desc: v.descricao }); toast('Crédito devolvido.'); refresh(); },
        });
      }));
    } },
  ]), 50);
})();
