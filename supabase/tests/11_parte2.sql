-- continuação do teste (mesma sessão psql da parte 1)
select id as deb from debitos where orcamento_id=:'orc1' \gset
select abrir_caixa(:'aldeota') as turno \gset
select receber_debito(:'deb', 700, 100, 'pix', :'bradesco', :'dv') as rec1 \gset
select t_assert((select status from debitos where id=:'deb')='pago' and (select saldo from debitos where id=:'deb')=0, 'desconto quita o débito');
select t_assert((select valor from comissoes where tipo='venda')=70, 'comissão de venda = 10% de 700 (não de 800)');
select t_assert((select sum(valor) from lancamentos where tipo='receita' and origem='recebimento')=700, 'PIX gera receita realizada de 700');
select t_assert((select saldo from v_saldo_contas where nome='Bradesco')=700, 'saldo do Bradesco = 700');
select t_assert((select data_recebimento from recebimentos where id=:'rec1') is not null, 'PIX realizado na hora');
select t_erro(format($$select receber_debito(%L,10,0,'pix',%L,%L)$$, :'deb', :'bradesco', :'dv'), 'já está pago');

-- novo orçamento: cartão 3x previsto e recebimento parcial
insert into orcamentos (paciente_id,unidade_id,dentista_id) values (:'pac',:'aldeota',:'dv');
select id as orc3 from orcamentos where status='pendente' order by codigo desc limit 1 \gset
insert into orcamento_itens (orcamento_id,procedimento_id,valor_negociado) select :'orc3', id, 1000 from procedimentos where codigo='P2';
select array_agg(id) as sel3 from orcamento_itens where orcamento_id=:'orc3' \gset
select aprovar_orcamento(:'orc3', :'sel3'::uuid[]) \gset
select id as deb3 from debitos where orcamento_id=:'orc3' \gset
select receber_debito(:'deb3', 600, 0, 'credito', :'sicredi', :'dv', current_date, 3, 'CV123') as rec2 \gset
select t_assert((select status from recebimentos where id=:'rec2')='previsto', 'cartão vai para o previsto');
select t_assert((select valor_taxa from recebimentos where id=:'rec2')=round(600*(select percentual from taxas_cartao where modalidade='credito' and parcelas=3)/100,2), 'taxa do cartão 3x');
select t_assert((select saldo from debitos where id=:'deb3')=400 and (select status from debitos where id=:'deb3')='parcial', 'recebimento parcial deixa saldo 400');
select t_assert((select count(*) from lancamentos where origem_id=:'rec2')=0, 'cartão previsto não gera lançamento');
select t_erro(format($$select realizar_recebimento(%L)$$, :'rec2'), 'permissão');

-- excedente em cartão é bloqueado; em PIX vira crédito
select t_erro(format($$select receber_debito(%L,500,0,'credito',%L,%L)$$, :'deb3', :'sicredi', :'dv'), 'excedente');
select receber_debito(:'deb3', 450, 0, 'pix', :'bradesco', :'dx') as rec3 \gset
select t_assert((select saldo from creditos_paciente)=50, 'excedente de 50 virou crédito');
select t_assert((select status from debitos where id=:'deb3')='pago', 'débito 3 quitado');
select t_assert((select count(*) from comissoes where recebimento_id=:'rec3')=0, 'recebedor sem % no cadastro não gera comissão');

-- uso de crédito: sem caixa e sem nova receita
insert into orcamentos (paciente_id,unidade_id,dentista_id) values (:'pac',:'aldeota',:'dv');
select id as orc4 from orcamentos where status='pendente' order by codigo desc limit 1 \gset
insert into orcamento_itens (orcamento_id,procedimento_id,valor_negociado) select :'orc4', id, 200 from procedimentos where codigo='P3';
select array_agg(id) as sel4 from orcamento_itens where orcamento_id=:'orc4' \gset
select aprovar_orcamento(:'orc4', :'sel4'::uuid[]) \gset
select id as deb4 from debitos where orcamento_id=:'orc4' \gset
select sum(valor) as receita_antes from lancamentos where tipo='receita' \gset
select usar_credito(:'deb4', 50, :'dv') as rec4 \gset
select t_assert((select sum(valor) from lancamentos where tipo='receita')=:receita_antes, 'uso de crédito não gera receita');
select t_assert((select saldo from creditos_paciente)=0, 'carteira zerada');
select t_erro(format($$select usar_credito(%L,10,%L)$$, :'deb4', :'dv'), 'Crédito insuficiente');
select t_assert((select saldo from debitos where id=:'deb4')=150, 'débito 4 com saldo 150');

