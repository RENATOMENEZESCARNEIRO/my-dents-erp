# Auditoria funcional e técnica — My Dents

Data: 11 de outubro de 2026.  
Ambiente: navegador do Cursor e arquivos locais. Produção apenas em leitura. Nenhum registro foi gravado, apagado ou enviado. Nenhum commit.

Arquitetura detalhada: `docs/arquitetura-my-dents.md`.  
Plano para outro agente: `docs/plano-correcao-tecnica-my-dents.md`.

## Resumo executivo

O site no ar é o PHP de `/home/mydentscom/public_html`. Ele não é o protótipo Supabase deste workspace, e também não é a cópia em `c:\Users\usuario\Projects\My_Dents\codigo\`. O HTML servido em 11/10 usa scripts de 05 a 11/10/2026. O repositório e `PUBLICACOES.md` param em 23/09/2026. Publicar a pasta `codigo\` por cima do live apagaria o que está em produção.

Com sessão administrativa já existente na aba, o fluxo de caixa de 01 a 11/10, unidade Todas, mostrou entradas de R$ 3,21 e uma receita na conta `QA — Banco Todas Unidades 09-10`. A mesma unidade Aldeota, no mesmo período, mostrou R$ 0,00 e nenhuma movimentação. O relatório executivo exibiu a mesma receita bruta de R$ 3,21. O combo de unidade desse relatório lista as clínicas reais como `1`, `2` e `3`.

A lista de pacientes devolvida por `GET /financeiro/api/pacientes.php` tinha um item: cadastro de teste `QA CADASTROS CLINICOS 10/10` (e-mail em `example.test`, unidade Aldeota). A busca por `TST-CURSOR-Ficha-Stab` não retornou linha. Não foi aberto o banco para saber se os demais pacientes estão inativos ou se a API corta o resultado.

Clicar em Dashboard trocou a URL para `#tela/dashboard` e o título para "My Dents · Recepção", mas o miolo ainda continha o fluxo de caixa e o heading "Dashboard do dia" não estava visível. O heading visível era "Central administrativa".

A primeira abertura de `/financeiro/app.html` caiu no login por CPF, com "Esqueci minha senha". O manual v6.1 e o `codigo\usuarios\index.php` descrevem login por e-mail, sem essa recuperação. `recuperacao.php` existe no ar e não existe na pasta local. A senha não foi digitada. Mais tarde a mesma aba passou a ter sessão de admin. Não foi determinado o que criou essa sessão. Logout não foi feito, para não derrubar a auditoria.

## Escopo e limitações

Feito:

