/* Notas fiscais (NFS-e em lote — ISS Fortaleza): seleciona o que o paciente pagou no mês, gera os XMLs (50 RPS/lote)
   e acompanha o envio. O envio no portal é feito pelo usuário (emite nota fiscal). */
(() => {
  'use strict';
  const { db, $, $$, esc, brl, num, today, fmtD, toast, state, opts, rows, table, badge, can, rpc, q, modal, tabs, register, refresh, porUnidade, fmtCPF } = window.MD;
  const X = window.NFSE;
  const STATUS = { gerado: 'Gerado (não enviado)', enviado: 'Enviado ao portal', processado: 'Processado', com_erro: 'Processado com erro' };
  const mesLabel = (d) => `${String(d).slice(5, 7)}/${String(d).slice(0, 4)}`;

  function baixar(nome, txt) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'application/xml;charset=utf-8' }));
    a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  }
  const empBase = (e) => ({ cnpj: e.cnpj, im: e.inscricao_municipal });

  /* ----- EMITIR ----- */
  async function emitir(b) {
    const empresas = await q(db.from('nfse_empresas').select('*').eq('ativo', true).order('sigla'));
    if (!empresas.length) { b.innerHTML = '<p class="empty">Cadastre a empresa emissora na aba Empresas.</p>'; return; }
    b.innerHTML = `<div class="aviso">Comunicado SEFIN 06/2026: a partir de <b>01/12/2026</b> empresas fora do Simples passam ao Emissor Nacional — este formato de lote deve deixar de valer.</div>
      <div class="form-row" style="margin-top:.8rem">
        <label>Empresa emissora<select id="emp">${opts(empresas, (e) => `${e.sigla} — ${e.razao_social}`, null)}</select></label>
        <label>Competência<input type="month" id="mes" value="${today().slice(0, 7)}"></label>
        <label>Data de emissão<input type="date" id="dt" value="${today()}"></label>
      </div>
      <div class="actions" style="margin:.6rem 0"><button class="btn" id="busca">Buscar recebimentos do mês</button></div><div id="res"></div>`;
    $('#busca', b).onclick = async () => {
      const emp = empresas.find((e) => e.id === $('#emp', b).value);
      const comp = $('#mes', b).value + '-01';
      const fim = new Date(new Date(comp).getUTCFullYear(), new Date(comp).getUTCMonth() + 1, 0).getDate();
      const [recs, usados, ultRps, ultLote] = await Promise.all([
        q(porUnidade(db.from('recebimentos').select('id, paciente_id, valor, meio, data_pagamento, pacientes!paciente_id(nome,cpf)').neq('status', 'estornado').neq('meio', 'credito_paciente').gte('data_pagamento', comp).lte('data_pagamento', `${comp.slice(0, 8)}${fim}`).limit(5000))),
        q(db.from('nfse_rps_recebimentos').select('recebimento_id')),
        q(db.from('nfse_rps').select('numero_rps').eq('empresa_id', emp.id).order('numero_rps', { ascending: false }).limit(1)),
        q(db.from('nfse_lotes').select('numero_lote').eq('empresa_id', emp.id).order('numero_lote', { ascending: false }).limit(1)),
      ]);
      const ja = new Set(usados.map((u) => u.recebimento_id));
      const g = {};
      recs.filter((r) => !ja.has(r.id)).forEach((r) => {
        const x = (g[r.paciente_id] ||= { paciente_id: r.paciente_id, nome: r.pacientes?.nome, cpf: r.pacientes?.cpf, valor: 0, recs: [] });
        x.valor += Number(r.valor); x.recs.push(r.id);
      });
      const lista = Object.values(g).sort((a, c) => a.nome.localeCompare(c.nome));
      lista.forEach((x) => { x.valor = Math.round(x.valor * 100) / 100; x.ok = X.cpfOk(x.cpf) && x.valor >= 1; });
      const rpsSug = (ultRps[0]?.numero_rps || 0) + 1, loteSug = (ultLote[0]?.numero_lote || 0) + 1;
      $('#res', b).innerHTML = (recs.length - [...recs].filter((r) => !ja.has(r.id)).length ? `<p class="hint">${recs.filter((r) => ja.has(r.id)).length} recebimento(s) do mês já constam em notas geradas e foram ocultados.</p>` : '') +
        (lista.length ? table(['', 'Paciente (tomador)', 'CPF', 'Valor da nota', 'Recebimentos', ''], rows(lista, (x, i) =>
          `<tr><td><input type="checkbox" style="width:auto" data-i="${i}" ${x.ok ? 'checked' : 'disabled'}></td><td>${esc(x.nome)}</td><td>${fmtCPF(x.cpf)}</td><td>${brl(x.valor)}</td><td>${x.recs.length}</td>
          <td>${x.ok ? '' : '<span class="badge cancelada">CPF/valor inválido — corrija no cadastro</span>'}</td></tr>`, '', 6)) +
          `<p id="tot" class="hint"></p>
          <div class="form-row"><label>Primeiro nº de RPS<input type="number" id="rps" min="1" value="${rpsSug}"></label>
          <label>Nº do primeiro lote<input type="number" id="lote" min="1" value="${loteSug}"></label></div>
          <p class="hint">Confira no portal: <b>1º RPS = maior NFS-e emitida + 1</b>; o nº do lote nunca se repete. Confirme também que a "Inscrição Atual" do portal é ${esc(emp.sigla)}.</p>
          <div class="actions"><button class="btn" id="gerar">Gerar arquivos XML</button></div>` : '<p class="empty">Nenhum recebimento pendente de nota nessa competência.</p>');
      if (!lista.length) return;
      const sel = () => $$('[data-i]', b).filter((c) => c.checked).map((c) => lista[c.dataset.i]);
      const tot = () => { const s = sel(); $('#tot', b).textContent = `${s.length} nota(s) selecionada(s) · ${brl(s.reduce((a, x) => a + x.valor, 0))} · ISS 3%: ${brl(s.reduce((a, x) => a + X.iss(X.cents(x.valor)) / 100, 0))}`; };
      $$('[data-i]', b).forEach((c) => (c.onchange = tot)); tot();
      $('#gerar', b).onclick = async () => {
        const s = sel(); if (!s.length) return toast('Selecione ao menos uma nota.', true);
        const data = $('#dt', b).value, rps0 = parseInt($('#rps', b).value, 10), lote0 = parseInt($('#lote', b).value, 10);
        if (!data || !(rps0 > 0) || !(lote0 > 0)) return toast('Informe data, 1º RPS e nº do lote.', true);
        if (!confirm(`Gerar ${s.length} nota(s) da ${emp.sigla}, RPS ${rps0} a ${rps0 + s.length - 1}, lote(s) a partir de ${lote0}?`)) return;
        const lotes = X.gerarLotes(empBase(emp), s, lote0, rps0, data);
        try {
          for (const l of lotes) {
            await rpc('registrar_nfse_lote', { p_empresa: emp.id, p_lote: l.lote, p_competencia: comp, p_data: data,
              p_rps: l.rows.map((r, k) => ({ numero: l.rpsInicial + k, paciente_id: r.paciente_id, nome: X.limparNome(r.nome), cpf: String(r.cpf).replace(/\D/g, ''), valor: r.valor, recs: r.recs })) });
          }
        } catch (e) { return toast(e.message, true); }
        lotes.forEach((l) => baixar(`lote_${emp.sigla}_${l.lote}.xml`, l.xml));
        $('#res', b).innerHTML = `<div class="aviso ok"><b>${lotes.length} arquivo(s) gerado(s)</b> e baixado(s): ${lotes.map((l) => `lote ${l.lote} (${l.rows.length} RPS, ${brl(l.total)})`).join('; ')}.<br>
          Próximo passo: no portal do ISS Fortaleza, <b>NFS-e › Enviar Arquivo - Lote RPS</b>, anexe os XMLs e envie. Depois registre o protocolo na aba <b>Lotes</b>.</div>`;
      };
    };
  }

  /* ----- LOTES ----- */
  async function xmlDoLote(l) {
    const rs = await q(db.from('nfse_rps').select('*').eq('lote_id', l.id).order('numero_rps'));
    return X.gerarLote({ cnpj: l.nfse_empresas.cnpj, im: l.nfse_empresas.inscricao_municipal }, rs.map((r) => ({ nome: r.nome, cpf: r.cpf, valor: r.valor })), l.numero_lote, rs[0].numero_rps, String(l.data_emissao).slice(0, 10));
  }
  function statusForm(l) {
    modal({
      title: `Lote ${l.numero_lote} — ${l.nfse_empresas.sigla}`,
      body: `<div class="form-row"><label>Situação<select name="status">${opts(Object.entries(STATUS).map(([id, n]) => ({ id, n })), (x) => x.n, null, l.status)}</select></label>
        <label>Protocolo<input name="protocolo" value="${esc(l.protocolo)}"></label></div>
        <label>Observações<textarea name="obs" rows="2">${esc(l.obs)}</textarea></label>
        <p class="hint">O portal processa em 30 a 90 minutos. Depois confira em NFS-e › Consultar Lotes Processados e o ISS de 3% em Consultar NFS-e.</p>`,
      onSubmit: async (v) => { await q(db.from('nfse_lotes').update({ status: v.status, protocolo: v.protocolo || null, obs: v.obs || null }).eq('id', l.id)); toast('Lote atualizado.'); refresh(); },
    });
  }
  async function lotes(b) {
    const list = await q(db.from('nfse_lotes').select('*, nfse_empresas(sigla,cnpj,inscricao_municipal)').order('criado_em', { ascending: false }).limit(200));
    b.innerHTML = table(['Empresa', 'Lote', 'Competência', 'Emissão', 'RPS', 'Notas', 'Total', 'Situação', 'Protocolo', ''],
      rows(list, (l) => `<tr><td>${esc(l.nfse_empresas?.sigla)}</td><td>${l.numero_lote}</td><td>${mesLabel(l.competencia)}</td><td>${fmtD(l.data_emissao)}</td><td>${l.rps_inicial}–${l.rps_inicial + l.qtd - 1}</td><td>${l.qtd}</td><td>${brl(l.total)}</td>
        <td>${badge(l.status === 'processado' ? 'realizado' : l.status === 'com_erro' ? 'cancelada' : 'em_atendimento')} ${esc(STATUS[l.status])}</td><td>${esc(l.protocolo)}</td>
        <td><button class="btn ghost sm" data-xml="${esc(l.id)}">XML</button> <button class="btn ghost sm" data-st="${esc(l.id)}">Situação</button>
        ${l.status === 'gerado' ? ` <button class="btn ghost sm" data-del="${esc(l.id)}">Descartar</button>` : ''}</td></tr>`, 'Nenhum lote gerado.', 10));
    $$('[data-xml]', b).forEach((x) => (x.onclick = async () => { const l = list.find((i) => i.id === x.dataset.xml); baixar(`lote_${l.nfse_empresas.sigla}_${l.numero_lote}.xml`, await xmlDoLote(l)); }));
    $$('[data-st]', b).forEach((x) => (x.onclick = () => statusForm(list.find((i) => i.id === x.dataset.st))));
    $$('[data-del]', b).forEach((x) => (x.onclick = async () => {
      if (!confirm('Descartar este lote? Os recebimentos voltam a ficar disponíveis para nova emissão (o nº do lote será liberado).')) return;
      await rpc('descartar_nfse_lote', { p_lote: x.dataset.del }); toast('Lote descartado.'); refresh();
    }));
  }

  /* ----- EMPRESAS ----- */
  function empresaForm(e = {}) {
    modal({
      title: e.id ? 'Editar empresa emissora' : 'Nova empresa emissora',
      body: `<div class="form-row"><label>Sigla<input name="sigla" required value="${esc(e.sigla)}" placeholder="AJJ"></label><label>CNPJ<input name="cnpj" required value="${esc(e.cnpj)}"></label></div>
        <label>Razão social<input name="razao_social" required value="${esc(e.razao_social)}"></label>
        <div class="form-row"><label>Inscrição municipal (SEM dígito verificador)<input name="inscricao_municipal" required value="${esc(e.inscricao_municipal)}"></label>
        <label>Inscrição no portal (com dígito)<input name="inscricao_portal" value="${esc(e.inscricao_portal)}"></label></div>
        <p class="hint">No XML do lote a inscrição municipal vai SEM o dígito (com o dígito o portal processa com erro).</p>`,
      onSubmit: async (v) => {
        v.cnpj = v.cnpj.replace(/\D/g, ''); v.inscricao_municipal = v.inscricao_municipal.replace(/\D/g, ''); v.sigla = v.sigla.toUpperCase();
        if (v.cnpj.length !== 14) throw new Error('CNPJ deve ter 14 dígitos.');
        await q(e.id ? db.from('nfse_empresas').update(v).eq('id', e.id) : db.from('nfse_empresas').insert(v));
        toast('Empresa salva.'); refresh();
      },
    });
  }
  async function empresas(b) {
    const list = await q(db.from('nfse_empresas').select('*').order('sigla'));
    b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><button class="btn" id="novo">Nova empresa</button></div>` +
      table(['Sigla', 'Razão social', 'CNPJ', 'IM no XML', 'Inscrição no portal', ''], rows(list, (e) => `<tr><td>${esc(e.sigla)}</td><td>${esc(e.razao_social)}</td><td>${esc(e.cnpj)}</td><td>${esc(e.inscricao_municipal)}</td><td>${esc(e.inscricao_portal)}</td><td><button class="btn ghost sm" data-ed="${esc(e.id)}">Editar</button></td></tr>`, 'Nenhuma empresa.', 6));
    $('#novo', b).onclick = () => empresaForm();
    $$('[data-ed]', b).forEach((x) => (x.onclick = () => empresaForm(list.find((e) => e.id === x.dataset.ed))));
  }

  register('nfse', 'Notas fiscais', (el) => tabs(el, 'nfse', [
    { id: 'emitir', label: 'Emitir', render: emitir }, { id: 'lotes', label: 'Lotes', render: lotes }, { id: 'empresas', label: 'Empresas', render: empresas },
  ]), 75);
})();
