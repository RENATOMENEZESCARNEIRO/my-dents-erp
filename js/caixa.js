/* Caixa por unidade e dia: abrir → receber → conferir → fechar → reabrir só com permissão. */
(() => {
  'use strict';
  const { db, $, $$, esc, brl, num, today, fmtD, fmtDT, toast, state, opts, rows, table, badge, can, rpc, q, modal, register, refresh } = window.MD;

  register('caixa', 'Fluxo de caixa', async (el) => {
    const unidade = state.unidadeId || state.unidades[0]?.id;
    const dia = el.dataset.dia || today();
    el.innerHTML = `<div class="actions" style="margin-bottom:1rem">
        <select id="uni" aria-label="Unidade">${opts(state.unidades, (u) => u.nome, null, unidade)}</select>
        <input type="date" id="dia" value="${dia}"></div><div id="corpo"></div>`;
    const draw = async () => {
      const uid = $('#uni', el).value, d = $('#dia', el).value || today();
      const turnos = await q(db.from('caixa_turnos').select('*').eq('unidade_id', uid).order('data', { ascending: false }).limit(15));
      let t = turnos.find((x) => x.data === d);
      const corpo = $('#corpo', el);
      if (!t && d === today()) {   // abertura automática do dia
        const { error } = await db.rpc('garantir_caixa', { p_unidade: uid, p_data: d });
        if (!error) { const n = await q(db.from('caixa_turnos').select('*').eq('unidade_id', uid).eq('data', d)); if (n[0]) { t = n[0]; turnos.unshift(t); } }
      }
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
      const recs = await q(db.from('recebimentos').select('*, pacientes!paciente_id(nome), dentistas!dentista_id(nome)').eq('turno_id', t.id).order('codigo'));
      const desp = await q(db.from('lancamentos').select('*, contas_bancarias!conta_id(nome)').eq('unidade_id', uid).eq('data', d).eq('estornado', false).in('tipo', ['despesa', 'receita']).eq('origem', 'manual').order('codigo'));
      const movs = await q(db.from('caixa_movs').select('*').eq('turno_id', t.id).order('criado_em'));
      const aberto = t.status === 'aberto';
      corpo.innerHTML = `<div class="card"><div class="actions" style="justify-content:space-between">
          <div><b>Caixa de ${fmtD(t.data)}</b> ${badge(aberto ? 'agendado' : 'realizado')} ${aberto ? 'aberto' : 'fechado'}${t.reaberturas ? ` · reaberto ${t.reaberturas}×` : ''}</div>
          <div class="actions">
            <button class="btn ghost sm" id="imprimir">Imprimir</button>
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
        <p class="hint">Valores brutos, como o paciente pagou. O líquido do cartão aparece somente no Financeiro.</p>
        ${table(['#', 'Paciente', 'Forma de pagamento', 'CV', 'Valor bruto', 'Dentista', 'Situação'], rows(recs, (x) => `<tr><td>${x.codigo}</td><td>${esc(x.pacientes?.nome)}</td><td>${esc(({ pix: 'PIX', dinheiro: 'Dinheiro', credito: 'Cartão de crédito', debito: 'Cartão de débito' })[x.meio] || x.meio)}${x.meio === 'credito' ? ` em ${x.parcelas}x` : ''}</td><td>${esc(x.cv)}</td><td>${brl(x.valor)}</td><td>${esc(x.dentistas?.nome)}</td><td>${esc(x.status)}</td></tr>`, 'Sem recebimentos.', 7))}
        <h3>Receitas e despesas lançadas no dia</h3>
        ${table(['#', 'Tipo', 'Valor', 'Conta', 'Categoria', 'Descrição'], rows(desp, (l) => `<tr><td>${l.codigo}</td><td>${l.tipo === 'despesa' ? 'Despesa' : 'Receita'}</td><td>${brl(l.valor)}</td><td>${esc(l.contas_bancarias?.nome)}</td><td>${esc([l.grupo, l.subgrupo].filter(Boolean).join(' › '))}</td><td>${esc(l.descricao)}</td></tr>`, 'Nenhum lançamento manual.', 6))}
        <h3>Sangrias e suprimentos</h3>
        ${table(['Hora', 'Tipo', 'Valor', 'Descrição'], rows(movs, (m) => `<tr><td>${fmtDT(m.criado_em)}</td><td>${esc(m.tipo)}</td><td>${brl(m.valor)}</td><td>${esc(m.descricao)}</td></tr>`, 'Nenhuma movimentação.', 4))}
        ${historico(turnos)}`;
      $('#imprimir', corpo).onclick = () => imprimir(t, r, recs, movs, desp);
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
    const imprimir = (t, r, recs, movs, desp) => {
      const e = (x) => String(x ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      const un = state.unidades.find((u) => u.id === t.unidade_id)?.nome || '';
      const forma = (x) => (({ pix: 'PIX', dinheiro: 'Dinheiro', credito: 'Cartão de crédito', debito: 'Cartão de débito' })[x.meio] || x.meio) + (x.meio === 'credito' ? ` em ${x.parcelas}x` : '');
      const tb = (h, ls) => `<table><thead><tr>${h.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${ls.length ? ls.map((l) => `<tr>${l.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${h.length}">Nenhum registro.</td></tr>`}</tbody></table>`;
      const w = window.open('', '_blank');
      if (!w) return toast('Libere pop-ups para imprimir.', true);
      w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Fluxo de caixa ${e(fmtD(t.data))} — ${e(un)}</title>
<style>body{font:12px Arial,sans-serif;margin:24px;color:#222}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}p{margin:0 0 6px;color:#555}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}th{background:#eef4fa;font-size:11px;text-transform:uppercase}.sig{margin-top:48px;display:flex;gap:48px}.sig div{flex:1;border-top:1px solid #333;padding-top:4px;text-align:center}</style></head><body>
<h1>My Dents — Fluxo de caixa</h1><p>${e(un)} · ${e(fmtD(t.data))} · ${t.status === 'aberto' ? 'caixa ABERTO' : 'caixa FECHADO'} · impresso em ${new Date().toLocaleString('pt-BR')}</p>
<h2>Resumo (valores brutos)</h2>${tb(['Saldo inicial', 'Dinheiro', 'PIX', 'Cartão crédito', 'Cartão débito', 'Suprimentos', 'Sangrias', 'Espécie esperada'], [[brl(r.saldo_inicial), brl(r.dinheiro), brl(r.pix), brl(r.credito), brl(r.debito), brl(r.suprimentos), brl(r.sangrias), brl(r.esperado)]])}
${t.status === 'fechado' ? `<p>Contado em espécie ${brl(t.saldo_contado)} · diferença ${brl(Number(t.saldo_contado) - Number(t.saldo_esperado))}${t.observacao ? ' · ' + e(t.observacao) : ''}</p>` : ''}
<h2>Recebimentos de pacientes</h2>${tb(['#', 'Paciente', 'Forma', 'CV', 'Valor bruto', 'Dentista', 'Situação'], recs.map((x) => [x.codigo, x.pacientes?.nome, forma(x), x.cv || '', brl(x.valor), x.dentistas?.nome, x.status]))}
<h2>Receitas e despesas lançadas</h2>${tb(['#', 'Tipo', 'Valor', 'Conta', 'Descrição'], desp.map((l) => [l.codigo, l.tipo === 'despesa' ? 'Despesa' : 'Receita', brl(l.valor), l.contas_bancarias?.nome, l.descricao || '']))}
<h2>Sangrias e suprimentos</h2>${tb(['Hora', 'Tipo', 'Valor', 'Descrição'], movs.map((m) => [fmtDT(m.criado_em), m.tipo, brl(m.valor), m.descricao || '']))}
<div class="sig"><div>Responsável pelo caixa</div><div>Conferência (Financeiro)</div></div>
<script>onload=()=>{print()}<\/script></body></html>`);
      w.document.close();
    };
    const historico = (turnos) => `<h3>Últimos caixas</h3>` + table(['Data', 'Situação', 'Inicial', 'Esperado', 'Contado', 'Diferença'], rows(turnos, (x) =>
      `<tr><td>${fmtD(x.data)}</td><td>${esc(x.status)}</td><td>${brl(x.saldo_inicial)}</td><td>${x.saldo_esperado != null ? brl(x.saldo_esperado) : '–'}</td>
       <td>${x.saldo_contado != null ? brl(x.saldo_contado) : '–'}</td><td>${x.saldo_contado != null ? brl(Number(x.saldo_contado) - Number(x.saldo_esperado)) : '–'}</td></tr>`, 'Sem histórico.', 6));
    $('#uni', el).onchange = draw;
    $('#dia', el).onchange = draw;
    await draw();
  }, 60);
})();
