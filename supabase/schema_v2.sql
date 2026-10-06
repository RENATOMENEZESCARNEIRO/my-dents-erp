-- My Dents — schema v2: orçamento/débito/recebimento, caixa, financeiro, produção e comissões.
-- Rode DEPOIS de schema.sql, no SQL Editor do Supabase. Pode ser reexecutado.
-- Regras de negócio: docs/REGRAS_NEGOCIO.md + manual. Operações que mexem em dinheiro são
-- funções (RPC) atômicas; as tabelas críticas só aceitam escrita por elas.

create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. PERFIS E PERMISSÕES
-- =====================================================================
create table if not exists perfis_usuario (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  admin boolean not null default false,
  financeiro boolean not null default false,        -- lançamentos, previsões, lotes, pagamentos
  fechar_caixa boolean not null default false,      -- fechar/reabrir caixa
  alterar_comissao boolean not null default false,  -- editar valor de comissão
  criado_em timestamptz not null default now()
);

create or replace function perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select admin or case p
            when 'financeiro' then financeiro
            when 'fechar_caixa' then fechar_caixa
            when 'alterar_comissao' then alterar_comissao
            else false end
          from perfis_usuario where user_id = auth.uid()), false)
$$;

create or replace function assert_auth() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sessão expirada. Entre novamente.'; end if;
end $$;

create or replace function require_perm(p text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_auth();
  if not perm(p) then raise exception 'Você não tem permissão para esta operação (%).', p; end if;
end $$;

-- primeiro usuário criado vira administrador; os demais entram sem permissões especiais
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis_usuario (user_id, nome, admin)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email),
          not exists (select 1 from perfis_usuario))
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

insert into perfis_usuario (user_id, nome, admin)
select u.id, u.email, (row_number() over (order by u.created_at) = 1 and not exists (select 1 from perfis_usuario))
from auth.users u
on conflict do nothing;

-- =====================================================================
-- 2. CADASTROS: contas, procedimentos, taxas de cartão, config
-- =====================================================================
create table if not exists contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  tipo text not null default 'banco' check (tipo in ('banco','caixa')),
  saldo_inicial numeric(14,2) not null default 0,   -- ajustar só quando o sistema estiver em operação
  ativo boolean not null default true
);
insert into contas_bancarias (nome, tipo) values
  ('Bradesco','banco'), ('Sicredi','banco'), ('Caixa (Espécie)','caixa')
on conflict (nome) do nothing;

alter table dentistas add column if not exists percentual_comissao_venda numeric(5,2) not null default 0
  check (percentual_comissao_venda between 0 and 100);
alter table dentistas add column if not exists dia_pagamento int
  check (dia_pagamento between 1 and 31);            -- dia do mês seguinte; vazio = último dia

create table if not exists procedimentos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  setor text not null default 'Clínico' check (setor in ('Clínico','Ortodontia','Administrativo/Geral','Convênios')),
  valor_venda numeric(12,2) not null check (valor_venda >= 0),      -- à vista
  valor_parcelado numeric(12,2) check (valor_parcelado >= 0),       -- parcelado (vazio = igual à vista)
  custo numeric(12,2) not null default 0 check (custo >= 0),
  valor_execucao numeric(12,2) not null default 0 check (valor_execucao >= 0),  -- pago ao dentista (D-01)
  tempo_min int,
  ativo boolean not null default true,
  check (not ativo or (valor_venda > 0 and valor_execucao > 0))
);

create table if not exists config (chave text primary key, valor jsonb not null);
insert into config values ('taxas_cartao_ativas', 'true') on conflict do nothing;

create table if not exists taxas_cartao (
  id uuid primary key default gen_random_uuid(),
  modalidade text not null check (modalidade in ('debito','credito')),
  parcelas int not null check (parcelas between 1 and 12),
  percentual numeric(5,2) not null check (percentual >= 0),
  revisar boolean not null default false,            -- valor estimado: conferir com o contrato
  unique (modalidade, parcelas)
);
insert into taxas_cartao (modalidade, parcelas, percentual, revisar) values ('debito', 1, 0.99, false)
on conflict do nothing;
-- crédito: 1x = 3,15% e 12x = 10,69% (conhecidos); 2x–11x interpolados e marcados "revisar"
insert into taxas_cartao (modalidade, parcelas, percentual, revisar)
select 'credito', n, round(3.15 + (10.69 - 3.15) * (n - 1) / 11.0, 2), n not in (1, 12)
from generate_series(1, 12) n
on conflict do nothing;

-- =====================================================================
-- 3. ORÇAMENTO, ITENS, EVOLUÇÃO, DÉBITO
-- =====================================================================
create table if not exists orcamentos (
  id uuid primary key default gen_random_uuid(),
  codigo bigint generated always as identity unique,
  paciente_id uuid not null references pacientes(id) on delete cascade,
  unidade_id uuid not null references unidades(id),
  dentista_id uuid not null references dentistas(id),            -- dentista responsável pela venda
  condicao text not null default 'avista' check (condicao in ('avista','parcelado')),
  status text not null default 'pendente' check (status in ('pendente','aprovado','cancelado')),
  percentual_venda numeric(5,2),                                 -- congelado na aprovação
  aprovado_em timestamptz,
  observacoes text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);

create table if not exists orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references orcamentos(id) on delete cascade,
  procedimento_id uuid not null references procedimentos(id),
  dente text,
  valor_negociado numeric(12,2) not null check (valor_negociado >= 0),
  valor_execucao numeric(12,2) not null default 0,               -- cópia do catálogo no momento do lançamento
  status_exec text not null default 'planejado' check (status_exec in ('planejado','em_andamento','executado','cancelado')),
  executado_em date,
  dentista_exec_id uuid references dentistas(id),
  criado_em timestamptz not null default now()
);
create index if not exists orcamento_itens_orc_idx on orcamento_itens(orcamento_id);

create table if not exists evolucoes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references orcamento_itens(id) on delete cascade,
  paciente_id uuid not null references pacientes(id) on delete cascade,
  dentista_id uuid not null references dentistas(id),            -- dentista que executou
  status text not null check (status in ('planejado','em_andamento','executado','cancelado')),
  data date not null default current_date,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);

create table if not exists debitos (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null unique references orcamentos(id),   -- um débito por orçamento aprovado
  paciente_id uuid not null references pacientes(id),
  unidade_id uuid not null references unidades(id),
  valor_original numeric(12,2) not null,
  desconto numeric(12,2) not null default 0,
  valor_pago numeric(12,2) not null default 0,
  saldo numeric(12,2) generated always as (valor_original - desconto - valor_pago) stored,
  status text not null default 'pendente' check (status in ('pendente','parcial','pago','cancelado')),
  vencimento date not null,
  data_lancamento date not null default current_date,
  criado_em timestamptz not null default now(),
  check (valor_pago >= 0 and desconto >= 0)
);

