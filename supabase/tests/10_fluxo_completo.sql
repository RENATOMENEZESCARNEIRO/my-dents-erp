-- Teste ponta a ponta das regras do manual (rodar após schema.sql e schema_v2.sql).
\set ON_ERROR_STOP on
\set QUIET on
create or replace function t_assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'FALHOU: %', msg; end if; end $$;
create or replace function t_erro(sql text, esperado text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if sqlerrm like '%'||esperado||'%' then return; end if;
    raise exception 'FALHOU: erro inesperado "%" (esperava "%")', sqlerrm, esperado;
  end;
  raise exception 'FALHOU: deveria ter dado erro "%"', esperado;
end $$;
grant execute on function t_assert(boolean,text), t_erro(text,text) to authenticated;

-- usuários: o 1º vira admin, o 2º é recepção
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','admin@x'),('00000000-0000-0000-0000-0000000000b2','recep@x');
select t_assert((select admin from perfis_usuario where user_id='00000000-0000-0000-0000-0000000000a1'), '1º usuário é admin');
select t_assert(not (select admin from perfis_usuario where user_id='00000000-0000-0000-0000-0000000000b2'), '2º não é admin');

-- dados-base
insert into dentistas (nome,cpf,unidade_id,percentual_comissao_venda,dia_pagamento)
 select 'Dra Venda','11111111111',id,10,15 from unidades where nome='Aldeota';
insert into dentistas (nome,cpf,unidade_id,percentual_comissao_venda) select 'Dr Executor','22222222222',id,0 from unidades where nome='Aldeota';
insert into pacientes (nome,cpf,telefone,unidade_id) select 'Paciente Teste','33333333333','85999',id from unidades where nome='Aldeota';
insert into procedimentos (codigo,nome,valor_venda,valor_execucao) values ('P1','Restauração',300,50),('P2','Canal',500,80),('P3','Limpeza',200,30);
select id as aldeota from unidades where nome='Aldeota' \gset
select id as pac from pacientes limit 1 \gset
select id as dv from dentistas where nome='Dra Venda' \gset
select id as dx from dentistas where nome='Dr Executor' \gset
select id as bradesco from contas_bancarias where nome='Bradesco' \gset
select id as sicredi from contas_bancarias where nome='Sicredi' \gset

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',false);   -- recepção

-- orçamento com 3 itens
insert into orcamentos (paciente_id,unidade_id,dentista_id) values (:'pac',:'aldeota',:'dv');
select id as orc1 from orcamentos limit 1 \gset
insert into orcamento_itens (orcamento_id,procedimento_id,dente,valor_negociado)
 select :'orc1', id, null, valor_venda from procedimentos;
select t_assert((select count(*) from orcamento_itens where valor_execucao>0)=3, 'execução copiada do catálogo');
select array_agg(i.id) as sel from orcamento_itens i join procedimentos p on p.id=i.procedimento_id where p.codigo in ('P1','P2') \gset

-- aprovação parcial -> 2 orçamentos independentes
select aprovar_orcamento(:'orc1', :'sel'::uuid[], current_date + 5) as r \gset
select t_assert((select count(*) from orcamentos)=2, 'aprovação parcial gera 2 orçamentos');
select t_assert((select valor_original from debitos)=800, 'débito = soma dos aprovados (800)');
select t_assert((select percentual_venda from orcamentos where id=:'orc1')=10, '% congelado na aprovação');
select t_assert((select count(*) from orcamento_itens where orcamento_id<>:'orc1')=1, 'item pendente no novo orçamento');
select t_erro($$update orcamentos set status='aprovado' where status='pendente'$$, 'row-level security');