- Leitura do manual v6.1, de `PUBLICACOES.md` (final), da árvore `codigo\` e do protótipo deste workspace.
- Leitura da análise de cPanel já gravada em 11/10. O painel não foi percorrido de novo.
- `GET` das rotas públicas e, com a sessão que apareceu na aba, leitura de fluxo, lançar (sem enviar), pacientes, produção e relatórios.
- Screenshots sem dados de paciente real em `docs/auditoria-evidencias\`.

Não feito, de propósito:

- Nenhuma gravação, exclusão, upload, e-mail, SMS, impressão ou exportação CSV.
- phpMyAdmin não foi aberto. Contagem de tabelas: não determinada.
- Corpo do log de PHP: não lido.
- `VAL-FLUXO Paciente 01` não foi aberto.
- Logout não foi executado.
- A análise de disco, cron, SSL, MySQL remoto, 2FA e backups do cPanel não foi revalidada nesta passagem. Não tratar essa lacuna como defeito novo do servidor.

Legenda usada abaixo:

- **Observado:** visto na interface ou na resposta HTTP desta sessão.
- **Inferido do código local:** lido em `codigo\`, que está defasado em relação ao live.
- **Não determinado:** faltou evidência; a evidência está dita no item.
- **Não revalidado:** veio da análise de cPanel de 11/10 e não foi reaberto.

## Arquitetura encontrada

Resumo. O detalhe está em `docs/arquitetura-my-dents.md`.

O operador usa PHP 8.2 no document root, com API em `/financeiro/api/`, sessão em `/usuarios/sessao.php` e config fora da web em `/home/mydentscom/private/config.php`. O banco do painel é um só: `financeiro`. Não há cron de aplicação na análise anterior. O front live é um bundle React de outubro mais uma fila de scripts (`fase12`, nav global, cadastros, recepção embutida no `app.html`).

O manual pede barra L1 fixa (Início, Pacientes, Agenda, Financeiro, Produção, Ajustes) e abas L2. O live mostra outro menu, e o menu de Relatórios é diferente do menu do Financeiro.

## Como o sistema deveria operar

Fonte do "deveria": manual v6.1. Onde o live ou o código local diz outra coisa, isso está na coluna de status. Não há regra inventada.

Cadeia do manual (§1): paciente → orçamento → aprovação por item → tratamento + débito → recebimento → conta → comissão de venda → evolução → comissão de execução → fechamento. Aprovar não entra dinheiro. Receber baixa o débito. Evoluir não paga o dentista na hora. Fato confirmado não se apaga. Dinheiro em duas casas, half-up (D-11). `localStorage` não é saldo oficial.

| Módulo | Finalidade no manual | Quem acessa | Status nesta auditoria |
| --- | --- | --- | --- |
| Login | E-mail e senha; mensagem genérica; sessão no servidor | Equipe ativa | Observado no ar: formulário de CPF. Código local: e-mail. Os dois divergem |
| Início / indicadores | `#painel`, relatórios, tarefas | Conforme permissão | O live abre Dashboard em `#tela/dashboard`. Conteúdo não coincidiu com o hash |
| Pacientes | Base única; ficha por id; unidades Aldeota, Messejana, Maracanaú | Recepção / admin | Observado: um cadastro de teste. TST-CURSOR ausente na resposta |
| Agenda | Cartão abre resumo; hash permanece na agenda | Recepção | Não percorrido além do atalho. Agenda de hoje no DOM: "Nenhum atendimento encontrado para esta data" (heading não visível no dashboard) |
| Orçamento, débito, recebimento | Aprovação separada de recebimento; parcial não reescreve o original | Recepção / financeiro | Não testado. Exigiria gravar ou abrir ficha. Código local existe; o PHP live não foi lido |
| Fluxo / lançar / contas | Unidade do topo filtra; lançar usa grupo/subgrupo oficiais; transferência não é receita | Financeiro | Fluxo e formulário de lançar observados. Formulário não foi enviado |
| Caixa por turno | Overlay; fechar devolve a rota anterior | Financeiro | Botão "Abertura e fechamento de caixa" visível. Fluxo de abrir/fechar turno não executado (gravação) |
| Produção e comissão | Venda em percentual congelado; execução em valor fixo; lote mensal | Produção | Tela aberta. Lote 10/2026 status Aberto, "Sem células encerradas". Listas do filtro inicial vazias |
| Folha e portal | Documentos e ciência | Funcionário / admin | `portal-funcionario.html` responde 200 (7.481 bytes, igual ao repo). Conteúdo autenticado não percorrido |
| Ajustes / equipe | Nome da sessão no chip; unidades são o cadastro de clínicas | Admin | Chip observado: rótulo "Administrador" e "Sessão ativa". Lista de usuários não foi aberta (teria nomes reais) |
| Relatórios | Mesma unidade e o mesmo valor do fluxo | Relatórios | Página aberta. Receita bruta exibida R$ 3,21. Exportar e imprimir não foram acionados |
| Nota fiscal | Por URL e por Ajustes; não é L1 | Financeiro | Sem cookie, `/notas-fiscais/` redireciona ao login. Tela não aberta com sessão |
| Fora do núcleo | WhatsApp em massa, TEF, estoque, anamnese como P1 | — | Link WhatsApp existe na ficha/lista. Não foi clicado |

