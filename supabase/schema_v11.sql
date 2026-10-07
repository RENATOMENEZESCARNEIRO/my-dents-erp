-- =====================================================================
-- v11 — Usuários por CPF, unidades de acesso e troca obrigatória de senha
-- =====================================================================
alter table perfis_usuario add column if not exists cpf text;
alter table perfis_usuario add column if not exists telefone text;
alter table perfis_usuario add column if not exists unidades_acesso uuid[] not null default '{}';
alter table perfis_usuario add column if not exists trocar_senha boolean not null default false;
create unique index if not exists perfis_usuario_cpf_uk on perfis_usuario (cpf) where cpf is not null;

-- O próprio usuário marca que já trocou a senha provisória.
create or replace function senha_trocada() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_auth();
  update perfis_usuario set trocar_senha = false where user_id = auth.uid();
end $$;

-- A unidade é permitida? (sem unidade = escopo Grupo; administrador vê todas)
create or replace function unidade_ok(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select u is null or coalesce((select ativo and (admin or u = any(unidades_acesso)) from perfis_usuario where user_id = auth.uid()), false)
$$;

-- Política restritiva em toda tabela com unidade_id: quem não tem a unidade não vê nem grava.
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'unidade_id'
      and c.table_name not in ('dentistas', 'dentista_unidades', 'perfis_usuario')
  loop
    execute format('drop policy if exists "unidade_acesso" on %I', t);
    execute format('create policy "unidade_acesso" on %I as restrictive for all to authenticated using (unidade_ok(unidade_id)) with check (unidade_ok(unidade_id))', t);
  end loop;
  drop policy if exists "unidade_acesso" on unidades;
  create policy "unidade_acesso" on unidades as restrictive for select to authenticated using (unidade_ok(id));
end $$;

revoke all on function senha_trocada(), unidade_ok(uuid) from public, anon;
grant execute on function senha_trocada(), unidade_ok(uuid) to authenticated;
