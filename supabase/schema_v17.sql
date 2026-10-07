-- v17 — Maquininhas: cada maquininha tem as próprias taxas (débito e crédito de 1x a 12x), editáveis.
-- Valores iniciais: referência de mercado para clínicas (débito e crédito à vista do contrato atual; parcelado em curva
-- crescente até o 12x do contrato). São só ponto de partida: ajuste conforme o contrato real de cada maquininha.

create table if not exists maquininhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade_id uuid references unidades(id),           -- nulo = vale para toda a rede
  aceita_debito boolean not null default true,
  aceita_credito boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  check (aceita_debito or aceita_credito)
);
alter table maquininhas enable row level security;
drop policy if exists "auth_all" on maquininhas;
create policy "auth_all" on maquininhas for all to authenticated using (true) with check (true);
drop policy if exists "so_ativos" on maquininhas;
create policy "so_ativos" on maquininhas as restrictive for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "perm_ins" on maquininhas; drop policy if exists "perm_upd" on maquininhas; drop policy if exists "perm_del" on maquininhas;
create policy "perm_ins" on maquininhas as restrictive for insert to authenticated with check (perm('financeiro'));
create policy "perm_upd" on maquininhas as restrictive for update to authenticated using (perm('financeiro')) with check (perm('financeiro'));
create policy "perm_del" on maquininhas as restrictive for delete to authenticated using (perm('financeiro'));
drop policy if exists "unidade_acesso" on maquininhas;
create policy "unidade_acesso" on maquininhas as restrictive for all to authenticated using (unidade_ok(unidade_id)) with check (unidade_ok(unidade_id));
drop trigger if exists zz_unidade_guard on maquininhas;
create trigger zz_unidade_guard before insert or update or delete on maquininhas for each row execute function trg_unidade_guard();

-- Maquininha padrão para as taxas que já existiam
insert into maquininhas (nome) select 'REDE (padrão)' where not exists (select 1 from maquininhas);

alter table taxas_cartao add column if not exists maquininha_id uuid references maquininhas(id) on delete cascade;
update taxas_cartao set maquininha_id = (select id from maquininhas order by criado_em limit 1) where maquininha_id is null;
alter table taxas_cartao alter column maquininha_id set not null;
alter table taxas_cartao drop constraint if exists taxas_cartao_modalidade_parcelas_key;
create unique index if not exists taxas_cartao_maq_mod_parc on taxas_cartao (maquininha_id, modalidade, parcelas);

-- Taxas de referência (débito 0,99%; crédito 1x 3,15% ... 12x 10,69%), sem marcar "revisar"
update taxas_cartao t set percentual = v.p, revisar = false
  from (values (1,3.15),(2,4.20),(3,5.00),(4,5.80),(5,6.60),(6,7.30),(7,8.00),(8,8.70),(9,9.30),(10,9.90),(11,10.30),(12,10.69)) v(n, p)
 where t.modalidade = 'credito' and t.parcelas = v.n;
update taxas_cartao set percentual = 0.99, revisar = false where modalidade = 'debito' and parcelas = 1;

-- Recebimento passa a registrar qual maquininha foi usada
alter table recebimentos add column if not exists maquininha_id uuid references maquininhas(id);

-- receber_debito: novo parâmetro opcional p_maquininha (sem ele, usa a primeira maquininha ativa)
do $$
declare r record; def text; novo text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'receber_debito' loop
    def := pg_get_functiondef(r.oid);
    continue when def like '%p_maquininha%';
    novo := replace(def, 'p_descricao text DEFAULT NULL::text)', 'p_descricao text DEFAULT NULL::text, p_maquininha uuid DEFAULT NULL::uuid)');
    if novo = def then raise exception 'assinatura de receber_debito não reconhecida'; end if;
    def := novo;
    novo := replace(def, 'select percentual into v_rate from taxas_cartao where modalidade = p_meio and parcelas = p_parcelas;',
      'v_maq := coalesce(p_maquininha, (select id from maquininhas where ativo order by criado_em limit 1)); select percentual into v_rate from taxas_cartao where maquininha_id = v_maq and modalidade = p_meio and parcelas = p_parcelas;');
    if novo = def then raise exception 'consulta de taxa de receber_debito não encontrada'; end if;
    def := novo;
    novo := replace(def, 'declare ', 'declare v_maq uuid; ');
    def := novo;
    novo := replace(def, 'perform _aplicar_pagamento_debito(d.id, v_aplicado, p_desconto);',
      'update recebimentos set maquininha_id = v_maq where id = v_id; perform _aplicar_pagamento_debito(d.id, v_aplicado, p_desconto);');
    if novo = def then raise exception 'ponto de gravação da maquininha não encontrado'; end if;
    execute format('drop function %s', r.oid::regprocedure);
    execute novo;
  end loop;
end $$;
revoke all on function receber_debito(uuid, numeric, numeric, text, uuid, uuid, date, int, text, text, uuid) from public, anon;
grant execute on function receber_debito(uuid, numeric, numeric, text, uuid, uuid, date, int, text, text, uuid) to authenticated;
