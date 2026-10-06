/* My Dents — front-end Vanilla JS + Supabase */
(() => {
  'use strict';

  const cfg = window.MYDENTS_CONFIG || {};
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const digits = (v) => String(v || '').replace(/\D/g, '');
  const fmtCPF = (v) => digits(v).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  const fmtDT = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD local

  const state = { unidades: [], dentistas: [], pacientes: [], planos: [], unidadeId: '' };

  /* ---------- utilidades de UI ---------- */
  let toastTimer;
  function toast(msg, error = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (error ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ''), 3500);
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

  const options = (list, label, placeholder) =>
    `<option value="">${placeholder}</option>` + list.map((i) => `<option value="${esc(i.id)}">${esc(label(i))}</option>`).join('');

  function fillSelects() {
    $$('[data-unidades]').forEach((s) => (s.innerHTML = options(state.unidades, (u) => u.nome, 'Selecione…')));
    $$('[data-dentistas]').forEach((s) => (s.innerHTML = options(state.dentistas, (d) => d.nome, 'Selecione…')));
    $$('[data-pacientes]').forEach((s) => (s.innerHTML = options(state.pacientes, (p) => p.nome, 'Selecione…')));
    $$('[data-planos]').forEach((s) => (s.innerHTML = options(state.planos, (p) => `${p.nome} — ${brl(p.valor_mensal)}`, 'Selecione…')));
    $('#filtro-unidade').innerHTML = options(state.unidades, (u) => u.nome, 'Todas as unidades');
    $('#filtro-unidade').value = state.unidadeId;
  }

  function rows(tbody, list, cols, emptyMsg, colspan) {
    tbody.innerHTML = list.length ? list.map(cols).join('') : `<tr><td colspan="${colspan}" class="empty">${emptyMsg}</td></tr>`;
  }

  /* ---------- dados ---------- */
  async function carregarBase() {
    const [u, d, p, pl] = await Promise.all([
      db.from('unidades').select('*').eq('ativo', true).order('nome'),
      db.from('dentistas').select('*, unidades(nome)').eq('ativo', true).order('nome'),
      db.from('pacientes').select('*, unidades(nome)').order('nome'),
      db.from('planos').select('*').eq('ativo', true).order('valor_mensal'),
    ]);
    for (const r of [u, d, p, pl]) if (r.error) return toast('Erro ao carregar dados: ' + r.error.message, true);
    Object.assign(state, { unidades: u.data, dentistas: d.data, pacientes: p.data, planos: pl.data });
    fillSelects();
  }

  const porUnidade = (q) => (state.unidadeId ? q.eq('unidade_id', state.unidadeId) : q);

  /* ---------- views ---------- */
  const views = {
    async dashboard() {
      const ini = new Date(today() + 'T00:00:00').toISOString();
      const fim = new Date(today() + 'T23:59:59').toISOString();
      const hoje = await porUnidade(db.from('agendamentos').select('status').gte('data_hora', ini).lte('data_hora', fim).neq('status', 'cancelado'));
      const pac = await porUnidade(db.from('pacientes').select('id', { count: 'exact', head: true }));
      const ass = await db.from('assinaturas').select('id', { count: 'exact', head: true }).eq('status', 'ativa');
      $('#st-hoje').textContent = hoje.data?.length ?? '–';
      $('#st-conf').textContent = hoje.data?.filter((a) => a.status === 'confirmado').length ?? '–';
      $('#st-pac').textContent = pac.count ?? '–';
      $('#st-ass').textContent = ass.count ?? '–';

      const prox = await porUnidade(
        db.from('agendamentos').select('*, pacientes(nome), dentistas(nome), unidades(nome)')
          .gte('data_hora', new Date().toISOString()).neq('status', 'cancelado').order('data_hora').limit(8)
      );
      rows($('#tb-proximos'), prox.data || [], (a) =>
        `<tr><td>${fmtDT(a.data_hora)}</td><td>${esc(a.pacientes?.nome)}</td><td>${esc(a.dentistas?.nome)}</td><td>${esc(a.unidades?.nome)}</td><td><span class="badge ${a.status}">${a.status}</span></td></tr>`,
        'Nenhum atendimento futuro.', 5);
    },

    async pacientes() {
      const termo = $('#busca-paciente').value.trim().toLowerCase();
      const lista = state.pacientes.filter((p) =>
        (!state.unidadeId || p.unidade_id === state.unidadeId) &&
        (!termo || p.nome.toLowerCase().includes(termo) || p.cpf.includes(digits(termo) || '§')));
      rows($('#tb-pacientes'), lista, (p) =>
        `<tr><td>${esc(p.nome)}</td><td>${fmtCPF(p.cpf)}</td><td>${esc(p.telefone)}</td><td>${esc(p.unidades?.nome)}</td>
         <td><button class="btn ghost sm" data-agendar="${esc(p.id)}">Agendar</button></td></tr>`,
        'Nenhum paciente encontrado.', 5);
    },

    async agenda() {
      const dia = $('#filtro-data').value || today();
      const q = porUnidade(
        db.from('agendamentos').select('*, pacientes(nome), dentistas(nome), unidades(nome)')
          .gte('data_hora', new Date(dia + 'T00:00:00').toISOString())
          .lte('data_hora', new Date(dia + 'T23:59:59').toISOString()).order('data_hora')
      );
      const { data, error } = await q;
      if (error) return toast(error.message, true);
      rows($('#tb-agenda'), data, (a) =>
        `<tr><td>${new Date(a.data_hora).toLocaleTimeString('pt-BR', { timeStyle: 'short' })}</td><td>${esc(a.pacientes?.nome)}</td><td>${esc(a.dentistas?.nome)}</td>
         <td>${esc(a.procedimento)}</td><td>${esc(a.unidades?.nome)}</td>
         <td><select data-status="${esc(a.id)}">${['agendado', 'confirmado', 'em_atendimento', 'realizado', 'faltou', 'cancelado']
           .map((s) => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`,
        'Sem agendamentos neste dia.', 6);
    },

    async planos() {
      $('#lista-planos').innerHTML = state.planos.map((p) =>
        `<div class="card"><b>${esc(p.nome)}</b><div style="font-size:1.4rem;margin:.3rem 0">${brl(p.valor_mensal)}<small>/mês</small></div><span style="color:var(--muted);font-size:.85rem">${esc(p.descricao)}</span></div>`).join('');
      const { data, error } = await db.from('assinaturas').select('*, pacientes(nome), planos(nome)').order('criado_em', { ascending: false });
      if (error) return toast(error.message, true);
      rows($('#tb-assin'), data, (a) =>
        `<tr><td>${esc(a.pacientes?.nome)}</td><td>${esc(a.planos?.nome)}</td><td>${new Date(a.inicio + 'T00:00').toLocaleDateString('pt-BR')}</td>
         <td><span class="badge ${a.status}">${a.status}</span></td>
         <td>${a.status === 'ativa' ? `<button class="btn ghost sm" data-cancelar-ass="${esc(a.id)}">Cancelar</button>` : ''}</td></tr>`,
        'Nenhuma assinatura.', 5);
    },

    async dentistas() {
      rows($('#tb-dentistas'), state.dentistas, (d) =>
        `<tr><td>${esc(d.nome)}</td><td>${fmtCPF(d.cpf)}</td><td>${esc(d.especialidade)}</td><td>${esc(d.unidades?.nome)}</td></tr>`,
        'Nenhum dentista cadastrado.', 4);
    },
  };

  const titles = { dashboard: 'Início', pacientes: 'Pacientes', agenda: 'Agenda', planos: 'Planos / Assinaturas', dentistas: 'Dentistas' };

  async function navigate() {
    const v = location.hash.slice(1) in views ? location.hash.slice(1) : 'dashboard';
    $$('.view').forEach((s) => (s.hidden = s.id !== 'view-' + v));
    $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
    $('#view-title').textContent = titles[v];
    $('#sidebar').classList.remove('open');
    await views[v]();
  }

  /* ---------- salvar dados (exemplo de INSERT) ---------- */
  function formData(form) {
    const o = Object.fromEntries(new FormData(form));
    for (const k in o) if (o[k] === '') o[k] = null;
    return o;
  }

  async function salvar(form, dlg, tabela, payload, okMsg, depois) {
    const btn = form.querySelector('button:not([type])');
    btn.disabled = true;
    const { error } = await db.from(tabela).insert(payload);
    btn.disabled = false;
    if (error) {
      const msg = error.code === '23505'
        ? (tabela === 'agendamentos' ? 'Esse dentista já tem atendimento neste horário.' : 'Já existe um cadastro com esse CPF.')
        : error.message;
      return toast(msg, true);
    }
    dlg.close();
    form.reset();
    toast(okMsg);
    if (depois) await depois();
    await navigate();
  }

  function bindForms() {
    $('#form-paciente').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (!validarCPF(d.cpf)) return toast('CPF inválido.', true);
      d.cpf = digits(d.cpf);
      d.telefone = d.telefone.trim();
      salvar(e.target, $('#dlg-paciente'), 'pacientes', d, 'Paciente cadastrado!', carregarBase);
    });

    $('#form-dent').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (!validarCPF(d.cpf)) return toast('CPF inválido.', true);
      d.cpf = digits(d.cpf);
      salvar(e.target, $('#dlg-dent'), 'dentistas', d, 'Dentista cadastrado!', carregarBase);
    });

    // Exemplo prático: salvar um novo agendamento
    $('#form-agend').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = formData(e.target);
      d.data_hora = new Date(d.data_hora).toISOString(); // datetime-local -> UTC
      salvar(e.target, $('#dlg-agend'), 'agendamentos', d, 'Agendamento salvo!');
    });

    $('#form-assin').addEventListener('submit', (e) => {
      e.preventDefault();
      salvar(e.target, $('#dlg-assin'), 'assinaturas', formData(e.target), 'Assinatura criada!');
    });
  }

  function bindUI() {
    const open = (id) => { fillSelects(); $(id).showModal(); };
    $('#btn-novo-paciente').onclick = () => open('#dlg-paciente');
    $('#btn-novo-agend').onclick = () => open('#dlg-agend');
    $('#btn-nova-assin').onclick = () => open('#dlg-assin');
    $('#btn-novo-dent').onclick = () => open('#dlg-dent');
    $$('[data-close]').forEach((b) => (b.onclick = () => b.closest('dialog').close()));

    $('#filtro-unidade').onchange = (e) => { state.unidadeId = e.target.value; navigate(); };
    $('#busca-paciente').oninput = () => views.pacientes();
    $('#filtro-data').value = today();
    $('#filtro-data').onchange = () => views.agenda();
    $('#btn-menu').onclick = () => $('#sidebar').classList.toggle('open');
    window.addEventListener('hashchange', navigate);

    document.addEventListener('click', async (e) => {
      const ag = e.target.closest('[data-agendar]');
      if (ag) { open('#dlg-agend'); $('#form-agend [name=paciente_id]').value = ag.dataset.agendar; }
      const can = e.target.closest('[data-cancelar-ass]');
      if (can && confirm('Cancelar esta assinatura?')) {
        const { error } = await db.from('assinaturas').update({ status: 'cancelada' }).eq('id', can.dataset.cancelarAss);
        error ? toast(error.message, true) : (toast('Assinatura cancelada.'), views.planos());
      }
    });
    document.addEventListener('change', async (e) => {
      const st = e.target.closest('[data-status]');
      if (!st) return;
      const { error } = await db.from('agendamentos').update({ status: st.value }).eq('id', st.dataset.status);
      error ? toast(error.message, true) : toast('Status atualizado.');
    });
  }

  /* ---------- autenticação ---------- */
  function mostrar(logado, user) {
    $('#login-view').hidden = logado;
    $('#app-view').hidden = !logado;
    if (logado) $('#user-email').textContent = user.email;
  }

  let iniciado = false;
  let bound = false;
  async function aoLogar(user) {
    mostrar(true, user);
    if (iniciado) return;
    iniciado = true;
    if (!bound) { bound = true; bindUI(); bindForms(); }
    await carregarBase();
    await navigate();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-err').textContent = '';
    const { error } = await db.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-senha').value });
    if (error) $('#login-err').textContent = 'E-mail ou senha inválidos.';
  });

  $('#btn-logout').addEventListener('click', () => db.auth.signOut());

  db.auth.onAuthStateChange((_evt, session) => {
    if (session) aoLogar(session.user);
    else { iniciado = false; mostrar(false); }
  });

  db.auth.getSession().then(({ data }) => { if (!data.session) mostrar(false); });
})();
