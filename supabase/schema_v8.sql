-- My Dents v8 — Notas fiscais (NFS-e em lote, ISS Fortaleza). Rode no SQL Editor (depois do v7).

create table if not exists nfse_empresas (
  id uuid primary key default gen_random_uuid(),
  sigla text not null unique,
  razao_social text not null,
  cnpj text not null,                    -- só dígitos
  inscricao_municipal text not null,     -- SEM dígito verificador (formato aceito no lote)
  inscricao_portal text,                 -- como aparece no portal (com dígito), só referência
  ativo boolean not null default true
);
insert into nfse_empresas (sigla, razao_social, cnpj, inscricao_municipal, inscricao_portal)
values ('AJJ', 'AJJ SERVICOS ODONTOLOGICOS E ESTETICOS LTDA', '65093958000110', '1088129', '1088129-8')
on conflict (sigla) do nothing;

create table if not exists nfse_lotes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references nfse_empresas(id),
  numero_lote int not null,
  competencia date not null,             -- 1º dia do mês de referência
  data_emissao date not null,
  rps_inicial int not null,
  qtd int not null,
  total numeric(14,2) not null,
  status text not null default 'gerado' check (status in ('gerado','enviado','processado','com_erro')),
  protocolo text,
  obs text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  unique (empresa_id, numero_lote)
);

create table if not exists nfse_rps (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references nfse_lotes(id) on delete cascade,
  empresa_id uuid not null references nfse_empresas(id),
  numero_rps int not null,
  paciente_id uuid references pacientes(id) on delete set null,
  nome text not null,
  cpf text not null,
  valor numeric(12,2) not null check (valor > 0),
  iss numeric(12,2) not null,
  unique (empresa_id, numero_rps)
);

-- cada recebimento só pode virar nota uma vez
create table if not exists nfse_rps_recebimentos (
  rps_id uuid not null references nfse_rps(id) on delete cascade,
  recebimento_id uuid not null unique references recebimentos(id),
  primary key (rps_id, recebimento_id)
);

-- Registra um lote gerado. p_rps: [{numero, paciente_id, nome, cpf, valor, recs:[uuid,...]}]
create or replace function registrar_nfse_lote(p_empresa uuid, p_lote int, p_competencia date, p_data date, p_rps jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_lote uuid; x jsonb; v_rps uuid; v_qtd int; v_total numeric := 0; v_rid text; v_soma numeric;
begin
  perform assert_auth(); perform require_perm('nfse');
  v_qtd := jsonb_array_length(p_rps);
  if v_qtd = 0 then raise exception 'Nenhuma nota no lote.'; end if;
  if v_qtd > 50 then raise exception 'Máximo de 50 RPS por lote.'; end if;
  if exists (select 1 from nfse_lotes where empresa_id = p_empresa and numero_lote = p_lote) then
    raise exception 'O lote % já foi usado por esta empresa (número de lote nunca se repete).', p_lote; end if;
  insert into nfse_lotes (empresa_id, numero_lote, competencia, data_emissao, rps_inicial, qtd, total)
  values (p_empresa, p_lote, date_trunc('month', p_competencia)::date, p_data, (p_rps->0->>'numero')::int, v_qtd, 0) returning id into v_lote;
  for x in select * from jsonb_array_elements(p_rps) loop
    if (x->>'valor')::numeric <= 0 then raise exception 'Valor inválido para %.', x->>'nome'; end if;
    insert into nfse_rps (lote_id, empresa_id, numero_rps, paciente_id, nome, cpf, valor, iss)
    values (v_lote, p_empresa, (x->>'numero')::int, nullif(x->>'paciente_id','')::uuid, x->>'nome', x->>'cpf',
            (x->>'valor')::numeric, round((x->>'valor')::numeric * 0.03, 2)) returning id into v_rps;
    v_total := v_total + (x->>'valor')::numeric;
    v_soma := 0;
    for v_rid in select jsonb_array_elements_text(coalesce(x->'recs', '[]'::jsonb)) loop
      insert into nfse_rps_recebimentos (rps_id, recebimento_id) values (v_rps, v_rid::uuid);
    end loop;
  end loop;
  update nfse_lotes set total = v_total where id = v_lote;
  return v_lote;
end $$;

-- Descarta um lote ainda não enviado (libera os recebimentos para nova emissão)
create or replace function descartar_nfse_lote(p_lote uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l nfse_lotes%rowtype;
begin
  perform assert_auth(); perform require_perm('nfse');
  select * into l from nfse_lotes where id = p_lote for update;
  if not found then raise exception 'Lote não encontrado.'; end if;
  if l.status <> 'gerado' then raise exception 'Só é possível descartar lote que ainda não foi enviado.'; end if;
  delete from nfse_lotes where id = p_lote;
end $$;

do $$
declare x record;
begin
  for x in select unnest(array['nfse_empresas','nfse_lotes','nfse_rps','nfse_rps_recebimentos']) as tabela loop
    execute format('alter table %I enable row level security', x.tabela);
    execute format('drop policy if exists "auth_all" on %I', x.tabela);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', x.tabela);
    execute format('drop policy if exists "so_ativos" on %I', x.tabela);
    execute format('create policy "so_ativos" on %I as restrictive for all to authenticated using (is_staff()) with check (is_staff())', x.tabela);
    execute format('drop policy if exists "perm_sel" on %I', x.tabela);
    execute format('create policy "perm_sel" on %I as restrictive for select to authenticated using (perm(''nfse''))', x.tabela);
    execute format('drop policy if exists "perm_ins" on %I', x.tabela);
    execute format('drop policy if exists "perm_upd" on %I', x.tabela);
    execute format('drop policy if exists "perm_del" on %I', x.tabela);
    execute format('create policy "perm_ins" on %I as restrictive for insert to authenticated with check (perm(''nfse''))', x.tabela);
    execute format('create policy "perm_upd" on %I as restrictive for update to authenticated using (perm(''nfse'')) with check (perm(''nfse''))', x.tabela);
    execute format('create policy "perm_del" on %I as restrictive for delete to authenticated using (perm(''nfse''))', x.tabela);
  end loop;
end $$;
