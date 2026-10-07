/* Ficha do paciente: Sobre, Orçamentos, Tratamentos (odontograma + evoluções), Anamnese e Débitos. Rota: #paciente/<id> */
(() => {
  'use strict';
  const { db, $, $$, esc, brl, num, today, fmtD, fmtCPF, digits, toast, state, opts, rows, table, badge, rpc, q, modal, tabs, register, refresh, validarCPF, novoAgendamento } = window.MD;

  const SUP = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const INF = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  const ST = { planejado: 'Planejado', em_andamento: 'Em andamento', executado: 'Executado', cancelado: 'Cancelado' };
  const idade = (d) => (d ? Math.floor((Date.now() - new Date(d + 'T12:00:00')) / 31557600000) : null);
  const campo = (k, v) => `<div class="kv"><span>${esc(k)}</span><b>${v ? esc(v) : '—'}</b></div>`;

  const PERGUNTAS = [
    ['tratamento_medico', 'Está em tratamento médico?'], ['medicacao', 'Faz uso de medicação contínua? Qual?'],
    ['alergia', 'Possui alergias (medicamentos, látex, anestésicos)?'], ['cardiaco', 'Problemas cardíacos / hipertensão?'],
    ['diabetes', 'Diabetes?'], ['gravida', 'Gestante ou lactante?'], ['anestesia', 'Já teve reação a anestesia?'],
    ['sangramento', 'Problemas de coagulação / sangramento excessivo?'], ['fuma', 'Fuma?'], ['bruxismo', 'Range ou aperta os dentes?'], ['obs', 'Outras observações'],
  ];

  /* ---------- Sobre ---------- */
  async function abaSobre(b, p) {
    const [evo, cons, plano] = await Promise.all([
      q(db.from('evolucoes').select('*, dentistas!dentista_id(nome), orcamento_itens(dente, procedimentos(nome))').eq('paciente_id', p.id).order('criado_em', { ascending: false }).limit(1)),
      q(db.from('agendamentos').select('*, dentistas!dentista_id(nome)').eq('paciente_id', p.id).order('data_hora', { ascending: false }).limit(8)),
      p.plano_id ? q(db.from('planos').select('nome').eq('id', p.plano_id)) : Promise.resolve([]),
    ]);
    const e = evo[0];
    b.innerHTML = `<div class="ficha-grid">
      <div class="card"><h4>Dados pessoais</h4>
        ${campo('CPF', fmtCPF(p.cpf))}${campo('Nascimento', p.data_nascimento ? `${fmtD(p.data_nascimento)} (${idade(p.data_nascimento)} anos)` : '')}
        ${campo('Sexo', { F: 'Feminino', M: 'Masculino', O: 'Outro' }[p.sexo])}${campo('Telefone', p.telefone)}${campo('E-mail', p.email)}
        ${campo('Unidade', p.unidades?.nome)}${campo('Endereço', [p.endereco, p.bairro].filter(Boolean).join(' — '))}${campo('Cidade/UF', [p.cidade, p.uf].filter(Boolean).join('/'))}${campo('CEP', p.cep)}
        <h4 style="margin-top:1rem">Responsável e plano</h4>
        ${campo('Responsável', p.responsavel_nome)}${campo('CPF do responsável', p.responsavel_cpf ? fmtCPF(p.responsavel_cpf) : '')}${campo('Plano', plano[0]?.nome)}
        <h4 style="margin-top:1rem">Observações</h4><p>${esc(p.observacoes) || '—'}</p></div>
      <div><div class="card"><h4>Última evolução</h4>${e ? `<p><b>${esc(e.orcamento_itens?.procedimentos?.nome || '')}</b> ${e.orcamento_itens?.dente ? '· dente ' + esc(e.orcamento_itens.dente) : ''}<br>
          ${badge(e.status)} · ${esc(e.dentistas?.nome)} · ${fmtD(e.data)}</p>${e.observacao ? `<p class="hint">${esc(e.observacao)}</p>` : ''}` : '<p class="hint">Nenhuma evolução registrada.</p>'}</div>
        <div class="card" style="margin-top:1rem"><h4>Consultas</h4>${table(['Quando', 'Dentista', 'Situação'], rows(cons, (c) =>
          `<tr><td>${new Date(c.data_hora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${esc(c.dentistas?.nome)}</td><td>${badge(c.status)}</td></tr>`, 'Sem consultas.', 3))}</div></div></div>`;
  }

  function editarPaciente(p) {
    modal({
      title: 'Editar paciente', wide: true,
      body: `<div class="form-row"><label>Nome<input name="nome" required value="${esc(p.nome)}"></label><label>Telefone<input name="telefone" required value="${esc(p.telefone)}"></label></div>
        <div class="form-row"><label>Nascimento<input type="date" name="data_nascimento" value="${esc(p.data_nascimento || '')}"></label>
          <label>Sexo<select name="sexo">${opts([{ id: 'F', n: 'Feminino' }, { id: 'M', n: 'Masculino' }, { id: 'O', n: 'Outro' }], (x) => x.n, 'Selecione…', p.sexo)}</select></label></div>
        <div class="form-row"><label>E-mail<input type="email" name="email" value="${esc(p.email || '')}"></label>
          <label>Plano<select name="plano_id">${opts(state.planos || [], (x) => x.nome, 'Nenhum', p.plano_id)}</select></label></div>
        <div class="form-row"><label>CEP<input name="cep" value="${esc(p.cep || '')}"></label><label>Endereço<input name="endereco" value="${esc(p.endereco || '')}"></label></div>
        <div class="form-row"><label>Bairro<input name="bairro" value="${esc(p.bairro || '')}"></label><label>Cidade<input name="cidade" value="${esc(p.cidade || '')}"></label><label>UF<input name="uf" maxlength="2" value="${esc(p.uf || '')}"></label></div>
        <div class="form-row"><label>Responsável<input name="responsavel_nome" value="${esc(p.responsavel_nome || '')}"></label><label>CPF do responsável<input name="responsavel_cpf" value="${esc(p.responsavel_cpf || '')}"></label></div>
        <label>Observações<textarea name="observacoes" rows="2">${esc(p.observacoes || '')}</textarea></label>`,
      onSubmit: async (v) => {
        const o = { ...v, data_nascimento: v.data_nascimento || null, sexo: v.sexo || null, plano_id: v.plano_id || null, responsavel_cpf: digits(v.responsavel_cpf) || null };
        if (o.responsavel_cpf && !validarCPF(o.responsavel_cpf)) throw new Error('CPF do responsável inválido.');
        await q(db.from('pacientes').update(o).eq('id', p.id));
        toast('Paciente atualizado.'); await window.MD.carregarBase(); refresh();
      },
    });
  }

  /* ---------- Orçamentos ---------- */
  async function abaOrc(b, p) {
    const data = await q(db.from('orcamentos').select('*, dentistas!dentista_id(nome), orcamento_itens(valor_negociado, procedimentos(nome))').eq('paciente_id', p.id).order('codigo', { ascending: false }));
    b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><button class="btn" data-perm="orcamentos_criar" id="novo">+ Novo orçamento</button></div>` +
      table(['#', 'Data', 'Descrição', 'Dentista', 'Valor', 'Situação', ''], rows(data, (o) =>
        `<tr><td>${o.codigo}</td><td>${fmtD(o.criado_em?.slice(0, 10))}</td><td>${esc(o.orcamento_itens.map((i) => i.procedimentos?.nome).join(', ').slice(0, 70))}</td><td>${esc(o.dentistas?.nome)}</td>
         <td>${brl(o.orcamento_itens.reduce((s, i) => s + Number(i.valor_negociado), 0))}</td><td>${badge(o.status)}</td>
         <td><button class="btn ghost sm" data-abrir="${esc(o.id)}">${o.status === 'pendente' ? 'Abrir / aprovar' : 'Ver'}</button></td></tr>`, 'Nenhum orçamento.', 7));
    $('#novo', b).onclick = () => window.MD.novoOrcamento(p.id);
    $$('[data-abrir]', b).forEach((x) => (x.onclick = () => window.MD.abrirOrcamento(x.dataset.abrir)));
  }

  /* ---------- Tratamentos ---------- */
  function evoluir(it) {
    modal({
      title: `Evoluir — ${it.procedimentos?.nome}${it.dente ? ' (dente ' + it.dente + ')' : ''}`, submit: 'Registrar evolução',
      body: `<p class="hint">Só "executado" gera a comissão de execução (${brl(it.valor_execucao)}).</p>
        <div class="form-row"><label>Situação<select name="status">${opts([{ id: 'em_andamento', n: 'Em andamento' }, { id: 'executado', n: 'Executado' }, { id: 'cancelado', n: 'Cancelado' }], (x) => x.n, null, 'executado')}</select></label>
        <label>Data<input name="data" type="date" value="${today()}" required></label></div>
        <label>Dentista que executou<select name="dentista" required>${opts(state.dentistas, (d) => d.nome)}</select></label>
        <label>Observação<textarea name="obs" rows="2"></textarea></label>`,
      onSubmit: async (v) => { await rpc('evoluir_item', { p_item: it.id, p_status: v.status, p_dentista: v.dentista, p_obs: v.obs, p_data: v.data }); toast('Evolução registrada.'); refresh(); },
    });
  }
  function novaNota(p, dente = '') {
    modal({
      title: 'Nova anotação clínica', submit: 'Salvar',
      body: `<div class="form-row"><label>Data<input type="date" name="data" value="${today()}" required></label><label>Dente / região<input name="dente" value="${esc(dente)}" placeholder="Ex.: 16"></label></div>
        <label>Dentista<select name="dentista_id">${opts(state.dentistas, (d) => d.nome, 'Selecione…')}</select></label>
        <label>Anotação<textarea name="texto" rows="4" required></textarea></label>`,
      onSubmit: async (v) => { if (!v.texto.trim()) throw new Error('Escreva a anotação.'); await q(db.from('notas_clinicas').insert({ paciente_id: p.id, data: v.data, dente: v.dente || null, dentista_id: v.dentista_id || null, texto: v.texto })); toast('Anotação salva.'); refresh(); },
    });
  }
  async function abaTrat(b, p) {
    const [itens, notas, evos] = await Promise.all([
      q(db.from('orcamento_itens').select('*, procedimentos(nome), orcamentos!inner(codigo, status, paciente_id)').eq('orcamentos.paciente_id', p.id).eq('orcamentos.status', 'aprovado').order('criado_em')),
      q(db.from('notas_clinicas').select('*, dentistas!dentista_id(nome)').eq('paciente_id', p.id).order('data', { ascending: false }).limit(50)),
      q(db.from('evolucoes').select('*, dentistas!dentista_id(nome), orcamento_itens(dente, procedimentos(nome))').eq('paciente_id', p.id).order('criado_em', { ascending: false }).limit(50)),
    ]);
    const porDente = {};
    const peso = { cancelado: 0, executado: 1, planejado: 2, em_andamento: 3 };
    itens.forEach((i) => { String(i.dente || '').match(/\d{2}/g)?.forEach((d) => { if ((peso[i.status_exec] || 0) > (peso[porDente[d]] || 0)) porDente[d] = i.status_exec; }); });
    const dentes = (arr) => arr.map((n) => `<button type="button" class="dente ${porDente[n] || ''}" data-dente="${n}" title="Dente ${n}${porDente[n] ? ' — ' + ST[porDente[n]] : ''}">${n}</button>`).join('');
    const abertos = itens.filter((i) => i.status_exec !== 'executado' && i.status_exec !== 'cancelado');
    const finais = itens.filter((i) => i.status_exec === 'executado' || i.status_exec === 'cancelado');
    const linha = (i) => `<tr><td>${esc(i.procedimentos?.nome)}</td><td>${esc(i.dente)}</td><td>#${i.orcamentos?.codigo}</td><td>${brl(i.valor_negociado)}</td><td>${badge(i.status_exec)}</td>
      <td>${i.status_exec === 'executado' || i.status_exec === 'cancelado' ? `<button class="btn ghost sm" data-perm="tratamentos_evoluir" data-evo="${esc(i.id)}">Reabrir/alterar</button>` : `<button class="btn sm" data-perm="tratamentos_evoluir" data-evo="${esc(i.id)}">Evoluir</button>`}</td></tr>`;
    b.innerHTML = `<div class="card odonto"><div class="legenda"><span class="dente planejado">■</span> Planejado <span class="dente em_andamento">■</span> Em andamento <span class="dente executado">■</span> Executado</div>
        <div class="arcada">${dentes(SUP)}</div><div class="arcada">${dentes(INF)}</div></div>
      <div class="actions" style="margin:1rem 0"><button class="btn" data-perm="prontuario" id="nota">+ Anotação clínica</button><label style="display:flex;gap:.4rem;align-items:center"><input type="checkbox" id="fin" style="width:auto"> Mostrar finalizados</label></div>
      <h4>Tratamentos em aberto</h4>${table(['Procedimento', 'Dente', 'Orç.', 'Valor', 'Situação', ''], rows(abertos, linha, 'Nenhum tratamento em aberto. Aprove um orçamento para iniciar.', 6))}
      <div id="finais" hidden><h4 style="margin-top:1rem">Finalizados / cancelados</h4>${table(['Procedimento', 'Dente', 'Orç.', 'Valor', 'Situação', ''], rows(finais, linha, 'Nenhum.', 6))}</div>
      <h4 style="margin-top:1.25rem">Histórico de evoluções</h4>${table(['Data', 'Procedimento', 'Dente', 'Situação', 'Dentista', 'Observação'], rows(evos, (e) =>
        `<tr><td>${fmtD(e.data)}</td><td>${esc(e.orcamento_itens?.procedimentos?.nome)}</td><td>${esc(e.orcamento_itens?.dente)}</td><td>${badge(e.status)}</td><td>${esc(e.dentistas?.nome)}</td><td>${esc(e.observacao)}</td></tr>`, 'Sem evoluções.', 6))}
      <h4 style="margin-top:1.25rem">Anotações clínicas</h4>${table(['Data', 'Dente', 'Dentista', 'Anotação'], rows(notas, (n) =>
        `<tr><td>${fmtD(n.data)}</td><td>${esc(n.dente)}</td><td>${esc(n.dentistas?.nome)}</td><td>${esc(n.texto)}</td></tr>`, 'Sem anotações.', 4))}`;
    $('#fin', b).onchange = (e) => ($('#finais', b).hidden = !e.target.checked);
    $('#nota', b).onclick = () => novaNota(p);
    $$('[data-evo]', b).forEach((x) => (x.onclick = () => evoluir(itens.find((i) => i.id === x.dataset.evo))));
    $$('[data-dente]', b).forEach((x) => (x.onclick = () => novaNota(p, x.dataset.dente)));
  }

  /* ---------- Anamnese ---------- */
  async function abaAnam(b, p) {
    const data = await q(db.from('anamneses').select('*').eq('paciente_id', p.id).order('data', { ascending: false }).order('criado_em', { ascending: false }));
    const atual = data[0];
    b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><button class="btn" data-perm="prontuario" id="nova">${atual ? '+ Nova anamnese' : '+ Preencher anamnese'}</button></div>` +
      (atual ? `${atual.alertas ? `<div class="alerta">⚠ ${esc(atual.alertas)}</div>` : ''}` : '<p class="hint">Paciente sem anamnese preenchida.</p>') +
      table(['Data', 'Modelo', 'Resumo', ''], rows(data, (a) =>
        `<tr><td>${fmtD(a.data)}</td><td>${esc(a.modelo)}</td><td>${esc(PERGUNTAS.filter(([k]) => a.respostas[k] && String(a.respostas[k]).trim() && !/^n(ã|a)o$/i.test(a.respostas[k])).length)} resposta(s) a observar</td>
         <td><button class="btn ghost sm" data-ver="${esc(a.id)}">Ver</button></td></tr>`, 'Nenhuma anamnese.', 4));
    const form = (a) => PERGUNTAS.map(([k, t]) => `<label>${esc(t)}<input name="${k}" value="${esc(a?.respostas?.[k] || '')}" ${a ? 'readonly' : ''}></label>`).join('');
    $('#nova', b).onclick = () => modal({
      title: 'Anamnese', wide: true, submit: 'Salvar anamnese',
      body: `<label>Modelo<select name="modelo">${opts(['Anamnese adulta', 'Anamnese infantil', 'Anamnese ortodôntica', 'Anamnese HOF'].map((n) => ({ id: n, n })), (x) => x.n, null, 'Anamnese adulta')}</select></label>${form()}
        <label>Alertas importantes (aparecem na ficha)<input name="alertas" placeholder="Ex.: alergia a penicilina"></label>`,
      onSubmit: async (v) => {
        const { modelo, alertas, ...resp } = v;
        await q(db.from('anamneses').insert({ paciente_id: p.id, modelo, alertas: alertas || null, respostas: resp }));
        toast('Anamnese salva.'); refresh();
      },
    });
    $$('[data-ver]', b).forEach((x) => (x.onclick = () => { const a = data.find((d) => d.id === x.dataset.ver); modal({ title: `${a.modelo} — ${fmtD(a.data)}`, wide: true, body: form(a) + (a.alertas ? `<div class="alerta">⚠ ${esc(a.alertas)}</div>` : '') }); }));
  }


  /* ---------- Imagens ---------- */
  async function abaImg(b, p) {
    const data = await q(db.from('imagens_paciente').select('*').eq('paciente_id', p.id).order('criado_em', { ascending: false }));
    b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><label class="btn" data-perm="imagens" style="cursor:pointer">+ Enviar imagens / PDFs<input type="file" id="up" multiple accept="image/*,application/pdf" hidden></label>
        <span class="hint">Até 20 MB por arquivo. Fica em armazenamento privado.</span></div><div class="galeria" id="gal"></div>`;
    const gal = $('#gal', b);
    if (!data.length) gal.innerHTML = '<p class="hint">Nenhuma imagem enviada.</p>';
    for (const im of data) {
      const { data: sg } = await db.storage.from('pacientes').createSignedUrl(im.caminho, 3600);
      const url = sg?.signedUrl || '';
      const isImg = (im.mime || '').startsWith('image/');
      const el = document.createElement('div'); el.className = 'thumb';
      el.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener">${isImg ? `<img src="${esc(url)}" alt="${esc(im.nome)}">` : '<div class="pdf">PDF</div>'}</a>
        <div class="nm" title="${esc(im.nome)}">${esc(im.nome)}</div><div class="hint">${fmtD(im.criado_em.slice(0, 10))}</div>
        <button class="btn ghost sm" data-del="${esc(im.id)}">Excluir</button>`;
      gal.appendChild(el);
    }
    $('#up', b).onchange = async (e) => {
      for (const f of e.target.files) {
        if (f.size > 20 * 1024 * 1024) { toast(`${f.name} passa de 20 MB.`, true); continue; }
        const caminho = `${p.id}/${Date.now()}_${f.name.replace(/[^\w.\-]+/g, '_')}`;
        const up = await db.storage.from('pacientes').upload(caminho, f, { contentType: f.type });
        if (up.error) { toast(up.error.message, true); continue; }
        const r = await db.from('imagens_paciente').insert({ paciente_id: p.id, nome: f.name, caminho, mime: f.type, tamanho: f.size });
        if (r.error) { await db.storage.from('pacientes').remove([caminho]); toast(r.error.message, true); }
      }
      toast('Envio concluído.'); refresh();
    };
    $$('[data-del]', b).forEach((x) => (x.onclick = async () => {
      if (!confirm('Excluir este arquivo?')) return;
      const im = data.find((d) => d.id === x.dataset.del);
      await db.storage.from('pacientes').remove([im.caminho]);
      await q(db.from('imagens_paciente').delete().eq('id', im.id));
      toast('Arquivo excluído.'); refresh();
    }));
  }

  /* ---------- Documentos ---------- */
  const TIPOS = { contrato: 'Contrato', termo: 'Termo de consentimento', receituario: 'Receituário', atestado: 'Atestado', personalizado: 'Personalizado' };
  const MODELOS = {
    contrato: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ODONTOLÓGICOS\n\nPelo presente instrumento, {{clinica}} (CONTRATADA) e {{paciente}}, CPF {{cpf}} (CONTRATANTE), acordam a prestação dos serviços odontológicos descritos no plano de tratamento aprovado, pelos valores e condições ali estabelecidos.\n\nO CONTRATANTE declara ter sido informado sobre o tratamento, riscos, alternativas e custos.\n\n{{cidade}}, {{data}}.\n\n______________________________\n{{paciente}}',
    termo: 'TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO\n\nEu, {{paciente}}, CPF {{cpf}}, declaro que fui informado(a) pelo(a) Dr(a). {{dentista}} sobre o procedimento proposto, seus benefícios, riscos e alternativas, e autorizo sua realização.\n\n{{cidade}}, {{data}}.\n\n______________________________\n{{paciente}}',
    receituario: 'RECEITUÁRIO\n\nPaciente: {{paciente}}\n\n1. ______________________\n   Posologia: ______________\n\n{{cidade}}, {{data}}.\n\n______________________________\nDr(a). {{dentista}}',
    atestado: 'ATESTADO\n\nAtesto para os devidos fins que {{paciente}}, CPF {{cpf}}, esteve sob atendimento odontológico nesta data, necessitando de ______ dia(s) de afastamento de suas atividades.\n\n{{cidade}}, {{data}}.\n\n______________________________\nDr(a). {{dentista}}',
    personalizado: '',
  };
  const preencher = (txt, p, dent, extra = {}) => txt.replace(/\{\{(\w+)\}\}/g, (_, k) => ({
    paciente: p.nome, cpf: fmtCPF(p.cpf), dentista: dent || '__________', clinica: 'My Dents Odontologia & Estética', cidade: p.cidade || 'Fortaleza',
    data: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }), ...extra,
  }[k] ?? ''));
  function imprimir(titulo, texto) {
    const w = window.open('', '_blank');
    if (!w) return toast('Libere pop-ups para imprimir.', true);
    w.document.write(`<!doctype html><title>${esc(titulo)}</title><body style="font:15px/1.6 Georgia,serif;max-width:720px;margin:2.5cm auto;white-space:pre-wrap">${esc(texto)}</body>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }
  async function abaDocs(b, p) {
    const data = await q(db.from('documentos_paciente').select('*, dentistas!dentista_id(nome)').eq('paciente_id', p.id).order('criado_em', { ascending: false }));
    b.innerHTML = `<div class="actions" style="margin-bottom:1rem">${Object.entries(TIPOS).map(([k, v]) => `<button class="btn ghost sm" data-perm="prontuario" data-novo="${k}">+ ${esc(v)}</button>`).join('')}</div>` +
      table(['Data', 'Tipo', 'Título', 'Dentista', ''], rows(data, (d) =>
        `<tr><td>${fmtD(d.data)}</td><td>${esc(TIPOS[d.tipo])}</td><td>${esc(d.titulo)}</td><td>${esc(d.dentistas?.nome)}</td>
         <td class="nowrap"><button class="btn ghost sm" data-ver="${esc(d.id)}">Ver / imprimir</button> <button class="btn ghost sm" data-del="${esc(d.id)}">Excluir</button></td></tr>`, 'Nenhum documento emitido.', 5));
    $$('[data-novo]', b).forEach((x) => (x.onclick = () => {
      const tipo = x.dataset.novo;
      modal({
        title: `Novo — ${TIPOS[tipo]}`, wide: true, submit: 'Salvar documento',
        body: `<div class="form-row"><label>Título<input name="titulo" required value="${esc(TIPOS[tipo])}"></label>
          <label>Dentista<select name="dentista_id">${opts(state.dentistas, (d) => d.nome, 'Selecione…')}</select></label></div>
          <label>Texto (use {{paciente}}, {{cpf}}, {{dentista}}, {{data}}, {{cidade}})<textarea name="conteudo" rows="14" required>${esc(MODELOS[tipo])}</textarea></label>`,
        onSubmit: async (v) => {
          const dn = state.dentistas.find((d) => d.id === v.dentista_id)?.nome;
          const conteudo = preencher(v.conteudo, p, dn);
          await q(db.from('documentos_paciente').insert({ paciente_id: p.id, tipo, titulo: v.titulo, conteudo, dentista_id: v.dentista_id || null }));
          toast('Documento salvo.'); refresh();
        },
      });
    }));
    $$('[data-ver]', b).forEach((x) => (x.onclick = () => {
      const d = data.find((i) => i.id === x.dataset.ver);
      modal({ title: d.titulo, wide: true, body: `<pre style="white-space:pre-wrap;font:inherit">${esc(d.conteudo)}</pre>`, extra: '<button type="button" class="btn" id="imp" style="margin-right:auto">Imprimir</button>',
        onOpen: (f) => { $('#imp', f).onclick = () => imprimir(d.titulo, d.conteudo); } });
    }));
    $$('[data-del]', b).forEach((x) => (x.onclick = async () => {
      if (!confirm('Excluir este documento?')) return;
      await q(db.from('documentos_paciente').delete().eq('id', x.dataset.del)); toast('Documento excluído.'); refresh();
    }));
  }

  /* ---------- Débitos ---------- */
  async function abaDeb(b, p) {
    const [deb, rec] = await Promise.all([
      q(db.from('debitos').select('*, orcamentos(codigo)').eq('paciente_id', p.id).order('data_lancamento', { ascending: false })),
      q(db.from('recebimentos').select('*').eq('paciente_id', p.id).order('codigo', { ascending: false })),
    ]);
    const receb = rec.filter((r) => r.status !== 'estornado').reduce((s, r) => s + Number(r.valor_aplicado || 0), 0);
    const areceber = deb.filter((d) => d.status !== 'cancelado').reduce((s, d) => s + Number(d.saldo), 0);
    b.innerHTML = `<div class="grid"><div class="card stat"><span>Total recebido</span><b class="txt-ok">${brl(receb)}</b></div><div class="card stat"><span>Total a receber</span><b class="${areceber > 0 ? 'txt-vencido' : ''}">${brl(areceber)}</b></div></div>
      <h4>Débitos</h4>${table(['Orç.', 'Lançado', 'Vencimento', 'Original', 'Desconto', 'Pago', 'Saldo', 'Situação', ''], rows(deb, (d) =>
        `<tr><td>#${esc(d.orcamentos?.codigo)}</td><td>${fmtD(d.data_lancamento)}</td><td>${fmtD(d.vencimento)}</td><td>${brl(d.valor_original)}</td><td>${brl(d.desconto)}</td><td>${brl(d.valor_pago)}</td><td><b>${brl(d.saldo)}</b></td><td>${badge(d.status)}</td>
         <td>${d.status === 'pago' || d.status === 'cancelado' ? '' : `<button class="btn sm" data-perm="debitos_receber" data-receber="${esc(d.id)}">Receber</button>`}</td></tr>`, 'Nenhum débito.', 9))}
      <h4 style="margin-top:1.25rem">Recebimentos</h4>${table(['#', 'Data', 'Meio', 'Valor', 'Líquido', 'Situação'], rows(rec, (r) =>
        `<tr><td>${r.codigo}</td><td>${fmtD(r.data_lancamento)}</td><td>${esc(r.meio)}${r.meio === 'credito' ? ` ${r.parcelas}×` : ''}</td><td>${brl(r.valor)}</td><td>${brl(r.valor_liquido)}</td><td>${badge(r.status === 'previsto' ? 'agendado' : r.status === 'estornado' ? 'cancelado' : 'realizado')} ${esc(r.status)}</td></tr>`, 'Nenhum recebimento.', 6))}`;
    $$('[data-receber]', b).forEach((x) => (x.onclick = () => window.MD.receber(x.dataset.receber)));
  }

  register('paciente', 'Paciente', async (el, id) => {
    if (!id) { location.hash = '#pacientes'; return; }
    const p = await q(db.from('pacientes').select('*, unidades!unidade_id(nome)').eq('id', id).single());
    const anam = await q(db.from('anamneses').select('alertas').eq('paciente_id', id).order('data', { ascending: false }).limit(1));
    const ini = p.nome.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
    el.innerHTML = `<div class="ficha-head"><a class="btn ghost sm" href="#pacientes">← Pacientes</a>
        <div class="avatar">${esc(ini)}</div><div style="flex:1"><h3 style="margin:0">${esc(p.nome)}</h3><div class="hint">${esc(p.telefone)} · CPF ${fmtCPF(p.cpf)} · ${esc(p.unidades?.nome)}</div></div>
        <button class="btn ghost sm" data-perm="pacientes_editar" id="edit">Editar</button><button class="btn ghost sm" data-perm="agenda_editar" id="agendar">Agendar</button></div>
      ${anam[0]?.alertas ? `<div class="alerta">⚠ ${esc(anam[0].alertas)}</div>` : ''}<div id="abas"></div>`;
    $('#edit', el).onclick = () => editarPaciente(p);
    $('#agendar', el).onclick = () => novoAgendamento(p.id);
    await tabs($('#abas', el), 'paciente', [
      { id: 'sobre', label: 'Sobre', render: (b) => abaSobre(b, p) },
      { id: 'orcamentos', label: 'Orçamentos', render: (b) => abaOrc(b, p) },
      { id: 'tratamentos', label: 'Tratamentos', render: (b) => abaTrat(b, p) },
      { id: 'anamnese', label: 'Anamnese', render: (b) => abaAnam(b, p) },
      { id: 'imagens', label: 'Imagens', render: (b) => abaImg(b, p) },
      { id: 'documentos', label: 'Documentos', render: (b) => abaDocs(b, p) },
      { id: 'debitos', label: 'Débitos', render: (b) => abaDeb(b, p) },
    ]);
  }, 999, 'pacientes');
})();
