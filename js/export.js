/* Exportação: botões Excel (CSV) e PDF/Imprimir em toda tabela das telas. */
(function () {
  const root = () => document.getElementById('view-root');
  const money = /^-?R\$\s*-?[\d.]+,\d{2}$/;

  function dados(wrap) {
    const t = wrap.querySelector('table');
    const ths = [...t.querySelectorAll('thead th')];
    const keep = ths.map((th, i) => (th.textContent.trim() && !/^a[cç][oõ]es$/i.test(th.textContent.trim()) ? i : -1)).filter((i) => i >= 0);
    const head = keep.map((i) => ths[i].textContent.trim());
    const rows = [...t.querySelectorAll('tbody tr')].filter((r) => r.children.length >= keep.length && !r.querySelector('td.empty, td[colspan]')).map((r) =>
      keep.map((i) => {
        const c = r.children[i]; if (!c) return '';
        const inp = c.querySelector('input:not([type=checkbox]),select');
        const chk = c.querySelector('input[type=checkbox]');
        if (chk && !c.textContent.trim()) return chk.checked ? 'Sim' : 'Não';
        return (inp ? inp.value : c.innerText).replace(/\s+/g, ' ').trim();
      }));
    return { head, rows };
  }

  const titulo = () => (document.getElementById('view-title')?.textContent || 'Relatório').trim();
  const arquivo = () => `${titulo().toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${new Date().toISOString().slice(0, 10)}`;

  function csv(wrap) {
    const { head, rows } = dados(wrap);
    const cel = (v) => { v = money.test(v) ? v.replace(/R\$\s*/, '').replace(/\./g, '') : v; return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    const txt = '﻿' + [head, ...rows].map((r) => r.map(cel).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = arquivo() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function pdf(wrap) {
    const { head, rows } = dados(wrap);
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const un = document.getElementById('filtro-unidade');
    const unTxt = un && un.selectedOptions[0] ? un.selectedOptions[0].textContent : '';
    const w = window.open('', '_blank');
    if (!w) { MD.toast('Libere pop-ups para imprimir.', true); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo())}</title>
<style>body{font:12px Arial,sans-serif;margin:24px;color:#222}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 14px;color:#666}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}th{background:#eef4fa;font-size:11px;text-transform:uppercase}</style></head>
<body><h1>My Dents — ${esc(titulo())}</h1><p>${esc(unTxt)} · emitido em ${new Date().toLocaleString('pt-BR')}</p>
<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
<script>onload=()=>{print()}<\/script></body></html>`);
    w.document.close();
  }

  function injetar() {
    const r = root(); if (!r) return;
    if (window.MD?.can && !window.MD.can('exportar')) return;
    r.querySelectorAll('.table-wrap:not([data-exp])').forEach((wrap) => {
      wrap.dataset.exp = '1';
      if (!wrap.querySelector('table')) return;
      const bar = document.createElement('div');
      bar.className = 'exp-bar no-print';
      bar.innerHTML = '<button type="button" class="btn ghost sm" data-x="csv">Excel</button><button type="button" class="btn ghost sm" data-x="pdf">PDF</button>';
      bar.onclick = (e) => { const b = e.target.closest('[data-x]'); if (b) (b.dataset.x === 'csv' ? csv : pdf)(wrap); };
      wrap.parentNode.insertBefore(bar, wrap);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (root()) new MutationObserver(injetar).observe(root(), { childList: true, subtree: true });
    injetar();
  });
})();
