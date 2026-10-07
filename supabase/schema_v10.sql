-- =====================================================================
-- v10 — Fluxo de caixa: abertura automática diária e trava de lançamentos manuais
-- =====================================================================

-- Garante o caixa (unidade + dia). Saldo inicial = saldo contado do último caixa anterior.
create or replace function garantir_caixa(p_unidade uuid, p_data date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ini numeric;
begin
  perform assert_auth();
  if p_data > current_date then raise exception 'Não é possível abrir caixa de data futura.'; end if;
  select id into v_id from caixa_turnos where unidade_id = p_unidade and data = p_data;
  if found then return v_id; end if;
  select coalesce(saldo_contado, saldo_inicial, 0) into v_ini
    from caixa_turnos where unidade_id = p_unidade and data < p_data order by data desc limit 1;
  insert into caixa_turnos (unidade_id, data, saldo_inicial) values (p_unidade, p_data, coalesce(v_ini, 0))
  on conflict (unidade_id, data) do nothing returning id into v_id;
  if v_id is null then select id into v_id from caixa_turnos where unidade_id = p_unidade and data = p_data; end if;
  return v_id;
end $$;

-- Abre o caixa de hoje de todas as unidades ativas (idempotente).
create or replace function garantir_caixas_hoje() returns int
language plpgsql security definer set search_path = public as $$
declare u record; n int := 0;
begin
  perform assert_auth();
  for u in select id from unidades where ativo loop
    if not exists (select 1 from caixa_turnos where unidade_id = u.id and data = current_date) then
      perform garantir_caixa(u.id, current_date); n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Caixa fechado não aceita lançamentos manuais (receita/despesa) daquele dia/unidade:
-- para incluir, alterar ou excluir é preciso reabrir o caixa antes.
create or replace function trg_lancamento_caixa_fechado() returns trigger
language plpgsql security definer set search_path = public as $$
declare o lancamentos%rowtype; fechado boolean;
begin
  if tg_op = 'INSERT' then o := new; else o := old; end if;
  if o.origem <> 'manual' or o.tipo not in ('receita','despesa') or o.unidade_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'conferido' - 'conferido_em') = (to_jsonb(old) - 'conferido' - 'conferido_em') then
    return new;   -- só conferência: permitido
  end if;
  select exists (select 1 from caixa_turnos where unidade_id = o.unidade_id and data = o.data and status = 'fechado') into fechado;
  if fechado then raise exception 'Caixa encerrado, procure o Financeiro (reabra o caixa para alterar).'; end if;
  if tg_op = 'UPDATE' then
    select exists (select 1 from caixa_turnos where unidade_id = new.unidade_id and data = new.data and status = 'fechado') into fechado;
    if fechado then raise exception 'Caixa encerrado, procure o Financeiro (reabra o caixa para alterar).'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists lancamento_caixa_fechado on lancamentos;
create trigger lancamento_caixa_fechado before insert or update or delete on lancamentos
  for each row execute function trg_lancamento_caixa_fechado();

revoke all on function garantir_caixa(uuid, date), garantir_caixas_hoje(), trg_lancamento_caixa_fechado() from public, anon;
grant execute on function garantir_caixa(uuid, date), garantir_caixas_hoje() to authenticated;
