/* My Dents — núcleo (auth, navegação, helpers, modal, abas) + telas Início, Pacientes, Agenda e Planos.
   Os demais módulos (cadastros, orcamentos, debitos, caixa, producao, financeiro) se registram com MD.register(). */
(() => {
  'use strict';

  const cfg = window.MYDENTS_CONFIG || {};
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const digits = (v) => String(v || '').replace(/\D/g, '');
  const fmtCPF = (v) => digits(v).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  const fmtDT = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const fmtD = (d) => (d ? new Date(String(d).slice(0, 10) + 'T00:00').toLocaleDateString('pt-BR') : '–');
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (fuso local)
  const monthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv-SE');
  const monthEnd = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('sv-SE');
  const daysTo = (d) => Math.round((new Date(String(d).slice(0, 10) + 'T00:00') - new Date(today() + 'T00:00')) / 86400000);

  const state = { unidades: [], dentistas: [], pacientes: [], planos: [], procedimentos: [], contas: [], perfil: {}, user: null, unidadeId: '' };

  let toastTimer;
  function toast(msg, error = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (error ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ''), error ? 6000 : 3500);
  }

  function validarCPF(cpf) {
    cpf = digits(cpf);
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    for (const t of [9, 10]) {
      let s = 0;
      for (let i = 0; i < t; i++) s += Number(cpf[i]) * (t + 1 - i);
      if (((s * 10) % 11) % 10 !== Number(cpf[t])) return false;
    }
    return true;
  }

  const opts = (list, label, placeholder = 'Selecione…', selected = '') =>
    (placeholder === null ? '' : `<option value="">${esc(placeholder)}</option>`) +
    list.map((i) => `<option value="${esc(i.id ?? i.value)}"${String(i.id ?? i.value) === String(selected) ? ' selected' : ''}>${esc(label(i))}</option>`).join('');

  const rows = (list, fn, vazio, colspan) =>
    list.length ? list.map(fn).join('') : `<tr><td colspan="${colspan}" class="empty">${esc(vazio)}</td></tr>`;

  const table = (head, body) =>
    `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;

  const badge = (s) => `<span class="badge ${esc(s)}">${esc(String(s).replace('_', ' '))}</span>`;
  const porUnidade = (q, col = 'unidade_id') => (state.unidadeId ? q.eq(col, state.unidadeId) : q);
  const can = (p) => !!(state.perfil.ativo && (state.perfil.admin || state.perfil[p] || state.perfil.permissoes?.[p]));
  const PERMISSOES = [
    ['Pacientes e agenda', [['pacientes_editar', 'Cadastrar/editar pacientes'], ['agenda_editar', 'Agendar e alterar agenda']]],
    ['Orçamentos', [['orcamentos_criar', 'Criar/editar orçamentos'], ['orcamentos_aprovar', 'Aprovar orçamentos (gera débito)']]],
    ['Prótese e estoque', [['proteses', 'Pedidos de prótese'], ['estoque', 'Estoque (entradas, saídas, itens)']]],
    ['Clínico', [['tratamentos_evoluir', 'Evoluir tratamentos'], ['prontuario', 'Anamnese, anotações e documentos'], ['imagens', 'Imagens do paciente']]],
    ['Recebimentos e caixa', [['debitos_receber', 'Receber débitos'], ['estornar_recebimento', 'Estornar recebimentos'], ['caixa_abrir', 'Abrir caixa e lançar movimentos'], ['fechar_caixa', 'Fechar/reabrir caixa']]],
    ['Financeiro e produção', [['financeiro', 'Financeiro completo (lançamentos, DRE, pagamentos, conferência)'], ['alterar_comissao', 'Alterar comissões'], ['nfse', 'Notas fiscais (NFS-e)'], ['marketing', 'Marketing e campanhas'], ['producao_ver', 'Ver produção e comissões']]],
    ['Administração', [['cadastros_editar', 'Cadastros (dentistas, procedimentos, planos)'], ['admin', 'Administrador (tudo, inclusive usuários)']]],
  ];
  const CARGOS = {
    Gerente: ['pacientes_editar', 'agenda_editar', 'orcamentos_criar', 'orcamentos_aprovar', 'tratamentos_evoluir', 'prontuario', 'imagens', 'debitos_receber', 'estornar_recebimento', 'caixa_abrir', 'fechar_caixa', 'financeiro', 'alterar_comissao', 'producao_ver', 'cadastros_editar', 'proteses', 'estoque', 'nfse', 'marketing'],
    Dentista: ['agenda_editar', 'orcamentos_criar', 'tratamentos_evoluir', 'prontuario', 'imagens', 'proteses'],
    'Secretário(a)': ['pacientes_editar', 'agenda_editar', 'orcamentos_criar', 'orcamentos_aprovar', 'prontuario', 'imagens', 'debitos_receber', 'caixa_abrir', 'proteses', 'estoque', 'marketing'],
    Financeiro: ['financeiro', 'nfse', 'fechar_caixa', 'alterar_comissao', 'producao_ver', 'estornar_recebimento', 'caixa_abrir', 'debitos_receber'],
  };
  const VIEW_PERM = { caixa: ['caixa_abrir', 'fechar_caixa'], producao: ['producao_ver', 'financeiro'], financeiro: ['financeiro'], recebimentos: ['debitos_receber', 'estornar_recebimento', 'financeiro'], creditos: ['debitos_receber', 'estornar_recebimento', 'financeiro'], cadastros: ['cadastros_editar'], proteses: ['proteses', 'financeiro'], estoque: ['estoque'], nfse: ['nfse'], marketing: ['marketing'] };
  const podeVer = (id) => {
    const g = views.find((x) => x.id === id && x.group);
    if (g) return g.group.some(podeVer);
    return !VIEW_PERM[id] || VIEW_PERM[id].some(can);
  };
  const aplicarPermissoes = (raiz) => $$('[data-perm]', raiz).forEach((e) => { if (!can(e.dataset.perm)) e.remove(); });
  const dentistasDaUnidade = (uid) => (uid ? state.dentistas.filter((d) => d.unidade_id === uid || (d.unidades_ids || []).includes(uid)) : state.dentistas);
  const nomeUnidade = () => state.unidades.find((u) => u.id === state.unidadeId)?.nome || 'Todas as unidades';

  async function rpc(name, args) {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  async function q(promise) {
    const { data, error, count } = await promise;
    if (error) throw new Error(error.message);
    return count != null && data == null ? count : data;
  }

  /* ---------- formulários e modal ---------- */
  function formValues(form) {
    const o = {};
    for (const [k, v] of new FormData(form)) o[k] = typeof v === 'string' && v.trim() === '' ? null : v;
    return o;
  }

  function modal({ title, body, submit = 'Salvar', wide = false, onSubmit, onOpen, extra = '' }) {
    const dlg = document.createElement('dialog');
    if (wide) dlg.className = 'wide';
    dlg.innerHTML = `<form novalidate><h3>${esc(title)}</h3><div class="modal-body">${body}</div>
      <div class="form-actions">${extra}<button type="button" class="btn ghost" data-close>${onSubmit ? 'Cancelar' : 'Fechar'}</button>
      ${onSubmit ? `<button class="btn" data-submit>${esc(submit)}</button>` : ''}</div></form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    dlg.querySelector('[data-close]').onclick = () => dlg.close();
    dlg.addEventListener('close', () => dlg.remove());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!onSubmit) return;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const btn = form.querySelector('[data-submit]');
      btn.disabled = true;
      try {
        const r = await onSubmit(formValues(form), form, dlg);
        if (r !== false) dlg.close();
      } catch (err) {
        if (!err?.cancel) toast(err?.message || String(err), true);
      } finally { btn.disabled = false; }
    });
    dlg.showModal();
    if (onOpen) onOpen(form, dlg);
    return dlg;
  }

  const tabState = {};
  function tabs(host, id, list) {
    const cur = list.some((t) => t.id === tabState[id]) ? tabState[id] : list[0].id;
    host.innerHTML = `<div class="tabs">${list.map((t) => `<button class="tab${t.id === cur ? ' active' : ''}" data-tab="${t.id}">${esc(t.label)}</button>`).join('')}</div><div class="tab-body"></div>`;
    $$('.tab', host).forEach((b) => (b.onclick = () => { tabState[id] = b.dataset.tab; tabs(host, id, list); }));
    return Promise.resolve(list.find((t) => t.id === cur).render($('.tab-body', host))).catch((e) => toast(e.message, true));
  }

  /* ---------- registro de telas ---------- */
  const views = [];
  const register = (id, title, render, order = 100, pai) => { views.push({ id, title, render, order, pai }); views.sort((a, b) => a.order - b.order); };
  /* Grupo de telas: vira um item de menu com abas; cada aba é uma tela já registrada. */
  function group(id, title, order, list) {
    list.forEach((c) => { const v = views.find((x) => x.id === c.view); if (v) v.pai = id; });
    views.push({ id, title, order, group: list.map((c) => c.view), render: (el) => {
      const abas = list.filter((c) => podeVer(c.view)).map((c) => ({ id: c.view, label: c.label, render: (b) => views.find((x) => x.id === c.view).render(b) }));
      return tabs(el, id, abas);
    } });
    views.sort((a, b) => a.order - b.order);
  }
  const ICONS = {
    dashboard: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
    pacientes: '<path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z"/>',
    agenda: '<path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V9h14v11z"/>',
    comercial: '<path d="M16 6l2.3 2.3-4.9 4.900-4-4L2 16.600 3.400 18l6-6 4 4 6.300-6.300L22 12V6h-6z"/>',
    gestao: '<path d="M19 3h-4.200c-.4-1.200-1.500-2-2.800-2s-2.400.8-2.800 2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 0a1 1 0 110 2 1 1 0 010-2zm-2 14l-4-4 1.400-1.400L10 14.200l6.600-6.600L18 9l-8 8z"/>',
    orcamentos: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13h8v2H8v-2zm0 4h8v2H8v-2z"/>',
    debitos: '<path d="M11.8 10.9c-2.3-.6-3-1.2-3-2.1 0-1.1 1-1.8 2.7-1.8 1.8 0 2.4.9 2.5 2h2.2c-.1-1.7-1.100-3.200-3.200-3.700V3h-3v2.300c-1.900.4-3.400 1.600-3.400 3.500 0 2.200 1.800 3.300 4.500 4 2.400.600 2.900 1.500 2.900 2.300 0 .6-.4 1.900-2.700 1.900-2 0-2.800-.9-2.900-2H6.200c.1 2.100 1.600 3.300 3.300 3.700V21h3v-2.300c1.900-.4 3.400-1.500 3.400-3.400 0-2.700-2.300-3.600-4.100-4.400z"/>',
    caixa: '<path d="M21 7H3a1 1 0 00-1 1v11a1 1 0 001 1h18a1 1 0 001-1V8a1 1 0 00-1-1zm-3 8a1.500 1.500 0 110-3 1.500 1.500 0 010 3zM19 5V4H5a2 2 0 00-2 2v1h16V5z"/>',
    producao: '<path d="M3 3v18h18v-2H5V3H3zm4 10h3v5H7v-5zm5-6h3v11h-3V7zm5 3h3v8h-3v-8z"/>',
    financeiro: '<path d="M4 10h3v7H4v-7zm6.500 0h3v7h-3v-7zM2 19h20v3H2v-3zm15-9h3v7h-3v-7zM12 1L2 6v2h20V6L12 1z"/>',
    proteses: '<path d="M12 2C8.700 2 6 4 6 7c0 2 .8 3.200 1.500 5 .6 1.600.9 4 1.500 8 .1.600.600 1 1.200 1 .6 0 1-.400 1.200-1l.6-4h1l.6 4c.2.600.6 1 1.200 1 .6 0 1.100-.400 1.200-1 .6-4 .9-6.400 1.500-8C17.200 10.200 18 9 18 7c0-3-2.700-5-6-5z"/>',
    estoque: '<path d="M20 2H4a1 1 0 00-1 1v4a1 1 0 001 1h1v12a1 1 0 001 1h12a1 1 0 001-1V8h1a1 1 0 001-1V3a1 1 0 00-1-1zm-5 11H9v-2h6v2zm4-7H5V4h14v2z"/>',
    fiscal: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 12h8v2H8v-2zm0 4h5v2H8v-2z"/>',
    nfse: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 12h8v2H8v-2zm0 4h5v2H8v-2z"/>',
    marketing: '<path d="M3 10v4a1 1 0 001 1h2l4 4V5L6 9H4a1 1 0 00-1 1zm13.500 2A4.500 4.500 0 0014 7.970v8.050A4.500 4.500 0 0016.500 12zM14 3.230v2.060a7 7 0 010 13.420v2.060a9 9 0 000-17.540z"/>',
    planos: '<path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>',
    cadastros: '<path d="M19.400 13a7.800 7.800 0 000-2l2.100-1.600a.5.500 0 00.100-.6l-2-3.500a.5.500 0 00-.6-.2l-2.500 1a7.300 7.300 0 00-1.700-1l-.4-2.600a.5.500 0 00-.5-.4h-4a.5.500 0 00-.5.400L9.600 5.500a7.300 7.300 0 00-1.700 1l-2.500-1a.5.500 0 00-.6.200l-2 3.500a.5.500 0 00.1.600L4.600 11a7.800 7.800 0 000 2l-2.100 1.600a.5.500 0 00-.1.600l2 3.500c.1.200.4.300.6.200l2.500-1c.5.400 1.100.7 1.700 1l.4 2.600c0 .2.200.4.500.4h4c.3 0 .5-.2.5-.4l.4-2.600c.6-.3 1.200-.6 1.700-1l2.500 1c.2.100.5 0 .6-.2l2-3.500a.5.500 0 00-.1-.6L19.400 13zM12 15.500a3.500 3.500 0 110-7 3.500 3.500 0 010 7z"/>'
  };
  ICONS.configuracoes = ICONS.cadastros;
  const iconeNav = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id] || '<circle cx="12" cy="12" r="5"/>'}</svg>`;
  let navToken = 0;

  async function navigate() {
    const [vid, arg] = location.hash.slice(1).split('/');
    let v = views.find((x) => x.id === vid) || views[0];
    const g = v.pai && views.find((x) => x.id === v.pai && x.group);
    if (g) { tabState[g.id] = v.id; v = g; }
    if (!podeVer(v.id)) v = views[0];
    const token = ++navToken;
    $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === (v.pai || v.id)));
    $('#view-title').textContent = v.title;
    $('#sidebar').classList.remove('open');
    const sec = document.createElement('section');
    sec.className = 'view';
    try { await v.render(sec, arg); } catch (e) { sec.innerHTML = `<div class="card empty">Erro ao carregar: ${esc(e.message)}</div>`; }
    if (token !== navToken) return;
    $('#view-root').replaceChildren(sec);
  }
  const refresh = () => navigate();

  /* ---------- dados-base ---------- */
  async function carregarBase() {
    const get = (p) => p.then((r) => { if (r.error) throw new Error(r.error.message); return r.data; });
    const [u, d, p, pl, pr, c, pf, cp, hr] = await Promise.all([
      get(db.from('unidades').select('*').eq('ativo', true).order('nome')),
      get(db.from('dentistas').select('*, unidades!unidade_id(nome), dentista_unidades(unidade_id, minutos_consulta, almoco_ini, almoco_fim)').eq('ativo', true).order('nome')),
      get(db.from('pacientes').select('*, unidades!unidade_id(nome)').order('nome')),
      get(db.from('planos').select('*').eq('ativo', true).order('valor_mensal')),
      get(db.from('procedimentos').select('*').order('nome')),
      get(db.from('contas_bancarias').select('*').eq('ativo', true).order('nome')),
      get(db.from('perfis_usuario').select('*').eq('user_id', state.user.id)),
      (async () => get(db.from('campanhas').select('id,nome,ativo').order('nome')))().catch(() => []),
      (async () => get(db.from('dentista_horarios').select('*')))().catch(() => []),
    ]);
    d.forEach((x) => { x.unidades_ids = (x.dentista_unidades || []).map((r) => r.unidade_id); });
    Object.assign(state, { unidades: u, dentistas: d, pacientes: p, planos: pl, procedimentos: pr, contas: c, perfil: pf[0] || {}, campanhas: cp, horarios: hr });
    $('#filtro-unidade').innerHTML = opts(state.unidades, (x) => x.nome, 'Todas as unidades', state.unidadeId);
  }

  /* ---------- Início ---------- */
  register('dashboard', 'Início', async (el) => {
    el.innerHTML = `<div class="grid">
        <div class="card stat"><span>Atendimentos hoje</span><b id="st-hoje">–</b></div>
        <div class="card stat"><span>Confirmados hoje</span><b id="st-conf">–</b></div>
        <div class="card stat"><span>Pacientes</span><b id="st-pac">–</b></div>
        <div class="card stat"><span>Débitos em aberto</span><b id="st-deb">–</b></div>
        <div class="card stat"><span>Cartão a receber</span><b id="st-cart">–</b></div>
        <div class="card stat"><span>Comissões a pagar</span><b id="st-com">–</b></div>
      </div>
      <div class="card" id="alertas" hidden></div>
      <div class="card"><h3 style="margin-top:0">Próximos atendimentos</h3><div id="proximos"></div></div>`;
    const ini = new Date(today() + 'T00:00:00').toISOString();
    const fim = new Date(today() + 'T23:59:59').toISOString();
    const [hoje, pac, deb, cart, prev, prox] = await Promise.all([
      porUnidade(db.from('agendamentos').select('status').gte('data_hora', ini).lte('data_hora', fim).neq('status', 'cancelado')),
      porUnidade(db.from('pacientes').select('id', { count: 'exact', head: true })),
      porUnidade(db.from('debitos').select('saldo').in('status', ['pendente', 'parcial'])),
      porUnidade(db.from('recebimentos').select('valor_liquido').eq('status', 'previsto')),
      db.from('previsoes').select('*, dentistas!dentista_id(nome)').eq('status', 'prevista').order('vencimento'),
      porUnidade(db.from('agendamentos').select('*, pacientes!paciente_id(nome), dentistas!dentista_id(nome), unidades!unidade_id(nome)')
        .gte('data_hora', new Date().toISOString()).neq('status', 'cancelado').order('data_hora').limit(8)),
    ]);
    const sum = (r, k) => (r.data || []).reduce((s, x) => s + Number(x[k]), 0);
    $('#st-hoje', el).textContent = hoje.data?.length ?? '–';
    $('#st-conf', el).textContent = hoje.data?.filter((a) => a.status === 'confirmado').length ?? '–';
    $('#st-pac', el).textContent = pac.count ?? '–';
    $('#st-deb', el).textContent = brl(sum(deb, 'saldo'));
    $('#st-cart', el).textContent = brl(sum(cart, 'valor_liquido'));
    $('#st-com', el).textContent = brl((prev.data || []).filter((p) => p.origem === 'producao').reduce((s, p) => s + Number(p.valor), 0));
    const urgentes = (prev.data || []).filter((p) => daysTo(p.vencimento) <= 5);
    if (urgentes.length) {
      const box = $('#alertas', el);
      box.hidden = false;
      box.innerHTML = `<h3 style="margin-top:0">Pagamentos a vencer</h3>` + urgentes.map((p) => {
        const d = daysTo(p.vencimento);
        return `<div class="alerta ${d < 0 ? 'vencido' : 'atencao'}">${d < 0 ? 'Vencido' : 'Vence'} ${fmtD(p.vencimento)} · ${esc(p.dentistas?.nome || p.fornecedor || p.descricao)} · ${brl(p.valor)}</div>`;
      }).join('');
    }
    $('#proximos', el).innerHTML = table(['Quando', 'Paciente', 'Dentista', 'Unidade', 'Status'], rows(prox.data || [], (a) =>
      `<tr><td>${fmtDT(a.data_hora)}</td><td>${esc(a.pacientes?.nome)}</td><td>${esc(a.dentistas?.nome)}</td><td>${esc(a.unidades?.nome)}</td><td>${badge(a.status)}</td></tr>`,
      'Nenhum atendimento futuro.', 5));
  }, 10);

  /* ---------- Ortodontia (campos na ficha) ---------- */
  const ORTO_SIT = [{ id: 'ativo', n: 'Ativo' }, { id: 'inativo', n: 'Inativo' }, { id: 'concluido', n: 'Tratamento Concluído' }, { id: 'cancelado', n: 'Cancelado' }];
  const ortoHtml = (p = {}) => `<div class="card" style="padding:.6rem .8rem;margin:.4rem 0">
      <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" name="orto" ${p.orto ? 'checked' : ''} style="width:auto"> Paciente de Ortodontia?</label>
      <div class="form-row orto-campos" ${p.orto ? '' : 'hidden'}>
        <label>Data de adesão do tratamento<input type="date" name="orto_adesao" value="${esc(p.orto_adesao || '')}"></label>
        <label>Situação do tratamento<select name="orto_situacao">${opts(ORTO_SIT, (x) => x.n, 'Selecione…', p.orto_situacao)}</select></label>
      </div></div>`;
  const ortoBind = (form) => {
    const cb = form.querySelector('[name=orto]'), box = form.querySelector('.orto-campos');
    cb.onchange = () => { box.hidden = !cb.checked; };
  };
  const ortoValores = (v) => {
    const on = !!v.orto;
    if (on && (!v.orto_adesao || !v.orto_situacao)) throw new Error('Informe a data de adesão e a situação do tratamento de ortodontia.');
    return { orto: on, orto_adesao: on ? v.orto_adesao : null, orto_situacao: on ? v.orto_situacao : null };
  };

  /* ---------- Pergunta Sim/Não ---------- */
  function pergunta(titulo, msg, sim = 'Sim', nao = 'Não') {
    return new Promise((res) => {
      const dlg = document.createElement('dialog');
      dlg.innerHTML = `<form method="dialog"><h3>${esc(titulo)}</h3><div class="modal-body"><p>${esc(msg)}</p></div>
        <div class="form-actions"><button type="button" class="btn ghost" data-n>${esc(nao)}</button><button type="button" class="btn" data-s>${esc(sim)}</button></div></form>`;
      document.body.appendChild(dlg);
      let r = false;
      dlg.querySelector('[data-s]').onclick = () => { r = true; dlg.close(); };
      dlg.querySelector('[data-n]').onclick = () => dlg.close();
      dlg.addEventListener('close', () => { dlg.remove(); res(r); });
      dlg.showModal();
    });
  }

  /* ---------- Pacientes ---------- */
  function novoPaciente() {
    modal({
      title: 'Novo paciente',
      body: `<label>Nome completo<input name="nome" required></label>
        <div class="form-row">
          <label>CPF<input name="cpf" required inputmode="numeric" placeholder="000.000.000-00"></label>
          <label>Telefone<input name="telefone" required inputmode="tel" placeholder="(85) 99999-9999"></label>
        </div>
        <div class="form-row">
          <label>E-mail<input name="email" type="email"></label>
          <label>Unidade<select name="unidade_id" required>${opts(state.unidades, (u) => u.nome, 'Selecione…', state.unidadeId)}</select></label>
        </div>
        <div class="form-row"><label>Como conheceu a clínica?<select name="origem">${opts((window.MD.ORIGENS || []).map((o) => ({ id: o, n: o })), (x) => x.n, 'Não informado')}</select></label>
          <label>Campanha<select name="campanha_id">${opts((state.campanhas || []).filter((c) => c.ativo), (x) => x.nome, 'Nenhuma')}</select></label></div>
        ${ortoHtml()}
        <label>Observações<textarea name="observacoes" rows="2"></textarea></label>`,
      onOpen: (form) => ortoBind(form),
      onSubmit: async (v) => {
        v.origem = v.origem || null; v.campanha_id = v.campanha_id || null;
        Object.assign(v, ortoValores(v));
        if (!validarCPF(v.cpf)) throw new Error('CPF inválido.');
        v.cpf = digits(v.cpf);
        const { error } = await db.from('pacientes').insert(v);
        if (error) throw new Error(error.code === '23505' ? 'Já existe um paciente com esse CPF.' : error.message);
        toast('Paciente cadastrado!');
        await carregarBase();
        refresh();
      },
    });
  }

  register('pacientes', 'Pacientes', async (el) => {
    el.innerHTML = `<div class="actions" style="margin-bottom:1rem">
        <input type="search" id="busca" placeholder="Buscar por nome ou CPF…" style="min-width:240px">
        <button class="btn" data-perm="pacientes_editar" id="novo">+ Novo paciente</button></div><div id="lista"></div>`;
    const draw = () => {
      const t = $('#busca', el).value.trim().toLowerCase();
      const lista = state.pacientes.filter((p) =>   // base de pacientes global: não filtra por unidade
        (!t || p.nome.toLowerCase().includes(t) || (digits(t) && p.cpf.includes(digits(t)))));
      $('#lista', el).innerHTML = table(['Nome', 'CPF', 'Telefone', 'Unidade', ''], rows(lista, (p) =>
        `<tr><td><a href="#paciente/${esc(p.id)}"><b>${esc(p.nome)}</b></a></td><td>${fmtCPF(p.cpf)}</td><td>${esc(p.telefone)}</td><td>${esc(p.unidades?.nome)}</td>
         <td class="nowrap"><a class="btn ghost sm" href="#paciente/${esc(p.id)}">Ficha</a> <button class="btn ghost sm" data-perm="agenda_editar" data-agendar="${esc(p.id)}">Agendar</button>
         <button class="btn ghost sm" data-perm="orcamentos_criar" data-orcar="${esc(p.id)}">Orçamento</button></td></tr>`, 'Nenhum paciente encontrado.', 5));
    };
    $('#busca', el).oninput = draw;
    $('#novo', el).onclick = novoPaciente;
    draw();
  }, 20);

  /* ---------- Atuação do dentista (dias/horários por unidade) ---------- */
  const hhmm = (t) => String(t || '').slice(0, 5);
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  function atuacao(dentistaId, unidadeId, dia /* 'YYYY-MM-DD' */) {
    const wd = new Date(dia + 'T12:00:00').getDay();
    const h = (state.horarios || []).find((x) => x.dentista_id === dentistaId && x.unidade_id === unidadeId && x.dia_semana === wd);
    if (!h) return null;
    const d = state.dentistas.find((x) => x.id === dentistaId);
    const du = (d?.dentista_unidades || []).find((x) => x.unidade_id === unidadeId) || {};
    return { ini: hhmm(h.hora_ini), fim: hhmm(h.hora_fim), almIni: hhmm(du.almoco_ini), almFim: hhmm(du.almoco_fim), min: du.minutos_consulta || 15 };
  }
  // devolve texto do problema (ou '' se o horário está dentro da atuação)
  function foraDaAtuacao(dentistaId, unidadeId, dataHoraLocal /* 'YYYY-MM-DDTHH:MM' */) {
    const [dia, hora] = dataHoraLocal.split('T');
    const a = atuacao(dentistaId, unidadeId, dia);
    const nomeD = state.dentistas.find((x) => x.id === dentistaId)?.nome || 'O dentista';
    const nomeU = state.unidades.find((x) => x.id === unidadeId)?.nome || 'esta unidade';
    if (!a) return `${nomeD} não atende nesse dia da semana em ${nomeU}.`;
    if (hora < a.ini || hora >= a.fim) return `${nomeD} atende em ${nomeU} das ${a.ini} às ${a.fim} nesse dia.`;
    if (a.almIni && a.almFim && hora >= a.almIni && hora < a.almFim) return `${hora} cai no horário de almoço de ${nomeD} (${a.almIni}–${a.almFim}).`;
    return '';
  }

  /* ---------- Agenda ---------- */
  function novoAgendamento(pacienteId = '') {
    modal({
      title: 'Novo agendamento',
      body: `<label>Paciente<select name="paciente_id" required>${opts(state.pacientes, (p) => p.nome, 'Selecione…', pacienteId)}</select></label>
        <div class="form-row">
          <label>Unidade<select name="unidade_id" required>${opts(state.unidades, (u) => u.nome, 'Selecione…', state.unidadeId || (state.unidades.length === 1 ? state.unidades[0].id : ''))}</select></label>
          <label>Dentista<select name="dentista_id" required>${opts(dentistasDaUnidade(state.unidadeId), (d) => d.nome)}</select></label>
        </div>
        <div class="form-row">
          <label>Data e hora<input name="data_hora" type="datetime-local" required step="900"></label>
          <label>Procedimento<input name="procedimento" placeholder="Ex.: Avaliação ortodôntica"></label>
        </div>
        <label>Observações<textarea name="observacoes" rows="2"></textarea></label>`,
      submit: 'Agendar',
      onOpen: (form) => { form.unidade_id.onchange = () => { form.dentista_id.innerHTML = opts(dentistasDaUnidade(form.unidade_id.value), (d) => d.nome); }; },
      onSubmit: async (v) => {
        // Unidade do cadastro é só identificador: cruzar unidades é permitido, mediante confirmação.
        const pac = state.pacientes.find((x) => x.id === v.paciente_id);
        let transferir = false;
        if (pac && pac.unidade_id !== v.unidade_id) {
          const X = state.unidades.find((u) => u.id === pac.unidade_id)?.nome, Y = state.unidades.find((u) => u.id === v.unidade_id)?.nome;
          if (!(await pergunta('Paciente de outra unidade', `Este paciente está cadastrado na unidade ${X}. Deseja prosseguir com a marcação para a unidade ${Y}?`))) return false;
          transferir = await pergunta('Unidade padrão do paciente', `Deseja alterar a unidade de atendimento padrão deste paciente de ${X} para ${Y}?`, 'Sim, transferir', 'Não, só esta consulta');
        }
        const fora = foraDaAtuacao(v.dentista_id, v.unidade_id, v.data_hora);
        if (fora && !(await pergunta('Fora da atuação do dentista', fora + ' Deseja agendar mesmo assim (encaixe)?', 'Sim, agendar', 'Não'))) return false;
        v.data_hora = new Date(v.data_hora).toISOString();
        const { error } = await db.from('agendamentos').insert(v);   // exemplo prático de INSERT
        if (error) throw new Error(error.code === '23505' ? 'Esse dentista já tem atendimento neste horário.' : error.message);
        if (transferir) {
          const r = await db.from('pacientes').update({ unidade_id: v.unidade_id }).eq('id', v.paciente_id);
          if (r.error) toast('Agendado, mas não foi possível transferir o paciente: ' + r.error.message, true);
          else await carregarBase();
        }
        toast('Agendamento salvo!');
        refresh();
      },
    });
  }

  register('agenda', 'Agenda', async (el) => {
    el.innerHTML = `<div class="actions" style="margin-bottom:1rem"><input type="date" id="dia" value="${today()}">
      <button class="btn" data-perm="agenda_editar" id="novo">+ Novo agendamento</button></div><div id="atuacao"></div><div id="lista"></div>`;
    const draw = async () => {
      const dia = $('#dia', el).value || today();
      // quem atende no dia (espelho da atuação cadastrada no dentista)
      const quem = [];
      state.dentistas.forEach((d) => state.unidades.filter((u) => !state.unidadeId || u.id === state.unidadeId).forEach((u) => {
        const a = atuacao(d.id, u.id, dia);
        if (a) quem.push(`<span class="badge confirmado" title="${esc(u.nome)}">${esc(d.nome)} · ${esc(u.nome)} · ${a.ini}–${a.fim}${a.almIni ? ` (almoço ${a.almIni}–${a.almFim})` : ''}</span>`);
      }));
      $('#atuacao', el).innerHTML = `<div class="card" style="margin-bottom:1rem"><b>Atendem em ${DIAS[new Date(dia + 'T12:00:00').getDay()]}, ${fmtD(dia)}</b><div class="actions" style="margin-top:.5rem;flex-wrap:wrap;gap:.4rem">${quem.join('') || '<span class="hint">Nenhum dentista com atuação cadastrada para este dia.</span>'}</div></div>`;
      const { data, error } = await porUnidade(db.from('agendamentos').select('*, pacientes!paciente_id(nome), dentistas!dentista_id(nome), unidades!unidade_id(nome)')
        .gte('data_hora', new Date(dia + 'T00:00:00').toISOString()).lte('data_hora', new Date(dia + 'T23:59:59').toISOString()).order('data_hora'));
      if (error) return toast(error.message, true);
      $('#lista', el).innerHTML = table(['Horário', 'Paciente', 'Dentista', 'Procedimento', 'Unidade', 'Status'], rows(data, (a) =>
        `<tr><td>${new Date(a.data_hora).toLocaleTimeString('pt-BR', { timeStyle: 'short' })}</td><td>${esc(a.pacientes?.nome)}</td><td>${esc(a.dentistas?.nome)}</td>
         <td>${esc(a.procedimento)}</td><td>${esc(a.unidades?.nome)}</td>
         <td><select data-status="${esc(a.id)}">${['agendado', 'confirmado', 'em_atendimento', 'realizado', 'faltou', 'cancelado']
           .map((s) => `<option${s === a.status ? ' selected' : ''}>${s}</option>`).join('')}</select></td></tr>`, 'Sem agendamentos neste dia.', 6));
    };
    $('#dia', el).onchange = draw;
    $('#novo', el).onclick = () => novoAgendamento();
    await draw();
  }, 30);

  /* ---------- Planos / assinaturas ---------- */
  register('planos', 'Planos / Assinaturas', async (el) => {
    el.innerHTML = `<div class="actions" style="margin-bottom:1rem"><button class="btn" id="novo">+ Nova assinatura</button></div>
      <div class="grid">${state.planos.map((p) => `<div class="card"><b>${esc(p.nome)}</b>
        <div style="font-size:1.4rem;margin:.3rem 0">${brl(p.valor_mensal)}<small>/mês</small></div>
        <span style="color:var(--muted);font-size:.85rem">${esc(p.descricao)}</span></div>`).join('')}</div>
      <h3>Assinaturas</h3><div id="lista"></div>`;
    $('#novo', el).onclick = () => modal({
      title: 'Nova assinatura', submit: 'Assinar',
      body: `<label>Paciente<select name="paciente_id" required>${opts(state.pacientes, (p) => p.nome)}</select></label>
        <label>Plano<select name="plano_id" required>${opts(state.planos, (p) => `${p.nome} — ${brl(p.valor_mensal)}`)}</select></label>`,
      onSubmit: async (v) => { await q(db.from('assinaturas').insert(v)); toast('Assinatura criada!'); refresh(); },
    });
    const data = await q(db.from('assinaturas').select('*, pacientes!paciente_id(nome), planos(nome)').order('criado_em', { ascending: false }));
    $('#lista', el).innerHTML = table(['Paciente', 'Plano', 'Início', 'Status', ''], rows(data, (a) =>
      `<tr><td>${esc(a.pacientes?.nome)}</td><td>${esc(a.planos?.nome)}</td><td>${fmtD(a.inicio)}</td><td>${badge(a.status)}</td>
       <td>${a.status === 'ativa' ? `<button class="btn ghost sm" data-cancelar-ass="${esc(a.id)}">Cancelar</button>` : ''}</td></tr>`, 'Nenhuma assinatura.', 5));
  }, 90);

  /* ---------- eventos globais ---------- */
  function bindGlobal() {
    $('#filtro-unidade').onchange = (e) => { state.unidadeId = e.target.value; refresh(); };
    $('#btn-menu').onclick = () => $('#sidebar').classList.toggle('open');
    window.addEventListener('hashchange', navigate);
    document.addEventListener('click', async (e) => {
      const ag = e.target.closest('[data-agendar]');
      if (ag) novoAgendamento(ag.dataset.agendar);
      const cn = e.target.closest('[data-cancelar-ass]');
      if (cn && confirm('Cancelar esta assinatura?')) {
        const { error } = await db.from('assinaturas').update({ status: 'cancelada' }).eq('id', cn.dataset.cancelarAss);
        error ? toast(error.message, true) : (toast('Assinatura cancelada.'), refresh());
      }
    });
    new MutationObserver(() => aplicarPermissoes(document.body)).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', async (e) => {
      const st = e.target.closest('[data-status]');
      if (!st) return;
      const { error } = await db.from('agendamentos').update({ status: st.value }).eq('id', st.dataset.status);
      error ? toast(error.message, true) : toast('Status atualizado.');
    });
  }

  /* ---------- autenticação ---------- */
  const mostrar = (logado) => { $('#login-view').hidden = logado; $('#app-view').hidden = !logado; };
  let iniciado = false, ligado = false;

  const DOMINIO_LOGIN = 'login.mydents.com.br';
  const senhaAuth = (x) => (/^\d{4}$/.test(x) ? 'MyD#' + x : x);   // senha provisória de 4 dígitos → exigência de 6+ do Supabase
  const loginEmail = (x) => (x.includes('@') ? x : digits(x) + '@' + DOMINIO_LOGIN);

  function trocarSenhaObrigatoria() {
    const dlg = modal({
      title: 'Crie sua senha definitiva', submit: 'Salvar senha',
      body: `<p class="hint">Por segurança, troque a senha provisória antes de continuar. Use no mínimo 6 caracteres (letras e números).</p>
        <label>Nova senha<input name="senha" type="password" minlength="6" required autocomplete="new-password"></label>
        <label>Repita a nova senha<input name="senha2" type="password" minlength="6" required autocomplete="new-password"></label>`,
      onSubmit: async (v) => {
        if (v.senha !== v.senha2) throw new Error('As senhas não conferem.');
        if (/^\d{4}$/.test(v.senha) || v.senha === '1234') throw new Error('Escolha uma senha diferente da provisória.');
        const { error } = await db.auth.updateUser({ password: v.senha });
        if (error) throw new Error(error.message);
        await db.rpc('senha_trocada');
        state.perfil.trocar_senha = false;
        toast('Senha definida. Bem-vindo(a)!');
      },
    });
    dlg.addEventListener('cancel', (e) => e.preventDefault());
    const c = dlg.querySelector('[data-close]'); if (c) c.hidden = true;
  }

  async function aoLogar(user) {
    state.user = user;
    mostrar(true);
    $('#user-email').textContent = user.email;
    if (!ligado) { ligado = true; bindGlobal(); }
    if (iniciado) return;
    iniciado = true;
    try {
      await carregarBase();
    } catch (e) { toast('Erro ao carregar dados: ' + e.message, true); }
    if (state.perfil.nome) $('#user-email').textContent = state.perfil.nome;
    if (state.perfil.ativo) db.rpc('garantir_caixas_hoje').then(() => {}, () => {});
    if (!state.perfil.ativo) {
      $('#nav').innerHTML = '';
      $('#view-root').innerHTML = '<div class="card empty"><h3>Acesso aguardando liberação</h3><p>Seu usuário foi criado, mas ainda não foi liberado. Peça ao administrador para ativá-lo em Cadastros › Usuários.</p></div>';
      return;
    }
    try {
      $('#nav').innerHTML = views.filter((v) => !v.pai && podeVer(v.id)).map((v) => `<a href="#${v.id}" data-view="${v.id}" title="${esc(v.title)}">${iconeNav(v.id)}<span>${esc(v.title)}</span></a>`).join('');
      await navigate();
      if (state.perfil.trocar_senha) trocarSenhaObrigatoria();
    } catch (e) { console.error(e); toast('Erro ao abrir a tela: ' + e.message, true); }
  }

  function definirSenha() {
    modal({
      title: 'Definir nova senha', submit: 'Salvar senha',
      body: `<label>Nova senha<input name="senha" type="password" minlength="8" required autocomplete="new-password"></label>
        <label>Repita a senha<input name="senha2" type="password" minlength="8" required autocomplete="new-password"></label>`,
      onSubmit: async (v) => {
        if (v.senha !== v.senha2) throw new Error('As senhas não conferem.');
        const { error } = await db.auth.updateUser({ password: v.senha });
        if (error) throw new Error(error.message);
        toast('Senha atualizada.');
        history.replaceState(null, '', location.pathname);
      },
    });
  }

  function start() {
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#login-err').textContent = '';
      const btn = $('#login-form button'); btn.disabled = true; btn.textContent = 'Entrando…';
      try {
        const { data, error } = await db.auth.signInWithPassword({ email: loginEmail($('#login-email').value.trim()), password: senhaAuth($('#login-senha').value) });
        if (error) $('#login-err').textContent = 'CPF/e-mail ou senha inválidos.';
        else await aoLogar(data.user);
      } catch (err) { console.error(err); $('#login-err').textContent = 'Erro: ' + err.message; }
      btn.disabled = false; btn.textContent = 'Entrar';
    });
    $('#btn-logout').addEventListener('click', () => db.auth.signOut());
    db.auth.onAuthStateChange((evt, session) => {
      // Eventos como TOKEN_REFRESHED/SIGNED_IN disparam ao trocar de aba: só sai da tela quando NÃO há sessão.
      if (!session) { iniciado = false; mostrar(false); return; }
      if (!iniciado) setTimeout(() => aoLogar(session.user), 0);
      if (evt === 'PASSWORD_RECOVERY') setTimeout(definirSenha, 800);
    });
    db.auth.getSession().then(({ data }) => { if (data.session) aoLogar(data.session.user); else mostrar(false); });
  }

  window.MD = { db, $, $$, esc, digits, fmtCPF, fmtDT, fmtD, brl, num, today, monthStart, monthEnd, daysTo, toast, state, opts, rows, table, badge,
    group, porUnidade, can, PERMISSOES, CARGOS, dentistasDaUnidade, aplicarPermissoes, nomeUnidade, rpc, q, modal, tabs, register, refresh, carregarBase, formValues, validarCPF, novoPaciente, novoAgendamento, atuacao, DIAS, hhmm, ortoHtml, ortoBind, ortoValores, pergunta, start };
})();