-- evolução: o executor define a comissão de execução (valor fixo do catálogo)
select id as item1 from orcamento_itens where orcamento_id=:'orc1' order by valor_negociado limit 1 \gset
select t_erro(format($$select evoluir_item(%L,'executado',null)$$, :'item1'), 'dentista que executou');
select evoluir_item(:'item1','executado',:'dx','feito');
select t_assert((select count(*) from comissoes where tipo='execucao' and dentista_id=:'dx')=1, 'comissão de execução criada');
select t_assert((select valor from comissoes where tipo='execucao')=(select valor_execucao from orcamento_itens where id=:'item1'), 'execução = valor fixo do catálogo');
select evoluir_item(:'item1','executado',:'dx');
select t_assert((select count(*) from comissoes where tipo='execucao')=1, 'executar de novo não duplica');
select t_erro(format($$select evoluir_item(%L,'executado',%L)$$, (select id from orcamento_itens where orcamento_id not in (:'orc1',:'orc3',:'orc4') limit 1), :'dx'), 'orçamento aprovado');

-- permissões da recepção
select id as com_venda from comissoes where tipo='venda' limit 1 \gset
select t_erro(format($$select alterar_comissao(%L,100,'x')$$, :'com_venda'), 'permissão');
select t_erro($$select encerrar_lote(gen_random_uuid())$$, 'permissão');
select t_erro(format($$select fechar_caixa(%L,0)$$, :'turno'), 'permissão');
select t_erro($$insert into lancamentos (tipo,data,valor,conta_id,unidade_id) select 'receita',current_date,1,id,(select id from unidades limit 1) from contas_bancarias limit 1$$, 'row-level security');
update debitos set valor_pago = 0;
select t_assert((select sum(valor_pago) from debitos)>0, 'update direto em débitos não tem efeito (só via funções)');

-- ADMIN
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select alterar_comissao(:'com_venda', 100, 'permuta');
select t_assert((select valor from comissoes where id=:'com_venda')=100 and (select editado from comissoes where id=:'com_venda'), 'alteração manual registrada');
select t_assert((select count(*) from comissao_log)=1, 'log da alteração');
select t_erro(format($$select alterar_comissao(%L,100,'')$$, :'com_venda'), 'justificativa');
select alterar_comissao(:'com_venda', 70, 'volta');

-- cartão: realizar com líquido editado -> receita bruta + despesa de taxa
select realizar_recebimento(:'rec2', current_date, 570);
select t_assert((select sum(valor) from lancamentos where origem_id=:'rec2' and tipo='receita')=600, 'receita bruta do cartão');
select t_assert((select sum(valor) from lancamentos where origem_id=:'rec2' and tipo='despesa')=30, 'taxa = bruto - líquido editado');
select t_assert((select saldo from v_saldo_contas where nome='Sicredi')=570, 'saldo Sicredi = líquido');
select t_erro(format($$select realizar_recebimento(%L)$$, :'rec2'), 'não está previsto');

-- lote: encerramento individual (só venda da Dra Venda)
select id as lote from lotes where competencia=date_trunc('month',current_date)::date \gset
select encerrar_lote(:'lote', :'dv', 'venda') as n \gset
select t_assert(:n=1, 'encerrou 1 combinação');
select t_assert((select valor from previsoes where tipo='comissao_venda')=(select sum(valor) from comissoes where tipo='venda' and status='encerrada'), 'previsão de venda = soma das linhas');
select t_assert((select count(*) from previsoes where tipo='comissao_execucao')=0, 'execução ainda não virou previsão');
select t_assert((select vencimento from previsoes where tipo='comissao_venda')=((date_trunc('month',current_date)+interval '1 month')::date + 14), 'vencimento = dia 15 do mês seguinte');
select t_assert((select status from lotes where id=:'lote')='aberto', 'encerramento individual mantém o lote aberto');

-- nova venda da mesma dentista no mesmo mês: vai para o lote seguinte
insert into orcamentos (paciente_id,unidade_id,dentista_id) values (:'pac',:'aldeota',:'dv');
select id as orc5 from orcamentos where status='pendente' order by codigo desc limit 1 \gset
insert into orcamento_itens (orcamento_id,procedimento_id,valor_negociado) select :'orc5', id, 100 from procedimentos where codigo='P3';
select array_agg(id) as sel5 from orcamento_itens where orcamento_id=:'orc5' \gset
select aprovar_orcamento(:'orc5', :'sel5'::uuid[]) \gset
select id as deb5 from debitos where orcamento_id=:'orc5' \gset
select receber_debito(:'deb5', 100, 0, 'dinheiro', (select id from contas_bancarias where tipo='caixa'), :'dv') as rec5 \gset
select t_assert((select l.competencia from comissoes c join lotes l on l.id=c.lote_id where c.recebimento_id=:'rec5')=(date_trunc('month',current_date)+interval '1 month')::date, 'venda após fechamento vai para o mês seguinte');

-- estornos
select t_erro(format($$select estornar_recebimento(%L)$$, :'rec3'), 'já foi utilizado');
select estornar_recebimento(:'rec5');
select t_assert((select valor from comissoes where recebimento_id=:'rec5')=0 and (select estornada from comissoes where recebimento_id=:'rec5'), 'lote aberto: linha fica zerada com sinal de estorno');
select estornar_recebimento(:'rec1');
select t_assert((select valor from comissoes where estorno_de is not null)=-70, 'lote fechado: estorno negativo no lote seguinte');
select t_assert((select status from debitos where id=:'deb')='pendente', 'estorno reabre o débito');
select t_assert((select count(*) from lancamentos where origem_id=:'rec1' and estornado)=1, 'lançamento estornado sai do saldo');
select t_assert((select saldo from v_saldo_contas where nome='Bradesco')=450, 'saldo do Bradesco = só o PIX de 450 que sobrou');

