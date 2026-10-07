/* Marketing: aniversariantes, reativação de pacientes, follow-up de orçamentos e campanhas (origem → retorno financeiro).
   Contato por WhatsApp (link wa.me com mensagem pronta; o envio é feito pelo próprio usuário). */
(() => {
  'use strict';
  const { db, $, $$, esc, brl, num, today, fmtD, toast, state, opts, rows, table, can, q, modal, tabs, register, refresh, porUnidade } = window.MD;

  const MSG = {
    aniv: 'Olá {nome}! A equipe My Dents deseja um feliz aniversário! 🎉 Que seu sorriso seja sempre motivo de alegria. Estamos à disposição!',
    reativ: 'Olá {nome}, tudo bem? Aqui é da My Dents. Faz um tempinho desde sua última visita — que tal agendar uma avaliação para cuidar do seu sorriso?',
    orc: 'Olá {nome}, tudo bem? Aqui é da My Dents. Gostaríamos de saber se ficou alguma dúvida sobre o seu orçamento. Podemos ajudar a agendar o início do tratamento?',
  };
  const wa = (tel, tpl, nome) => {
    let d = String(tel || '').replace(/\D/g, ''); if (!d) return '';
    if (d.length <= 11) d = '55' + d;
    return `https://wa.me/${d}?text=${encodeURIComponent(tpl.replace('{nome}', String(nome).split(' ')[0]))}`;
  };
  const zap = (tel, tpl, nome) => { const u = wa(tel, tpl, nome); return u ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(u)}">WhatsApp</a>` : '<span class="hint">sem telefone</span>'; };
  const tplBox = (k) => `<label>Mensagem (use {nome})<textarea id="tpl" rows="2">${esc(MSG[k])}</textarea></label>`;
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const diasDesde = (d) => Math.floor((Date.now() - new Date(d + 'T12:00:00').getTime()) / 864e5);

  const ORIGENS = ['Indicação', 'Instagram', 'Facebook', 'Google', 'WhatsApp', 'Fachada / passante', 'Convênio / plano', 'Outro'];

  function campanhaForm(c = {}) {
    modal({
      title: c.id ? 'Editar campanha' : 'Nova campanha',
      body: `<label>Nome<input name="nome" required value="${esc(c.nome)}" placeholder="Ex.: Clareamento Dia das Mães"></label>
        <div class="form-row"><label>Canal<input name="canal" value="${esc(c.canal)}" placeholder="Instagram, Google…"></label>
        <label>Investimento (R$)<input name="investimento" type="number" step="0.01" min="0" value="${esc(c.investimento ?? 0)}"></label></div>
        <div class="form-row"><label>Início<input name="inicio" type="date" value="${esc(c.inicio)}"></label><label>Fim<input name="fim" type="date" value="${esc(c.fim)}"></label>
        <label>Situação<select name="ativo">${opts([{ id: 'true', n: 'Ativa' }, { id: 'false', n: 'Encerrada' }], (x) => x.n, null, String(c.ativo ?? true))}</select></label></div>
        <label>Observações<textarea name="obs" rows="2">${esc(c.obs)}</textarea></label>`,
      onSubmit: async (v) => {
        v.ativo = v.ativo === 'true'; v.investimento = num(v.investimento);
        ['inicio', 'fim', 'canal', 'obs'].forEach((k) => { if (!v[k]) v[k] = null; });
        const { error } = await (c.id ? db.from('campanhas').update(v).eq('id', c.id) : db.from('campanhas').insert(v));
        if (error) throw new Error(error.code === '23505' ? 'Já existe uma campanha com esse nome.' : error.message);
        toast('Campanha salva.'); await window.MD.carregarBase(); refresh();
      },
    });
  }

  register('marketing', 'Marketing', (el) => tabs(el, 'marketing', [
    { id: 'aniv', label: 'Aniversariantes', render: async (b) => {
      b.innerHTML = `<div class="actions" style="margin-bottom:.8rem"><select id="m">${meses.map((n, i) => `<option value="${i + 1}"${i + 1 === new Date().getMonth() + 1 ? ' selected' : ''}>${n}</option>`).join('')}</select></div>${tplBox('aniv')}<div id="l"></div>`;
      const all = await q(porUnidade(db.from('pacientes').select('id,nome,telefone,data_nascimento, unidades!unidade_id(nome)').not('data_nascimento', 'is', null).limit(5000)));
      const draw = () => {
        const m = +$('#m', b).value, tpl = $('#tpl', b).value;
        const ls = all.filter((p) => +p.data_nascimento.slice(5, 7) === m).sort((a, c) => a.data_nascimento.slice(8) - c.data_nascimento.slice(8));
        $('#l', b).innerHTML = table(['Dia', 'Paciente', 'Idade', 'Telefone', 'Unidade', ''], rows(ls, (p) => `<tr><td>${p.data_nascimento.slice(8)}/${p.data_nascimento.slice(5, 7)}</td><td>${esc(p.nome)}</td><td>${new Date().getFullYear() - +p.data_nascimento.slice(0, 4)}</td><td>${esc(p.telefone)}</td><td>${esc(p.unidades?.nome)}</td><td>${zap(p.telefone, tpl, p.nome)}</td></tr>`, 'Nenhum aniversariante no mês.', 6));
      };
      $('#m', b).onchange = draw; $('#tpl', b).oninput = draw; draw();
    } },
    { id: 'reativ', label: 'Reativação', render: async (b) => {
      b.innerHTML = `<div class="actions" style="margin-bottom:.8rem"><label style="margin:0">Sem atendimento há mais de <select id="m"><option value="3">3 meses</option><option value="6" selected>6 meses</option><option value="12">12 meses</option></select></label></div>${tplBox('reativ')}<div id="l"></div>`;
      const [pacs, ags] = await Promise.all([q(porUnidade(db.from('pacientes').select('id,nome,telefone, unidades!unidade_id(nome)').limit(5000))), q(db.from('agendamentos').select('paciente_id,data_hora').eq('status', 'realizado').limit(20000))]);
      const last = {}; ags.forEach((a) => { const d = a.data_hora.slice(0, 10); if (!last[a.paciente_id] || d > last[a.paciente_id]) last[a.paciente_id] = d; });
      const draw = () => {
        const lim = +$('#m', b).value * 30, tpl = $('#tpl', b).value;
        const ls = pacs.filter((p) => last[p.id] && diasDesde(last[p.id]) > lim).sort((a, c) => last[a.id].localeCompare(last[c.id]));
        $('#l', b).innerHTML = table(['Paciente', 'Último atendimento', 'Há', 'Telefone', 'Unidade', ''], rows(ls, (p) => `<tr><td>${esc(p.nome)}</td><td>${fmtD(last[p.id])}</td><td>${Math.floor(diasDesde(last[p.id]) / 30)} meses</td><td>${esc(p.telefone)}</td><td>${esc(p.unidades?.nome)}</td><td>${zap(p.telefone, tpl, p.nome)}</td></tr>`, 'Nenhum paciente nesse critério (só contam atendimentos marcados como realizados).', 6));
      };
      $('#m', b).onchange = draw; $('#tpl', b).oninput = draw; draw();
    } },
    { id: 'orc', label: 'Orçamentos pendentes', render: async (b) => {
      b.innerHTML = `${tplBox('orc')}<div id="l"></div>`;
      const ls = await q(porUnidade(db.from('orcamentos').select('id,codigo,criado_em, pacientes!paciente_id(nome,telefone), dentistas!dentista_id(nome), unidades!unidade_id(nome), orcamento_itens(valor_negociado)').eq('status', 'pendente').order('criado_em').limit(500)));
      const draw = () => {
        const tpl = $('#tpl', b).value;
        $('#l', b).innerHTML = table(['#', 'Paciente', 'Dentista', 'Valor', 'Criado há', 'Telefone', ''], rows(ls, (o) => `<tr><td>${o.codigo}</td><td>${esc(o.pacientes?.nome)}</td><td>${esc(o.dentistas?.nome)}</td><td>${brl((o.orcamento_itens || []).reduce((s, i) => s + Number(i.valor_negociado), 0))}</td><td>${diasDesde(o.criado_em.slice(0, 10))} dias</td><td>${esc(o.pacientes?.telefone)}</td><td>${zap(o.pacientes?.telefone, tpl, o.pacientes?.nome || '')}</td></tr>`, 'Nenhum orçamento pendente.', 7));
      };
      $('#tpl', b).oninput = draw; draw();
    } },
    { id: 'camp', label: 'Campanhas', render: async (b) => {
      const [cs, pacs, recs] = await Promise.all([
        q(db.from('campanhas').select('*').order('criado_em', { ascending: false })),
        q(db.from('pacientes').select('id,campanha_id,origem').limit(5000)),
        q(db.from('recebimentos').select('paciente_id,valor').neq('status', 'estornado').limit(20000)).catch(() => []),
      ]);
      const pagou = {}; recs.forEach((r) => { pagou[r.paciente_id] = (pagou[r.paciente_id] || 0) + Number(r.valor); });
      const stat = (c) => { const ps = pacs.filter((p) => p.campanha_id === c.id); const rec = ps.reduce((s, p) => s + (pagou[p.id] || 0), 0); return { n: ps.length, rec }; };
      const porOrigem = {}; pacs.forEach((p) => { const k = p.origem || '(não informada)'; const x = (porOrigem[k] ||= { n: 0, rec: 0 }); x.n++; x.rec += pagou[p.id] || 0; });
      b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><button class="btn" data-perm="marketing" id="novo">Nova campanha</button></div>` +
        table(['Campanha', 'Canal', 'Período', 'Investimento', 'Pacientes captados', 'Recebido', 'Retorno', 'Situação', ''],
          rows(cs, (c) => { const s = stat(c); return `<tr><td>${esc(c.nome)}</td><td>${esc(c.canal)}</td><td>${c.inicio ? fmtD(c.inicio) : '–'}${c.fim ? ' a ' + fmtD(c.fim) : ''}</td><td>${brl(c.investimento)}</td><td>${s.n}</td><td>${brl(s.rec)}</td><td>${Number(c.investimento) > 0 ? (s.rec / c.investimento).toFixed(1) + 'x' : '–'}</td><td>${c.ativo ? 'Ativa' : 'Encerrada'}</td><td><button class="btn ghost sm" data-perm="marketing" data-ed="${esc(c.id)}">Editar</button></td></tr>`; }, 'Nenhuma campanha cadastrada.', 9)) +
        '<h4 style="margin-top:1.4rem">Pacientes por origem</h4>' +
        table(['Origem', 'Pacientes', 'Total recebido'], rows(Object.entries(porOrigem).sort((a, c) => c[1].n - a[1].n), ([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${brl(v.rec)}</td></tr>`, 'Sem dados.', 3)) +
        '<p class="hint">A origem e a campanha são informadas no cadastro do paciente. "Recebido" soma tudo o que o paciente já pagou.</p>';
      $('#novo', b).onclick = () => campanhaForm();
      $$('[data-ed]', b).forEach((x) => (x.onclick = () => campanhaForm(cs.find((c) => c.id === x.dataset.ed))));
    } },
  ]), 85);
  window.MD.ORIGENS = ORIGENS;
})();