-- itens: execução vem do catálogo; orçamento aprovado fica imutável
create or replace function guard_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if tg_op = 'DELETE' then
    select status into st from orcamentos where id = old.orcamento_id;
    if st = 'aprovado' then raise exception 'Orçamento aprovado não pode ter procedimentos removidos.'; end if;
    return old;
  elsif tg_op = 'INSERT' then
    select status into st from orcamentos where id = new.orcamento_id;
    if st <> 'pendente' then raise exception 'Só orçamentos pendentes aceitam novos procedimentos.'; end if;
    select valor_execucao into new.valor_execucao from procedimentos where id = new.procedimento_id;
    return new;
  else
    select status into st from orcamentos where id = old.orcamento_id;
    if st <> 'pendente' and (new.valor_negociado <> old.valor_negociado
        or new.procedimento_id <> old.procedimento_id or new.orcamento_id <> old.orcamento_id) then
      raise exception 'Orçamento aprovado não pode ser alterado.';
    end if;
    return new;
  end if;
end $$;
drop trigger if exists trg_guard_item on orcamento_itens;
create trigger trg_guard_item before insert or update or delete on orcamento_itens
  for each row execute function guard_item();

-- =====================================================================
-- 4. CAIXA, RECEBIMENTOS, CRÉDITO DO PACIENTE
-- =====================================================================
create table if not exists caixa_turnos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id),
  data date not null,
  status text not null default 'aberto' check (status in ('aberto','fechado')),
  saldo_inicial numeric(12,2) not null default 0,
  aberto_por uuid default auth.uid(),
  aberto_em timestamptz not null default now(),
  fechado_por uuid,
  fechado_em timestamptz,
  saldo_esperado numeric(12,2),
  saldo_contado numeric(12,2),
  observacao text,
  reaberturas int not null default 0,
  unique (unidade_id, data)
);

create table if not exists caixa_movs (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references caixa_turnos(id) on delete cascade,
  tipo text not null check (tipo in ('sangria','suprimento')),
  valor numeric(12,2) not null check (valor > 0),
  descricao text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);

create table if not exists recebimentos (
  id uuid primary key default gen_random_uuid(),
  codigo bigint generated always as identity unique,
  debito_id uuid not null references debitos(id),
  paciente_id uuid not null references pacientes(id),
  unidade_id uuid not null references unidades(id),
  dentista_id uuid not null references dentistas(id),           -- define a comissão de venda
  valor numeric(12,2) not null check (valor > 0),               -- bruto pago pelo paciente
  valor_aplicado numeric(12,2) not null,                        -- parte que abateu o débito
  desconto numeric(12,2) not null default 0,
  meio text not null check (meio in ('dinheiro','pix','credito','debito','credito_paciente')),
  parcelas int not null default 1,
  cv text,
  conta_id uuid references contas_bancarias(id),
  taxa_percentual numeric(5,2),
  valor_taxa numeric(12,2) not null default 0,
  valor_liquido numeric(12,2) not null,
  data_lancamento date not null default current_date,           -- quando foi lançado
  data_pagamento date not null,                                 -- quando o cliente pagou
  data_recebimento date,                                        -- quando o dinheiro entrou
  status text not null check (status in ('realizado','previsto','estornado')),
  turno_id uuid references caixa_turnos(id),
  descricao text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  check (meio = 'credito_paciente' or conta_id is not null)
);

create table if not exists creditos_paciente (
  paciente_id uuid not null references pacientes(id) on delete cascade,
  unidade_id uuid not null references unidades(id),
  saldo numeric(12,2) not null default 0 check (saldo >= 0),
  primary key (paciente_id, unidade_id)
);
create table if not exists credito_movs (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  unidade_id uuid not null references unidades(id),
  tipo text not null check (tipo in ('entrada','uso','devolucao','estorno')),
  valor numeric(12,2) not null,
  recebimento_id uuid references recebimentos(id),
  descricao text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);

-- =====================================================================
-- 5. FINANCEIRO: lançamentos, previsões, pagamentos
-- =====================================================================
create table if not exists lancamentos (
  id uuid primary key default gen_random_uuid(),
  codigo bigint generated always as identity unique,
  tipo text not null check (tipo in ('receita','despesa','aporte','emprestimo','devolucao_emprestimo',
                                     'transferencia_entrada','transferencia_saida','devolucao_credito')),
  data date not null,
  valor numeric(14,2) not null check (valor > 0),
  unidade_id uuid references unidades(id),
  setor text check (setor is null or setor in ('Clínico','Ortodontia','Administrativo/Geral','Convênios')),
  conta_id uuid not null references contas_bancarias(id),
  grupo text, subgrupo text, nfe text, descricao text, observacao text,
  origem text not null default 'manual',
  origem_id uuid,
  pagamento_codigo text,                                         -- PGD-n
  estornado boolean not null default false,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  -- aporte, empréstimo, devolução e transferência ficam no escopo "Grupo" (sem unidade)
  check ((tipo in ('aporte','emprestimo','devolucao_emprestimo','transferencia_entrada','transferencia_saida')) = (unidade_id is null))
);
create index if not exists lancamentos_data_idx on lancamentos(data);
create index if not exists lancamentos_conta_idx on lancamentos(conta_id);

create or replace view v_saldo_contas with (security_invoker = true) as
select c.id, c.nome, c.tipo, c.saldo_inicial,
       x.entradas, x.saidas,
       c.saldo_inicial + x.entradas - x.saidas as saldo
from contas_bancarias c
cross join lateral (
  select coalesce(sum(l.valor) filter (where l.tipo in ('receita','aporte','emprestimo','transferencia_entrada')), 0) as entradas,
         coalesce(sum(l.valor) filter (where l.tipo in ('despesa','devolucao_emprestimo','transferencia_saida','devolucao_credito')), 0) as saidas
  from lancamentos l where l.conta_id = c.id and not l.estornado
) x;

create table if not exists lotes (
  id uuid primary key default gen_random_uuid(),
  competencia date not null unique check (competencia = date_trunc('month', competencia)::date),
  status text not null default 'aberto' check (status in ('aberto','encerrado')),
  aberto_em timestamptz not null default now(),
  encerrado_em timestamptz
);

create table if not exists comissoes (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes(id),
  dentista_id uuid not null references dentistas(id),
  tipo text not null check (tipo in ('venda','execucao','convenio')),
  unidade_id uuid not null references unidades(id),
  setor text,
  paciente_id uuid references pacientes(id),
  recebimento_id uuid references recebimentos(id),
  item_id uuid references orcamento_itens(id),
  base numeric(12,2),
  percentual numeric(5,2),
  valor_calculado numeric(12,2) not null,
  valor numeric(12,2) not null,
  editado boolean not null default false,
  justificativa text,
  estornada boolean not null default false,
  estorno_de uuid references comissoes(id),
  status text not null default 'aberta' check (status in ('aberta','encerrada')),
  previsao_id uuid,
  data_ref date not null,
  descricao text,
  criado_em timestamptz not null default now()
);
create index if not exists comissoes_lote_idx on comissoes(lote_id, dentista_id, tipo);

