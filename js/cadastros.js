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
        <label>Dia do pagamento (mês seguinte)<input name="dia_pagamento" type="number" min="1" max="31" value="${esc(d.dia_pagamento)}" placeholder="vazio = último dia do mês"></label>
        <p class="hint">Mudar o % não altera orçamentos já aprovados: o percentual fica congelado na aprovação.</p>`,
      onSubmit: async (v) => {
        if (!validarCPF(v.cpf)) throw new Error('CPF inválido.');
        v.cpf = digits(v.cpf);
        v.percentual_comissao_venda = num(v.percentual_comissao_venda);
        v.dia_pagamento = v.dia_pagamento ? parseInt(v.dia_pagamento, 10) : null;
        const { error } = d.id ? await db.from('dentistas').update(v).eq('id', d.id) : await db.from('dentistas').insert(v);
        if (error) throw new Error(error.code === '23505' ? 'Já existe um dentista com esse CPF.' : error.message);
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
      $('#l', b).innerHTML = table(['Nome', 'CPF', 'Especialidade', 'Unidade', '% venda', 'Dia pgto', ''], rows(state.dentistas, (d) =>
        `<tr><td>${esc(d.nome)}</td><td>${fmtCPF(d.cpf)}</td><td>${esc(d.especialidade)}</td><td>${esc(d.unidades?.nome)}</td>
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
      const lista = await q(db.from('perfis_usuario').select('*').order('criado_em'));
      const adm = can('admin');
      const cols = [['admin', 'Administrador'], ['financeiro', 'Financeiro'], ['fechar_caixa', 'Fechar caixa'], ['alterar_comissao', 'Alterar comissão']];
      b.innerHTML = `<p class="hint">Crie os usuários em Supabase › Authentication › Users (e-mail + senha). O primeiro usuário vira administrador; aqui você define as permissões dos demais.</p><div id="l"></div>`;
      $('#l', b).innerHTML = table(['Usuário', ...cols.map((c) => c[1])], rows(lista, (u) =>
        `<tr><td>${esc(u.nome)}</td>${cols.map(([k]) => `<td><input type="checkbox" style="width:auto" data-u="${esc(u.user_id)}" data-k="${k}" ${u[k] ? 'checked' : ''} ${adm ? '' : 'disabled'}></td>`).join('')}</tr>`,
        'Sem usuários.', 5));
      $$('[data-u]', b).forEach((c) => (c.onchange = async () => {
        const { error } = await db.from('perfis_usuario').update({ [c.dataset.k]: c.checked }).eq('user_id', c.dataset.u);
        error ? (toast(error.message, true), (c.checked = !c.checked)) : toast('Permissão atualizada.');
      }));
    } },
  ]), 100);
})();
