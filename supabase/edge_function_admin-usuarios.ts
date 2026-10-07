// Edge Function admin-usuarios — cria usuário (login = CPF) e reseta senha. Somente administradores.
// A chave de serviço fica só aqui (variável SUPABASE_SERVICE_ROLE_KEY, injetada pelo Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2';

const SENHA_PADRAO = 'MyD#1234';                 // o usuário digita 1234; o sistema acrescenta o prefixo
const DOMINIO = 'login.mydents.com.br';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function cpfOk(c: string) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  for (const n of [9, 10]) {
    let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(c[n])) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, srv = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return resp({ error: 'Sessão expirada. Entre novamente.' }, 401);
    const admin = createClient(url, srv, { auth: { persistSession: false } });
    const { data: eu } = await admin.from('perfis_usuario').select('admin, ativo').eq('user_id', user.id).single();
    if (!eu?.admin || !eu?.ativo) return resp({ error: 'Somente administradores.' }, 403);

    const b = await req.json();
    if (b.action === 'criar') {
      const cpf = String(b.cpf ?? '').replace(/\D/g, ''), tel = String(b.telefone ?? '').replace(/\D/g, '');
      const nome = String(b.nome ?? '').trim(), unidades: string[] = Array.isArray(b.unidades) ? b.unidades : [];
      if (nome.length < 3) return resp({ error: 'Informe o nome.' }, 400);
      if (!cpfOk(cpf)) return resp({ error: 'CPF inválido.' }, 400);
      if (tel.length < 10 || tel.length > 11) return resp({ error: 'Informe o telefone com DDD.' }, 400);
      if (!unidades.length) return resp({ error: 'Selecione ao menos uma unidade.' }, 400);
      const { data: dup } = await admin.from('perfis_usuario').select('user_id').eq('cpf', cpf).maybeSingle();
      if (dup) return resp({ error: 'Já existe usuário com este CPF.' }, 400);
      const { data: novo, error } = await admin.auth.admin.createUser({ email: `${cpf}@${DOMINIO}`, password: SENHA_PADRAO, email_confirm: true, user_metadata: { nome } });
      if (error || !novo.user) return resp({ error: error?.message ?? 'Falha ao criar o login.' }, 400);
      const { error: e2 } = await admin.from('perfis_usuario').update({
        nome, cpf, telefone: tel, unidades_acesso: unidades, cargo: b.cargo || null, permissoes: b.permissoes ?? {},
        admin: false, ativo: true, trocar_senha: true,
        financeiro: !!b.permissoes?.financeiro, fechar_caixa: !!b.permissoes?.fechar_caixa, alterar_comissao: !!b.permissoes?.alterar_comissao,
      }).eq('user_id', novo.user.id);
      if (e2) return resp({ error: e2.message }, 400);
      return resp({ ok: true, user_id: novo.user.id });
    }
    if (b.action === 'resetar') {
      const { error } = await admin.auth.admin.updateUserById(String(b.user_id), { password: SENHA_PADRAO });
      if (error) return resp({ error: error.message }, 400);
      await admin.from('perfis_usuario').update({ trocar_senha: true }).eq('user_id', String(b.user_id));
      return resp({ ok: true });
    }
    return resp({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    return resp({ error: String((e as Error).message ?? e) }, 500);
  }
});