create table if not exists lote_fechamentos (
  lote_id uuid not null references lotes(id),
  dentista_id uuid not null references dentistas(id),
  tipo text not null,
  fechado_em timestamptz not null default now(),
  previsao_id uuid,
  primary key (lote_id, dentista_id, tipo)
);

create table if not exists comissao_log (
  id uuid primary key default gen_random_uuid(),
  comissao_id uuid not null references comissoes(id) on delete cascade,
  valor_antigo numeric(12,2) not null,
  valor_novo numeric(12,2) not null,
  justificativa text not null,
  usuario uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create table if not exists previsoes (
  id uuid primary key default gen_random_uuid(),
  codigo bigint generated always as identity unique,
  origem text not null default 'manual' check (origem in ('producao','manual')),
  tipo text not null default 'despesa' check (tipo in ('comissao_venda','comissao_execucao','convenio','despesa')),
  dentista_id uuid references dentistas(id),
  lote_id uuid references lotes(id),
  descricao text,
  fornecedor text,
  valor numeric(14,2) not null check (valor > 0),
  vencimento date not null,
  unidade_id uuid references unidades(id),                       -- vazio = agrupado
  setor text check (setor is null or setor in ('Clínico','Ortodontia','Administrativo/Geral','Convênios')),
  grupo text, subgrupo text,
  status text not null default 'prevista' check (status in ('prevista','paga','cancelada')),
  conta_id uuid references contas_bancarias(id),
  data_pagamento date,
  pagamento_codigo text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);

create table if not exists pagamentos_dentista (
  id uuid primary key default gen_random_uuid(),
  codigo bigint generated always as identity unique,
  dentista_id uuid not null references dentistas(id),
  conta_id uuid not null references contas_bancarias(id),
  data date not null,
  total numeric(14,2) not null,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);

-- =====================================================================
-- 6. FUNÇÕES INTERNAS
-- =====================================================================
create or replace function _setor_orcamento(p_orc uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select p.setor from orcamento_itens i join procedimentos p on p.id = i.procedimento_id
                   where i.orcamento_id = p_orc order by i.valor_negociado desc limit 1), 'Clínico')
$$;

