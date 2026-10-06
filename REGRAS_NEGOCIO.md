# Regras de Negócio - My Dents v6.1

## 💰 Comissões

### Comissão de Venda
- **Incide sobre**: valor bruto que o paciente EFETIVAMENTE pagou
- **Origem**: % do dentista definido no cadastro de profissional
- **Congelamento**: percentual fica congelado no momento da aprovação
- **Cálculo**: ex: orçamento R$ 1.000 com sinal de R$ 500 → comissão sobre R$ 500
- **Desconto**: desconto quita o débito, comissão é sobre o valor recebido

### Comissão de Execução
- **Incide sobre**: valor fixo da tabela de procedimentos
- **Liberação**: quando tratamento é evoluído e marcado como finalizado
- **Sem bloqueio**: não é travado por débito vencido (apenas sinaliza)
- **Registro**: exige informar o dentista que executou o procedimento

### Pagamento de Comissões
- **Período**: lote de competência mensal (01 até último dia do mês)
- **Criação**: automática no início do mês
- **Fechamento**: manual por botão "encerrar lote"
- **Segregação**: venda e execução vão em previsões SEPARADAS
- **Encerramento**: pode ser do lote inteiro ou individual (por dentista)
- **Data de Pagamento**: configurável por dentista
- **Estorno**: se lote aberto, linha permanece com comissão zerada; se fechado, lançamento de estorno no próximo lote

### Comissão de Convênio
- **Lançamento**: manual na previsão de pagamento
- **Cálculo**: externo (sistema da operadora)
- **Agrupamento**: mesmo grupo de pagamento do dentista
- **Separação**: por unidade no registro final

### Edição Manual de Comissões
- **Permissão**: usuário com acesso específico pode alterar valor
- **Registro**: alteração fica registrada como justificativa
- **Casos**: pagamento zero, pagamento superior, permutas

## 📊 Recebimento e Débito

### Débito
- **Criação**: um débito por orçamento aprovado
- **Geração**: quando paciente autoriza (seleciona) procedimentos
- **Vencimento**: informado pela recepção (padrão: dia atual, editável)

### Recebimento
- **Meios**: dinheiro, PIX, crédito, débito
- **Datas**:
  - **Lançamento**: quando débito foi criado
  - **Pagamento**: quando cliente pagou (cliente paga antes de dinheiro entrar)
  - **Recebimento**: quando dinheiro efetivamente entrou
  - PIX/espécie: últimas duas coincidem
  - Cartão: divergem
- **Cartão de Débito**: taxa 0,99%, vai para PREVISTO
- **Cartão de Crédito**: 1–12×, vai para PREVISTO
- **PIX/Espécie**: realizado na hora
- **Dentista Responsável**: pré-preenchido com quem orçou, editável
- **Campo de CV**: para cartão (identificação da transação)
- **Desconto**: quita o débito, comissão sobre valor recebido

### Pagamento Parcial
- **Permitido**: receber menos que orçamento
- **Saldo Restante**: fica pendente
- **Recebimento Múltiplo**: permite várias entradas para um débito

### Crédito do Paciente
- **Tipo**: carteira por paciente + unidade
- **Receita**: o dinheiro entra cheio, conta como receita NO MOMENTO DO RECEBIMENTO
- **Uso**: não gera nova receita nem lançamento de caixa
- **Excedente**: só em forma imediata (não acumula)
- **Devolução**: reduz receita (não é despesa)

## 🏦 Contas Bancárias

### Instituições
- Bradesco
- Sicredi
- Caixa (Espécie)

### Saldo de Conta
- **Inclui**: aporte e empréstimo de sócio (somam)
- **Reduz**: devolução de empréstimo (subtrai)
- **Escopo**: aporte, empréstimo, devolução e transferência ficam no grupo "Grupo" (não em unidades)

### Conciliação Bancária
- **Batimento**: extrato (OFX/bancário) vs. lançamentos do sistema
- **Status**: conciliado vs. divergente
- **Ação**: botão de reconciliar itens

## 📈 Receitas

### Fontes de Receita
1. **Procedimentos Odontológicos**: venda de tratamentos
2. **Convênios/Planos**: valor mensal conforme atendimento
3. **Aporte Financeiro**: sócios (NÃO é receita, mas aparece no DRE)

### Convênios (Fase Atual)
- **Registro**: apenas valor recebido
- **Anexo**: arquivo de produção de atendimento (opcional)
- **SEM cadastrar**: pacientes de plano, agendamentos, cálculos de atendimento

### Receita Líquida
- **Fórmula**: Receita Bruta − Deduções/Devoluções
- **Devolução de Crédito**: dedução da receita (estorno), não despesa

## 💼 Dentista

### Cadastro
- **Campos**:
  - Nome e CPF
  - Unidade(s) de atuação
  - Cargo
  - Salário base
  - Dados bancários
  - % de comissão de venda
  - Data de pagamento (dia do mês)
- **Comissão**: valor de comissão de venda é congelado no momento da aprovação

### Recebimentos Atribuídos
- **Todo recebimento**: exige informar dentista responsável
- **Pré-preenchido**: quem orçou, editável
- **Comissão de Venda**: definida por este dentista

### Execução Atribuída
- **Toda evolução/conclusão**: exige informar dentista que executou
- **Comissão de Execução**: definida por este dentista

### Visualização de Pagamentos
- **Visualização**: agrupado (sem dividir por unidade)
- **Detalhe**: unidade informada
- **Realização**: separado por unidade (custo real por unidade)
- **Código de Vínculo**: identifica lançamentos do mesmo pagamento

