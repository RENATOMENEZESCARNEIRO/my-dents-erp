/* Gerador do lote RPS (ISS Fortaleza) — porta fiel do gerar_lote_rps.py validado em 30/09/2026.
   Não alterar os parâmetros fiscais sem validar no portal (ver MANUAL_EMISSAO_NFSE_LOTE_FORTALEZA). */
(function (root) {
  'use strict';
  const MUNICIPIO = '2304400', UF = 'CE', ITEM_LISTA = '412', COD_TRIBUTACAO = '863050401', NBS = '123012300';
  const ALIQUOTA = '0.0300', DISCRIMINACAO = 'Serviços odontológicos.', IND_OPERACAO = '030101', CST = '200', CLASS_TRIB = '200029';
  const MAX_POR_LOTE = 50;
  const NS = 'http://www.ginfes.com.br/servico_enviar_lote_rps_envio_v03.xsd', TP = 'http://www.ginfes.com.br/tipos_v03.xsd';

  const cents = (v) => Math.round(Number(v) * 100 + 1e-9);                 // centavos inteiros (evita 1700.0000000000002)
  const money = (c) => (c / 100).toFixed(2);
  const iss = (c) => Math.floor((c * 3 + 50) / 100);                        // 3% half-up, em centavos
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const limparNome = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();

  function cpfOk(c) {
    c = String(c || '').replace(/\D/g, '');
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (const n of [9, 10]) {
      let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
      if (Number(c[n]) !== ((s * 10) % 11) % 10) return false;
    }
    return true;
  }

  /* rows: [{nome, cpf, valor}] ; emp: {cnpj, im} (IM SEM dígito verificador) */
  function gerarLote(emp, rows, lote, inicio, data) {
    const t = (tag, v) => `<tipos:${tag}>${esc(v)}</tipos:${tag}>`;
    const itens = rows.map((r, k) => {
      const c = cents(r.valor), v = money(c), n = inicio + k;
      return `            <tipos:Rps>
                <tipos:InfRps Id="rps${n}">
                    <tipos:IdentificacaoRps>${t('Numero', n)}${t('Serie', '1')}${t('Tipo', 1)}</tipos:IdentificacaoRps>
                    ${t('DataEmissao', data + 'T00:00:00')}${t('NaturezaOperacao', 1)}${t('OptanteSimplesNacional', 2)}${t('IncentivadorCultural', 2)}${t('Status', 1)}
                    <tipos:Servico>
                        <tipos:Valores>${t('ValorServicos', v)}${t('IssRetido', 2)}${t('ValorIss', money(iss(c)))}${t('BaseCalculo', v)}${t('Aliquota', ALIQUOTA)}${t('ValorLiquidoNfse', v)}</tipos:Valores>
                        ${t('ItemListaServico', ITEM_LISTA)}${t('CodigoTributacaoMunicipio', COD_TRIBUTACAO)}${t('Discriminacao', DISCRIMINACAO)}${t('CodigoMunicipio', MUNICIPIO)}${t('CodigoNbs', NBS)}
                    </tipos:Servico>
                    <tipos:Prestador>${t('Cnpj', emp.cnpj)}${t('InscricaoMunicipal', emp.im)}</tipos:Prestador>
                    <tipos:Tomador>
                        <tipos:IdentificacaoTomador><tipos:CpfCnpj>${t('Cpf', String(r.cpf).replace(/\D/g, ''))}</tipos:CpfCnpj></tipos:IdentificacaoTomador>
                        ${t('RazaoSocial', limparNome(r.nome))}
                        <tipos:Endereco>${t('CodigoMunicipio', MUNICIPIO)}${t('Uf', UF)}</tipos:Endereco>
                    </tipos:Tomador>
                    <tipos:IbsCbs>${t('CodigoIndicadorFinalidadeNFSe', 0)}${t('CodigoIndicadorOperacaoUsoConsumoPessoal', 0)}${t('CodigoIndicadorOperacao', IND_OPERACAO)}${t('IndDest', 0)}
                        <tipos:Valores><tipos:TributosIbsCbs><tipos:GrupoIbsCbs>${t('CST', CST)}${t('CodigoClassTrib', CLASS_TRIB)}</tipos:GrupoIbsCbs></tipos:TributosIbsCbs></tipos:Valores>
                    </tipos:IbsCbs>
                </tipos:InfRps>
            </tipos:Rps>`;
    }).join('\n');
    return `<?xml version='1.0' encoding='UTF-8'?>
<EnviarLoteRpsEnvio xmlns="${NS}" xmlns:tipos="${TP}">
    <LoteRps Id="lote${lote}">
        ${t('NumeroLote', lote)}${t('Cnpj', emp.cnpj)}${t('InscricaoMunicipal', emp.im)}${t('QuantidadeRps', rows.length)}
        <tipos:ListaRps>
${itens}
        </tipos:ListaRps>
    </LoteRps>
</EnviarLoteRpsEnvio>
`;
  }

  /* divide em lotes de 50; retorna [{lote, rpsInicial, rows, xml, total}] */
  function gerarLotes(emp, rows, loteInicial, rpsInicial, data) {
    const out = []; let rps = rpsInicial, lote = loteInicial;
    for (let k = 0; k < rows.length; k += MAX_POR_LOTE) {
      const bloco = rows.slice(k, k + MAX_POR_LOTE);
      out.push({ lote, rpsInicial: rps, rows: bloco, xml: gerarLote(emp, bloco, lote, rps, data), total: bloco.reduce((s, r) => s + cents(r.valor), 0) / 100 });
      rps += bloco.length; lote++;
    }
    return out;
  }

  const api = { gerarLote, gerarLotes, cpfOk, cents, iss, limparNome, MAX_POR_LOTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NFSE = api;
})(typeof window !== 'undefined' ? window : globalThis);
