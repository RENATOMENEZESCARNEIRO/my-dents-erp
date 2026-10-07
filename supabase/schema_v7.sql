-- My Dents v7 — Prótese (laboratório) e Estoque. Rode no SQL Editor (depois do v6).

-- ===== PRÓTESE =====
create table if not exists laboratorios (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  contato text, telefone text,
  ativo boolean not null default true
);

create table if not exists proteses (
  id uuid primary key default gen_random_uuid(),
  codigo bigint generated always as identity unique,
  paciente_id uuid not null references pacientes(id) on delete cascade,
  unidade_id uuid not null references unidades(id),
  dentista_id uuid not null references dentistas(id),
  laboratorio_id uuid not null references laboratorios(id),
  item_id uuid references orcamento_itens(id) on delete set null,
  tipo text not null,                       -- coroa, faceta, prótese total, etc.
  dente text, cor text, descricao text,
  status text not null default 'solicitado'
    check (status in ('solicitado','enviado','em_producao','recebido','instalado','refazer','cancelado')),
  data_envio date, data_prevista date, data_retorno date, data_instalacao date,
  valor_lab numeric(12,2) not null default 0 check (valor_lab >= 0),
  pago boolean not null default false,
  lancamento_id uuid references lancamentos(id) on delete set null,
  observacoes text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);
create index if not exists proteses_status_idx on proteses(status, data_prevista);
create index if not exists proteses_pac_idx on proteses(paciente_id);

create or replace function pagar_protese(p_id uuid, p_conta uuid, p_data date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare pr proteses%rowtype; v_lab text; v_l uuid;
begin
  perform assert_auth(); perform require_perm('financeiro');
  select * into pr from proteses where id = p_id for update;
  if not found then raise exception 'Prótese não encontrada.'; end if;
  if pr.pago then raise exception 'Esta prótese já foi paga ao laboratório.'; end if;
  if pr.valor_lab <= 0 then raise exception 'Informe o valor do laboratório antes de pagar.'; end if;
  select nome into v_lab from laboratorios where id = pr.laboratorio_id;
  v_l := lancar_movimentacao('despesa', p_data, pr.valor_lab, p_conta, pr.unidade_id, 'Clínico', 'Laboratório', 'Prótese',
                             null, 'Prótese #' || pr.codigo || ' — ' || v_lab, null);
  update proteses set pago = true, lancamento_id = v_l where id = p_id;
  return v_l;
end $$;

-- ===== ESTOQUE =====
create table if not exists estoque_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  categoria text,
  unidade_medida text not null default 'un',
  minimo numeric(12,2) not null default 0 check (minimo >= 0),
  ativo boolean not null default true
);

create table if not exists estoque_movs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references estoque_itens(id),
  unidade_id uuid not null references unidades(id),
  tipo text not null check (tipo in ('entrada','saida','perda')),
  qtd numeric(12,2) not null check (qtd > 0),
  custo_unit numeric(12,2) check (custo_unit is null or custo_unit >= 0),
  data date not null default current_date,
  obs text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);
create index if not exists estoque_movs_idx on estoque_movs(item_id, unidade_id);

create or replace view estoque_saldo with (security_invoker = true) as
select i.id as item_id, u.id as unidade_id,
       coalesce(sum(case when m.tipo = 'entrada' then m.qtd else -m.qtd end), 0) as saldo
from estoque_itens i cross join unidades u
left join estoque_movs m on m.item_id = i.id and m.unidade_id = u.id
group by i.id, u.id;

create or replace function guard_estoque() returns trigger language plpgsql security definer set search_path = public as $$
declare v_saldo numeric;
begin
  if new.tipo in ('saida','perda') then
    perform pg_advisory_xact_lock(hashtext(new.item_id::text || new.unidade_id::text));
    select coalesce(sum(case when tipo = 'entrada' then qtd else -qtd end), 0) into v_saldo
      from estoque_movs where item_id = new.item_id and unidade_id = new.unidade_id;
    if new.qtd > v_saldo then raise exception 'Saldo insuficiente em estoque (disponível: %).', v_saldo; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_estoque on estoque_movs;
create trigger trg_guard_estoque before insert on estoque_movs for each row execute function guard_estoque();

-- ===== Segurança (mesmo padrão do v6) =====
do $$
declare x record;
begin
  for x in select * from (values
    ('laboratorios','cadastros_editar'), ('proteses','proteses'),
    ('estoque_itens','estoque'), ('estoque_movs','estoque')) as v(tabela, chave) loop
    execute format('alter table %I enable row level security', x.tabela);
    execute format('drop policy if exists "auth_all" on %I', x.tabela);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', x.tabela);
    execute format('drop policy if exists "so_ativos" on %I', x.tabela);
    execute format('create policy "so_ativos" on %I as restrictive for all to authenticated using (is_staff()) with check (is_staff())', x.tabela);
    execute format('drop policy if exists "perm_ins" on %I', x.tabela);
    execute format('drop policy if exists "perm_upd" on %I', x.tabela);
    execute format('drop policy if exists "perm_del" on %I', x.tabela);
    execute format('create policy "perm_ins" on %I as restrictive for insert to authenticated with check (perm(%L))', x.tabela, x.chave);
    execute format('create policy "perm_upd" on %I as restrictive for update to authenticated using (perm(%L)) with check (perm(%L))', x.tabela, x.chave, x.chave);
    execute format('create policy "perm_del" on %I as restrictive for delete to authenticated using (perm(%L))', x.tabela, x.chave);
  end loop;
end $$;
