/* Orçamentos: planejamento do dentista → paciente autoriza itens → aprovação gera o débito.
   Aprovação parcial = dois orçamentos independentes (o pendente fica na ficha). */
(() => {
  'use strict';
  const { db, $, $$, esc, brl, num, today, toast, state, opts, rows, table, badge, rpc, q, modal, register, refresh, porUnidade } = window.MD;

  const preco = (p, condicao) => (condicao === 'parcelado' && p.valor_parcelado != null ? p.valor_parcelado : p.valor_venda);
  const ativos = () => state.procedimentos.filter((p) => p.ativo);

  function novoOrcamento(pacienteId = '') {
    modal({
      title: 'Novo orçamento', wide: true,
      body: `<div class="form-row">
          <label>Paciente<select name="paciente_id" required>${opts(state.pacientes, (p) => p.nome, 'Selecione…', pacienteId)}</select></label>
          <label>Dentista responsável (vendedor)<select name="dentista_id" required>${opts(state.dentistas, (d) => d.nome)}</select></label>
        </div>
        <div class="form-row">
          <label>Unidade<select name="unidade_id" required>${opts(state.unidades, (u) => u.nome, 'Selecione…', state.unidadeId)}</select></label>
          <label>Condição de venda<select name="condicao">${opts([{ id: 'avista', n: 'À vista' }, { id: 'parcelado', n: 'Parcelado' }], (x) => x.n, null, 'avista')}</select></label>
        </div>
        <h4 style="margin:.5rem 0">Procedimentos planejados</h4>
        <div id="itens"></div>
        <button type="button" class="btn ghost sm" id="add">+ Procedimento</button>
        <div class="total">Total: <b id="tot">R$ 0,00</b></div>
        <label>Observações<textarea name="observacoes" rows="2"></textarea></label>`,
      onOpen: (form) => {
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

  async function abrirOrcamento(id) {
    const o = await q(db.from('orcamentos').select('*, pacientes!paciente_id(nome), dentistas!dentista_id(nome), unidades!unidade_id(nome), orcamento_itens(*, procedimentos(codigo,nome))').eq('id', id).single());
    const itens = o.orcamento_itens || [];
    const pend = o.status === 'pendente';
    modal({
      title: `Orçamento #${o.codigo} — ${o.pacientes?.nome}`, wide: true, submit: 'Aprovar selecionados',
      body: `<p class="hint">${esc(o.unidades?.nome)} · vendedor ${esc(o.dentistas?.nome)} · ${o.condicao === 'avista' ? 'à vista' : 'parcelado'} · ${badge(o.status)}
          ${o.percentual_venda != null ? ` · comissão congelada em ${esc(o.percentual_venda)}%` : ''}</p>
        ${table([pend ? 'Autorizou?' : 'Execução', 'Procedimento', 'Dente', 'Valor'], rows(itens, (i) =>
          `<tr><td>${pend ? `<input type="checkbox" style="width:auto" name="item" value="${esc(i.id)}" checked>` : badge(i.status_exec)}</td>
           <td>${esc(i.procedimentos?.codigo)} — ${esc(i.procedimentos?.nome)}</td><td>${esc(i.dente)}</td><td>${brl(i.valor_negociado)}</td></tr>`, 'Sem itens.', 4))}
        <div class="total">Total: <b>${brl(itens.reduce((s, i) => s + Number(i.valor_negociado), 0))}</b></div>
        ${pend ? `<label>Vencimento do débito<input type="date" name="vencimento" value="${today()}"></label>
          <p class="hint">Os itens desmarcados viram um novo orçamento pendente, sem vínculo com este. O aprovado gera um único débito.</p>` : ''}`,
      extra: pend ? '<button type="button" class="btn ghost" id="cancelar-orc" style="margin-right:auto;color:var(--danger)">Cancelar orçamento</button>' : '',
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
      },
    });
  }

  window.MD.abrirOrcamento = abrirOrcamento; window.MD.novoOrcamento = novoOrcamento;
  register('orcamentos', 'Orçamentos', async (el) => {
    el.innerHTML = `<div class="actions" style="margin-bottom:1rem">
        <select id="st" aria-label="Situação">${opts([{ id: '', n: 'Todos' }, { id: 'pendente', n: 'Pendentes' }, { id: 'aprovado', n: 'Aprovados' }, { id: 'cancelado', n: 'Cancelados' }], (x) => x.n, null, 'pendente')}</select>
        <button class="btn" id="novo">+ Novo orçamento</button></div><div id="lista"></div>`;
    $('#novo', el).onclick = () => novoOrcamento();
    const draw = async () => {
      let qy = porUnidade(db.from('orcamentos').select('*, pacientes!paciente_id(nome), dentistas!dentista_id(nome), unidades!unidade_id(nome), orcamento_itens(valor_negociado)').order('codigo', { ascending: false }).limit(200));
      if ($('#st', el).value) qy = qy.eq('status', $('#st', el).value);
      const data = await q(qy);
      $('#lista', el).innerHTML = table(['#', 'Paciente', 'Dentista', 'Unidade', 'Itens', 'Total', 'Situação', ''], rows(data, (o) =>
        `<tr><td>${o.codigo}</td><td>${esc(o.pacientes?.nome)}</td><td>${esc(o.dentistas?.nome)}</td><td>${esc(o.unidades?.nome)}</td>
         <td>${o.orcamento_itens.length}</td><td>${brl(o.orcamento_itens.reduce((s, i) => s + Number(i.valor_negociado), 0))}</td><td>${badge(o.status)}</td>
         <td><button class="btn ghost sm" data-abrir="${esc(o.id)}">${o.status === 'pendente' ? 'Abrir / aprovar' : 'Ver'}</button></td></tr>`, 'Nenhum orçamento.', 8));
      $$('[data-abrir]', el).forEach((b) => (b.onclick = () => abrirOrcamento(b.dataset.abrir)));
    };
    $('#st', el).onchange = draw;
    await draw();
  }, 40);

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-orcar]');
    if (b) novoOrcamento(b.dataset.orcar);
  });
})();
