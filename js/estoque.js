/* Estoque: itens, entradas/saídas/perdas por unidade e alerta de estoque mínimo. */
(() => {
  'use strict';
  const { db, $, $$, esc, brl, num, today, fmtD, toast, state, opts, rows, table, can, q, modal, tabs, register, refresh } = window.MD;
  const TIPO = { entrada: 'Entrada', saida: 'Saída (uso)', perda: 'Perda / vencimento' };
  const n2 = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  function itemForm(i = {}) {
    modal({
      title: i.id ? 'Editar item' : 'Novo item de estoque',
      body: `<label>Nome<input name="nome" required value="${esc(i.nome)}"></label>
        <div class="form-row"><label>Categoria<input name="categoria" value="${esc(i.categoria)}" placeholder="Ex.: Resina, Anestésico"></label>
        <label>Medida<input name="unidade_medida" value="${esc(i.unidade_medida || 'un')}" placeholder="un, cx, ml"></label>
        <label>Estoque mínimo<input name="minimo" type="number" step="0.01" min="0" value="${esc(i.minimo ?? 0)}"></label></div>
        <label>Situação<select name="ativo">${opts([{ id: 'true', n: 'Ativo' }, { id: 'false', n: 'Inativo' }], (x) => x.n, null, String(i.ativo ?? true))}</select></label>`,
      onSubmit: async (v) => {
        v.ativo = v.ativo === 'true'; v.minimo = num(v.minimo); if (!v.categoria) v.categoria = null;
        const { error } = await (i.id ? db.from('estoque_itens').update(v).eq('id', i.id) : db.from('estoque_itens').insert(v));
        if (error) throw new Error(error.code === '23505' ? 'Já existe um item com esse nome.' : error.message);
        toast('Item salvo.'); refresh();
      },
    });
  }

  function movForm(item, tipo) {
    modal({
      title: `${TIPO[tipo]} — ${item.nome}`, submit: 'Lançar',
      body: `<div class="form-row"><label>Unidade<select name="unidade_id" required>${opts(state.unidades, (x) => x.nome, 'Selecione…', state.unidadeId)}</select></label>
        <label>Quantidade (${esc(item.unidade_medida)})<input name="qtd" type="number" step="0.01" min="0.01" required></label></div>
        <div class="form-row">${tipo === 'entrada' ? '<label>Custo unitário<input name="custo_unit" type="number" step="0.01" min="0"></label>' : ''}
        <label>Data<input name="data" type="date" value="${today()}" required></label></div>
        <label>Observação<input name="obs"></label>`,
      onSubmit: async (v) => {
        const o = { item_id: item.id, unidade_id: v.unidade_id, tipo, qtd: num(v.qtd), data: v.data, obs: v.obs || null, custo_unit: v.custo_unit ? num(v.custo_unit) : null };
        await q(db.from('estoque_movs').insert(o));
        toast('Movimento lançado.'); refresh();
      },
    });
  }

  register('estoque', 'Estoque', (el) => tabs(el, 'estoque', [
    { id: 'saldo', label: 'Saldos', render: async (b) => {
      const [itens, saldos] = await Promise.all([q(db.from('estoque_itens').select('*').eq('ativo', true).order('nome')), q(db.from('estoque_saldo').select('*'))]);
      const un = state.unidadeId ? state.unidades.filter((u) => u.id === state.unidadeId) : state.unidades;
      const sal = (i, u) => Number(saldos.find((s) => s.item_id === i && s.unidade_id === u)?.saldo || 0);
      b.innerHTML = table(['Item', 'Categoria', ...un.map((u) => u.nome), 'Total', 'Mínimo', ''],
        rows(itens, (i) => {
          const tot = un.reduce((s, u) => s + sal(i.id, u.id), 0);
          const baixo = tot <= Number(i.minimo);
          return `<tr><td>${esc(i.nome)}</td><td>${esc(i.categoria)}</td>${un.map((u) => `<td>${n2(sal(i.id, u.id))}</td>`).join('')}
            <td><b>${n2(tot)}</b> ${esc(i.unidade_medida)}${baixo ? ' <span class="badge cancelada">baixo</span>' : ''}</td><td>${n2(i.minimo)}</td>
            <td><button class="btn sm" data-perm="estoque" data-m="entrada" data-i="${esc(i.id)}">Entrada</button> <button class="btn ghost sm" data-perm="estoque" data-m="saida" data-i="${esc(i.id)}">Saída</button> <button class="btn ghost sm" data-perm="estoque" data-m="perda" data-i="${esc(i.id)}">Perda</button></td></tr>`;
        }, 'Nenhum item cadastrado.', 4 + un.length));
      $$('[data-m]', b).forEach((x) => (x.onclick = () => movForm(itens.find((i) => i.id === x.dataset.i), x.dataset.m)));
    } },
    { id: 'movs', label: 'Movimentações', render: async (b) => {
      let qy = db.from('estoque_movs').select('*, estoque_itens!item_id(nome,unidade_medida), unidades!unidade_id(nome)').order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(300);
      if (state.unidadeId) qy = qy.eq('unidade_id', state.unidadeId);
      const list = await q(qy);
      b.innerHTML = table(['Data', 'Item', 'Unidade', 'Tipo', 'Qtd', 'Custo unit.', 'Obs.'],
        rows(list, (m) => `<tr><td>${fmtD(m.data)}</td><td>${esc(m.estoque_itens?.nome)}</td><td>${esc(m.unidades?.nome)}</td><td>${TIPO[m.tipo]}</td><td>${m.tipo === 'entrada' ? '+' : '−'}${n2(m.qtd)} ${esc(m.estoque_itens?.unidade_medida)}</td><td>${m.custo_unit != null ? brl(m.custo_unit) : '–'}</td><td>${esc(m.obs)}</td></tr>`, 'Sem movimentações.', 7));
    } },
    { id: 'itens', label: 'Itens', render: async (b) => {
      const list = await q(db.from('estoque_itens').select('*').order('nome'));
      b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><button class="btn" data-perm="estoque" id="novo">Novo item</button></div>` +
        table(['Nome', 'Categoria', 'Medida', 'Mínimo', 'Situação', ''], rows(list, (i) => `<tr><td>${esc(i.nome)}</td><td>${esc(i.categoria)}</td><td>${esc(i.unidade_medida)}</td><td>${n2(i.minimo)}</td><td>${i.ativo ? 'Ativo' : 'Inativo'}</td><td><button class="btn ghost sm" data-perm="estoque" data-ed="${esc(i.id)}">Editar</button></td></tr>`, 'Nenhum item.', 6));
      $('#novo', b).onclick = () => itemForm();
      $$('[data-ed]', b).forEach((x) => (x.onclick = () => itemForm(list.find((i) => i.id === x.dataset.ed))));
    } },
  ]), 65);
})();
