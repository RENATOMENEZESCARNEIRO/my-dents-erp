/* Agrupamento dos módulos em itens de menu com abas (Comercial, Gestão clínica, Configurações). */
(() => {
  'use strict';
  const { group } = window.MD;
  group('comercial', 'Comercial', 40, [
    { view: 'orcamentos', label: 'Orçamentos' }, { view: 'recebimentos', label: 'Recebimentos' },
    { view: 'creditos', label: 'Crédito de pacientes' }, { view: 'marketing', label: 'Marketing' },
  ]);
  group('gestao', 'Gestão clínica', 62, [
    { view: 'proteses', label: 'Prótese' }, { view: 'estoque', label: 'Estoque' }, { view: 'producao', label: 'Produção' },
  ]);
  group('configuracoes', 'Configurações', 100, [
    { view: 'cadastros', label: 'Cadastros' }, { view: 'planos', label: 'Planos / Assinaturas' },
  ]);
})();
