/* Prótese: pedidos ao laboratório (acompanhamento do envio ao retorno/instalação) e pagamento ao laboratório. */
(() => {
  'use strict';
  const { db, $, $$, esc, brl, num, today, fmtD, toast, state, opts, rows, table, badge, can, rpc, q, modal, tabs, register, refresh, porUnidade, dentistasDaUnidade } = window.MD;

  const STATUS = { solicitado: 'Solicitado', enviado: 'Enviado ao lab', em_producao: 'Em produção', recebido: 'Recebido', instalado: 'Instalado', refazer: 'Refazer', cancelado: 'Cancelado' };
  const ORDEM = ['solicitado', 'enviado', 'em_producao', 'recebido', 'instalado'];
  const TIPOS = ['Coroa', 'Faceta', 'Prótese total', 'Prótese parcial removível', 'Protocolo', 'Núcleo', 'Placa/Aparelho', 'Outro'];

  function protese(p = {}) {
    const uid = p.unidade_id || state.unidadeId;
    modal({
      title: p.id ? `Prótese #${p.codigo}` : 'Novo pedido de prótese', wide: true,
      body: `<div class="form-row">
          <label>Paciente<select name="paciente_id" required>${opts(state.pacientes, (x) => x.nome, 'Selecione…', p.paciente_id)}</select></label>
          <label>Unidade<select name="unidade_id" required>${opts(state.unidades, (x) => x.nome, 'Selecione…', uid)}</select></label>
        </div>
        <div class="form-row">
          <label>Dentista<select name="dentista_id" required>${opts(dentistasDaUnidade(uid), (x) => x.nome, 'Selecione…', p.dentista_id)}</select></label>
          <label>Laboratório<select name="laboratorio_id" required>${opts(state.labs, (x) => x.nome, 'Selecione…', p.laboratorio_id)}</select></label>
        </div>
        <div class="form-row">
          <label>Tipo<select name="tipo">${opts(TIPOS.map((t) => ({ id: t, n: t })), (x) => x.n, null, p.tipo || 'Coroa')}</select></label>
          <label>Dente(s)<input name="dente" value="${esc(p.dente)}"></label>
          <label>Cor<input name="cor" value="${esc(p.cor)}" placeholder="Ex.: A2"></label>
        </div>
        <div class="form-row">
          <label>Situação<select name="status">${opts(Object.entries(STATUS).map(([id, n]) => ({ id, n })), (x) => x.n, null, p.status || 'solicitado')}</select></label>
          <label>Valor do laboratório<input name="valor_lab" type="number" step="0.01" min="0" value="${esc(p.valor_lab ?? 0)}"></label>
        </div>
        <div class="form-row">
          <label>Enviado em<input name="data_envio" type="date" value="${esc(p.data_envio)}"></label>
          <label>Previsão de retorno<input name="data_prevista" type="date" value="${esc(p.data_prevista)}"></label>
          <label>Recebido em<input name="data_retorno" type="date" value="${esc(p.data_retorno)}"></label>
          <label>Instalado em<input name="data_instalacao" type="date" value="${esc(p.data_instalacao)}"></label>
        </div>
        <label>Descrição / observações<textarea name="observacoes" rows="2">${esc(p.observacoes)}</textarea></label>`,
      onOpen: (form) => {
        form.unidade_id.onchange = () => { form.dentista_id.innerHTML = opts(dentistasDaUnidade(form.unidade_id.value), (x) => x.nome); };
      },
      onSubmit: async (v) => {
        ['data_envio', 'data_prevista', 'data_retorno', 'data_instalacao', 'dente', 'cor', 'observacoes'].forEach((k) => { if (v[k] === '') v[k] = null; });
        v.valor_lab = num(v.valor_lab);
        if (v.status === 'enviado' && !v.data_envio) v.data_envio = today();
        if (v.status === 'recebido' && !v.data_retorno) v.data_retorno = today();
        if (v.status === 'instalado' && !v.data_instalacao) v.data_instalacao = today();
        await q(p.id ? db.from('proteses').update(v).eq('id', p.id) : db.from('proteses').insert(v));
        toast('Prótese salva.'); refresh();
      },
    });
  }

  function pagar(p) {
    modal({
      title: `Pagar laboratório — prótese #${p.codigo}`, submit: 'Pagar',
      body: `<p>${esc(p.laboratorios?.nome)} · ${esc(p.pacientes?.nome)} · <b>${brl(p.valor_lab)}</b></p>
        <div class="form-row"><label>Conta<select name="conta" required>${opts(state.contas, (x) => x.nome)}</select></label>
        <label>Data<input name="data" type="date" value="${today()}" required></label></div>
        <p class="hint">Gera uma despesa em Financeiro › Lançamentos (grupo Laboratório).</p>`,
      onSubmit: async (v) => { await rpc('pagar_protese', { p_id: p.id, p_conta: v.conta, p_data: v.data }); toast('Pagamento lançado.'); refresh(); },
    });
  }

  function labForm(l = {}) {
    modal({
      title: l.id ? 'Editar laboratório' : 'Novo laboratório',
      body: `<label>Nome<input name="nome" required value="${esc(l.nome)}"></label>
        <div class="form-row"><label>Contato<input name="contato" value="${esc(l.contato)}"></label><label>Telefone<input name="telefone" value="${esc(l.telefone)}"></label></div>
        <label>Situação<select name="ativo">${opts([{ id: 'true', n: 'Ativo' }, { id: 'false', n: 'Inativo' }], (x) => x.n, null, String(l.ativo ?? true))}</select></label>`,
      onSubmit: async (v) => {
        v.ativo = v.ativo === 'true';
        const { error } = await (l.id ? db.from('laboratorios').update(v).eq('id', l.id) : db.from('laboratorios').insert(v));
        if (error) throw new Error(error.code === '23505' ? 'Já existe um laboratório com esse nome.' : error.message);
        toast('Laboratório salvo.'); refresh();
      },
    });
  }

  const carregarLabs = async () => { state.labs = await q(db.from('laboratorios').select('*').eq('ativo', true).order('nome')); };

  register('proteses', 'Prótese', (el) => tabs(el, 'proteses', [
    { id: 'pedidos', label: 'Pedidos', render: async (b) => {
      await carregarLabs();
      b.innerHTML = `<div class="actions" style="margin-bottom:1rem">
        <select id="st"><option value="">Em andamento</option><option value="todos">Todas</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <button class="btn" data-perm="proteses" id="novo">Novo pedido</button></div><div id="l"></div>`;
      $('#novo', b).onclick = () => protese();
      const draw = async () => {
        const f = $('#st', b).value;
        let qy = porUnidade(db.from('proteses').select('*, pacientes!paciente_id(nome), dentistas!dentista_id(nome), unidades!unidade_id(nome), laboratorios!laboratorio_id(nome)').order('codigo', { ascending: false }).limit(300));
        if (f === '') qy = qy.in('status', ['solicitado', 'enviado', 'em_producao', 'recebido', 'refazer']);
        else if (f !== 'todos') qy = qy.eq('status', f);
        const list = await q(qy);
        const atraso = (p) => p.data_prevista && p.data_prevista < today() && ['solicitado', 'enviado', 'em_producao', 'refazer'].includes(p.status);
        $('#l', b).innerHTML = table(['#', 'Paciente', 'Tipo / dente', 'Dentista', 'Laboratório', 'Situação', 'Previsão', 'Valor lab.', ''],
          rows(list, (p) => `<tr><td>${p.codigo}</td><td>${esc(p.pacientes?.nome)}</td><td>${esc(p.tipo)}${p.dente ? ' · ' + esc(p.dente) : ''}</td><td>${esc(p.dentistas?.nome)}</td><td>${esc(p.laboratorios?.nome)}</td>
            <td>${badge(p.status)}${p.pago ? ' <span class="badge realizado">pago</span>' : ''}</td><td>${fmtD(p.data_prevista)}${atraso(p) ? ' <span class="badge cancelada">atrasada</span>' : ''}</td><td>${brl(p.valor_lab)}</td>
            <td><button class="btn ghost sm" data-ed="${esc(p.id)}">Abrir</button>${!p.pago && p.valor_lab > 0 && p.status !== 'cancelado' ? ` <button class="btn sm" data-perm="financeiro" data-pg="${esc(p.id)}">Pagar lab.</button>` : ''}</td></tr>`, 'Nenhuma prótese.', 9));
        $$('[data-ed]', b).forEach((x) => (x.onclick = () => protese(list.find((p) => p.id === x.dataset.ed))));
        $$('[data-pg]', b).forEach((x) => (x.onclick = () => pagar(list.find((p) => p.id === x.dataset.pg))));
      };
      $('#st', b).onchange = draw; draw();
    } },
    { id: 'labs', label: 'Laboratórios', render: async (b) => {
      const list = await q(db.from('laboratorios').select('*').order('nome'));
      b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><button class="btn" data-perm="cadastros_editar" id="novo">Novo laboratório</button></div>` +
        table(['Nome', 'Contato', 'Telefone', 'Situação', ''], rows(list, (l) => `<tr><td>${esc(l.nome)}</td><td>${esc(l.contato)}</td><td>${esc(l.telefone)}</td><td>${l.ativo ? 'Ativo' : 'Inativo'}</td><td><button class="btn ghost sm" data-perm="cadastros_editar" data-ed="${esc(l.id)}">Editar</button></td></tr>`, 'Nenhum laboratório.', 5));
      $('#novo', b).onclick = () => labForm();
      $$('[data-ed]', b).forEach((x) => (x.onclick = () => labForm(list.find((l) => l.id === x.dataset.ed))));
    } },
  ]), 55);
})();
