-- v13 — Ortodontia na ficha do paciente + pacientes circulam livremente entre unidades
alter table pacientes
  add column if not exists orto boolean not null default false,
  add column if not exists orto_adesao date,
  add column if not exists orto_situacao text;
alter table pacientes drop constraint if exists pacientes_orto_situacao_chk;
alter table pacientes add constraint pacientes_orto_situacao_chk
  check (orto_situacao is null or orto_situacao in ('ativo','inativo','concluido','cancelado'));
alter table pacientes drop constraint if exists pacientes_orto_coerente_chk;
alter table pacientes add constraint pacientes_orto_coerente_chk
  check (orto or (orto_adesao is null and orto_situacao is null));

-- A unidade do paciente é só identificador (cadastro), não trava de acesso.
drop policy if exists "unidade_acesso" on pacientes;
drop trigger if exists zz_unidade_guard on pacientes;
