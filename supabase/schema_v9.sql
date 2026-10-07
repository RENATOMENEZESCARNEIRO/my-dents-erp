-- My Dents v9 — Marketing: origem do paciente e campanhas. Rode no SQL Editor (depois do v8).

create table if not exists campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  canal text,                                  -- Instagram, Google, Indicação, Panfleto...
  inicio date, fim date,
  investimento numeric(12,2) not null default 0 check (investimento >= 0),
  ativo boolean not null default true,
  obs text,
  criado_em timestamptz not null default now()
);

alter table pacientes
  add column if not exists origem text,
  add column if not exists campanha_id uuid references campanhas(id) on delete set null;
create index if not exists pacientes_campanha_idx on pacientes(campanha_id);

do $$
begin
  alter table campanhas enable row level security;
  drop policy if exists "auth_all" on campanhas;
  create policy "auth_all" on campanhas for all to authenticated using (true) with check (true);
  drop policy if exists "so_ativos" on campanhas;
  create policy "so_ativos" on campanhas as restrictive for all to authenticated using (is_staff()) with check (is_staff());
  drop policy if exists "perm_ins" on campanhas; drop policy if exists "perm_upd" on campanhas; drop policy if exists "perm_del" on campanhas;
  create policy "perm_ins" on campanhas as restrictive for insert to authenticated with check (perm('marketing'));
  create policy "perm_upd" on campanhas as restrictive for update to authenticated using (perm('marketing')) with check (perm('marketing'));
  create policy "perm_del" on campanhas as restrictive for delete to authenticated using (perm('marketing'));
end $$;