Entidade pedido no roteiro (entrada → validação → gravação → relacionamento → exibição → cálculo → auditoria), só no que deu para ver:

**Lançamento financeiro.** Entrada: formulário `#lancar` com data (preenchida com 11/10/2026), valor, unidade, setor, banco, grupo, subgrupo, NF-e, observação, forma de pagamento. Validação observada no DOM: só o select de forma de pagamento está `required`. O botão "Lançar movimentação" é `type="submit"`. Gravação: não executada. Relacionamento e auditoria depois da gravação: não determinados nesta sessão. Exibição do que já existe: uma linha em 11/10, tipo Receita, conta QA, R$ 3,21, quando a unidade está em Todas.

**Paciente.** Entrada da lista: busca por nome, CPF ou telefone. A API `pacientes.php` devolveu um array `data` com um objeto. Chaves incluem identificação, contato, unidade e também dados bancários, PIX e titular financeiro. Valores não foram copiados. Não dá para dizer se estão preenchidos.

**Relatório.** Entrada: período default de 15/04/2026 a 11/10/2026, botões de 30/90/180/365 dias, dois combos de unidade. Cálculo exibido: receita bruta R$ 3,21, deduções R$ 0,00, receita líquida R$ 3,21, despesa operacional R$ 0,00, e o texto "Fluxo: entradas R$ 3,21 − saídas R$ 0,00". O texto da tela diz que a DRE é regime de caixa, na data de efetivação, no mesmo período e unidade do fluxo, e que transferência fica de fora.

## Módulos percorridos

### Login (sem sessão)

Pré-condição: a primeira ida a `/financeiro/app.html` redirecionou para `/usuarios/?retorno=financeiro`.  
Observado: CPF, senha, Entrar, Esqueci minha senha. Evidência: `docs/auditoria-evidencias/01-login-sem-sessao.png`.  
O script inline consulta `./recuperacao.php` e declara simulação de envio. Não foi clicado, para não disparar POST.  
Classificação: documentação / possível defeito de contrato. O manual pede e-mail.

### Fluxo de caixa

URL `#fluxo`. Período 01/10/2026 a 11/10/2026.

- Unidade Todas: saldo inicial R$ 0,00, entradas R$ 3,21, saídas R$ 0,00, saldo final R$ 3,21. Linha: 11/10/2026, Receita, conta `QA — Banco Todas Unidades 09-10`, R$ 3,21.
- Unidade Aldeota, mesmo período, depois de Atualizar: saldo inicial, entradas, saídas e saldo final R$ 0,00. Texto: "Nenhuma movimentação no período selecionado."
- Voltar de `#lancar` para `#fluxo` recoloca a unidade em Todas e o total de R$ 3,21. O filtro Aldeota não permaneceu.
- URL direta `#fluxo` com a sessão já aberta permanece no fluxo e não cai no login.
- Combos visíveis incluem contas e formas de pagamento com prefixo QA, além de Bradesco, Sicredi e Caixa (Espécie).

Evidência de enquadramento (os totais ficam abaixo da dobra): `docs/auditoria-evidencias/02-fluxo-filtros.png`. Os valores foram lidos do texto do miolo, não da imagem.

Classificação: dados. O número consolidado do período é um lançamento de conta de teste.

### Lançar

`#lancar` abre o formulário e mantém "Fluxo de Caixa" como item corrente. Há "Voltar ao fluxo de caixa", que retorna a `#fluxo` sem gravar. Tipos à vista: Receita, Despesa, Transferência, Aporte de Sócio, Empréstimo de Sócio, Devolução de Empréstimo. Texto de convênio: somente valor recebido da operadora, sem paciente. Não foi clicado "Lançar movimentação".

Classificação do que foi visto: interface. A tela abre. A validação completa no servidor não foi testada.

### Dashboard

Clique em Dashboard a partir do fluxo.

