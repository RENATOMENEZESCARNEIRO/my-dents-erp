-- v15 — Dentistas: atuação por unidade (dias/horários), acesso ao sistema; procedimentos por especialidade
alter table dentistas add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists dentistas_user_uq on dentistas(user_id) where user_id is not null;

alter table dentista_unidades
  add column if not exists minutos_consulta int not null default 15 check (minutos_consulta between 5 and 240),
  add column if not exists almoco_ini time,
  add column if not exists almoco_fim time;

create table if not exists dentista_horarios (
  dentista_id uuid not null references dentistas(id) on delete cascade,
  unidade_id uuid not null references unidades(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),   -- 0 = domingo
  hora_ini time not null,
  hora_fim time not null check (hora_fim > hora_ini),
  primary key (dentista_id, unidade_id, dia_semana)
);
alter table dentista_horarios enable row level security;
drop policy if exists "auth_all" on dentista_horarios;
create policy "auth_all" on dentista_horarios for all to authenticated using (true) with check (true);
drop policy if exists "so_ativos" on dentista_horarios;
create policy "so_ativos" on dentista_horarios as restrictive for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "unidade_acesso" on dentista_horarios;
create policy "unidade_acesso" on dentista_horarios as restrictive for all to authenticated using (unidade_ok(unidade_id)) with check (unidade_ok(unidade_id));
drop trigger if exists zz_unidade_guard on dentista_horarios;
create trigger zz_unidade_guard before insert or update or delete on dentista_horarios for each row execute function trg_unidade_guard();

-- Procedimentos agrupados por especialidade (mesma divisão do Simples Dental)
alter table procedimentos add column if not exists especialidade text not null default 'Outros';
update procedimentos set especialidade = 'Ortodontia' where setor = 'Ortodontia' and especialidade = 'Outros';
