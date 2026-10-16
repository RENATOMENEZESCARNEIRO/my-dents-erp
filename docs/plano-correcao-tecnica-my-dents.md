# Plano de correção técnica — My Dents

Proposta para outro agente. Este documento não implementa nada. Não publicar no cPanel a partir daqui.

Fonte: `docs/auditoria-funcional-my-dents.md` e `docs/arquitetura-my-dents.md`, leitura de 11/10/2026.

Regra de ouro: o código em `c:\Users\usuario\Projects\My_Dents\codigo\` está atrás do HTML servido em mydents.com.br. Corrigir o arquivo de setembro e subir por cima do live destrói o que está em produção. A primeira entrega é cópia do live para o Git, não um patch.

## 0. O que não entra neste plano

- Logout, exclusão, WhatsApp, e-mail, SMS, upload real, encerrar lote, lançar movimentação.
- Abrir `VAL-FLUXO Paciente 01`.
- Apagar Cursor Teste, Codex Teste, unidades QA ou o lançamento de R$ 3,21.
- Criar token de API no cPanel, mudar PHP, cron, SSL, DNS ou permissão de arquivo.
- Tratar como bug o que a auditoria marcou como "não revalidado" no cPanel.

## 1. Capturar o live antes de editar

**Tipo:** confirmado.  
**Por quê:** `app.html` live tem 12.727 bytes; o local tem 5.526. O bundle que o live pede (`app.bundle.20261005-calculos2.js`, 1.708.351 bytes) não está em `codigo\` e o bundle do repo responde 404. Vários JS de outubro existem só no servidor, entre eles `mydents-global-nav.js`, `cadastros-financeiros.js` e `recuperacao.php`.

**Proposta:**

1. Baixar em leitura o `public_html` atual (financeiro, usuarios, recepcao, relatorios, notas-fiscais) para uma pasta de captura, fora de qualquer deploy.
2. Comparar com `codigo\` arquivo a arquivo (tamanho e hash).
3. Commitar a captura no Git privado antes de qualquer diff de correção. Anotar em `docs/PUBLICACOES.md` que foi captura, não publicação.
4. Não usar File Manager para editar durante a cópia.

**Pronto quando:** um checkout novo contém os mesmos nomes e tamanhos que o `GET` de 11/10, inclusive o bundle de 1.708.351 bytes e `recuperacao.php`.

**Teste:** repetir os `GET` de tamanho citados na arquitetura. Não precisa logar.

## 2. Isolar o movimento de teste dos totais

**Tipo:** confirmado no sintoma. Causa não determinada.  
**Por quê:** em `#fluxo`, 01/10/2026–11/10/2026, unidade Todas, a tela mostrou entradas R$ 3,21, uma receita em `QA — Banco Todas Unidades 09-10`. Aldeota no mesmo período mostrou R$ 0,00. O texto da DRE em `/relatorios/` mostrou a mesma receita bruta de R$ 3,21.

**Proposta, só depois do item 1:**

1. Achar no código capturado o filtro de fluxo e o da DRE. Ver se existe `origem_teste` ou equivalente e se a tela ignora.
2. No banco, em leitura, localizar a linha de R$ 3,21 (conta, unidade, data, origem, usuário). Não dar `UPDATE` ainda.
3. Decisão do operador, por escrito: o consolidado operacional exclui QA, ou QA continua e o rótulo da tela diz que o total inclui teste.
4. Se a decisão for excluir: filtrar na API, não só no JS. A tela e o relatório têm de usar o mesmo critério. Não apagar a linha. Cancelar ou marcar origem, com auditoria, se o padrão do manual for esse (fato confirmado não se apaga).
5. Unidades, contas, formas e setores com prefixo QA (`QA BASE`, `TESTE UNIDADE DEMO 001`, `TESTE CLÍNICA DEMO 001`) entram no mesmo critério. Não remover o cadastro.

**Pronto quando:** fluxo e DRE, mesmo período e mesma unidade, mostram o mesmo número, e esse número não inclui a receita QA a menos que o rótulo avise.

