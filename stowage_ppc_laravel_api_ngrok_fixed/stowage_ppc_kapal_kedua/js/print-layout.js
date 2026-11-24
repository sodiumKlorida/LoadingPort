// Membuat halaman cetak yang eksplisit: 4 Bay per halaman (2 x 2).
(function () {
  function buildPrintPages() {
    const source = document.getElementById('bays');
    if (!source) return;
    let target = document.getElementById('printPages');
    if (target) target.remove();
    target = document.createElement('div');
    target.id = 'printPages';

    const groups = Array.from(source.querySelectorAll(':scope > .cargo-hold-group'));
    groups.forEach((group, i) => {
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

      const hold = document.createElement('section');
      hold.className = 'print-cargo-hold';
      const title = document.createElement('h2');
      title.className = 'print-cargo-hold-title';
      title.textContent = group.querySelector('.cargo-hold-label')?.textContent || '';

      const grid = document.createElement('div');
      grid.className = 'print-page-grid';
      Array.from(group.querySelectorAll(':scope > .bay-panel')).forEach(panel => {
        const clone = panel.cloneNode(true);
        clone.removeAttribute('id');
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        grid.appendChild(clone);
      });
      hold.appendChild(title);
      hold.appendChild(grid);
      page.appendChild(hold);
      target.appendChild(page);
    });
    document.body.appendChild(target);
  }

  window.addEventListener('beforeprint', buildPrintPages);
  window.addEventListener('afterprint', () => {
    document.getElementById('printPages')?.remove();
  });
})();