## 📋 Orçamento

### Estrutura
- **Campo**: dentro do cadastro do paciente
- **Dentista Responsável**: quem fez o orçamento
- **Procedimentos**: lista de tudo que paciente precisa fazer
- **Aprovação**: paciente seleciona quais autoriza
- **Resultado**:
  - **Aprovados**: viram orçamento APROVADO (gera débito)
  - **Não selecionados**: viram orçamento PENDENTE PARALELO

### Orçamento Aprovado
- **Débito**: gera um débito único para o paciente
- **Compartilhamento**: um recebimento pode pagar múltiplos procedimentos
- **Exemplo**: 300 + 500 + 200 = R$ 1.000 → 1 recebimento único

### Aprovação Parcial
- **Resultado**: DOIS orçamentos distintos SEM vínculo
- **Códigos**: Orçamento #1 e #2, cada um com código próprio
- **Benefício**: minimiza esforço manual do operador

## 💳 Cartão de Crédito

### Taxas Configuráveis
- **Tabela**: editável no sistema
- **Chave**: ligar/desligar
- **Pré-preenchida**: com taxas atuais
- **Bandeiras**: Visa, Mastercard, Redeshop, Diners, Mais!, Sicredi
- **Valores**:
  - 1×: 3,15%
  - 2×: até 10,69% (varia por parcelamento)

### Recebimento em Cartão
- **Status**: PREVISTO (até confirmação do valor)
- **Realização**: quando financeiro recebe
- **CV**: campo obrigatório para rastrear transação
- **Valor Líquido**: pré-programado, editável na realização
- **Flexibilidade**: bandeira X: 3,2%, bandeira Y: 3,5% (base editável)

### D+1 Automático
- **Crédito/Débito**: credita em D+1 (próximo dia útil)
- **Pagamento**: Renato paga alguns dias depois

## 📅 Lote de Comissões

### Criação
- **Automática**: início do mês (abertura automática)
- **Período**: competência mensal (01 até último dia)

### Conferência
- **Aberto**: serve para análise e correções
- **Ações**:
  - Analisar valores
  - Verificar procedimentos pendentes de conclusão
  - Verificar dentista que vendeu
  - Corrigir informações (se permissão)

### Encerramento
- **Manual**: botão "encerrar lote"
- **Escopo**: pode ser lote inteiro ou individual (dentista + tipo)
- **Resultado**: comissões vão para previsão de pagamento
- **Segregação**: venda e execução em PREVISÕES SEPARADAS

### Estorno em Lote Encerrado
- **Novo Lote**: próxima competência recebe estorno como valor negativo
- **Descontos**: descontado no próximo pagamento

### Lançamento Retroativo
- **Lote Aberto**: entra normalmente
- **Lote Encerrado**: programa para próximo mês (mesma lógica de estorno)

## 🏥 Caixa da Unidade

### Fechamento
- **Permissão**: apenas usuário com acesso específico
- **Imutabilidade**: caixa fechado não sofre alterações
- **Reabertura**: requer permissão para abrir novamente
- **Sequência**: reabrir → alterar → fechar (com permissão)
- **Alerta**: "caixa encerrado, procure o Financeiro"

### Operações em Caixa Fechado
- **Bloqueado**: não permite receber, excluir ou alterar
- **Mensagem**: erro impedindo a ação

## 📊 Folha Salarial

### Colaboradores
- **Cadastro**: cargo, unidade, salário base, dados bancários
- **Benefícios**:
  - **Vale-Transporte**: custo real − desconto legal (máx 6% salário)
  - **Vale-Alimentação**: valor fixo por dia útil

### Fechamento Mensal
- **Componentes**: proventos, descontos (INSS, IRRF, VT), valor líquido
- **Validação**: status de validação pelo colaborador
- **Integração**: botão para integrar em sistema contábil

## 📝 Lançamentos

### Visualização
- **Diferente de**: fluxo de caixa
- **Escopo**: tudo que foi lançado pelo operador
- **Filtros**: data, tipo, valor, dentista, unidade

## 🎯 Receita vs. Caixa

### Princípio
- **Uma coisa é eu receber**: débito quitado quando cliente paga
- **Outra é eu receber o dinheiro**: efetivamente entra em conta
- **Visibilidade**: três datas distintas (lançamento, pagamento, recebimento)

### DRE (Demonstração de Resultado)
```
Receita Bruta (procedimentos + convênios)
− Deduções/Devoluções (crédito devolvido)
= Receita Líquida
− Despesas (folha, aluguel, etc.)
= Resultado Operacional

+ Aporte Financeiro (não é receita, mas aparece aqui)
= Saldo Real em Caixa
```

### Aporte Financeiro
- **Não é receita**: não vem de operação
- **Aparece no DRE**: para mostrar de onde veio o dinheiro
- **Exemplo**: receita R$ 120.000 − despesa R$ 150.000 = prejuízo R$ 30.000, mas aporte R$ 35.000 = saldo positivo

## 🔒 Permissões

- Fechar/reabrir caixa
- Alterar comissões manualmente
- Aprovar folha de pagamento
- Acessar auditoria e histórico

## 🎨 Navegação

- **Estrutura**: L1 plana com abas L2 no miolo
- **Sem accordion**: navegação direta
- **Tela Única**: sem recarregar página (fluido)
- **Login**: email + senha (não CPF)

---

**Versão**: 6.1.0  
**Última atualização**: 06 de outubro de 2026