- URL passou a `/financeiro/app.html#tela/dashboard`.
- Título: "My Dents · Recepção".
- `aria-current` no link Dashboard.
- Headings com caixa visível: "Central administrativa", "Pendências da operação", "Contatos a fazer".
- "Dashboard do dia", "Agenda de hoje" e "Saldos das contas": no DOM, sem caixa visível (`offsetParent` nulo).
- O miolo `.md-main` continuou com o texto do fluxo e o total de R$ 3,21.

O manual §3.3 diz que a URL, o item destacado e o conteúdo têm de ser o destino, não a tela anterior com título novo. Isso foi observado uma vez, nesta sessão.

Classificação: interface. Reprodução: estando em `#fluxo`, clicar Dashboard e ler URL, título e texto do miolo.

### Pacientes

`/recepcao/#tela/pacientes` abriu `/financeiro/app.html#tela/pacientes`. A recepção está dentro do shell financeiro.

Lista inicial: uma linha, `QA CADASTROS CLINICOS 10/10`, unidade Aldeota, e-mail em domínio `example.test`. Botões Abrir, Editar e um link WhatsApp. Nenhum foi acionado.

Busca pelo texto `TST-CURSOR-Ficha-Stab`: a linha some e não entra outra. `GET /financeiro/api/pacientes.php` com a sessão: HTTP 200, `ok: true`, `data` com comprimento 1, `revision` 13706. O nome TST-CURSOR não está nesse array. `VAL-FLUXO` também não.

Não determinado se o paciente de teste foi inativado, se está em outra unidade fora do escopo da API, ou se a API devolve só um recorte. Evidência que falta: contagem na tabela de pacientes, com ativos e inativos, sem copiar CPF.

Classificação: dados. Sintoma confirmado. Causa não determinada.

A árvore de acessibilidade da página de pacientes ainda expunha campos do formulário de lançar (valor, banco, grupo, forma de pagamento). Não foi medido se estão `display:none` para o olho. O leitor da árvore os enxerga.

### Produção dos dentistas

`/financeiro/producao-dentistas.html#producao` carregou com a sessão. Combo de unidade chegou a mostrar Messejana e as unidades de teste. Texto da tela: lote competência 10/2026, status Aberto, aberto em 01/10/2026, "Sem células encerradas". Comissões de venda, execução e convênio: "Nenhum registro neste filtro." Dentista listado no filtro: "QA BASE — Dentista Fictício 10/10 revisado". Não foi clicado "Acrescentar produção" nem "Encerrar lote".

O HTML dessa URL, sem cookie, é HTTP 200. Não foi repetida a chamada da API de produção sem cookie. Vazamento de dado sem sessão: não determinado.

### Relatórios

`/relatorios/` com sessão. Título "Relatórios executivos". Período 15/04/2026–11/10/2026. Botões Imprimir/PDF e Exportar CSV não foram usados.

Texto lido na página: receita bruta R$ 3,21, deduções R$ 0,00, receita líquida R$ 3,21, despesa operacional R$ 0,00, e a conferência "Fluxo: entradas R$ 3,21 − saídas R$ 0,00". O corpo também cita `TESTE UNIDADE DEMO 001`.

O combo de unidade do filtro (não o do canto) tem as opções visíveis: Todas, `2`, `3`, `TESTE CLÍNICA DEMO 001`, `1`, `Clínica Fictícia QA Base 10/10 — revisada`. O seletor do topo, na captura, mostrava Messejana. Há dois seletores. Não foi determinado se o R$ 3,21 segue o topo (Messejana) ou o consolidado. Evidência: `docs/auditoria-evidencias/03-relatorios-executivos.png` (totais abaixo da dobra; os números vieram do texto da página).

Classificação: interface e dados. Rótulos `1`/`2`/`3` são defeito de tela confirmado. O valor R$ 3,21 coincide com o fluxo consolidado; o vínculo com a unidade do topo não foi isolado.

Sem cookie, `/relatorios/` responde 302 para o login. Confirmado por `GET`.