**Teste:** repetir a matriz da auditoria (Todas e Aldeota, 01–11/10). Conferir que a linha de teste ainda aparece numa consulta de auditoria.

## 3. Nomes das unidades no relatório

**Tipo:** confirmado.  
**Por quê:** o select do relatório lista `Todas`, `2`, `3`, `TESTE CLÍNICA DEMO 001`, `1`, `Clínica Fictícia QA Base 10/10`. Aldeota, Messejana e Maracanaú não aparecem nesse combo; aparecem no outro seletor, o do topo.

**Proposta:** no código capturado do relatório, o `option` deve usar o nome da clínica. O `value` pode continuar sendo o id. Há dois seletores na página; definir qual manda no número (o manual diz o do topo) e fazer o outro seguir, ou esconder o duplicado. Não inventar nome para o id `1` sem olhar a tabela de clínicas.

**Pronto quando:** as três unidades oficiais aparecem pelo nome e trocar a unidade altera o total junto com o fluxo.

**Teste:** abrir `/relatorios/` com sessão de admin, ler as opções, comparar um período curto com `#fluxo` na mesma unidade. Não exportar CSV.

## 4. Dashboard coerente com a URL

**Tipo:** confirmado uma vez. Repetir antes de tratar como estável.  
**Por quê:** clique em Dashboard levou a `#tela/dashboard`, título "My Dents · Recepção", item corrente no Dashboard, miolo ainda com o texto do fluxo, heading "Dashboard do dia" sem caixa visível, "Central administrativa" visível.

**Proposta:** no nav de outubro (`mydents-global-nav.js` e o bundle), a troca de rota tem de pintar o destino e tirar o fluxo da área visível. Seguir a ordem do manual §3.3 só se o operador ainda quiser aquele contrato. Se o menu de outubro for o novo oficial, registrar a decisão e aí consertar só a incoerência (URL ≠ miolo), sem recriar a barra L1 de setembro no escuro.

**Pronto quando:** URL, título, item corrente e texto visível descrevem a mesma tela, inclusive depois de F5 em `#tela/dashboard`.

**Teste:** do fluxo, clicar Dashboard; recarregar; clicar Fluxo de Caixa e ver o fluxo voltar. Fazer em largura estreita, porque a captura do fluxo mostrou filtros empilhados.

## 5. Lista de pacientes com um registro

**Tipo:** sintoma confirmado. Causa não determinada. Não "corrigir" com insert.  
**Por quê:** a grade e `GET /financeiro/api/pacientes.php` devolveram um item, `QA CADASTROS CLINICOS 10/10`. A busca `TST-CURSOR-Ficha-Stab` ficou vazia. `revision` da resposta: 13706.

**Proposta:**

1. Leitura no banco: contar pacientes por status e unidade. Procurar o nome de teste TST-CURSOR sem copiar CPF para o relatório.
2. No PHP capturado, ver se há `LIMIT`, filtro de unidade ou filtro que só devolve cadastro recente.
3. Se o paciente de teste existir inativo, a tela de busca deve dizer isso. Não reativar sem pedido.
4. Se a API estiver limitada, corrigir o limite e a paginação. A busca tem de ir ao servidor, não só à página já carregada (hoje a lista visível tinha uma linha antes mesmo da busca).

**Pronto quando:** o total da tela bate com a contagem lida no banco para o mesmo escopo, e a busca do paciente de teste reflete o status real.

**Teste:** buscar `TST-CURSOR-Ficha-Stab`. Não abrir `VAL-FLUXO`. Não clicar WhatsApp, Editar ou Novo paciente.

## 6. Login: decidir antes de codar

**Tipo:** divergência confirmada. Falha de autenticação: não testada.  
**Por quê:** a tela no ar é CPF + "Esqueci minha senha" + `POST recuperacao.php`. O manual v6.1 e `codigo\usuarios\index.php` são e-mail, sem esses arquivos. `recuperacao.php`, `trocar-senha.php` e `portal-dentista.php` respondem no ar e faltam no repo.

**Proposta:**

