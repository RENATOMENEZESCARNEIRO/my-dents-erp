-- =====================================================================
-- v12 — Bloqueio por unidade também nas operações (RPCs SECURITY DEFINER)
-- Gatilho em toda tabela com unidade_id: quem não tem acesso à unidade não grava,
-- nem por função. Sem usuário logado (SQL editor/service role) continua liberado.
-- =====================================================================
create or replace function trg_unidade_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if auth.uid() is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op in ('UPDATE','DELETE') then
    u := old.unidade_id;
    if not unidade_ok(u) then raise exception 'Sem acesso a esta unidade.'; end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    u := new.unidade_id;
    if not unidade_ok(u) then raise exception 'Sem acesso a esta unidade.'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'unidade_id'
      and c.table_name not in ('dentistas', 'dentista_unidades', 'perfis_usuario')
  loop
    execute format('drop trigger if exists zz_unidade_guard on %I', t);
    execute format('create trigger zz_unidade_guard before insert or update or delete on %I for each row execute function trg_unidade_guard()', t);
  end loop;
end $$;

-- Abertura automática só nas unidades que o usuário acessa.
create or replace function garantir_caixas_hoje() returns int
language plpgsql security definer set search_path = public as $$
declare u record; n int := 0;
begin
  perform assert_auth();
  for u in select id from unidades where ativo and unidade_ok(id) loop
    if not exists (select 1 from caixa_turnos where unidade_id = u.id and data = current_date) then
      perform garantir_caixa(u.id, current_date); n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke all on function trg_unidade_guard() from public, anon;
