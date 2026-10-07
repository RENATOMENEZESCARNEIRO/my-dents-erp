/* Orçamentos: planejamento do dentista → paciente autoriza itens → aprovação gera o débito.
   Aprovação parcial = dois orçamentos independentes (o pendente fica na ficha). */
(() => {
  'use strict';
  const { dentistasDaUnidade, db, $, $$, esc, brl, num, today, fmtD, toast, state, opts, rows, table, badge, rpc, q, modal, register, refresh, porUnidade } = window.MD;

  const preco = (p, condicao) => (condicao === 'parcelado' && p.valor_parcelado != null ? p.valor_parcelado : p.valor_venda);
  const ativos = () => state.procedimentos.filter((p) => p.ativo);

  function novoOrcamento(pacienteId = '') {
    modal({
      title: 'Novo orçamento', wide: true,
      body: `<div class="form-row">
          <label>Paciente<select name="paciente_id" required>${opts(state.pacientes, (p) => p.nome, 'Selecione…', pacienteId)}</select></label>
          <label>Unidade<select name="unidade_id" required>${opts(state.unidades, (u) => u.nome, 'Selecione…', state.unidadeId)}</select></label>
        </div>
        <div class="form-row">
          <label>Dentista responsável (vendedor)<select name="dentista_id" required>${opts(dentistasDaUnidade(state.unidadeId), (d) => d.nome)}</select></label>
          <label>Condição de venda<select name="condicao">${opts([{ id: 'avista', n: 'À vista' }, { id: 'parcelado', n: 'Parcelado' }], (x) => x.n, null, 'avista')}</select></label>
        </div>
        <h4 style="margin:.5rem 0">Procedimentos planejados</h4>
        <div id="itens"></div>
        <button type="button" class="btn ghost sm" id="add">+ Procedimento</button>
        <div class="total">Total: <b id="tot">R$ 0,00</b></div>
        <label>Observações<textarea name="observacoes" rows="2"></textarea></label>`,
      onOpen: (form) => {
        form.unidade_id.onchange = () => { form.dentista_id.innerHTML = opts(dentistasDaUnidade(form.unidade_id.value), (d) => d.nome); };
        const box = $('#itens', form);
        const cond = () => form.condicao.value;
        const total = () => { $('#tot', form).textContent = brl($$('[data-valor]', form).reduce((s, i) => s + num(i.value), 0)); };
        const addRow = () => {
          const r = document.createElement('div');
          r.className = 'item-row';
          r.innerHTML = `<select data-proc>${opts(ativos(), (p) => `${p.codigo} — ${p.nome}`)}</select>
            <input data-dente placeholder="Dente/região">
            <input data-valor type="number" step="0.01" min="0" placeholder="Valor">
            <button type="button" class="btn ghost sm" data-rm aria-label="Remover">×</button>`;
          box.appendChild(r);
          $('[data-proc]', r).onchange = (e) => {
            const p = state.procedimentos.find((x) => x.id === e.target.value);
            $('[data-valor]', r).value = p ? preco(p, cond()) : '';
            total();
          };
          $('[data-valor]', r).oninput = total;
          $('[data-rm]', r).onclick = () => { r.remove(); total(); };
        };
        $('#add', form).onclick = addRow;
        form.condicao.onchange = () => {
          $$('.item-row', form).forEach((r) => {
            const p = state.procedimentos.find((x) => x.id === $('[data-proc]', r).value);
            if (p) $('[data-valor]', r).value = preco(p, cond());
          });
          total();
        };
        addRow();
      },
      onSubmit: async (v, form) => {
        const itens = $$('.item-row', form).map((r) => ({
          procedimento_id: $('[data-proc]', r).value, dente: $('[data-dente]', r).value.trim() || null, valor_negociado: num($('[data-valor]', r).value),
        })).filter((i) => i.procedimento_id);
        if (!itens.length) throw new Error('Inclua ao menos um procedimento.');
        const o = await q(db.from('orcamentos').insert(v).select('id').single());
        const { error } = await db.from('orcamento_itens').insert(itens.map((i) => ({ ...i, orcamento_id: o.id })));
        if (error) { await db.from('orcamentos').delete().eq('id', o.id); throw new Error(error.message); }
        toast('Orçamento criado. Marque o que o paciente autorizar para aprovar.');
        location.hash = '#orcamentos';
        refresh();
      },
    });
  }

  const um = (x) => (Array.isArray(x) ? x[0] : x) || null;
  const MEIO = { pix: 'PIX', dinheiro: 'Dinheiro', credito: 'Crédito', debito: 'Débito', credito_paciente: 'Crédito do paciente' };
  /* Situação única do orçamento (a venda e o débito vivem na mesma tela). */
  function situacao(o) {
    const d = um(o.debitos);
    if (o.status === 'cancelado') return { k: 'cancelado', t: 'Cancelado' };
    if (o.status === 'pendente') return { k: 'nao_aprovado', t: 'Não aprovado' };
    if (!d) return { k: 'pendente', t: 'Aprovado' };
    if (d.status === 'cancelado') return { k: 'cancelado', t: 'Cancelado' };
    if (Number(d.saldo) <= 0 || d.status === 'pago') return { k: 'pago', t: 'Pago' };
    const venc = d.vencimento < today();
    if (Number(d.valor_pago) > 0) return { k: venc ? 'vencido' : 'parcial', t: `Parcial · falta ${brl(d.saldo)}` };
    return { k: venc ? 'vencido' : 'pendente', t: `Pendente · ${brl(d.saldo)}` };
  }
  const chip = (o) => { const x = situacao(o); return `<span class="badge ${x.k}">${esc(x.t)}</span>`; };

  async function abrirOrcamento(id) {
    const o = await q(db.from('orcamentos').select('*, pacientes!paciente_id(nome), dentistas!dentista_id(nome), unidades!unidade_id(nome), orcamento_itens(*, procedimentos(codigo,nome))').eq('id', id).single());
    const itens = o.orcamento_itens || [];
    const pend = o.status === 'pendente';
    const deb = pend ? null : um(await q(db.from('debitos').select('*').eq('orcamento_id', id)));
    const recs = deb ? await q(db.from('recebimentos').select('*, dentistas!dentista_id(nome)').eq('debito_id', deb.id).order('codigo')) : [];
    const aReceber = deb && !['pago', 'cancelado'].includes(deb.status) && Number(deb.saldo) > 0;
    const fin = deb ? `<h4 style="margin:1rem 0 .4rem">Financeiro</h4>
        <div class="grid" style="margin-bottom:.6rem">
          <div class="stat"><span>Valor do débito</span><b>${brl(deb.valor_original)}</b></div>
          <div class="stat"><span>Desconto</span><b>${brl(deb.desconto)}</b></div>
          <div class="stat"><span>Recebido</span><b>${brl(deb.valor_pago)}</b></div>
          <div class="stat"><span>${aReceber ? 'Falta receber' : 'Saldo'}</span><b>${brl(deb.saldo)}</b></div>
        </div>
        <p class="hint">Lançado em ${fmtD(deb.data_lancamento)} · vencimento ${fmtD(deb.vencimento)}${aReceber && deb.vencimento < today() ? ' <b class="txt-vencido">(vencido)</b>' : ''}</p>
        ${table(['#', 'Pagamento', 'Meio', 'Valor', 'Dentista', 'Situação'], rows(recs, (r) =>
          `<tr><td>${r.codigo}</td><td>${fmtD(r.data_pagamento)}</td><td>${esc(MEIO[r.meio] || r.meio)}${r.meio === 'credito' ? ` ${r.parcelas}×` : ''}</td><td>${brl(r.valor)}</td><td>${esc(r.dentistas?.nome)}</td><td>${esc(r.status)}</td></tr>`, 'Nenhum recebimento ainda.', 6))}` : '';
    modal({
      title: `Orçamento #${o.codigo} — ${o.pacientes?.nome}`, wide: true, submit: 'Aprovar selecionados',
      body: `<p class="hint">${esc(o.unidades?.nome)} · vendedor ${esc(o.dentistas?.nome)} · ${o.condicao === 'avista' ? 'à vista' : 'parcelado'} · ${chip({ ...o, debitos: deb })}
          ${o.percentual_venda != null ? ` · comissão congelada em ${esc(o.percentual_venda)}%` : ''}</p>
        ${table([pend ? 'Autorizou?' : 'Execução', 'Procedimento', 'Dente', 'Valor'], rows(itens, (i) =>
          `<tr><td>${pend ? `<input type="checkbox" style="width:auto" name="item" value="${esc(i.id)}" checked>` : badge(i.status_exec)}</td>
           <td>${esc(i.procedimentos?.codigo)} — ${esc(i.procedimentos?.nome)}</td><td>${esc(i.dente)}</td><td>${brl(i.valor_negociado)}</td></tr>`, 'Sem itens.', 4))}
        <div class="total">Total: <b>${brl(itens.reduce((s, i) => s + Number(i.valor_negociado), 0))}</b></div>
        ${pend ? `<label>Vencimento do débito<input type="date" name="vencimento" value="${today()}"></label>
          <p class="hint">Os itens desmarcados viram um novo orçamento pendente, sem vínculo com este. O aprovado gera um único débito.</p>` : ''}${fin}`,
      extra: pend ? '<button type="button" class="btn ghost" id="cancelar-orc" style="margin-right:auto;color:var(--danger)">Cancelar orçamento</button>'
        : (aReceber ? '<button type="button" class="btn" id="receber-orc" data-perm="debitos_receber" style="margin-right:auto">Receber</button>' : ''),
      onSubmit: pend ? async (v, form) => {
        const sel = $$('[name=item]:checked', form).map((c) => c.value);
        const r = await rpc('aprovar_orcamento', { p_orc: id, p_itens: sel, p_vencimento: v.vencimento || today() });
        toast(r.orcamento_pendente_id ? 'Aprovado! O restante ficou como novo orçamento pendente.' : 'Orçamento aprovado e débito gerado.');
        refresh();
      } : null,
      onOpen: (form, dlg) => {
        const b = $('#cancelar-orc', form);
        if (b) b.onclick = async () => {
          if (!confirm('Cancelar este orçamento?')) return;
          const { error } = await db.from('orcamentos').update({ status: 'cancelado' }).eq('id', id);
          if (error) return toast(error.message, true);
          dlg.close(); toast('Orçamento cancelado.'); refresh();
        };
        const r = $('#receber-orc', form);
        if (r) r.onclick = () => { dlg.close(); window.MD.receber(deb.id); };
      },
    });
  }

  window.MD.abrirOrcamento = abrirOrcamento; window.MD.novoOrcamento = novoOrcamento;
  register('orcamentos', 'Orçamentos', async (el) => {
    const FILTROS = [{ id: '', n: 'Todos' }, { id: 'nao_aprovado', n: 'Não aprovados' }, { id: 'a_receber', n: 'Aprovados · a receber' }, { id: 'vencido', n: 'Aprovados · vencidos' }, { id: 'pago', n: 'Aprovados · pagos' }, { id: 'cancelado', n: 'Cancelados' }];
    el.innerHTML = `<div class="actions" style="margin-bottom:1rem">
        <select id="st" aria-label="Situação">${opts(FILTROS, (x) => x.n, null, '')}</select>
        <input id="busca" type="search" placeholder="Buscar paciente…" aria-label="Buscar paciente">
        <select id="dent" aria-label="Dentista">${opts(state.dentistas, (d) => d.nome, 'Todos os dentistas')}</select>
        <button class="btn" data-perm="orcamentos_criar" id="novo">+ Novo orçamento</button></div><div id="resumo"></div><div id="lista"></div>`;
    $('#novo', el).onclick = () => novoOrcamento();
    let dados = [];
    const total = (o) => o.orcamento_itens.reduce((s, i) => s + Number(i.valor_negociado), 0);
    const draw = () => {
      const f = $('#st', el).value, t = $('#busca', el).value.trim().toLowerCase(), dn = $('#dent', el).value;
      const ls = dados.filter((o) => {
        const k = situacao(o).k;
        if (f === 'a_receber' && !['pendente', 'parcial', 'vencido'].includes(k)) return false;
        if (f && f !== 'a_receber' && k !== f) return false;
        if (dn && o.dentista_id !== dn) return false;
        return !t || (o.pacientes?.nome || '').toLowerCase().includes(t);
      });
      const aprov = ls.filter((o) => um(o.debitos) && o.status === 'aprovado');
      const soma = (k) => aprov.reduce((s, o) => s + Number(um(o.debitos)[k] || 0), 0);
      $('#resumo', el).innerHTML = `<div class="grid" style="margin-bottom:1rem">
        <div class="card stat"><span>Orçamentos listados</span><b>${ls.length}</b></div>
        <div class="card stat"><span>Possível venda (não aprovados)</span><b>${brl(ls.filter((o) => o.status === 'pendente').reduce((s, o) => s + total(o), 0))}</b></div>
        <div class="card stat"><span>Recebido (aprovados)</span><b>${brl(soma('valor_pago'))}</b></div>
        <div class="card stat"><span>A receber (aprovados)</span><b>${brl(soma('saldo'))}</b></div></div>`;
      $('#lista', el).innerHTML = table(['#', 'Paciente', 'Dentista', 'Unidade', 'Criado', 'Total', 'Situação', 'Vencimento', ''], rows(ls, (o) => {
        const d = um(o.debitos), k = situacao(o).k;
        return `<tr><td>${o.codigo}</td><td>${esc(o.pacientes?.nome)}</td><td>${esc(o.dentistas?.nome)}</td><td>${esc(o.unidades?.nome)}</td><td>${fmtD((o.criado_em || '').slice(0, 10))}</td>
         <td>${brl(total(o))}</td><td>${chip(o)}</td><td class="${k === 'vencido' ? 'txt-vencido' : ''}">${d && Number(d.saldo) > 0 ? fmtD(d.vencimento) : ''}</td>
         <td><button class="btn ghost sm" data-abrir="${esc(o.id)}">${o.status === 'pendente' ? 'Abrir / aprovar' : 'Detalhes'}</button></td></tr>`;
      }, 'Nenhum orçamento.', 9));
      $$('[data-abrir]', el).forEach((b) => (b.onclick = () => abrirOrcamento(b.dataset.abrir)));
    };
    dados = await q(porUnidade(db.from('orcamentos').select('*, pacientes!paciente_id(nome), dentistas!dentista_id(nome), unidades!unidade_id(nome), orcamento_itens(valor_negociado), debitos(id,valor_original,desconto,valor_pago,saldo,vencimento,status)').order('codigo', { ascending: false }).limit(500)));
    ['st', 'dent'].forEach((i) => ($('#' + i, el).onchange = draw));
    $('#busca', el).oninput = draw;
    draw();
  }, 40);

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-orcar]');
    if (b) novoOrcamento(b.dataset.orcar);
  });
})();
