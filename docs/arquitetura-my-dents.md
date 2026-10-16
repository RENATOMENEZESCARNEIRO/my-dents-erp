# Arquitetura encontrada — My Dents

Data da leitura: 11 de outubro de 2026. Somente leitura. Nenhum arquivo de produção foi alterado.

Este texto separa três coisas que não são a mesma árvore:

| Origem | O que é | Relação com o site no ar |
| --- | --- | --- |
| `https://mydents.com.br` | PHP + HTML/JS estáticos no cPanel, document root `/home/mydentscom/public_html` | É o sistema que o operador usa |
| `c:\Users\usuario\Projects\My_Dents\codigo\` | Cópia local do PHP, alinhada às publicações anotadas até 23/09/2026 | Está atrás do que o navegador serviu em 11/10/2026 |
| `c:\Users\usuario\Projects\My_Dents\docs\my-dents-erp\` | Protótipo HTML/JS com Supabase, descrito no `README.md` como GitHub Pages | Não é o que responde em mydents.com.br |

Contrato de comportamento lido: `c:\Users\usuario\Projects\My_Dents\docs\MANUAL_FUNCIONAL_MY_DENTS.md` (v6.1, 14/09/2026). O manual manda corrigir o código quando a tela divergir, salvo decisão registrada. As publicações em `docs\PUBLICACOES.md` param em 23/09/2026 (`?v=20260923-boot1`). O HTML servido em 11/10 usa versões `20261005` a `20261011`.

## 1. Hospedagem (cPanel)

Fonte: análise somente leitura de 11/10/2026 em `analise-cpanel-producao.md` (store do agente). Nesta passagem o painel não foi reaberto tela a tela. A aba do cPanel continuava na sessão `cpsess4865721394` (Imunify360) no início. Itens abaixo estão marcados quando não foram revalidados.

| Item | Valor na análise de 11/10 | Nesta auditoria |
| --- | --- | --- |
| Conta / domínio | `mydentscom` / `mydents.com.br` | Não revalidado no painel |
| Document root | `/home/mydentscom/public_html` | Correlacionado: as URLs públicas batem com essa árvore |
| PHP | 8.2 FPM (`ea-php82`), `pm_max_children=5` | Não revalidado no painel |
| Banco | MySQL `financeiro`, 3,22 MB, usuário `mydents` | Não revalidado no painel. phpMyAdmin não foi aberto |
| Config | `/home/mydentscom/private/config.php` (chaves `db_host`, `db_name`, `db_user`, `db_pass` [REDACTED], `db_charset`, `session_name`). Sem `.env` | Não revalidado. Senha não copiada |
| Cron | Nenhum trabalho na tela do painel | Não revalidado |
| SSL | Let's Encrypt, CN `mydents.com.br` + `www`, válido 02/09/2026 a 01/12/2026. AutoSSL em 11/10 com aviso unmanaged nos 10 nomes. Force HTTPS do domínio desligado; `.htaccess` faz 301 | Não revalidado no painel. O navegador abriu `https://` |
| Disco | 1.184 MB de 10.240 MB. Peso fora do site: tar e `.cagefs.zip` no home (~756 MB) e `backups_arquivados/` (~274 MB) | Não revalidado |
| Backup da conta | Pontos até 09/10/2026. Tar manual de 10/10 dentro do home | Não revalidado |
| MySQL remoto | Quatro hosts, sem `%`: `10.31.45.250`, `10.31.45.251`, `200.194.96.105`, `201.49.40.250` | Não revalidado |
| 2FA da conta cPanel | API `is_enabled=0`. Tela de senha não foi aberta | Não revalidado |
| E-mail / SSH / cron de app | Ferramentas de caixa ausentes; SSH desligado; nenhum cron de aplicação | Não revalidado |

O código local confirma o desenho de conexão: `codigo\financeiro\api\db.php` lê `private/config.php` três níveis acima do diretório `api` e abre PDO MySQL com prepared statements desligando emulate prepares. Isso é o código do repositório, não uma leitura nova do `config.php` no servidor.

## 2. O que o navegador carregou em 11/10/2026

