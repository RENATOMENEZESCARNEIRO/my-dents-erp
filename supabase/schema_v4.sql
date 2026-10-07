-- My Dents v4 — imagens e documentos do paciente
create table if not exists imagens_paciente (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  nome text not null,
  caminho text not null unique,
  mime text,
  tamanho bigint,
  descricao text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists imagens_pac_idx on imagens_paciente(paciente_id, criado_em desc);

create table if not exists documentos_paciente (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  tipo text not null check (tipo in ('contrato','termo','receituario','atestado','personalizado')),
  titulo text not null,
  conteudo text not null,
  dentista_id uuid references dentistas(id),
  data date not null default current_date,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists docs_pac_idx on documentos_paciente(paciente_id, data desc);

do $$
declare t text;
begin
  foreach t in array array['imagens_paciente','documentos_paciente'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- armazenamento privado (somente usuários logados)
insert into storage.buckets (id, name, public, file_size_limit)
values ('pacientes', 'pacientes', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "pacientes_ler" on storage.objects;
drop policy if exists "pacientes_enviar" on storage.objects;
drop policy if exists "pacientes_apagar" on storage.objects;
create policy "pacientes_ler" on storage.objects for select to authenticated using (bucket_id = 'pacientes');
create policy "pacientes_enviar" on storage.objects for insert to authenticated with check (bucket_id = 'pacientes');
create policy "pacientes_apagar" on storage.objects for delete to authenticated using (bucket_id = 'pacientes');
