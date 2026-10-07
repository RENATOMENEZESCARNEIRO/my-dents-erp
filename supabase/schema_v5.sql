-- My Dents v5 — conferência de transações
alter table recebimentos add column if not exists conferido boolean not null default false;
alter table recebimentos add column if not exists conferido_em timestamptz;
alter table lancamentos  add column if not exists conferido boolean not null default false;
alter table lancamentos  add column if not exists conferido_em timestamptz;

create or replace function conferir_transacoes(p_tabela text, p_ids uuid[], p_valor boolean default true)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform require_perm('financeiro');
  if p_tabela = 'recebimentos' then
    update recebimentos set conferido = p_valor, conferido_em = case when p_valor then now() end where id = any(p_ids);
  elsif p_tabela = 'lancamentos' then
    update lancamentos set conferido = p_valor, conferido_em = case when p_valor then now() end where id = any(p_ids);
  else raise exception 'Tabela inválida.'; end if;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function conferir_transacoes(text, uuid[], boolean) from public, anon;
grant execute on function conferir_transacoes(text, uuid[], boolean) to authenticated;
