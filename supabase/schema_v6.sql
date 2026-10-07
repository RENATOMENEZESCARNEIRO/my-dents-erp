-- My Dents v6 — permissões por usuário, ativação de acesso e dentistas por unidade
-- (rodar depois de schema.sql … schema_v5.sql)

-- 1) perfis: cargo, ativo e permissões granulares ------------------------------------------
alter table perfis_usuario add column if not exists cargo text;
alter table perfis_usuario add column if not exists ativo boolean not null default false;
alter table perfis_usuario add column if not exists permissoes jsonb not null default '{}'::jsonb;
update perfis_usuario set ativo = true where not ativo;   -- quem já existe continua com acesso

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ativo from perfis_usuario where user_id = auth.uid()), false)
$$;

create or replace function perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ativo and (admin or coalesce((permissoes ->> p)::boolean, false) or case p
            when 'financeiro' then financeiro
            when 'fechar_caixa' then fechar_caixa
            when 'alterar_comissao' then alterar_comissao
            else false end)
          from perfis_usuario where user_id = auth.uid()), false)
$$;

create or replace function assert_auth() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sessão expirada. Entre novamente.'; end if;
  if not is_staff() then raise exception 'Seu acesso ainda não foi liberado pelo administrador.'; end if;
end $$;

-- 1º usuário = administrador ativo; os demais entram inativos até o admin liberar
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare primeiro boolean := not exists (select 1 from perfis_usuario);
begin
  insert into perfis_usuario (user_id, nome, admin, ativo, cargo)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), primeiro, primeiro, case when primeiro then 'Administrador' end)
  on conflict do nothing;
  return new;
end $$;

-- 2) quem não está ativo não enxerga nem altera nada (política restritiva em todas as tabelas) -------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "so_ativos" on %I', t);
    if t = 'perfis_usuario' then
      execute format('create policy "so_ativos" on %I as restrictive for all to authenticated using (is_staff() or user_id = auth.uid()) with check (is_staff())', t);
    else
      execute format('create policy "so_ativos" on %I as restrictive for all to authenticated using (is_staff()) with check (is_staff())', t);
    end if;
  end loop;
end $$;
drop policy if exists "pacientes_ativos" on storage.objects;
create policy "pacientes_ativos" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'pacientes' or is_staff()) with check (bucket_id <> 'pacientes' or is_staff());

-- 3) escrita por permissão (policies restritivas por comando) ---------------------------------
do $$
declare x record;
begin
  for x in select * from (values
      ('pacientes','pacientes_editar'), ('agendamentos','agenda_editar'),
      ('orcamentos','orcamentos_criar'), ('orcamento_itens','orcamentos_criar'),
      ('anamneses','prontuario'), ('notas_clinicas','prontuario'), ('documentos_paciente','prontuario'), ('imagens_paciente','imagens'),
      ('dentistas','cadastros_editar'), ('planos','cadastros_editar'), ('assinaturas','cadastros_editar'), ('procedimentos','cadastros_editar'), ('unidades','cadastros_editar')
    ) as v(tabela, chave) loop
    execute format('drop policy if exists "perm_ins" on %I', x.tabela);
    execute format('drop policy if exists "perm_upd" on %I', x.tabela);
    execute format('drop policy if exists "perm_del" on %I', x.tabela);
    execute format('create policy "perm_ins" on %I as restrictive for insert to authenticated with check (perm(%L))', x.tabela, x.chave);
    execute format('create policy "perm_upd" on %I as restrictive for update to authenticated using (perm(%L)) with check (perm(%L))', x.tabela, x.chave, x.chave);
    execute format('create policy "perm_del" on %I as restrictive for delete to authenticated using (perm(%L))', x.tabela, x.chave);
  end loop;
end $$;

-- leitura de dados financeiros só com permissão
do $$
declare x record;
begin
  for x in select * from (values
      ('lancamentos','perm(''financeiro'')'), ('previsoes','perm(''financeiro'')'), ('pagamentos_dentista','perm(''financeiro'')'),
      ('comissoes','(perm(''financeiro'') or perm(''producao_ver''))'), ('lotes','(perm(''financeiro'') or perm(''producao_ver''))'),
      ('lote_fechamentos','(perm(''financeiro'') or perm(''producao_ver''))'), ('comissao_log','(perm(''financeiro'') or perm(''producao_ver''))')
    ) as v(tabela, regra) loop
    execute format('drop policy if exists "perm_sel" on %I', x.tabela);
    execute format('create policy "perm_sel" on %I as restrictive for select to authenticated using (%s)', x.tabela, x.regra);
  end loop;
end $$;

-- 4) operações (RPC) exigem a permissão correspondente ----------------------------------------
do $$
declare x record; r record; def text; novo text;
begin
  for x in select * from (values
      ('receber_debito','debitos_receber'), ('estornar_recebimento','estornar_recebimento'), ('abrir_caixa','caixa_abrir'),
      ('aprovar_orcamento','orcamentos_aprovar'), ('evoluir_item','tratamentos_evoluir'),
      ('usar_credito','debitos_receber'), ('registrar_mov_caixa','caixa_abrir')
    ) as v(fn, chave) loop
    for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = x.fn loop
      def := pg_get_functiondef(r.oid);
      continue when def like '%require_perm(''' || x.chave || ''')%';
      novo := replace(def, 'perform assert_auth();', 'perform assert_auth(); perform require_perm(''' || x.chave || ''');');
      if novo = def then raise exception 'assert_auth não encontrado em %', x.fn; end if;
      execute novo;
    end loop;
  end loop;
end $$;

-- 5) dentistas atendem em várias unidades --------------------------------------------------------
create table if not exists dentista_unidades (
  dentista_id uuid not null references dentistas(id) on delete cascade,
  unidade_id uuid not null references unidades(id) on delete cascade,
  primary key (dentista_id, unidade_id)
);
insert into dentista_unidades (dentista_id, unidade_id)
  select id, unidade_id from dentistas where unidade_id is not null on conflict do nothing;
alter table dentista_unidades enable row level security;
drop policy if exists "auth_all" on dentista_unidades;
create policy "auth_all" on dentista_unidades for all to authenticated using (true) with check (true);
drop policy if exists "so_ativos" on dentista_unidades;
create policy "so_ativos" on dentista_unidades as restrictive for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "perm_ins" on dentista_unidades; drop policy if exists "perm_upd" on dentista_unidades; drop policy if exists "perm_del" on dentista_unidades;
create policy "perm_ins" on dentista_unidades as restrictive for insert to authenticated with check (perm('cadastros_editar'));
create policy "perm_upd" on dentista_unidades as restrictive for update to authenticated using (perm('cadastros_editar'));
create policy "perm_del" on dentista_unidades as restrictive for delete to authenticated using (perm('cadastros_editar'));

-- 6) funções novas: só autenticados -------------------------------------------------------------
revoke all on function is_staff() from public, anon;
grant execute on function is_staff() to authenticated;
