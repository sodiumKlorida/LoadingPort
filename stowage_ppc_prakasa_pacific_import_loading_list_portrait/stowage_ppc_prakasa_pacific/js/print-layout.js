// Membuat halaman cetak eksplisit dengan dua Bay tersusun vertikal per halaman.
(function () {
  function buildPrintPages() {
    const source = document.getElementById('bays');
    if (!source) return;
    let target = document.getElementById('printPages');
    if (target) target.remove();
    target = document.createElement('div');
    target.id = 'printPages';

    const panels = Array.from(source.querySelectorAll(':scope > .bay-panel'));
    for (let i = 0; i < panels.length; i += 2) {
      const page = document.createElement('section');
      page.className = 'print-page';

      if (i === 0) {
        const header = document.getElementById('printHeader');
        if (header) {
          const headerClone = header.cloneNode(true);
          headerClone.removeAttribute('id');
          headerClone.classList.remove('hidden');
          headerClone.classList.add('print-page-header');
          page.appendChild(headerClone);
        }
      }

      const grid = document.createElement('div');
      grid.className = 'print-page-grid';
      panels.slice(i, i + 2).forEach(panel => {
        const clone = panel.cloneNode(true);
        clone.removeAttribute('id');
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        grid.appendChild(clone);
      });
      page.appendChild(grid);
      target.appendChild(page);
    }
    document.body.appendChild(target);
  }

  window.addEventListener('beforeprint', buildPrintPages);
  window.addEventListener('afterprint', () => {
    document.getElementById('printPages')?.remove();
  });
})();