### O que não foi operado

Usuários e permissões (a tela lista nomes reais), novo paciente, editar, lançar, caixa, importar, folha, fechamento de lote, upload, nota fiscal, WhatsApp, esqueci senha, logout, relatório exportado.

## Dados e tratamento

- Consolidado "Todas" mistura unidade oficial e unidade QA. O único movimento de 01–11/10 nesse consolidado é R$ 3,21 numa conta QA.
- Aldeota no mesmo recorte está zerada. Isso foi lido na tela. Não prova que Aldeota não tenha movimento em outras datas.
- Pacientes visíveis para esta sessão: um cadastro de teste. Não usar esse número como censo da clínica até olhar o banco.
- O payload da lista traz chaves de banco, agência, conta, PIX e titular. Valores não lidos. Se estiverem preenchidos, a lista carrega dado que a grade não precisa mostrar. Suspeita, não defeito confirmado de vazamento.
- Contas oficiais do manual (Bradesco, Sicredi, Caixa Espécie) aparecem no combo junto com contas QA. Há, na árvore de acessibilidade, outro select só com as três oficiais, que não era o texto visível do miolo. Dois shells no DOM. Efeito para o operador: não determinado além da lista visível com QA.

## Matriz dos fluxos testados

| Fluxo | Pré-condição | Passos | Esperado pelo manual | Observado | Classe |
| --- | --- | --- | --- | --- | --- |
| Abrir financeiro sem sessão | Aba sem sessão no início | GET `/financeiro/app.html` | Login por e-mail | Redirect para login com CPF | Interface / contrato |
| Sessão anônima nas APIs | curl sem cookie | GET `session.php` e `sessao.php` | Não autenticado | `authenticated: false` | Segurança (comportamento correto) |
| Diretório da API | sem sessão | GET `/financeiro/api/` | Sem listagem | 403 | Infra (comportamento correto) |
| Portas de recepção, relatórios, notas, portal dentista | sem cookie | GET | Exigir sessão | 302 para `/usuarios/` | Segurança (comportamento correto) |
| Fluxo Todas, 01–11/10 | sessão admin | Abrir `#fluxo` | Operação das três unidades, sem lixo de teste no consolidado | Entradas R$ 3,21 em conta QA | Dados |
| Fluxo Aldeota, mesmo período | sessão admin | Trocar unidade e Atualizar | Só Aldeota | R$ 0,00 e lista vazia | Dados (filtro responde) |
| Voltar do lançar | formulário aberto, nada preenchido de propósito | Clicar Voltar | Volta ao fluxo sem gravar | `#fluxo`, total R$ 3,21, unidade Todas | Interface |
| URL direta do fluxo | sessão já aberta | Abrir `#fluxo` de novo | Mesma tela, sessão viva | Fluxo abre, não pede login | Funcional |
| Dashboard | estando no fluxo | Clicar Dashboard | Tela de indicadores, conteúdo = hash | Hash e título mudam; miolo segue no fluxo; "Dashboard do dia" invisível | Interface |
| Pacientes | sessão admin | Abrir lista e buscar TST-CURSOR | Achar o paciente de teste se ele existir | Um QA na lista; busca vazia; API com 1 item | Dados |
| Lançar | sessão admin | Abrir `#lancar` | Formulário com validação; não gravar nesta auditoria | Formulário abre; só forma de pagamento `required`; não enviado | Interface |
| Produção | sessão admin | Abrir `producao-dentistas.html` | Lote e comissões da competência | Lote 10/2026 aberto, sem células; listas vazias no filtro | Funcional (leitura) |
| Relatórios | sessão admin | Abrir `/relatorios/` | Nomes de unidade; valor rastreável ao fluxo | Rótulos 1, 2, 3; receita R$ 3,21 igual ao fluxo consolidado | Interface e dados |
| Persistência de filtro | Aldeota aplicado | Ir a lançar e voltar | Não especificado no manual como obrigatório | Unidade volta para Todas | Interface (observado; regra de persistência não determinada) |
| Logout | — | Não executado | Sessão encerra | Não testado | — |

