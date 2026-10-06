/* Caixa por unidade e dia: abrir → receber → conferir → fechar → reabrir só com permissão. */
(() => {
  'use strict';
  const { db, $, $$, esc, brl, num, today, fmtD, fmtDT, toast, state, opts, rows, table, badge, can, rpc, q, modal, register, refresh } = window.MD;

  register('caixa', 'Caixa', async (el) => {
    const unidade = state.unidadeId || state.unidades[0]?.id;
    const dia = el.dataset.dia || today();
    el.innerHTML = `<div class="actions" style="margin-bottom:1rem">
        <select id="uni" aria-label="Unidade">${opts(state.unidades, (u) => u.nome, null, unidade)}</select>
        <input type="date" id="dia" value="${dia}"></div><div id="corpo"></div>`;
    const draw = async () => {
      const uid = $('#uni', el).value, d = $('#dia', el).value || today();
      const turnos = await q(db.from('caixa_turnos').select('*').eq('unidade_id', uid).order('data', { ascending: false }).limit(15));
      const t = turnos.find((x) => x.data === d);
      const corpo = $('#corpo', el);
      if (!t) {
        const prev = turnos.find((x) => x.data < d);
        corpo.innerHTML = `<div class="card"><p>Nenhum caixa aberto para esta unidade em ${fmtD(d)}.</p>
          <button class="btn" id="abrir">Abrir caixa</button></div>${historico(turnos)}`;
        $('#abrir', corpo).onclick = () => modal({
          title: `Abrir caixa — ${fmtD(d)}`, submit: 'Abrir',
          body: `<label>Saldo inicial em espécie<input name="saldo" type="number" step="0.01" min="0" value="${esc(prev?.saldo_contado ?? 0)}"></label>
            <p class="hint">Sugerido: o saldo contado no último fechamento.</p>`,
          onSubmit: async (v) => { await rpc('abrir_caixa', { p_unidade: uid, p_data: d, p_saldo_inicial: num(v.saldo) }); toast('Caixa aberto.'); refresh(); },
        });
        return;
      }
      const r = await rpc('caixa_resumo', { p_turno: t.id });
      const recs = await q(db.from('recebimentos').select('*, pacientes!paciente_id(nome)').eq('turno_id', t.id).order('codigo'));
      const movs = await q(db.from('caixa_movs').select('*').eq('turno_id', t.id).order('criado_em'));
      const aberto = t.status === 'aberto';
      corpo.innerHTML = `<div class="card"><div class="actions" style="justify-content:space-between">
          <div><b>Caixa de ${fmtD(t.data)}</b> ${badge(aberto ? 'agendado' : 'realizado')} ${aberto ? 'aberto' : 'fechado'}${t.reaberturas ? ` · reaberto ${t.reaberturas}×` : ''}</div>
          <div class="actions">
            ${aberto ? '<button class="btn ghost sm" id="mov">Sangria / suprimento</button>' : ''}
            ${aberto ? `<button class="btn sm" id="fechar" ${can('fechar_caixa') ? '' : 'disabled title="Somente quem tem permissão de fechar caixa"'}>Fechar caixa</button>`
                     : `<button class="btn sm" id="reabrir" ${can('fechar_caixa') ? '' : 'disabled title="Somente quem tem permissão de fechar caixa"'}>Reabrir caixa</button>`}
          </div></div>
          <div class="grid" style="margin:1rem 0 0">
            <div class="stat"><span>Saldo inicial</span><b>${brl(r.saldo_inicial)}</b></div>
            <div class="stat"><span>Dinheiro</span><b>${brl(r.dinheiro)}</b></div>
            <div class="stat"><span>PIX</span><b>${brl(r.pix)}</b></div>
            <div class="stat"><span>Cartão crédito</span><b>${brl(r.credito)}</b></div>
            <div class="stat"><span>Cartão débito</span><b>${brl(r.debito)}</b></div>
            <div class="stat"><span>Espécie esperada</span><b>${brl(r.esperado)}</b></div>
          </div>
          ${!aberto ? `<p class="hint">Contado ${brl(t.saldo_contado)} · esperado ${brl(t.saldo_esperado)} · diferença ${brl(Number(t.saldo_contado) - Number(t.saldo_esperado))}. Caixa fechado não aceita recebimentos nem estornos.</p>` : ''}</div>
        <h3>Recebimentos do dia</h3>
        ${table(['#', 'Paciente', 'Meio', 'Valor', 'Situação'], rows(recs, (x) => `<tr><td>${x.codigo}</td><td>${esc(x.pacientes?.nome)}</td><td>${esc(x.meio.replace('_', ' '))}</td><td>${brl(x.valor)}</td><td>${esc(x.status)}</td></tr>`, 'Sem recebimentos.', 5))}
        <h3>Sangrias e suprimentos</h3>
        ${table(['Hora', 'Tipo', 'Valor', 'Descrição'], rows(movs, (m) => `<tr><td>${fmtDT(m.criado_em)}</td><td>${esc(m.tipo)}</td><td>${brl(m.valor)}</td><td>${esc(m.descricao)}</td></tr>`, 'Nenhuma movimentação.', 4))}
        ${historico(turnos)}`;
      const mov = $('#mov', corpo);
      if (mov) mov.onclick = () => modal({
        title: 'Sangria / suprimento', submit: 'Registrar',
        body: `<label>Tipo<select name="tipo">${opts([{ id: 'sangria', n: 'Sangria (retirada)' }, { id: 'suprimento', n: 'Suprimento (entrada)' }], (x) => x.n, null, 'sangria')}</select></label>
          <label>Valor<input name="valor" type="number" step="0.01" min="0.01" required></label><label>Descrição<input name="descricao"></label>`,
        onSubmit: async (v) => { await rpc('registrar_mov_caixa', { p_turno: t.id, p_tipo: v.tipo, p_valor: num(v.valor), p_desc: v.descricao }); toast('Registrado.'); refresh(); },
      });
      const fe = $('#fechar', corpo);
      if (fe) fe.onclick = () => modal({
        title: 'Fechar caixa', submit: 'Fechar caixa',
        body: `<p class="hint">Espécie esperada: <b>${brl(r.esperado)}</b></p>
          <label>Saldo contado em espécie<input name="contado" type="number" step="0.01" min="0" required value="${Number(r.esperado).toFixed(2)}"></label>
          <label>Observação<textarea name="obs" rows="2"></textarea></label>`,
        onSubmit: async (v) => { await rpc('fechar_caixa', { p_turno: t.id, p_saldo_contado: num(v.contado), p_obs: v.obs }); toast('Caixa fechado.'); refresh(); },
      });
      const re = $('#reabrir', corpo);
      if (re) re.onclick = async () => {
        if (!confirm('Reabrir este caixa? Depois de alterar, feche-o novamente.')) return;
        try { await rpc('reabrir_caixa', { p_turno: t.id }); toast('Caixa reaberto.'); refresh(); } catch (e) { toast(e.message, true); }
      };
    };
    const historico = (turnos) => `<h3>Últimos caixas</h3>` + table(['Data', 'Situação', 'Inicial', 'Esperado', 'Contado', 'Diferença'], rows(turnos, (x) =>
      `<tr><td>${fmtD(x.data)}</td><td>${esc(x.status)}</td><td>${brl(x.saldo_inicial)}</td><td>${x.saldo_esperado != null ? brl(x.saldo_esperado) : '–'}</td>
       <td>${x.saldo_contado != null ? brl(x.saldo_contado) : '–'}</td><td>${x.saldo_contado != null ? brl(Number(x.saldo_contado) - Number(x.saldo_esperado)) : '–'}</td></tr>`, 'Sem histórico.', 6));
    $('#uni', el).onchange = draw;
    $('#dia', el).onchange = draw;
    await draw();
  }, 60);
})();