`GET` sem cookie, comparado ao arquivo em `codigo\`.

| Recurso | Live | Local | Leitura |
| --- | ---: | ---: | --- |
| `/` (`index.html`) | 298.767 bytes | 282.754 | Landing pública divergente |
| `/financeiro/app.html` | 12.727 | 5.526 | Shell do financeiro divergente |
| Bundle citado pelo `app.html` local (`app.bundle.cloud-refresh-20260921.js`) | 404 | arquivo existe no repo | O live não usa esse nome |
| Bundle citado pelo `app.html` live (`app.bundle.20261005-calculos2.js?v=20261011-cadastros7`) | 1.708.351, HTTP 200 | arquivo ausente em `codigo\` | Live à frente do repo |
| `fase12.js` (query antiga ainda devolve o arquivo do disco) | 96.924 | 94.303 | Arquivo do disco maior que o repo |
| `auth-guard.js` | 9.885 | 4.291 | Divergente |
| `recepcao-app.js` | 237.244 | 222.113 | Divergente |
| `usuarios/portal-funcionario.html` | 7.481 | 7.481 | Tamanho igual |
| `producao-dentistas.html` | 938 | 650 | Divergente |

O `app.html` live referencia, entre outros, estes arquivos que não existem em `codigo\` e responderam HTTP 200:

- `novo-lancamento-modal.js` (8.837)
- `modulos-interface.js` (25.059)
- `previsoes-layout-unificado.js` (3.778)
- `fluxo-filtros.js` (17.831)
- `cadastros-financeiros.js` (16.442)
- `mydents-global-nav.js` (55.631)
- `financeiro-calculos-20261005.js` (7.922)
- `unificacao.js` (4.330)
- `cadastros-clinicos.js` (12.030)
- `fase12-pendencia-financeira.js` (12.170)
- `tailwind-financeiro-20260925.css` (11.392)
- `usuarios/clinicas-ui.js` (12.420)

Cache visto no HTML live (amostra): `fase12.js?v=20261009-comissoes-forma1`, `auth-guard.js?v=20261010-access-routes4`, `recepcao-app.js?v=20261010-anamnese-historico1`, `previsoes-contas-pagar.js?v=20261011-cadastros9`. O repo e o manual de publicação ainda apontam `?v=20260923-boot1`.

## 3. Fluxo de uma tela autenticada

Observado no HTML/JS servido e no código local. Onde a fonte é só o repo, está marcado.

```
Navegador
  → GET /financeiro/app.html          (estático; no live, 12.727 bytes)
  → auth-guard.js
       GET /usuarios/sessao.php       (JSON: authenticated, user, permissions)
       se falso → /usuarios/?retorno=financeiro
  → bundle React (nome de outubro no live)
  → fila de enhancements (fase12, lançamentos, folha, caixa, etc.)
  → APIs em /financeiro/api/*.php
       bootstrap: sessão + origem da requisição (sem token CSRF)
       PDO via private/config.php
       permissão de módulo, ação e unidade
```

Sessão no código local (`bootstrap.php`): cookie `Secure`, `HttpOnly`, `SameSite=Lax`, nome vindo de `session_name`. Inatividade máxima no código: 1.800 s. Teto absoluto: 43.200 s. O `php.ini` descrito na análise de cPanel tem `session.gc_maxlifetime=1440`. Isso é uma diferença entre dois arquivos; não foi medido se a sessão cai aos 24 minutos no ar.

Proteção de escrita no código local: `requisicao_proteger_origem()` exige `Origin` ou `Referer` do mesmo host em POST. Não há token de formulário. O manual v6.1 confirma essa regra.

`GET /financeiro/api/` sem sessão: HTTP 403 (listagem negada). Confere com o log Apache descrito na análise anterior (autoindex em `financeiro/api/`).

`GET /financeiro/api/session.php` e `GET /usuarios/sessao.php` sem cookie: `authenticated: false` e permissões falsas. Sem corpo de usuário.

## 4. Módulos e entradas

Mapa do que existe no ar, pelo HTML e pelos redirecionamentos. Não é o menu do manual.

Menu visto dentro de `/financeiro/app.html`:

- Dashboard → `#tela/dashboard` (o título da aba virou "My Dents · Recepção")
- Agenda / Recepção
- Pacientes → `#tela/pacientes`
- Fluxo de Caixa → `#fluxo` (Lançar fica nesta área, `#lancar`)
- Gestão Financeira
- Funcionários
- Dentistas → também `/financeiro/producao-dentistas.html#producao`
- Ajustes / Configurações

Menu visto em `/relatorios/`: Dashboard, Pacientes, Agenda / Recepção, Financeiro, Produção, Folha salarial, Relatórios, Ajustes.

O manual v6.1 (§3.1) descreve outra barra: Início, Pacientes, Agenda, Financeiro, Produção, Ajustes, com abas L2 dentro de cada módulo. O live não segue esse desenho. Não há decisão posterior a 23/09 no `PUBLICACOES.md` que explique a troca.

### Portas HTTP sem cookie (11/10)

| URL | Status | Destino |
| --- | --- | --- |
| `/financeiro/app.html` | 200 (o JS manda ao login se não houver sessão) | — |
| `/recepcao/` | 302 | `/usuarios/?retorno=recepcao` |
| `/relatorios/` | 302 | `/usuarios/?retorno=relatorios` |
| `/notas-fiscais/` | 302 | `/usuarios/?retorno=financeiro` |
| `/financeiro/portal-dentista.php` | 302 | `/usuarios/?retorno=dentistas` |
| `/usuarios/trocar-senha.php` | 302 | `/usuarios/` |
| `/usuarios/login.php` | 405 em GET | — |
| `/usuarios/recuperacao.php` | 405 em GET | — |
| `/financeiro/producao-dentistas.html` | 200 | HTML público; dados só foram vistos com sessão |

`recuperacao.php`, `trocar-senha.php` e `portal-dentista.php` respondem no ar e não existem em `codigo\`.

### API no repositório local

Pasta `codigo\financeiro\api\`. Lista de arquivos, não de comportamento live (o PHP do ar não foi baixado):

Pacientes e clínica: `pacientes.php`, `anamnese.php`, `arquivos-clinicos.php`, `documentos-paciente.php`, `jornada-paciente.php`, `recepcao.php`, `planos.php`, `tratamentos.php`, `pendencias.php`.

Dinheiro: `debitos.php`, `lancamentos.php`, `controles-financeiros.php`, `recebimentos-financeiros.php`, `caixa-turno.php`, `pagamento-dentistas.php`, `folha-salarial.php`, `folha-fechamento.php`, `taxas-cartao.php`, `importacao-financeira.php`, `credito-devolucao.php`.

Acesso: `login.php` (em `usuarios\`), `session.php`, `usuarios.php`, `api-usuarios.php`, `auditoria.php`.

Relatórios: `relatorios.php` tem 89 bytes no repo e aponta para outro arquivo; a implementação longa está em `codigo\relatorios\relatorios-api.php` (72.979 bytes). Não foi conferido se o live usa esse mesmo arquivo.

Uploads no código local: `anexos-financeiro.php`, `arquivos-clinicos.php`, `documentos-paciente.php`. A análise de cPanel cita `dados_clinicos/` e `anexos-folha/` fora do document root. Não foi aberto arquivo clínico.

## 5. Autenticação

Dois comportamentos, os dois observados, em momentos diferentes.

**Tela de login, sem sessão** (`/usuarios/?retorno=financeiro`):

- Rótulo CPF, `input name="login"`, placeholder "Digite seu CPF".
- Senha com botão de mostrar.
- Botão "Esqueci minha senha".
- O script da página faz `POST ./login.php` com o `FormData` (campo `login`, não `email`).
- O mesmo script faz `POST ./recuperacao.php` com `acao: consultar` e `acao: simular_envio`. O texto do script diz que o envio é simulado. O botão não foi acionado.

**Código local** (`codigo\usuarios\index.php` e `login.php`):

- Rótulo E-mail, `name="email"`, `type="email"`.
- Sem "Esqueci minha senha".
- `usuarios_autenticar()` busca `usuarios.email`, `password_verify`, bloqueio após 5 falhas em 15 minutos, `session_regenerate_id`.
- Mensagem de falha genérica: e-mail ou senha inválidos.
- Senha nova no código: 12 caracteres com maiúscula, minúscula, número e símbolo. Login aceita senha já gravada com mínimo 8.

O manual v6.1 (§4.1 e a correção da seção 0) diz login por e-mail, não por CPF. A tela no ar está no CPF. O PHP live de `login.php` não foi lido (executa no servidor). Não dá para afirmar se o POST com `login` autentica de fato.

Com sessão administrativa já presente na aba, `sessao.php` devolveu `authenticated: true`, papel `admin`, permissões de financeiro, recepção, relatórios e dentistas. Esta auditoria não digitou senha. Não foi determinado o que criou o cookie entre o redirect inicial e esse retorno.

## 6. Dados

Banco único citado no cPanel: `financeiro`. O `schema.sql` do repo tem 596 bytes e só cria `usuarios` (id, nome, email, senha_hash, perfil `admin|usuario`, ativo). O restante do esquema nasce em scripts PHP (`CREATE TABLE IF NOT EXISTS` em `fase12-schema.php` e afins) e em migrações disparadas pela API. A revisão vista na resposta de pacientes foi `13706`. Isso indica estado acumulado; não é uma contagem de pacientes.

Unidades oficiais no manual: Aldeota, Messejana, Maracanaú. No ar, os combos também listam `QA BASE 10/10`, `TESTE UNIDADE DEMO 001` e, no relatório, `TESTE CLÍNICA DEMO 001` / `Clínica Fictícia QA Base 10/10`. Contas no fluxo: Bradesco, Sicredi, Caixa (Espécie) e quatro contas com prefixo QA.

Não houve `SELECT` no phpMyAdmin. Quantidade de linhas por tabela: não determinada.

## 7. Protótipo Supabase (este workspace)

`docs\my-dents-erp` é outro produto: `index.html`, `js\app.js`, `js\config.js`, módulos de orçamento, caixa, estoque, NFS-e, laboratório. O `README.md` manda hospedar no GitHub Pages e autenticar no Supabase. `js\config.js` contém URL e chave anon; os valores ficam [REDACTED] aqui. Esse código não participa do request path de mydents.com.br. Corrigir o live a partir desta pasta não altera o cPanel.

## 8. O que esta arquitetura não fecha

- Conteúdo dos PHP de outubro que estão só no servidor (`recuperacao.php`, bundle, nav global).
- Contagem e status das tabelas no MySQL.
- Se o log `logs/mydents_com_br.php.error.log` (450 KB na análise anterior) tem fatal recente. O corpo não foi lido.
- Se a sessão administrativa usada nos testes é a conta Cursor Teste ou outra. O chip mostrou o rótulo "Administrador", não um nome. O nome não foi registrado.
