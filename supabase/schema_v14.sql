-- v14 — Segregação por unidade: contas/taxas/config com unidade_id, dinheiro sempre com unidade, dentistas filtrados
-- Contas, taxas de cartão e configurações: unidade_id opcional (nulo = vale para toda a rede).
alter table contas_bancarias add column if not exists unidade_id uuid references unidades(id);
alter table taxas_cartao     add column if not exists unidade_id uuid references unidades(id);
alter table config           add column if not exists unidade_id uuid references unidades(id);

-- Receitas e despesas (lançamentos) e previsões: unidade obrigatória daqui em diante.
alter table lancamentos drop constraint if exists lancamentos_unidade_obrig;
alter table lancamentos add constraint lancamentos_unidade_obrig check (unidade_id is not null) not valid;
alter table previsoes drop constraint if exists previsoes_unidade_obrig;
alter table previsoes add constraint previsoes_unidade_obrig check (unidade_id is not null) not valid;

-- Dentistas: operador sem acesso global só vê profissionais alocados nas suas unidades.
create or replace function dentista_visivel(d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ativo and admin from perfis_usuario where user_id = auth.uid()), false)
      or exists (select 1 from dentista_unidades du where du.dentista_id = d and unidade_ok(du.unidade_id))
$$;
revoke all on function dentista_visivel(uuid) from public, anon;
grant execute on function dentista_visivel(uuid) to authenticated;

drop policy if exists "unidade_dent_sel" on dentistas;
create policy "unidade_dent_sel" on dentistas as restrictive for select to authenticated using (dentista_visivel(id));
drop policy if exists "unidade_dent_upd" on dentistas;
create policy "unidade_dent_upd" on dentistas as restrictive for update to authenticated using (dentista_visivel(id));
drop policy if exists "unidade_dent_del" on dentistas;
create policy "unidade_dent_del" on dentistas as restrictive for delete to authenticated using (dentista_visivel(id));
drop policy if exists "unidade_du_sel" on dentista_unidades;
create policy "unidade_du_sel" on dentista_unidades as restrictive for select to authenticated using (unidade_ok(unidade_id));

-- Novas colunas unidade_id (contas, taxas, config) entram na segregação:
do $$
declare t text;
begin
  foreach t in array array['contas_bancarias','taxas_cartao','config'] loop
    execute format('drop policy if exists "unidade_acesso" on %I', t);
    execute format('create policy "unidade_acesso" on %I as restrictive for all to authenticated using (unidade_ok(unidade_id)) with check (unidade_ok(unidade_id))', t);
    execute format('drop trigger if exists zz_unidade_guard on %I', t);
    execute format('create trigger zz_unidade_guard before insert or update or delete on %I for each row execute function trg_unidade_guard()', t);
  end loop;
end $$;