## Comportamentos confirmados

- O live exige sessão para recepção, relatórios, notas e portal do dentista quando não há cookie.
- A sessão, uma vez presente, sobrevive a uma nova abertura de `#fluxo`.
- O filtro de unidade do fluxo muda o total: Todas R$ 3,21, Aldeota R$ 0,00, no recorte 01–11/10/2026.
- Fluxo consolidado e o texto da DRE mostram o mesmo R$ 3,21 de entrada e R$ 0,00 de saída.
- "Voltar ao fluxo" não grava.
- A página de pacientes desta sessão não lista `TST-CURSOR-Ficha-Stab`.
- O repositório `codigo\` não contém os arquivos de outubro que o `app.html` live pede, e o bundle antigo do repo responde 404 no ar.

## Problemas

Sem causa inventada. Cada item diz o que foi visto.

### 1. O código local não é o que está no ar

Confirmado por tamanho e por nome de arquivo (tabela na arquitetura). Efeito: qualquer correção feita em `codigo\` e publicada por cima substitui o trabalho de outubro que não está no Git. Impacto: alto, antes de qualquer outro conserto. Classe: infraestrutura / documentação (D-29).

### 2. Totais operacionais incluem movimento de teste

Confirmado na tela de fluxo e no texto do relatório: R$ 3,21 em conta com nome QA, em 11/10/2026, quando a unidade está em Todas. Aldeota no mesmo período fica em zero. Impacto: quem olha o consolidado lê teste como movimento do grupo. Classe: dados. Causa (lançamento manual, script de QA, falta de `origem_teste`): não determinada. Evidência que falta: a linha no banco, sem abrir edição.

### 3. Unidades reais aparecem como 1, 2 e 3 no relatório

Confirmado nas opções do select. As unidades de teste aparecem com nome. Impacto: filtro fácil de errar. Classe: interface. Causa (id gravado no option em vez do nome): não determinada no PHP live.

### 4. Dashboard não troca o miolo

Confirmado uma vez: hash `#tela/dashboard`, título de Recepção, conteúdo de fluxo ainda no `.md-main`, "Dashboard do dia" fora da área visível, "Central administrativa" visível. Classe: interface. Não foi repetido três vezes. Reprodução está na matriz.

### 5. Lista de pacientes com um cadastro de teste

Confirmado na grade e no JSON (`data.length === 1`). TST-CURSOR ausente. Impacto: se a base real sumiu da API, a recepção não acha paciente. Se a base foi isolada de propósito, a tela não explica o recorte. Causa: não determinada.

### 6. Login do ar diverge do manual e do repositório

Confirmado na tela (CPF, recuperação) e na ausência local de `recuperacao.php`, `trocar-senha.php` e `portal-dentista.php`. O manual pede e-mail. Não foi provado que o POST de CPF falhe ou funcione, porque a senha não foi enviada. Classe: contrato. Não tratar como "login quebrado" até um teste com usuário de homologação.

### 7. Chip de sessão mostra "Administrador"

Observado o rótulo, não o nome da pessoa. O manual §3.4 pede o nome da sessão. Classe: interface. O nome real não foi anotado.

### 8. Menu live diferente do manual §3.1

Observado nos dois shells (financeiro e relatórios). Não há nota em `PUBLICACOES.md` depois de 23/09 que registre essa navegação. Pode ser decisão de outubro não escrita. Até isso ser decidido, é divergência de contrato, não um bug de clique isolado.

### Itens que não são defeito do servidor

- Não reabrir o cPanel nesta passagem.
- `GET` da API de sessão sem cookie devolver não autenticado.
- 403 em `/financeiro/api/`.
- Redirect 302 das áreas sem cookie.

### Suspeitas (não confirmar como bug)

