// Print renderer: seluruh Bay dalam satu halaman A4 bila memungkinkan.
// Portrait: grid 2 kolom per Cargo Hold. Landscape: grid 4 kolom per Cargo Hold.
(() => {
  const getBayNumber = (panel) => {
    const raw = panel?.dataset?.bayPanel || panel?.id?.replace('panel-', '') || '';
    const n = Number(raw);
    return Number.isFinite(n) ? n : -1;
  };

  function buildPrintPages() {
    const landscape = window.printOrientation === 'landscape';
    const source = document.getElementById('bays');
    if (!source) return;

    document.getElementById('printPages')?.remove();
    const panels = Array.from(source.querySelectorAll('.bay-panel'))
      .sort((a, b) => getBayNumber(b) - getBayNumber(a));
    if (!panels.length) return;

    // Petakan nomor Bay ke Cargo Hold sesuai data yang dipakai tampilan web.
    const holdByBay = new Map();
    (typeof CARGO_HOLD_GROUPS !== 'undefined' ? CARGO_HOLD_GROUPS : []).forEach((group) => {
      group.bays.forEach((bay) => holdByBay.set(Number(bay), group));
    });

    const items = [];
    panels.forEach((panel) => {
      const group = holdByBay.get(getBayNumber(panel));
      if (group) items.push({ panel, hold: group });
    });
    if (!items.length) return;

    // Delapan Bay (dua Cargo Hold) muat dalam satu halaman. Jika jumlah Bay
    // bertambah, halaman berikutnya dibuat otomatis.
    const perPage = 8;
    const pages = [];
    for (let index = 0; index < items.length; index += perPage) {
      pages.push(items.slice(index, index + perPage));
    }

    const target = document.createElement('main');
    target.id = 'printPages';
    target.className = 'hidden print:block print:w-full print:m-0 print:p-0';

    pages.forEach((pageItems, pageIndex) => {
      const page = document.createElement('section');
      page.className = 'hidden print:flex print:w-full print:box-border print:flex-col print:gap-[1mm] print:break-after-page print:px-[1mm] print:py-[1mm]';

      if (pageIndex === 0) {
        const header = document.getElementById('printHeader');
        if (header) {
          const headerClone = header.cloneNode(true);
          headerClone.removeAttribute('id');
          headerClone.className = 'print:flex print:h-[9mm] print:min-h-[9mm] print:max-h-[9mm] print:shrink-0 print:items-center print:justify-between print:gap-[0.5mm] print:border-b-2 print:border-slate-900 print:px-[2mm] print:pb-[0.5mm]';
          page.appendChild(headerClone);
        }
      }

      let activeHold = null;
      let activeGrid = null;

      pageItems.forEach(({ panel: sourcePanel, hold }) => {
        if (hold !== activeHold) {
          activeHold = hold;

          const holdBox = document.createElement('div');
          holdBox.className = 'print:flex print:flex-col print:rounded print:border print:border-slate-800 print:p-[1mm]';

          const holdLabel = document.createElement('div');
          holdLabel.className = 'print:flex print:items-center print:justify-between print:border-b print:border-slate-400 print:px-[1mm] print:pb-[0.5mm] print:text-[6pt] print:font-extrabold print:tracking-widest print:text-slate-900';
          holdLabel.textContent = hold.label || 'CARGO HOLD';
          holdBox.appendChild(holdLabel);

          activeGrid = document.createElement('div');
          activeGrid.className = landscape
            ? 'print-bay-grid print:grid print:grid-cols-4 print:gap-[1mm] print:content-start'
            : 'print-bay-grid print:grid print:grid-cols-2 print:gap-[1mm] print:content-start';
          holdBox.appendChild(activeGrid);
          page.appendChild(holdBox);
        }

        const clone = sourcePanel.cloneNode(true);
        clone.removeAttribute('id');
        clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));

        clone.classList.remove(
          'min-h-[300px]',
          'md:min-h-[310px]',
          'lg:min-h-[300px]',
          'print:h-[126mm]',
          'print:min-h-[126mm]',
          'print:max-h-[126mm]'
        );
        if (landscape) {
          clone.classList.add(
            'print:h-[78mm]',
            'print:min-h-[78mm]',
            'print:max-h-[78mm]'
          );
        } else {
          clone.classList.add(
            'print:h-[60mm]',
            'print:min-h-[60mm]',
            'print:max-h-[60mm]'
          );
        }
        clone.classList.add(
          'print:flex-none',
          'print:w-full',
          'print:min-w-0',
          'print:break-inside-avoid',
          'print:rounded',
          'print:shadow-none'
        );
        activeGrid.appendChild(clone);
      });

      target.appendChild(page);
    });

    document.body.appendChild(target);
  }

  window.addEventListener('beforeprint', buildPrintPages);
  window.addEventListener('afterprint', () => document.getElementById('printPages')?.remove());
  window.buildStowagePrintPreview = buildPrintPages;
})();
