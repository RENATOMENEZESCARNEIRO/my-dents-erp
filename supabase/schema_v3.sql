-- My Dents v3 — ficha completa do paciente (rodar depois de schema.sql e schema_v2.sql)
alter table pacientes
  add column if not exists data_nascimento date,
  add column if not exists sexo text check (sexo in ('F','M','O')),
  add column if not exists cep text,
  add column if not exists endereco text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text,
  add column if not exists responsavel_nome text,
  add column if not exists responsavel_cpf text,
  add column if not exists plano_id uuid references planos(id);

create table if not exists anamneses (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  modelo text not null default 'Anamnese adulta',
  respostas jsonb not null default '{}'::jsonb,
  alertas text,
  data date not null default current_date,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists anamneses_pac_idx on anamneses(paciente_id, data desc);

create table if not exists notas_clinicas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  dentista_id uuid references dentistas(id),
  dente text,
  data date not null default current_date,
  texto text not null,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists notas_pac_idx on notas_clinicas(paciente_id, data desc);

do $$
declare t text;
begin
  foreach t in array array['anamneses','notas_clinicas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