- Payload de pacientes com chaves bancárias. Falta ver se o valor vem vazio.
- Dois selects de conta no DOM (um só com Bradesco/Sicredi/Caixa). Falta ver qual o operador enxerga em cada hash depois do boot.
- `session.gc_maxlifetime=1440` no INI descrito na análise anterior contra 1.800 s no `bootstrap.php` local. Os dois arquivos podem nem ser os do live de outubro.
- HTML de `producao-dentistas.html` em 200 sem cookie. Falta chamar a API sem sessão.
- Disco, tar dentro do home, MySQL remoto, AutoSSL unmanaged, 2FA desligado, cron vazio: análise de 11/10, não revalidados aqui. Continuam hipóteses operacionais daquele relatório, não achados novos.

## Evidências e reprodução

Capturas (sem paciente real):

- `docs/auditoria-evidencias/01-login-sem-sessao.png`
- `docs/auditoria-evidencias/02-fluxo-filtros.png`
- `docs/auditoria-evidencias/03-relatorios-executivos.png`

Cópias também em `media/auditoria-my-dents/` no store do agente que fez a análise de cPanel.

Reproduzir o total de teste:

1. Entrar com um admin já autorizado (não usar senha neste documento).
2. Abrir `https://mydents.com.br/financeiro/app.html#fluxo`.
3. Período 01/10/2026 a 11/10/2026, unidade Todas.
4. Ler entradas. Nesta sessão: R$ 3,21, conta QA, data 11/10/2026.
5. Trocar a unidade para Aldeota e atualizar. Nesta sessão: R$ 0,00.

Reproduzir o dashboard:

1. Na mesma sessão, em `#fluxo`, clicar Dashboard.
2. Comparar a URL (`#tela/dashboard`), o título e o texto do miolo.

Reproduzir a lista:

1. Abrir `#tela/pacientes`.
2. Buscar `TST-CURSOR-Ficha-Stab`.
3. Não abrir outra ficha. Não usar WhatsApp.

## Priorização por impacto

1. Não publicar `codigo\` até o live estar no Git. Impacto: perda do código de outubro.
2. Separar QA do consolidado de fluxo e da DRE, depois de identificar a linha sem apagá-la. Impacto: decisão gerencial em cima de R$ 3,21 de teste.
3. Rótulos 1, 2 e 3 no relatório. Impacto: filtro errado.
4. Dashboard que não troca o miolo. Impacto: o operador acha que mudou de módulo.
5. Lista de pacientes com um registro. Impacto alto se a base real não voltar; causa ainda aberta.
6. Decidir login (CPF no ar versus e-mail no manual) antes de "corrigir" a tela. Impacto: trancar a equipe fora se o PHP live espera CPF e o repo for publicado.

## Recomendações

- Capturar o `public_html` atual para o repositório antes de editar qualquer PHP ou JS. D-29 do próprio manual.
- Tratar contas, unidades, formas e pacientes com prefixo QA como homolagação dentro da produção. O relatório operacional não deve somá-los enquanto a regra de `origem_teste` (corte de 16/09 no manual de handoff) não estiver visível na tela. Como aplicar: não determinado até ler o código de outubro.
- Não abrir phpMyAdmin para "consertar" paciente ou lançamento nesta leva. Primeiro contar, em leitura, pacientes ativos e o lançamento de R$ 3,21.
- Não clicar Encerrar lote, Lançar, Exportar, nem Esqueci minha senha até haver ambiente que não seja o live, ou um roteiro que pare antes da confirmação.

## Dependências entre correções

1. Captura do live bloqueia todas as outras alterações de arquivo. Sem isso, o patch nasce no código velho.
2. A regra de excluir QA dos totais depende de achar o lançamento e a flag no código que está no ar, não no `fase12.js` de setembro.
3. O rótulo 1/2/3 depende do PHP/JS de relatórios que está no ar (`relatorios-api.php` local pode não ser o mesmo).
4. O dashboard depende de `mydents-global-nav.js` e do bundle de outubro, ambos ausentes em `codigo\`.
5. Login: decisão de produto primeiro (manual manda e-mail; o ar mostra CPF). Código depois.

## Riscos de alterar produção

- Sobrescrever `app.html` ou o bundle com a versão de setembro tira do ar o shell de outubro (o bundle antigo já responde 404).
- Inativar o lançamento de R$ 3,21 sem auditoria muda o saldo que a tela mostra hoje.
- Apagar unidade QA pode quebrar o lote 10/2026 e o dentista fictício ligados a ela. Não apagar nesta fase.
- Publicar o `index.php` de usuários do repo remove a recuperação e o campo CPF se o PHP live depender deles.
- `pm_max_children=5` e `memory_limit=256M` (análise anterior, não revalidada): um PHP novo mais pesado pode encostar no teto de 1 GB. Não foi medido agora.
- Não há cron para desfazer uma migração. Backup da conta visto na análise anterior: último automático em 09/10, mais um tar manual em 10/10 dentro do home.

## Testes depois de cada correção

Só leitura ou homologação já combinada. Não usar `VAL-FLUXO Paciente 01`. Não apagar Cursor Teste nem Codex Teste.

Depois da captura (ainda sem mudar regra):

- O Git contém `app.bundle.20261005-calculos2.js`, `mydents-global-nav.js` e `recuperacao.php`, com o mesmo tamanho do HTTP.
- `PUBLICACOES.md` passa a citar as versões `20261011`, ou registra que o live foi só copiado e ainda não republicado.

Depois de isolar QA dos totais:

- `#fluxo`, 01–11/10, unidade Todas, sem o R$ 3,21, se a regra for excluir teste.
- Aldeota no mesmo período continua R$ 0,00, a menos que outro movimento real exista e tenha sido escondido pelo filtro.
- DRE do mesmo período mostra o mesmo número do fluxo.
- A linha de teste continua consultável em trilha de auditoria. Não some o histórico.

