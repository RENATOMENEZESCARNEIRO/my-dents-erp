/* Cadastros: dentistas, procedimentos (catálogo), contas, taxas de cartão e usuários. */
(() => {
  'use strict';
  const { db, $, $$, esc, fmtCPF, digits, brl, num, toast, state, opts, rows, table, badge, can, q, modal, tabs, register, refresh, carregarBase, validarCPF } = window.MD;
  const SETORES = ['Clínico', 'Ortodontia', 'Administrativo/Geral', 'Convênios'];

  /* ----- Dentistas ----- */
  function dentistaForm(d = {}) {
    modal({
      title: d.id ? 'Editar dentista' : 'Novo dentista',
      body: `<label>Nome<input name="nome" required value="${esc(d.nome)}"></label>
        <div class="form-row">
          <label>CPF<input name="cpf" required inputmode="numeric" value="${esc(d.cpf ? fmtCPF(d.cpf) : '')}"></label>
          <label>Especialidade<input name="especialidade" value="${esc(d.especialidade)}" placeholder="Ortodontia, Clínico…"></label>
        </div>
        <div class="form-row">
          <label>Unidade principal<select name="unidade_id">${opts(state.unidades, (u) => u.nome, 'Selecione…', d.unidade_id)}</select></label>
          <label>% comissão de venda<input name="percentual_comissao_venda" type="number" step="0.01" min="0" max="100" value="${esc(d.percentual_comissao_venda ?? 0)}"></label>
        </div>
        <div><span class="hint">Unidades em que atende</span><div class="actions">${state.unidades.map((u) => `<label class="inline"><input type="checkbox" style="width:auto" name="unid" value="${esc(u.id)}" ${(d.unidades_ids || []).includes(u.id) || (!d.id && u.id === state.unidadeId) ? 'checked' : ''}> ${esc(u.nome)}</label>`).join('')}</div></div>
        <label>Dia do pagamento (mês seguinte)<input name="dia_pagamento" type="number" min="1" max="31" value="${esc(d.dia_pagamento)}" placeholder="vazio = último dia do mês"></label>
        <p class="hint">Mudar o % não altera orçamentos já aprovados: o percentual fica congelado na aprovação.</p>`,
      onSubmit: async (v, form) => {
        if (!validarCPF(v.cpf)) throw new Error('CPF inválido.');
        const unis = $$('[name=unid]:checked', form).map((c) => c.value);
        delete v.unid;
        v.cpf = digits(v.cpf);
        v.percentual_comissao_venda = num(v.percentual_comissao_venda);
        v.dia_pagamento = v.dia_pagamento ? parseInt(v.dia_pagamento, 10) : null;
        if (v.unidade_id && !unis.includes(v.unidade_id)) unis.push(v.unidade_id);
        const r = d.id ? await db.from('dentistas').update(v).eq('id', d.id).select('id').single() : await db.from('dentistas').insert(v).select('id').single();
        if (r.error) throw new Error(r.error.code === '23505' ? 'Já existe um dentista com esse CPF.' : r.error.message);
        await q(db.from('dentista_unidades').delete().eq('dentista_id', r.data.id));
        if (unis.length) await q(db.from('dentista_unidades').insert(unis.map((u) => ({ dentista_id: r.data.id, unidade_id: u }))));
        toast('Dentista salvo.');
        await carregarBase();
        refresh();
      },
    });
  }

  /* ----- Procedimentos ----- */
  function procedimentoForm(p = {}) {
    modal({
      title: p.id ? 'Editar procedimento' : 'Novo procedimento',
      body: `<div class="form-row">
          <label>Código<input name="codigo" required value="${esc(p.codigo)}"></label>
          <label>Setor<select name="setor">${opts(SETORES.map((s) => ({ id: s, nome: s })), (x) => x.nome, null, p.setor || 'Clínico')}</select></label>
        </div>
        <label>Nome<input name="nome" required value="${esc(p.nome)}"></label>
        <div class="form-row">
          <label>Valor de venda (à vista)<input name="valor_venda" type="number" step="0.01" min="0" required value="${esc(p.valor_venda)}"></label>
          <label>Valor parcelado<input name="valor_parcelado" type="number" step="0.01" min="0" value="${esc(p.valor_parcelado)}" placeholder="vazio = igual à vista"></label>
        </div>
        <div class="form-row">
          <label>Valor de execução (pago ao dentista)<input name="valor_execucao" type="number" step="0.01" min="0" required value="${esc(p.valor_execucao)}"></label>
          <label>Custo<input name="custo" type="number" step="0.01" min="0" value="${esc(p.custo ?? 0)}"></label>
        </div>
        <div class="form-row">
          <label>Tempo previsto (min)<input name="tempo_min" type="number" min="0" value="${esc(p.tempo_min)}"></label>
          <label>Situação<select name="ativo">${opts([{ id: 'true', n: 'Ativo' }, { id: 'false', n: 'Inativo' }], (x) => x.n, null, String(p.ativo ?? true))}</select></label>
        </div>
        <p class="hint">Procedimento ativo precisa de código, valor de venda e valor de execução maiores que zero.</p>`,
      onSubmit: async (v) => {
        const o = { ...v, valor_venda: num(v.valor_venda), valor_execucao: num(v.valor_execucao), custo: num(v.custo), ativo: v.ativo === 'true',
          valor_parcelado: v.valor_parcelado == null ? null : num(v.valor_parcelado), tempo_min: v.tempo_min ? parseInt(v.tempo_min, 10) : null };
        if (o.ativo && (o.valor_venda <= 0 || o.valor_execucao <= 0)) throw new Error('Para ficar ativo, informe valor de venda e de execução.');
        const { error } = p.id ? await db.from('procedimentos').update(o).eq('id', p.id) : await db.from('procedimentos').insert(o);
        if (error) throw new Error(error.code === '23505' ? 'Já existe um procedimento com esse código.' : error.message);
        toast('Procedimento salvo.');
        await carregarBase();
        refresh();
      },
    });
  }

  /* ----- Contas ----- */
  function contaForm(c = {}) {
    modal({
      title: c.id ? 'Editar conta' : 'Nova conta',
      body: `<label>Nome<input name="nome" required value="${esc(c.nome)}"></label>
        <div class="form-row">
          <label>Tipo<select name="tipo">${opts([{ id: 'banco', n: 'Banco' }, { id: 'caixa', n: 'Caixa (espécie)' }], (x) => x.n, null, c.tipo || 'banco')}</select></label>
          <label>Saldo inicial<input name="saldo_inicial" type="number" step="0.01" value="${esc(c.saldo_inicial ?? 0)}"></label>
        </div>
        <p class="hint">O saldo das contas é calculado pelos lançamentos. Ajuste o saldo inicial só quando o sistema estiver em operação.</p>`,
      onSubmit: async (v) => {
        v.saldo_inicial = num(v.saldo_inicial);
        await q(c.id ? db.from('contas_bancarias').update(v).eq('id', c.id) : db.from('contas_bancarias').insert(v));
        toast('Conta salva.');
        await carregarBase();
        refresh();
      },
    });
  }

  register('cadastros', 'Cadastros', (el) => tabs(el, 'cadastros', [
    { id: 'dentistas', label: 'Dentistas', render: async (b) => {
      b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><button class="btn" id="n">+ Novo dentista</button></div><div id="l"></div>`;
      $('#n', b).onclick = () => dentistaForm();
      $('#l', b).innerHTML = table(['Nome', 'CPF', 'Especialidade', 'Unidades', '% venda', 'Dia pgto', ''], rows(state.dentistas, (d) =>
        `<tr><td>${esc(d.nome)}</td><td>${fmtCPF(d.cpf)}</td><td>${esc(d.especialidade)}</td><td>${esc((d.unidades_ids?.length ? state.unidades.filter((u) => d.unidades_ids.includes(u.id)).map((u) => u.nome) : [d.unidades?.nome]).join(', '))}</td>
         <td>${esc(d.percentual_comissao_venda)}%</td><td>${esc(d.dia_pagamento ?? 'último')}</td>
         <td><button class="btn ghost sm" data-edit="${esc(d.id)}">Editar</button></td></tr>`, 'Nenhum dentista.', 7));
      $$('[data-edit]', b).forEach((x) => (x.onclick = () => dentistaForm(state.dentistas.find((d) => d.id === x.dataset.edit))));
    } },
    { id: 'procedimentos', label: 'Procedimentos', render: async (b) => {
      b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><button class="btn" id="n">+ Novo procedimento</button></div><div id="l"></div>`;
      $('#n', b).onclick = () => procedimentoForm();
      $('#l', b).innerHTML = table(['Código', 'Nome', 'Setor', 'Venda', 'Parcelado', 'Execução', 'Custo', 'Situação', ''], rows(state.procedimentos, (p) =>
        `<tr><td>${esc(p.codigo)}</td><td>${esc(p.nome)}</td><td>${esc(p.setor)}</td><td>${brl(p.valor_venda)}</td>
         <td>${p.valor_parcelado != null ? brl(p.valor_parcelado) : '–'}</td><td>${brl(p.valor_execucao)}</td><td>${brl(p.custo)}</td>
         <td>${badge(p.ativo ? 'ativa' : 'cancelada')}</td><td><button class="btn ghost sm" data-edit="${esc(p.id)}">Editar</button></td></tr>`, 'Nenhum procedimento cadastrado.', 9));
      $$('[data-edit]', b).forEach((x) => (x.onclick = () => procedimentoForm(state.procedimentos.find((p) => p.id === x.dataset.edit))));
    } },
    { id: 'contas', label: 'Contas', render: async (b) => {
      b.innerHTML = `<div class="actions" style="margin-bottom:1rem"><button class="btn" id="n" ${can('financeiro') ? '' : 'disabled'}>+ Nova conta</button></div><div id="l"></div>`;
      $('#n', b).onclick = () => contaForm();
      $('#l', b).innerHTML = table(['Conta', 'Tipo', 'Saldo inicial', ''], rows(state.contas, (c) =>
        `<tr><td>${esc(c.nome)}</td><td>${esc(c.tipo)}</td><td>${brl(c.saldo_inicial)}</td>
         <td>${can('financeiro') ? `<button class="btn ghost sm" data-edit="${esc(c.id)}">Editar</button>` : ''}</td></tr>`, 'Nenhuma conta.', 4));
      $$('[data-edit]', b).forEach((x) => (x.onclick = () => contaForm(state.contas.find((c) => c.id === x.dataset.edit))));
    } },
    { id: 'taxas', label: 'Taxas de cartão', render: async (b) => {
      const [taxas, cfg] = await Promise.all([q(db.from('taxas_cartao').select('*').order('modalidade').order('parcelas')), q(db.from('config').select('*').eq('chave', 'taxas_cartao_ativas'))]);
      const ativo = cfg[0] ? String(cfg[0].valor) === 'true' : true;
      const edit = can('financeiro');
      b.innerHTML = `<div class="card" style="margin-bottom:1rem"><label style="margin:0"><input type="checkbox" id="ativo" ${ativo ? 'checked' : ''} ${edit ? '' : 'disabled'} style="width:auto"> Aplicar taxas nos recebimentos de cartão</label>
        <p class="hint" style="margin:.5rem 0 0">Débito 0,99% e crédito 1× 3,15% / 12× 10,69% vêm do contrato. As parcelas intermediárias foram estimadas (marcadas "revisar"): confira e ajuste.</p></div>
        <div id="l"></div><div class="form-actions" style="margin-top:1rem"><button class="btn" id="salvar" ${edit ? '' : 'disabled'}>Salvar taxas</button></div>`;
      $('#l', b).innerHTML = table(['Modalidade', 'Parcelas', 'Taxa (%)', ''], rows(taxas, (t) =>
        `<tr><td>${esc(t.modalidade)}</td><td>${t.parcelas}×</td>
         <td><input type="number" step="0.01" min="0" style="width:110px" data-taxa="${esc(t.id)}" value="${esc(t.percentual)}" ${edit ? '' : 'disabled'}></td>
         <td>${t.revisar ? '<span class="badge em_atendimento">revisar</span>' : ''}</td></tr>`, 'Sem taxas.', 4));
      $('#salvar', b).onclick = async () => {
        try {
          await q(db.from('config').upsert({ chave: 'taxas_cartao_ativas', valor: $('#ativo', b).checked }));
          for (const i of $$('[data-taxa]', b)) await q(db.from('taxas_cartao').update({ percentual: num(i.value), revisar: false }).eq('id', i.dataset.taxa));
          toast('Taxas salvas.');
          refresh();
        } catch (e) { toast(e.message, true); }
      };
    } },
    { id: 'usuarios', label: 'Usuários', render: async (b) => {
      const { PERMISSOES, CARGOS } = window.MD;
      const lista = await q(db.from('perfis_usuario').select('*').order('criado_em'));
      const adm = can('admin');
      const total = PERMISSOES.flatMap(([, ps]) => ps).length;
      const cont = (u) => PERMISSOES.flatMap(([, ps]) => ps).filter(([k]) => u.admin || u.permissoes?.[k] || u[k]).length;
      const fmtTel = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : ''; };
      const nomesUn = (u) => (u.admin ? 'Todas' : (u.unidades_acesso || []).map((id) => state.unidades.find((x) => x.id === id)?.nome).filter(Boolean).join(', ') || '—');
      const chamar = async (body) => {
        const { data, error } = await db.functions.invoke('admin-usuarios', { body });
        if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch (_) { /* sem corpo */ } throw new Error(m); }
        if (data?.error) throw new Error(data.error);
        return data;
      };
      const permBloco = (u) => {
        const marcado = (k) => !!(u.admin && k === 'admin') || !!u.permissoes?.[k] || !!u[k];
        return `<div class="form-row"><label>Cargo (modelo de permissões)<select name="cargo" id="cargo">${opts([{ id: '', n: 'Personalizado' }, ...Object.keys(CARGOS).map((c) => ({ id: c, n: c }))], (c) => c.n, null, u.cargo || '')}</select></label></div>
          ${PERMISSOES.map(([g, ps]) => `<h4 style="margin:.8rem 0 .3rem">${esc(g)}</h4>${ps.map(([k, n]) => `<label class="inline" style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" style="width:auto" data-perm-k="${k}" ${marcado(k) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}`).join('')}`;
      };
      const permLigar = (form) => { $('#cargo', form).onchange = (e) => { const set = CARGOS[e.target.value]; if (!set) return; $$('[data-perm-k]', form).forEach((c) => { c.checked = c.dataset.permK === 'admin' ? c.checked : set.includes(c.dataset.permK); }); }; };
      const permLer = (form) => {
        const ks = $$('[data-perm-k]', form), permissoes = {};
        ks.forEach((c) => { if (c.checked && c.dataset.permK !== 'admin') permissoes[c.dataset.permK] = true; });
        return { permissoes, admin: ks.find((c) => c.dataset.permK === 'admin').checked };
      };
      const unBloco = (sel = []) => `<fieldset style="border:1px solid var(--line,#d6dde6);border-radius:8px;padding:.5rem .8rem;margin:.5rem 0"><legend>Unidades que pode acessar *</legend>
        ${state.unidades.map((u) => `<label class="inline" style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" style="width:auto" data-un="${esc(u.id)}" ${sel.includes(u.id) ? 'checked' : ''}> ${esc(u.nome)}</label>`).join('')}</fieldset>`;
      const unLer = (form) => $$('[data-un]:checked', form).map((c) => c.dataset.un);

      b.innerHTML = `${adm ? '<div class="actions" style="margin-bottom:1rem"><button class="btn" id="novo-u">+ Novo usuário</button></div>' : ''}
        <p class="hint">Login = CPF. Todo usuário novo (ou com senha resetada) entra com a senha <b>1234</b> e é obrigado a criar a senha definitiva no primeiro acesso.</p><div id="l"></div>`;
      $('#l', b).innerHTML = table(['Usuário', 'CPF', 'Telefone', 'Unidades', 'Cargo', 'Acesso', 'Permissões', ''], rows(lista, (u) =>
        `<tr><td>${esc(u.nome)}</td><td>${u.cpf ? esc(window.MD.fmtCPF(u.cpf)) : '—'}</td><td>${esc(fmtTel(u.telefone)) || '—'}</td><td>${esc(nomesUn(u))}</td><td>${esc(u.cargo || (u.admin ? 'Administrador' : '—'))}</td>
         <td>${badge(u.ativo ? 'ativa' : 'cancelada')} ${u.ativo ? 'liberado' : 'bloqueado'}${u.trocar_senha ? '<br><small>aguarda 1º acesso</small>' : ''}</td>
         <td>${cont(u)} de ${total}</td>
         <td>${adm ? `<button class="btn ghost sm" data-u="${esc(u.user_id)}">Editar</button> ${u.cpf ? `<button class="btn ghost sm" data-reset="${esc(u.user_id)}">Resetar senha</button>` : ''}` : ''}</td></tr>`, 'Sem usuários.', 8));

      const novo = $('#novo-u', b);
      if (novo) novo.onclick = () => modal({
        title: 'Novo usuário', wide: true, submit: 'Criar usuário',
        body: `<div class="form-row"><label>Nome completo *<input name="nome" required></label><label>CPF (será o login) *<input name="cpf" required inputmode="numeric" placeholder="000.000.000-00"></label></div>
          <label>Telefone com DDD *<input name="telefone" required inputmode="tel" placeholder="(85) 99999-9999"></label>
          ${unBloco()}${permBloco({})}`,
        onOpen: (form) => permLigar(form),
        onSubmit: async (v, form) => {
          const cpf = String(v.cpf || '').replace(/\D/g, ''), tel = String(v.telefone || '').replace(/\D/g, '');
          if (!window.MD.validarCPF(cpf)) throw new Error('CPF inválido.');
          if (tel.length < 10 || tel.length > 11) throw new Error('Informe o telefone com DDD.');
          const unidades = unLer(form);
          if (!unidades.length) throw new Error('Selecione ao menos uma unidade.');
          const { permissoes } = permLer(form);
          await chamar({ action: 'criar', nome: v.nome, cpf, telefone: tel, unidades, cargo: v.cargo || null, permissoes });
          toast('Usuário criado. Senha provisória: 1234 (troca obrigatória no 1º acesso).'); refresh();
        },
      });

      $$('[data-reset]', b).forEach((x) => (x.onclick = async () => {
        const u = lista.find((i) => i.user_id === x.dataset.reset);
        if (!confirm(`Resetar a senha de ${u.nome}? Ela voltará para 1234 e deverá ser trocada no próximo acesso.`)) return;
        try { await chamar({ action: 'resetar', user_id: u.user_id }); toast('Senha resetada para 1234.'); refresh(); } catch (e) { toast(e.message, true); }
      }));

      $$('[data-u]', b).forEach((x) => (x.onclick = () => {
        const u = lista.find((i) => i.user_id === x.dataset.u);
        modal({
          title: `Usuário — ${u.nome}`, wide: true, submit: 'Salvar',
          body: `<div class="form-row"><label>Nome<input name="nome" required value="${esc(u.nome)}"></label>
              <label>CPF (login)<input name="cpf" value="${esc(u.cpf || '')}" ${u.cpf ? 'disabled' : 'placeholder="só números"'}></label></div>
            <div class="form-row"><label>Telefone com DDD<input name="telefone" value="${esc(u.telefone || '')}"></label>
              <label class="inline" style="align-self:end"><input type="checkbox" name="ativo" style="width:auto" ${u.ativo ? 'checked' : ''}> Acesso liberado</label></div>
            ${unBloco(u.unidades_acesso || [])}${permBloco(u)}`,
          onOpen: (form) => permLigar(form),
          onSubmit: async (v, form) => {
            const { permissoes, admin } = permLer(form), unidades = unLer(form);
            if (!admin && !unidades.length) throw new Error('Selecione ao menos uma unidade.');
            if (u.user_id === window.MD.state.user.id && (!admin || !form.ativo.checked)) throw new Error('Você não pode remover seu próprio acesso de administrador.');
            const tel = String(v.telefone || '').replace(/\D/g, '');
            if (tel && (tel.length < 10 || tel.length > 11)) throw new Error('Telefone inválido (use DDD + número).');
            const upd = { nome: v.nome, telefone: tel || null, unidades_acesso: unidades, cargo: v.cargo || (admin ? 'Administrador' : null), ativo: form.ativo.checked, admin, permissoes,
              financeiro: !!permissoes.financeiro, fechar_caixa: !!permissoes.fechar_caixa, alterar_comissao: !!permissoes.alterar_comissao };
            if (!u.cpf && v.cpf) { const c = String(v.cpf).replace(/\D/g, ''); if (!window.MD.validarCPF(c)) throw new Error('CPF inválido.'); upd.cpf = c; }
            await q(db.from('perfis_usuario').update(upd).eq('user_id', u.user_id));
            toast('Usuário atualizado.'); refresh();
          },
        });
      }));
    } },
    { id: 'unidades', label: 'Unidades', render: async (b) => {
      const un = await q(db.from('unidades').select('*').order('nome'));
      const adm = can('admin') || can('cadastros_editar');
      b.innerHTML = `${adm ? '<div class="actions" style="margin-bottom:1rem"><button class="btn" id="n">+ Nova unidade</button></div>' : ''}<div id="l"></div>`;
      const form = (u = {}) => modal({
        title: u.id ? 'Editar unidade' : 'Nova unidade',
        body: `<label>Nome<input name="nome" required value="${esc(u.nome)}"></label>
          <label class="inline"><input type="checkbox" name="ativo" style="width:auto" ${u.ativo === false ? '' : 'checked'}> Ativa</label>`,
        onSubmit: async (v, f) => {
          const dados = { nome: v.nome, ativo: f.ativo.checked };
          await q(u.id ? db.from('unidades').update(dados).eq('id', u.id) : db.from('unidades').insert(dados));
          toast('Unidade salva.'); await carregarBase(); refresh();
        },
      });
      if ($('#n', b)) $('#n', b).onclick = () => form();
      $('#l', b).innerHTML = table(['Unidade', 'Situação', ''], rows(un, (u) => `<tr><td>${esc(u.nome)}</td><td>${badge(u.ativo ? 'ativa' : 'cancelada')} ${u.ativo ? 'ativa' : 'inativa'}</td>
        <td>${adm ? `<button class="btn ghost sm" data-e="${esc(u.id)}">Editar</button>` : ''}</td></tr>`, 'Nenhuma unidade.', 3));
      $$('[data-e]', b).forEach((x) => (x.onclick = () => form(un.find((i) => i.id === x.dataset.e))));
    } },
  ]), 100);
})();