1. Não substituir `usuarios/index.php` pelo do repo.
2. O operador escolhe: o contrato passa a ser CPF, ou o live volta para e-mail.
3. Só então alinhar tela, `login.php` e manual. Se ficar CPF, o manual muda por decisão escrita (a seção 0 do manual diz que o contrato só muda assim).
4. O script de recuperação diz que o envio é simulado. Confirmar no PHP capturado. Não acionar o botão no live durante o teste.

**Pronto quando:** tela, POST e manual usam o mesmo identificador, e uma conta de teste entra. Mensagem de erro continua genérica.

**Teste:** conta Cursor Teste, já existente. Não criar usuário. Não resetar senha de outra pessoa.

## 7. Chip "Administrador"

**Tipo:** confirmado na tela.  
**Por quê:** o manual §3.4 pede o nome da sessão. O chip mostrou o papel "Administrador" e "Sessão ativa".

**Proposta:** depois da captura, o componente do canto usa o nome já devolvido por `sessao.php`. Não gravar esse nome em screenshot de auditoria.

**Teste:** o chip não diz só "Administrador" quando a sessão tem nome. Não abrir o menu se isso for listar e-mail em evidência pública.

## 8. Nav em dois desenhos

**Tipo:** confirmado como divergência de contrato. Não é, sozinho, um defeito de clique.  
**Por quê:** o manual §3.1 descreve uma barra. O `app.html` mostra outra. `/relatorios/` mostra uma terceira, mais próxima do manual (inclui Folha e Produção).

**Proposta:** não unificar no código até o item 6 de produto (qual menu vale). Se a decisão for o menu de outubro, atualizar o manual. Se for o manual, o trabalho é no `mydents-global-nav.js` capturado, não no `layout-modernizacao.js` de setembro.

## 9. Suspeitas — investigar, não corrigir no escuro

| Suspeita | O que fazer | Não fazer |
| --- | --- | --- |
| JSON de pacientes traz chaves de banco, PIX e titular | No código capturado, tirar esses campos da listagem se a grade não usa. Conferir se vêm preenchidos | Não colar valor no Git |
| HTML de produção em HTTP 200 sem cookie | Chamar a API de produção sem cookie e ver se volta dado | Não tratar o 200 do HTML estático como vazamento até a API responder |
| Dois selects de conta no DOM | Ver qual fica visível depois do boot em `#fluxo` | Não apagar select sem saber qual é o oficial |
| `gc_maxlifetime` 1440 contra inatividade 1800 | Comparar o INI live com o `bootstrap.php` capturado | Não mudar INI no cPanel nesta leva |
| cPanel: tar e `.cagefs.zip` no home, MySQL remoto com quatro IPs, AutoSSL unmanaged, 2FA desligado, cron vazio | Revalidar no painel em leitura. São itens da análise de 11/10, não reabertos na auditoria funcional | Não apagar backup, não remover host MySQL, não emitir certificado à mão enquanto o Let's Encrypt valer (até 01/12/2026, segundo aquela análise) |

## Ordem sugerida

1. Captura do live para o Git.  
2. Leitura no banco do lançamento de R$ 3,21 e da contagem de pacientes.  
3. Decisão curta do operador: QA fora do consolidado ou não; login CPF ou e-mail; qual menu vale.  
4. Só então os patches 2, 3, 4 e 5, no código capturado.  
5. Chip e nav depois, porque dependem da decisão do menu.  
6. Itens de cPanel em separado, sem misturar com o deploy do PHP.

## Riscos se esta ordem for invertida

- Patch em `codigo\` publicado hoje remove o bundle de outubro. O `app.html` novo aponta para um arquivo que o live já responde 404.
- `DELETE` ou inativação do R$ 3,21 sem trilha muda o saldo que a auditoria acabou de ler.
- Remover unidade QA pode órfão o lote 10/2026 (status Aberto, sem células encerradas) e o dentista fictício visto no filtro.
- Trocar o login para e-mail enquanto o PHP live espera `login` impede a equipe de entrar. Isso não foi provado; por isso o teste de POST fica para depois da captura, com conta de teste.