Depois do rótulo de unidade:

- O select do relatório mostra Aldeota, Messejana e Maracanaú, não `1`, `2`, `3`.
- Trocar a unidade muda o total de forma coerente com o fluxo na mesma unidade e período.

Depois do dashboard:

- Clique em Dashboard deixa URL, título, item corrente e miolo na mesma tela.
- O texto do fluxo não permanece como conteúdo visível.
- Recarregar `#tela/dashboard` abre a mesma tela.

Depois da lista de pacientes:

- A busca por `TST-CURSOR-Ficha-Stab` acha o cadastro se ele ainda existir ativo, ou a tela diz que não há paciente, com um total coerente com o banco.
- A API não precisa devolver PIX e conta na listagem, se a correção for reduzir o payload. Conferir com um paciente de teste, sem copiar o valor para o relatório.

Login, só depois da decisão:

- Se a decisão for e-mail: a tela mostra e-mail e uma conta de teste entra.
- Se a decisão for CPF: o manual é que muda, por decisão explícita, e o repo passa a ter o mesmo `index.php` do ar.

## Validação manual ainda necessária

- Logar de novo se a sessão da aba cair. Esta auditoria não tem senha para refazer o login.
- Confirmar com o operador qual conta estava no chip "Administrador".
- Contar no banco, em leitura: pacientes ativos, o lançamento de R$ 3,21, e se `TST-CURSOR-Ficha-Stab` existe e com qual status.
- Ler o PHP live de `login.php` só depois de copiar o arquivo para o Git, para ver se o campo `login` é CPF.
- Repetir o clique do Dashboard mais de uma vez e em outra largura de tela.
- Abrir Gestão Financeira, Folha, Caixa e Ajustes só em leitura, com cuidado para não listar nomes reais no relatório.
- Revalidar no cPanel, se ainda importar: validade do certificado, cron vazio, hosts de MySQL remoto, 2FA, e o tar de backup dentro do home.
- Corpo do log PHP de 450 KB, sem colar IP de cliente nem sessão no Git.
