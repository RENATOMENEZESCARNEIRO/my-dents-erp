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
      const cont = (u) => PERMISSOES.flatMap(([, ps]) => ps).filter(([k]) => u.admin || u.permissoes?.[k] || u[k]).length;
      b.innerHTML = `<p class="hint">Crie o login em Supabase › Authentication › Users (e-mail + senha). Novos usuários entram <b>sem acesso</b>: libere e defina as permissões aqui.</p><div id="l"></div>`;
      $('#l', b).innerHTML = table(['Usuário', 'Cargo', 'Acesso', 'Permissões', ''], rows(lista, (u) =>
        `<tr><td>${esc(u.nome)}</td><td>${esc(u.cargo || (u.admin ? 'Administrador' : '—'))}</td><td>${badge(u.ativo ? 'ativa' : 'cancelada')} ${u.ativo ? 'liberado' : 'aguardando'}</td>
         <td>${cont(u)} de ${PERMISSOES.flatMap(([, ps]) => ps).length}</td><td>${adm ? `<button class="btn ghost sm" data-u="${esc(u.user_id)}">Editar</button>` : ''}</td></tr>`, 'Sem usuários.', 5));
      $$('[data-u]', b).forEach((x) => (x.onclick = () => {
        const u = lista.find((i) => i.user_id === x.dataset.u);
        const marcado = (k) => !!(u.admin && k === 'admin') || !!u.permissoes?.[k] || !!u[k];
        modal({
          title: `Permissões — ${u.nome}`, wide: true, submit: 'Salvar',
          body: `<div class="form-row"><label>Cargo (modelo de permissões)<select name="cargo" id="cargo">${opts([{ id: '', n: 'Personalizado' }, ...Object.keys(CARGOS).map((c) => ({ id: c, n: c }))], (c) => c.n, null, u.cargo || '')}</select></label>
              <label class="inline" style="align-self:end"><input type="checkbox" name="ativo" style="width:auto" ${u.ativo ? 'checked' : ''}> Acesso liberado</label></div>
            ${PERMISSOES.map(([g, ps]) => `<h4 style="margin:.8rem 0 .3rem">${esc(g)}</h4>${ps.map(([k, n]) => `<label class="inline" style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" style="width:auto" data-perm-k="${k}" ${marcado(k) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}`).join('')}`,
          onOpen: (form) => {
            $('#cargo', form).onchange = (e) => { const set = CARGOS[e.target.value]; if (!set) return; $$('[data-perm-k]', form).forEach((c) => { c.checked = c.dataset.permK === 'admin' ? c.checked : set.includes(c.dataset.permK); }); };
          },
          onSubmit: async (v, form) => {
            const ks = $$('[data-perm-k]', form);
            const permissoes = {}; ks.forEach((c) => { if (c.checked && c.dataset.permK !== 'admin') permissoes[c.dataset.permK] = true; });
            const admin = ks.find((c) => c.dataset.permK === 'admin').checked;
            if (u.user_id === window.MD.state.user.id && (!admin || !form.ativo.checked)) throw new Error('Você não pode remover seu próprio acesso de administrador.');
            await q(db.from('perfis_usuario').update({ cargo: v.cargo || (admin ? 'Administrador' : null), ativo: form.ativo.checked, admin, permissoes,
              financeiro: !!permissoes.financeiro, fechar_caixa: !!permissoes.fechar_caixa, alterar_comissao: !!permissoes.alterar_comissao }).eq('user_id', u.user_id));
            toast('Usuário atualizado.'); refresh();
          },
        });
      }));
    } },
  ]), 100);
})();