-- caixa: fechar, bloquear, reabrir
select fechar_caixa(:'turno', 0, 'ok');
select t_erro(format($$select receber_debito(%L,10,0,'pix',%L,%L)$$, :'deb', :'bradesco', :'dv'), 'Caixa encerrado, procure o Financeiro');
select t_erro(format($$select estornar_recebimento(%L)$$, :'rec2'), 'Caixa encerrado');
select t_erro(format($$select abrir_caixa(%L)$$, :'aldeota'), 'já foi encerrado');
select reabrir_caixa(:'turno');
select t_assert((select status from caixa_turnos)='aberto' and (select reaberturas from caixa_turnos)=1, 'reabertura registrada');

-- encerrar lote inteiro: execução vira previsão; pagamento único PGD
select encerrar_lote(:'lote');
select t_assert((select status from lotes where id=:'lote')='encerrado', 'lote inteiro encerrado');
select t_assert((select valor from previsoes where tipo='comissao_execucao')=50, 'previsão de execução separada (50)');
select id as prev_exec from previsoes where tipo='comissao_execucao' \gset
select t_erro(format($$select pagar_previsao(%L,%L)$$, :'prev_exec', :'bradesco'), 'Produção dos Dentistas');
select pagar_dentista(:'dx', array[:'prev_exec']::uuid[], :'bradesco', current_date) as pgd \gset
select t_assert(:'pgd'='PGD-1', 'código PGD-1');
select t_assert((select count(*) from lancamentos where pagamento_codigo='PGD-1' and unidade_id=:'aldeota' and valor=50)=1, 'lançamento por unidade com código PGD');
select t_assert((select status from previsoes where id=:'prev_exec')='paga', 'previsão baixada');
select t_erro(format($$select pagar_dentista(%L, array[%L]::uuid[], %L)$$, :'dx', :'prev_exec', :'bradesco'), 'em aberto');

-- financeiro: aporte, previsão manual, transferência, devolução de crédito
select lancar_movimentacao('aporte', current_date, 35000, :'sicredi', null, null, 'Sócios', 'Aporte', null, 'aporte', null);
select t_erro(format($$select lancar_movimentacao('despesa', current_date, 10, %L, null, 'Clínico', null, null, null, null, null)$$, :'sicredi'), 'unidade');
insert into previsoes (descricao, fornecedor, valor, vencimento, unidade_id, setor, grupo) values ('Aluguel', 'Imob', 3000, current_date, :'aldeota', 'Administrativo/Geral', 'Fixas');
select id as prev_man from previsoes where origem='manual' \gset
select pagar_previsao(:'prev_man', :'sicredi');
select t_assert((select count(*) from lancamentos where origem='previsao' and valor=3000)=1, 'previsão paga gera lançamento');
select transferir(:'sicredi', :'bradesco', 1000, current_date);
select t_assert((select saldo from v_saldo_contas where nome='Bradesco')=450-50+1000, 'transferência entrou no Bradesco');
select t_assert((select sum(total) from dre_resumo(current_date-30, current_date+30) where tipo in ('transferencia_entrada','transferencia_saida')) is null, 'DRE ignora transferência');
select t_assert((select total from dre_resumo(current_date-30, current_date+30) where tipo='aporte')=35000, 'aporte aparece no DRE (fora da receita)');
select t_assert((select saldo_final from fluxo_caixa(current_date-30, current_date+30)) = (select sum(saldo) from v_saldo_contas), 'fluxo de caixa fecha com os saldos das contas');

insert into orcamentos (paciente_id,unidade_id,dentista_id) values (:'pac',:'aldeota',:'dv');
select id as orc6 from orcamentos where status='pendente' order by codigo desc limit 1 \gset
insert into orcamento_itens (orcamento_id,procedimento_id,valor_negociado) select :'orc6', id, 100 from procedimentos where codigo='P3';
select array_agg(id) as sel6 from orcamento_itens where orcamento_id=:'orc6' \gset
select aprovar_orcamento(:'orc6', :'sel6'::uuid[]) \gset
select id as deb6 from debitos where orcamento_id=:'orc6' \gset
select receber_debito(:'deb6', 130, 0, 'pix', :'bradesco', :'dv');
select t_assert((select saldo from creditos_paciente)=30, 'excedente 30 em crédito');
select devolver_credito(:'pac', :'aldeota', 30, :'bradesco');
select t_assert((select saldo from creditos_paciente)=0, 'crédito devolvido');
select t_assert((select total from dre_resumo(current_date-30, current_date+30) where tipo='devolucao_credito')=30, 'devolução de crédito é dedução da receita (não despesa)');

reset role;
select 'TODOS OS TESTES PASSARAM' as resultado;
