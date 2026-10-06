-- My Dents — schema Supabase (rode no SQL Editor do projeto)
create extension if not exists "pgcrypto";

create table if not exists unidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true
);
insert into unidades (nome) values ('Aldeota'), ('Messejana'), ('Maracanaú')
on conflict (nome) do nothing;

create table if not exists dentistas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text not null unique,            -- somente dígitos
  unidade_id uuid references unidades(id),
  especialidade text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists pacientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text not null unique,            -- somente dígitos
  telefone text not null,
  email text,
  unidade_id uuid not null references unidades(id),
  observacoes text,
  criado_em timestamptz not null default now()
);

create table if not exists agendamentos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  dentista_id uuid not null references dentistas(id),
  unidade_id uuid not null references unidades(id),
  data_hora timestamptz not null,
  procedimento text,
  status text not null default 'agendado'
    check (status in ('agendado','confirmado','em_atendimento','realizado','faltou','cancelado')),
  observacoes text,
  criado_em timestamptz not null default now()
);
-- impede dois atendimentos no mesmo horário para o mesmo dentista
create unique index if not exists agendamentos_dentista_horario_uq
  on agendamentos (dentista_id, data_hora) where status <> 'cancelado';

create table if not exists planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor_mensal numeric(12,2) not null check (valor_mensal >= 0),
  descricao text,
  ativo boolean not null default true
);
insert into planos (nome, valor_mensal, descricao) values
  ('Plano Básico', 49.90, 'Consultas e limpeza semestral'),
  ('Plano Ortodontia', 189.90, 'Manutenção ortodôntica mensal')
on conflict do nothing;

create table if not exists assinaturas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  plano_id uuid not null references planos(id),
  inicio date not null default current_date,
  status text not null default 'ativa' check (status in ('ativa','suspensa','cancelada')),
  criado_em timestamptz not null default now()
);

-- Segurança: somente usuários autenticados acessam os dados
do $$
declare t text;
begin
  foreach t in array array['unidades','dentistas','pacientes','agendamentos','planos','assinaturas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