-- lote do mês (abre se não existir). Se o lote ou o dentista+tipo já fechou, vai para o mês seguinte.
create or replace function lote_aberto_para(p_data date, p_dentista uuid, p_tipo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c date := date_trunc('month', p_data)::date; l lotes%rowtype;
begin
  loop
    insert into lotes (competencia) values (c) on conflict (competencia) do nothing;
    select * into l from lotes where competencia = c;
    exit when l.status = 'aberto' and not exists (
      select 1 from lote_fechamentos f where f.lote_id = l.id and f.dentista_id = p_dentista and f.tipo = p_tipo);
    c := (c + interval '1 month')::date;
  end loop;
  return l.id;
end $$;

create or replace function abrir_lote_do_mes() returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  perform assert_auth();
  insert into lotes (competencia) values (date_trunc('month', current_date)::date) on conflict (competencia) do nothing;
  select id into v from lotes where competencia = date_trunc('month', current_date)::date;
  return v;
end $$;

create or replace function _gerar_comissao_venda(p_rec uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r recebimentos%rowtype; o orcamentos%rowtype; v_pct numeric; v_lote uuid;
begin
  select * into r from recebimentos where id = p_rec;
  select oo.* into o from debitos d join orcamentos oo on oo.id = d.orcamento_id where d.id = r.debito_id;
  -- quem fechou a venda é o dentista do recebimento; se for o do orçamento vale o % congelado na aprovação
  if r.dentista_id = o.dentista_id then v_pct := coalesce(o.percentual_venda, 0);
  else select percentual_comissao_venda into v_pct from dentistas where id = r.dentista_id; end if;
  if coalesce(v_pct, 0) <= 0 or r.valor_aplicado <= 0 then return; end if;
  v_lote := lote_aberto_para(r.data_pagamento, r.dentista_id, 'venda');
  insert into comissoes (lote_id, dentista_id, tipo, unidade_id, setor, paciente_id, recebimento_id, base, percentual,
                         valor_calculado, valor, data_ref, descricao)
  values (v_lote, r.dentista_id, 'venda', r.unidade_id, _setor_orcamento(o.id), r.paciente_id, r.id, r.valor_aplicado, v_pct,
          round(r.valor_aplicado * v_pct / 100, 2), round(r.valor_aplicado * v_pct / 100, 2), r.data_pagamento,
          'Orçamento #' || o.codigo);
end $$;

-- estorno: lote aberto = linha fica com valor zero e sinal; lote fechado = lançamento negativo no lote seguinte
create or replace function estornar_comissao(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c comissoes%rowtype; l lotes%rowtype; v_lote uuid;
begin
  select * into c from comissoes where id = p_id for update;
  if not found or c.estornada then return; end if;
  select * into l from lotes where id = c.lote_id;
  if c.status = 'aberta' and l.status = 'aberto' then
    update comissoes set valor = 0, estornada = true where id = c.id;
  else
    v_lote := lote_aberto_para(current_date, c.dentista_id, c.tipo);
    insert into comissoes (lote_id, dentista_id, tipo, unidade_id, setor, paciente_id, valor_calculado, valor,
                           estorno_de, data_ref, descricao)
    values (v_lote, c.dentista_id, c.tipo, c.unidade_id, c.setor, c.paciente_id, -c.valor, -c.valor,
            c.id, current_date, 'Estorno — ' || coalesce(c.descricao, ''));
    update comissoes set estornada = true where id = c.id;
  end if;
end $$;

create or replace function _aplicar_pagamento_debito(p_debito uuid, p_aplicado numeric, p_desconto numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  update debitos set desconto = desconto + p_desconto, valor_pago = valor_pago + p_aplicado,
    status = case when valor_original - (desconto + p_desconto) - (valor_pago + p_aplicado) = 0 then 'pago' else 'parcial' end
  where id = p_debito;
end $$;

-- =====================================================================
-- 7. ORÇAMENTO → APROVAÇÃO → DÉBITO
-- =====================================================================
-- Aprovação parcial: os itens marcados ficam no orçamento aprovado (gera o débito) e os demais
-- viram um NOVO orçamento pendente, com código próprio e sem vínculo com o original.
create or replace function aprovar_orcamento(p_orc uuid, p_itens uuid[], p_vencimento date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o orcamentos%rowtype; v_total int; v_sel int; v_novo uuid; v_pct numeric; v_valor numeric; v_deb uuid;
begin
  perform assert_auth();
  select * into o from orcamentos where id = p_orc for update;
  if not found then raise exception 'Orçamento não encontrado.'; end if;
  if o.status <> 'pendente' then raise exception 'Este orçamento já foi %.', o.status; end if;
  select percentual_comissao_venda into v_pct from dentistas where id = o.dentista_id;
  if not found then raise exception 'Informe o dentista vendedor do orçamento.'; end if;
  select count(*) into v_total from orcamento_itens where orcamento_id = p_orc;
  select count(*) into v_sel from orcamento_itens where orcamento_id = p_orc and id = any(coalesce(p_itens, '{}'));
  if v_sel = 0 then raise exception 'Marque ao menos um procedimento autorizado pelo paciente.'; end if;

  if v_sel < v_total then
    insert into orcamentos (paciente_id, unidade_id, dentista_id, condicao, observacoes)
    values (o.paciente_id, o.unidade_id, o.dentista_id, o.condicao, o.observacoes) returning id into v_novo;
    update orcamento_itens set orcamento_id = v_novo where orcamento_id = p_orc and id <> all(p_itens);
  end if;

  update orcamentos set status = 'aprovado', percentual_venda = v_pct, aprovado_em = now() where id = p_orc;
  select sum(valor_negociado) into v_valor from orcamento_itens where orcamento_id = p_orc;
  insert into debitos (orcamento_id, paciente_id, unidade_id, valor_original, vencimento)
  values (p_orc, o.paciente_id, o.unidade_id, v_valor, coalesce(p_vencimento, current_date)) returning id into v_deb;
  return jsonb_build_object('orcamento_id', p_orc, 'debito_id', v_deb, 'orcamento_pendente_id', v_novo);
end $$;

-- =====================================================================
-- 8. CAIXA
-- =====================================================================
create or replace function abrir_caixa(p_unidade uuid, p_data date default current_date, p_saldo_inicial numeric default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare t caixa_turnos%rowtype;
begin
  perform assert_auth();
  select * into t from caixa_turnos where unidade_id = p_unidade and data = p_data;
  if found then
    if t.status = 'fechado' then raise exception 'O caixa deste dia já foi encerrado. Peça a reabertura a quem tem permissão.'; end if;
    return t.id;
  end if;
  insert into caixa_turnos (unidade_id, data, saldo_inicial) values (p_unidade, p_data, coalesce(p_saldo_inicial, 0)) returning id into t.id;
  return t.id;
end $$;

create or replace function caixa_resumo(p_turno uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'saldo_inicial', t.saldo_inicial,
    'dinheiro',  coalesce((select sum(valor) from recebimentos r where r.turno_id = t.id and r.status <> 'estornado' and r.meio = 'dinheiro'), 0),
    'pix',       coalesce((select sum(valor) from recebimentos r where r.turno_id = t.id and r.status <> 'estornado' and r.meio = 'pix'), 0),
    'credito',   coalesce((select sum(valor) from recebimentos r where r.turno_id = t.id and r.status <> 'estornado' and r.meio = 'credito'), 0),
    'debito',    coalesce((select sum(valor) from recebimentos r where r.turno_id = t.id and r.status <> 'estornado' and r.meio = 'debito'), 0),
    'suprimentos', coalesce((select sum(valor) from caixa_movs m where m.turno_id = t.id and m.tipo = 'suprimento'), 0),
    'sangrias',    coalesce((select sum(valor) from caixa_movs m where m.turno_id = t.id and m.tipo = 'sangria'), 0),
    'esperado', t.saldo_inicial
      + coalesce((select sum(valor) from recebimentos r where r.turno_id = t.id and r.status <> 'estornado' and r.meio = 'dinheiro'), 0)
      + coalesce((select sum(valor) from caixa_movs m where m.turno_id = t.id and m.tipo = 'suprimento'), 0)
      - coalesce((select sum(valor) from caixa_movs m where m.turno_id = t.id and m.tipo = 'sangria'), 0))
  from caixa_turnos t where t.id = p_turno
$$;

create or replace function registrar_mov_caixa(p_turno uuid, p_tipo text, p_valor numeric, p_desc text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t caixa_turnos%rowtype;
begin
  perform assert_auth();
  select * into t from caixa_turnos where id = p_turno;
  if not found then raise exception 'Caixa não encontrado.'; end if;
  if t.status = 'fechado' then raise exception 'Caixa encerrado, procure o Financeiro.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor.'; end if;
  insert into caixa_movs (turno_id, tipo, valor, descricao) values (p_turno, p_tipo, p_valor, p_desc);
end $$;

create or replace function fechar_caixa(p_turno uuid, p_saldo_contado numeric, p_obs text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t caixa_turnos%rowtype;
begin
  perform require_perm('fechar_caixa');
  select * into t from caixa_turnos where id = p_turno for update;
  if not found or t.status = 'fechado' then raise exception 'Caixa já encerrado.'; end if;
  update caixa_turnos set status = 'fechado', fechado_por = auth.uid(), fechado_em = now(),
    saldo_esperado = (caixa_resumo(p_turno)->>'esperado')::numeric, saldo_contado = p_saldo_contado, observacao = p_obs
  where id = p_turno;
end $$;

create or replace function reabrir_caixa(p_turno uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_perm('fechar_caixa');
  update caixa_turnos set status = 'aberto', fechado_por = null, fechado_em = null, reaberturas = reaberturas + 1
  where id = p_turno and status = 'fechado';
  if not found then raise exception 'Caixa não está encerrado.'; end if;
end $$;

-- =====================================================================
-- 9. RECEBIMENTOS
-- =====================================================================
create or replace function receber_debito(
  p_debito uuid, p_valor numeric, p_desconto numeric, p_meio text, p_conta uuid, p_dentista uuid,
  p_data date default current_date, p_parcelas int default 1, p_cv text default null, p_descricao text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d debitos%rowtype; t caixa_turnos%rowtype; v_devido numeric; v_aplicado numeric; v_exced numeric;
        v_rate numeric := 0; v_taxa numeric := 0; v_status text; v_id uuid; v_pac text; v_setor text;
begin
  perform assert_auth();
  if p_meio not in ('dinheiro','pix','credito','debito') then raise exception 'Meio de pagamento inválido.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor recebido.'; end if;
  p_desconto := coalesce(p_desconto, 0);
  if p_desconto < 0 then raise exception 'Desconto inválido.'; end if;
  if p_conta is null then raise exception 'Informe o banco/conta de destino.'; end if;
  if p_dentista is null then raise exception 'Informe o dentista responsável pelo recebimento.'; end if;

  select * into d from debitos where id = p_debito for update;
  if not found then raise exception 'Débito não encontrado.'; end if;
  if d.status in ('pago','cancelado') then raise exception 'Este débito já está %.', d.status; end if;

  select * into t from caixa_turnos where unidade_id = d.unidade_id and data = p_data;
  if not found then raise exception 'Caixa não aberto para esta unidade em %. Abra o caixa antes de receber.', to_char(p_data, 'DD/MM/YYYY'); end if;
  if t.status = 'fechado' then raise exception 'Caixa encerrado, procure o Financeiro.'; end if;

  v_devido := d.valor_original - d.desconto - d.valor_pago - p_desconto;
  if v_devido < 0 then raise exception 'Desconto maior que o saldo do débito.'; end if;
  v_aplicado := least(p_valor, v_devido);
  v_exced := p_valor - v_aplicado;
  if v_exced > 0 and p_meio not in ('dinheiro','pix') then
    raise exception 'Valor acima do saldo: o excedente só pode virar crédito do paciente em dinheiro ou PIX.';
  end if;

  if p_meio in ('credito','debito') then
    if p_meio = 'debito' then p_parcelas := 1; end if;
    if coalesce(p_parcelas, 1) < 1 or p_parcelas > 12 then raise exception 'Parcelas inválidas.'; end if;
    if coalesce((select valor::text from config where chave = 'taxas_cartao_ativas'), 'true') = 'true' then
      select percentual into v_rate from taxas_cartao where modalidade = p_meio and parcelas = p_parcelas;
    end if;
    v_rate := coalesce(v_rate, 0);
    v_taxa := round(p_valor * v_rate / 100, 2);
    v_status := 'previsto';
  else
    p_parcelas := 1; v_status := 'realizado';
  end if;

  insert into recebimentos (debito_id, paciente_id, unidade_id, dentista_id, valor, valor_aplicado, desconto, meio, parcelas, cv,
                            conta_id, taxa_percentual, valor_taxa, valor_liquido, data_pagamento, data_recebimento, status,
                            turno_id, descricao)
  values (d.id, d.paciente_id, d.unidade_id, p_dentista, p_valor, v_aplicado, p_desconto, p_meio, coalesce(p_parcelas, 1), p_cv,
          p_conta, case when v_rate > 0 then v_rate end, v_taxa, p_valor - v_taxa, p_data,
          case when v_status = 'realizado' then p_data end, v_status, t.id, p_descricao)
  returning id into v_id;

  perform _aplicar_pagamento_debito(d.id, v_aplicado, p_desconto);

  if v_status = 'realizado' then
    select nome into v_pac from pacientes where id = d.paciente_id;
    v_setor := _setor_orcamento(d.orcamento_id);
    insert into lancamentos (tipo, data, valor, unidade_id, setor, conta_id, grupo, subgrupo, descricao, origem, origem_id)
    values ('receita', p_data, p_valor, d.unidade_id, v_setor, p_conta, 'Receita de pacientes', 'Procedimentos',
            'Recebimento — ' || v_pac, 'recebimento', v_id);
  end if;

  if v_exced > 0 then
    insert into creditos_paciente (paciente_id, unidade_id, saldo) values (d.paciente_id, d.unidade_id, v_exced)
    on conflict (paciente_id, unidade_id) do update set saldo = creditos_paciente.saldo + excluded.saldo;
    insert into credito_movs (paciente_id, unidade_id, tipo, valor, recebimento_id, descricao)
    values (d.paciente_id, d.unidade_id, 'entrada', v_exced, v_id, 'Excedente de recebimento');
  end if;

  perform _gerar_comissao_venda(v_id);
  return v_id;
end $$;

-- cartão: o paciente já quitou; aqui o dinheiro entra (conciliação). O líquido pode ser editado.
create or replace function realizar_recebimento(p_id uuid, p_data date default current_date, p_liquido numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare r recebimentos%rowtype; v_liq numeric; v_taxa numeric; v_setor text; v_pac text; v_orc uuid;
begin
  perform require_perm('financeiro');
  select * into r from recebimentos where id = p_id for update;
  if not found or r.status <> 'previsto' then raise exception 'Este recebimento não está previsto.'; end if;
  v_liq := coalesce(p_liquido, r.valor_liquido);
  if v_liq <= 0 or v_liq > r.valor then raise exception 'Valor líquido inválido.'; end if;
  v_taxa := r.valor - v_liq;
  select orcamento_id into v_orc from debitos where id = r.debito_id;
  v_setor := _setor_orcamento(v_orc);
  select nome into v_pac from pacientes where id = r.paciente_id;

  update recebimentos set status = 'realizado', data_recebimento = p_data, valor_liquido = v_liq, valor_taxa = v_taxa where id = p_id;
  insert into lancamentos (tipo, data, valor, unidade_id, setor, conta_id, grupo, subgrupo, descricao, origem, origem_id)
  values ('receita', p_data, r.valor, r.unidade_id, v_setor, r.conta_id, 'Receita de pacientes', 'Procedimentos',
          'Cartão ' || r.meio || ' — ' || v_pac || coalesce(' (CV ' || r.cv || ')', ''), 'recebimento', r.id);
  if v_taxa > 0 then
    insert into lancamentos (tipo, data, valor, unidade_id, setor, conta_id, grupo, subgrupo, descricao, origem, origem_id)
    values ('despesa', p_data, v_taxa, r.unidade_id, 'Administrativo/Geral', r.conta_id, 'Taxas', 'Taxa de cartão',
            'Taxa de cartão — ' || v_pac, 'taxa_cartao', r.id);
  end if;
end $$;

-- usa o crédito da carteira do paciente: sem lançamento de caixa e sem nova receita (D-13)
create or replace function usar_credito(p_debito uuid, p_valor numeric, p_dentista uuid, p_data date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare d debitos%rowtype; v_id uuid;
begin
  perform assert_auth();
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor.'; end if;
  if p_dentista is null then raise exception 'Informe o dentista responsável pelo recebimento.'; end if;
  select * into d from debitos where id = p_debito for update;
  if not found or d.status in ('pago','cancelado') then raise exception 'Débito indisponível.'; end if;
  if p_valor > d.saldo then raise exception 'O valor excede o saldo do débito (R$ %).', d.saldo; end if;
  update creditos_paciente set saldo = saldo - p_valor
   where paciente_id = d.paciente_id and unidade_id = d.unidade_id and saldo >= p_valor;
  if not found then raise exception 'Crédito insuficiente na carteira do paciente.'; end if;

  insert into recebimentos (debito_id, paciente_id, unidade_id, dentista_id, valor, valor_aplicado, meio, valor_liquido,
                            data_pagamento, data_recebimento, status, descricao)
  values (d.id, d.paciente_id, d.unidade_id, p_dentista, p_valor, p_valor, 'credito_paciente', p_valor,
          p_data, p_data, 'realizado', 'Uso de crédito do paciente') returning id into v_id;
  insert into credito_movs (paciente_id, unidade_id, tipo, valor, recebimento_id, descricao)
  values (d.paciente_id, d.unidade_id, 'uso', p_valor, v_id, 'Uso em débito');
  perform _aplicar_pagamento_debito(d.id, p_valor, 0);
  perform _gerar_comissao_venda(v_id);
  return v_id;
end $$;

create or replace function estornar_recebimento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r recebimentos%rowtype; t caixa_turnos%rowtype; d debitos%rowtype; v_exced numeric; c record;
begin
  perform assert_auth();
  select * into r from recebimentos where id = p_id for update;
  if not found then raise exception 'Recebimento não encontrado.'; end if;
  if r.status = 'estornado' then raise exception 'Recebimento já estornado.'; end if;
  if r.turno_id is not null then
    select * into t from caixa_turnos where id = r.turno_id;
    if t.status = 'fechado' then raise exception 'Caixa encerrado, procure o Financeiro.'; end if;
  end if;
  select * into d from debitos where id = r.debito_id for update;

  if r.meio = 'credito_paciente' then
    insert into creditos_paciente (paciente_id, unidade_id, saldo) values (r.paciente_id, r.unidade_id, r.valor)
    on conflict (paciente_id, unidade_id) do update set saldo = creditos_paciente.saldo + excluded.saldo;
    insert into credito_movs (paciente_id, unidade_id, tipo, valor, recebimento_id, descricao)
    values (r.paciente_id, r.unidade_id, 'estorno', r.valor, r.id, 'Estorno de uso de crédito');
  else
    v_exced := r.valor - r.valor_aplicado;
    if v_exced > 0 then
      update creditos_paciente set saldo = saldo - v_exced
       where paciente_id = r.paciente_id and unidade_id = r.unidade_id and saldo >= v_exced;
      if not found then raise exception 'O crédito gerado por este recebimento já foi utilizado.'; end if;
      insert into credito_movs (paciente_id, unidade_id, tipo, valor, recebimento_id, descricao)
      values (r.paciente_id, r.unidade_id, 'estorno', -v_exced, r.id, 'Estorno de recebimento');
    end if;
  end if;

  update debitos set valor_pago = valor_pago - r.valor_aplicado, desconto = desconto - r.desconto,
    status = case when valor_pago - r.valor_aplicado + desconto - r.desconto = 0 then 'pendente' else 'parcial' end
  where id = d.id;
  update lancamentos set estornado = true where origem_id = r.id and origem in ('recebimento','taxa_cartao');
  update recebimentos set status = 'estornado' where id = r.id;
  for c in select id from comissoes where recebimento_id = r.id and not estornada loop
    perform estornar_comissao(c.id);
  end loop;
end $$;

-- =====================================================================
-- 10. EVOLUÇÃO, COMISSÕES, LOTES, PAGAMENTO DE DENTISTAS
-- =====================================================================
-- Só procedimento "executado" gera comissão de execução (valor fixo do catálogo).
-- Débito vencido NÃO bloqueia: o sistema apenas sinaliza (ver v_execucoes_sinalizadas na tela).
create or replace function evoluir_item(p_item uuid, p_status text, p_dentista uuid, p_obs text default null, p_data date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare i orcamento_itens%rowtype; o orcamentos%rowtype; v_lote uuid; v_setor text; c record;
begin
  perform assert_auth();
  if p_dentista is null then raise exception 'Informe o dentista que executou o procedimento.'; end if;
  select * into i from orcamento_itens where id = p_item for update;
  if not found then raise exception 'Procedimento não encontrado.'; end if;
  select * into o from orcamentos where id = i.orcamento_id;
  if o.status <> 'aprovado' then raise exception 'Só procedimentos de orçamento aprovado podem ser evoluídos.'; end if;

  insert into evolucoes (item_id, paciente_id, dentista_id, status, data, observacao)
  values (p_item, o.paciente_id, p_dentista, p_status, p_data, p_obs);
  update orcamento_itens set status_exec = p_status, dentista_exec_id = p_dentista,
    executado_em = case when p_status = 'executado' then p_data end where id = p_item;

  if p_status = 'executado' and i.status_exec <> 'executado' then
    select setor into v_setor from procedimentos where id = i.procedimento_id;
    v_lote := lote_aberto_para(p_data, p_dentista, 'execucao');
    insert into comissoes (lote_id, dentista_id, tipo, unidade_id, setor, paciente_id, item_id, base, valor_calculado, valor, data_ref, descricao)
    values (v_lote, p_dentista, 'execucao', o.unidade_id, v_setor, o.paciente_id, p_item, i.valor_execucao,
            i.valor_execucao, i.valor_execucao, p_data,
            (select nome from procedimentos where id = i.procedimento_id) || coalesce(' — dente ' || i.dente, ''));
  elsif p_status <> 'executado' and i.status_exec = 'executado' then
    for c in select id from comissoes where item_id = p_item and tipo = 'execucao' and not estornada and estorno_de is null loop
      perform estornar_comissao(c.id);
    end loop;
  end if;
end $$;

create or replace function alterar_comissao(p_id uuid, p_valor numeric, p_just text) returns void
language plpgsql security definer set search_path = public as $$
declare c comissoes%rowtype;
begin
  perform require_perm('alterar_comissao');
  if coalesce(trim(p_just), '') = '' then raise exception 'Informe a justificativa da alteração.'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Valor inválido.'; end if;
  select * into c from comissoes where id = p_id for update;
  if not found or c.status <> 'aberta' then raise exception 'Só comissões de lote aberto podem ser alteradas; acerte no próximo lote.'; end if;
  insert into comissao_log (comissao_id, valor_antigo, valor_novo, justificativa) values (c.id, c.valor, p_valor, p_just);
  update comissoes set valor = p_valor, editado = (p_valor <> valor_calculado), justificativa = p_just where id = c.id;
end $$;

-- produção de convênio: lançada à mão, uma linha por unidade
create or replace function acrescentar_producao_convenio(p_dentista uuid, p_unidade uuid, p_operadora text, p_valor numeric,
                                                          p_desc text default null, p_data date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare v_lote uuid;
begin
  perform require_perm('financeiro');
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor.'; end if;
  if coalesce(trim(p_operadora), '') = '' then raise exception 'Informe a operadora.'; end if;
  v_lote := lote_aberto_para(p_data, p_dentista, 'convenio');
  insert into comissoes (lote_id, dentista_id, tipo, unidade_id, setor, valor_calculado, valor, data_ref, descricao)
  values (v_lote, p_dentista, 'convenio', p_unidade, 'Convênios', p_valor, p_valor, p_data,
          trim(p_operadora) || coalesce(' — ' || p_desc, ''));
end $$;

-- Encerra o lote inteiro ou só um dentista/tipo. Cada (dentista, tipo) vira UMA previsão.
create or replace function encerrar_lote(p_lote uuid, p_dentista uuid default null, p_tipo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare l lotes%rowtype; g record; v_total numeric; v_prev uuid; v_venc date; v_next date; v_last date;
        v_dia int; v_nome text; v_n int := 0; v_dest uuid;
begin
  perform require_perm('financeiro');
  select * into l from lotes where id = p_lote for update;
  if not found then raise exception 'Lote não encontrado.'; end if;
  if l.status = 'encerrado' then raise exception 'Lote já encerrado.'; end if;

  for g in select dentista_id, tipo from comissoes
           where lote_id = p_lote and status = 'aberta'
             and (p_dentista is null or dentista_id = p_dentista) and (p_tipo is null or tipo = p_tipo)
           group by 1, 2 loop
    select coalesce(sum(valor), 0) into v_total from comissoes
     where lote_id = p_lote and dentista_id = g.dentista_id and tipo = g.tipo and status = 'aberta';
    v_prev := null;
    insert into lote_fechamentos (lote_id, dentista_id, tipo) values (p_lote, g.dentista_id, g.tipo) on conflict do nothing;

    if v_total > 0 then
      select nome, dia_pagamento into v_nome, v_dia from dentistas where id = g.dentista_id;
      v_next := (l.competencia + interval '1 month')::date;
      v_last := (v_next + interval '1 month' - interval '1 day')::date;
      v_venc := v_next + (least(coalesce(v_dia, 31), extract(day from v_last)::int) - 1);
      insert into previsoes (origem, tipo, dentista_id, lote_id, descricao, valor, vencimento, grupo, subgrupo)
      values ('producao', case g.tipo when 'venda' then 'comissao_venda' when 'execucao' then 'comissao_execucao' else 'convenio' end,
              g.dentista_id, p_lote,
              format('Comissão de %s — %s — %s', case g.tipo when 'venda' then 'vendas' when 'execucao' then 'execução' else 'convênio' end,
                     to_char(l.competencia, 'MM/YYYY'), v_nome),
              v_total, v_venc, 'Pessoal', 'Comissão de dentistas')
      returning id into v_prev;
      update comissoes set status = 'encerrada', previsao_id = v_prev
       where lote_id = p_lote and dentista_id = g.dentista_id and tipo = g.tipo and status = 'aberta';
    elsif v_total = 0 then
      update comissoes set status = 'encerrada'
       where lote_id = p_lote and dentista_id = g.dentista_id and tipo = g.tipo and status = 'aberta';
    else
      -- saldo negativo (estornos): acerta no próximo pagamento
      v_dest := lote_aberto_para((l.competencia + interval '1 month')::date, g.dentista_id, g.tipo);
      update comissoes set lote_id = v_dest
       where lote_id = p_lote and dentista_id = g.dentista_id and tipo = g.tipo and status = 'aberta';
    end if;
    update lote_fechamentos set previsao_id = v_prev where lote_id = p_lote and dentista_id = g.dentista_id and tipo = g.tipo;
    v_n := v_n + 1;
  end loop;

  if p_dentista is null and p_tipo is null then
    update lotes set status = 'encerrado', encerrado_em = now() where id = p_lote;
  end if;
  return v_n;
end $$;

-- pagamento único ao dentista (agrupado), com lançamentos separados por unidade e mesmo código PGD-n
create or replace function pagar_dentista(p_dentista uuid, p_previsoes uuid[], p_conta uuid, p_data date default current_date, p_obs text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_n int; v_pg pagamentos_dentista%rowtype; v_cod text; g record;
begin
  perform require_perm('financeiro');
  select count(*), coalesce(sum(valor), 0) into v_n, v_total from previsoes
   where id = any(p_previsoes) and dentista_id = p_dentista and origem = 'producao' and status = 'prevista';
  if v_n = 0 or v_n <> coalesce(array_length(p_previsoes, 1), 0) then
    raise exception 'Selecione previsões em aberto deste dentista.';
  end if;
  if p_conta is null then raise exception 'Informe a conta de pagamento.'; end if;

  insert into pagamentos_dentista (dentista_id, conta_id, data, total, observacao)
  values (p_dentista, p_conta, p_data, v_total, p_obs) returning * into v_pg;
  v_cod := 'PGD-' || v_pg.codigo;

  for g in select c.unidade_id, c.setor, sum(c.valor) as total from comissoes c
           where c.previsao_id = any(p_previsoes) group by 1, 2 loop
    if g.total < 0 then raise exception 'Composição negativa na unidade; ajuste a comissão antes de pagar.'; end if;
    if g.total > 0 then
      insert into lancamentos (tipo, data, valor, unidade_id, setor, conta_id, grupo, subgrupo, descricao, origem, origem_id, pagamento_codigo)
      values ('despesa', p_data, g.total, g.unidade_id, coalesce(g.setor, 'Clínico'), p_conta, 'Pessoal', 'Comissão de dentistas',
              'Pagamento ' || v_cod || ' — ' || (select nome from dentistas where id = p_dentista), 'pagamento_dentista', v_pg.id, v_cod);
    end if;
  end loop;

  update previsoes set status = 'paga', conta_id = p_conta, data_pagamento = p_data, pagamento_codigo = v_cod
   where id = any(p_previsoes);
  return v_cod;
end $$;

-- previsão manual (fornecedor, aluguel...). Previsão de produção só se paga por pagar_dentista.
create or replace function pagar_previsao(p_id uuid, p_conta uuid, p_data date default current_date) returns void
language plpgsql security definer set search_path = public as $$
declare p previsoes%rowtype;
begin
  perform require_perm('financeiro');
  select * into p from previsoes where id = p_id for update;
  if not found or p.status <> 'prevista' then raise exception 'Previsão indisponível.'; end if;
  if p.origem = 'producao' then raise exception 'Previsão de produção deve ser paga pela tela de Produção dos Dentistas.'; end if;
  if p.unidade_id is null then raise exception 'Informe a unidade da previsão antes de pagar.'; end if;
  insert into lancamentos (tipo, data, valor, unidade_id, setor, conta_id, grupo, subgrupo, descricao, origem, origem_id)
  values ('despesa', p_data, p.valor, p.unidade_id, p.setor, p_conta, p.grupo, p.subgrupo,
          coalesce(p.descricao, p.fornecedor), 'previsao', p.id);
  update previsoes set status = 'paga', conta_id = p_conta, data_pagamento = p_data where id = p_id;
end $$;

-- =====================================================================
-- 11. FINANCEIRO: lançamentos manuais, transferência, devolução de crédito, relatórios
-- =====================================================================
create or replace function lancar_movimentacao(p_tipo text, p_data date, p_valor numeric, p_conta uuid, p_unidade uuid,
  p_setor text, p_grupo text, p_subgrupo text, p_nfe text, p_desc text, p_obs text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_grupo boolean := p_tipo in ('aporte','emprestimo','devolucao_emprestimo');
begin
  perform require_perm('financeiro');
  if p_tipo not in ('receita','despesa','aporte','emprestimo','devolucao_emprestimo') then raise exception 'Tipo inválido.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor.'; end if;
  if p_conta is null then raise exception 'Informe o banco/conta.'; end if;
  if not v_grupo and p_unidade is null then raise exception 'Informe a unidade.'; end if;
  insert into lancamentos (tipo, data, valor, unidade_id, setor, conta_id, grupo, subgrupo, nfe, descricao, observacao)
  values (p_tipo, p_data, p_valor, case when v_grupo then null else p_unidade end, p_setor, p_conta, p_grupo, p_subgrupo, p_nfe, p_desc, p_obs)
  returning id into v_id;
  return v_id;
end $$;

create or replace function transferir(p_origem uuid, p_destino uuid, p_valor numeric, p_data date, p_desc text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ref uuid := gen_random_uuid();
begin
  perform require_perm('financeiro');
  if p_origem is null or p_destino is null or p_origem = p_destino then raise exception 'Escolha contas de origem e destino diferentes.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor.'; end if;
  insert into lancamentos (tipo, data, valor, conta_id, grupo, descricao, origem, origem_id)
  values ('transferencia_saida', p_data, p_valor, p_origem, 'Transferência', p_desc, 'transferencia', v_ref),
         ('transferencia_entrada', p_data, p_valor, p_destino, 'Transferência', p_desc, 'transferencia', v_ref);
end $$;

-- devolução de crédito = dedução da receita (estorno de venda), nunca despesa
create or replace function devolver_credito(p_paciente uuid, p_unidade uuid, p_valor numeric, p_conta uuid, p_data date default current_date, p_desc text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_pac text;
begin
  perform require_perm('financeiro');
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor.'; end if;
  update creditos_paciente set saldo = saldo - p_valor where paciente_id = p_paciente and unidade_id = p_unidade and saldo >= p_valor;
  if not found then raise exception 'Crédito insuficiente na carteira do paciente.'; end if;
  select nome into v_pac from pacientes where id = p_paciente;
  insert into credito_movs (paciente_id, unidade_id, tipo, valor, descricao) values (p_paciente, p_unidade, 'devolucao', p_valor, p_desc);
  insert into lancamentos (tipo, data, valor, unidade_id, setor, conta_id, grupo, subgrupo, descricao, origem)
  values ('devolucao_credito', p_data, p_valor, p_unidade, 'Clínico', p_conta, 'Deduções da receita', 'Devolução de crédito',
          'Devolução de crédito — ' || v_pac, 'credito');
end $$;

create or replace function dre_resumo(p_ini date, p_fim date, p_unidade uuid default null, p_setor text default null)
returns table (tipo text, unidade_id uuid, setor text, total numeric)
language sql stable security invoker set search_path = public as $$
  select l.tipo, l.unidade_id, l.setor, sum(l.valor)
  from lancamentos l
  where not l.estornado and l.data between p_ini and p_fim
    and l.tipo not in ('transferencia_entrada','transferencia_saida')
    and (p_unidade is null or l.unidade_id = p_unidade)
    and (p_setor is null or l.setor = p_setor)
  group by 1, 2, 3
$$;

create or replace function fluxo_caixa(p_ini date, p_fim date, p_conta uuid default null, p_unidade uuid default null)
returns table (saldo_inicial numeric, entradas numeric, saidas numeric, saldo_final numeric)
language sql stable security invoker set search_path = public as $$
  with base as (
    select case when p_unidade is null then coalesce((select sum(c.saldo_inicial) from contas_bancarias c where p_conta is null or c.id = p_conta), 0) else 0 end as s0),
  ant as (
    select coalesce(sum(case when l.tipo in ('receita','aporte','emprestimo','transferencia_entrada') then l.valor else -l.valor end), 0) as v
    from lancamentos l where not l.estornado and l.data < p_ini
      and (p_conta is null or l.conta_id = p_conta) and (p_unidade is null or l.unidade_id = p_unidade)),
  per as (
    select coalesce(sum(l.valor) filter (where l.tipo in ('receita','aporte','emprestimo','transferencia_entrada')), 0) as e,
           coalesce(sum(l.valor) filter (where l.tipo in ('despesa','devolucao_emprestimo','transferencia_saida','devolucao_credito')), 0) as s
    from lancamentos l where not l.estornado and l.data between p_ini and p_fim
      and (p_conta is null or l.conta_id = p_conta) and (p_unidade is null or l.unidade_id = p_unidade))
  select base.s0 + ant.v, per.e, per.s, base.s0 + ant.v + per.e - per.s from base, ant, per
$$;

-- =====================================================================
-- 12. SEGURANÇA (RLS)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['perfis_usuario','contas_bancarias','procedimentos','config','taxas_cartao','orcamentos','orcamento_itens',
      'evolucoes','debitos','caixa_turnos','caixa_movs','recebimentos','creditos_paciente','credito_movs','lancamentos','lotes',
      'comissoes','lote_fechamentos','comissao_log','previsoes','pagamentos_dentista'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "leitura" on %I', t);
    execute format('create policy "leitura" on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- escrita direta permitida só onde não há risco para o dinheiro
drop policy if exists "escrita" on procedimentos;
create policy "escrita" on procedimentos for all to authenticated using (true) with check (true);

drop policy if exists "escrita" on taxas_cartao;
create policy "escrita" on taxas_cartao for all to authenticated using (perm('financeiro')) with check (perm('financeiro'));
drop policy if exists "escrita" on config;
create policy "escrita" on config for all to authenticated using (perm('financeiro')) with check (perm('financeiro'));
drop policy if exists "escrita" on contas_bancarias;
create policy "escrita" on contas_bancarias for all to authenticated using (perm('financeiro')) with check (perm('financeiro'));
drop policy if exists "escrita" on perfis_usuario;
create policy "escrita" on perfis_usuario for all to authenticated using (perm('admin')) with check (perm('admin'));

drop policy if exists "escrita" on orcamentos;
create policy "escrita" on orcamentos for all to authenticated
  using (status = 'pendente') with check (status in ('pendente','cancelado'));
drop policy if exists "inserir" on orcamentos;
create policy "inserir" on orcamentos for insert to authenticated with check (status = 'pendente');

drop policy if exists "escrita" on orcamento_itens;
create policy "escrita" on orcamento_itens for all to authenticated
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and o.status = 'pendente'))
  with check (exists (select 1 from orcamentos o where o.id = orcamento_id and o.status = 'pendente'));

drop policy if exists "escrita" on previsoes;
create policy "escrita" on previsoes for all to authenticated
  using (origem = 'manual' and perm('financeiro')) with check (origem = 'manual' and perm('financeiro'));

-- funções: só usuários autenticados; auxiliares internas não ficam expostas na API
revoke all on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function handle_new_user(), guard_item(), assert_auth(), require_perm(text), _setor_orcamento(uuid),
  lote_aberto_para(date, uuid, text), _gerar_comissao_venda(uuid), estornar_comissao(uuid),
  _aplicar_pagamento_debito(uuid, numeric, numeric) from authenticated;
