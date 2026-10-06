# My Dents

Painel web da clínica (pacientes, agenda, planos/assinaturas, dentistas). HTML + CSS + JavaScript puro, banco e login no Supabase, hospedagem no GitHub Pages.

## Estrutura

```
index.html          shell do app (login + telas + modais)
css/styles.css      layout responsivo
js/config.js        URL e chave anon do Supabase  <- preencher
js/app.js           lógica (auth, CRUD, navegação sem recarregar)
supabase/schema.sql tabelas, índices e RLS  <- rodar no SQL Editor
docs/               manual técnico funcional e regras de negócio
```

## Configuração

1. Supabase: crie o projeto, rode `supabase/schema.sql` no SQL Editor.
2. Authentication > Users: crie os usuários (e-mail + senha). Desative "Allow new users to sign up".
3. Preencha `js/config.js` com Project URL e anon key.
4. GitHub: Settings > Pages > Deploy from branch `main` / root.
5. Supabase > Authentication > URL Configuration: adicione a URL do Pages.

Regras do manual já aplicadas: unidades por lista padronizada, CPF validado e único, bloqueio de horário duplicado por dentista.
