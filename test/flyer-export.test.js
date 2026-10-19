import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('Gerador de Encartes — Etapa 4: Módulo FlyerExport (Exportação PDF, PNG e JPG)', async (t) => {
  const code = fs.readFileSync('./admin/modules/flyerExport.js', 'utf8');

  // Prepara sandbox com mocks do DOM, jspdf, html2canvas e jszip
  const createdElements = [];
  const sandbox = {
    window: {
      html2canvas: async () => ({
        toDataURL: () => 'data:image/jpeg;base64,mock',
        toBlob: (cb, mime, q) => cb(new Blob(['mock-data'], { type: mime || 'image/png' }))
      }),
      jspdf: {
        jsPDF: function() {
          return {
            addPage: () => {},
            addImage: () => {},
            save: () => {}
          };
        }
      },
      JSZip: function() {
        return {
          file: () => {},
          generateAsync: async () => new Blob(['mock-zip'], { type: 'application/zip' })
        };
      },
      showToast: () => {}
    },
    document: {
      body: {
        appendChild: (el) => createdElements.push(el),
        removeChild: (el) => {
          const idx = createdElements.indexOf(el);
          if (idx >= 0) createdElements.splice(idx, 1);
        }
      },
      createElement: (tag) => {
        if (tag === 'div') {
          return {
            style: { cssText: '' },
            innerHTML: '',
            querySelector: () => ({ style: { cssText: '' }, className: 'flyer-page-sheet' })
          };
        }
        return { href: '', download: '', click: () => {}, remove: () => {} };
      }
    },
    URL: {
      createObjectURL: () => 'blob:http://localhost/mock-blob',
      revokeObjectURL: () => {}
    },
    FlyerTemplates: {
      renderPage: () => '<div class="flyer-page-sheet"><main class="flyer-grid-container"></main></div>',
      getStoreBranding: (s) => ({
        name: (s && s.name) ? s.name : 'Loja Teste',
        color: (s && s.color) ? s.color : '#e94560',
        logoUrl: (s && s.logo_url) || null,
        slogan: ''
      })
    },
    console: console,
    setTimeout: setTimeout,
    Promise: Promise,
    Blob: globalThis.Blob
  };

  sandbox.window.window = sandbox.window;
  sandbox.window.FlyerTemplates = sandbox.FlyerTemplates;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const FlyerExport = sandbox.window.FlyerExport;
  assert.ok(FlyerExport, 'FlyerExport deve ser exposto no escopo global/window');

  await t.test('Verifica disponibilidade da API pública', () => {
    assert.strictEqual(typeof FlyerExport.isReady, 'function');
    assert.strictEqual(typeof FlyerExport.exportPDF, 'function');
    assert.strictEqual(typeof FlyerExport.exportPNG, 'function');
    assert.strictEqual(typeof FlyerExport.exportJPG, 'function');
    assert.strictEqual(typeof FlyerExport.exportCurrentPagePNG, 'function');
    assert.strictEqual(typeof FlyerExport.exportCurrentPageJPG, 'function');
  });

  await t.test('Valida isReady() com e sem dependências', () => {
    assert.strictEqual(FlyerExport.isReady(), true);

    const origH2c = sandbox.window.html2canvas;
    sandbox.window.html2canvas = undefined;
    assert.strictEqual(FlyerExport.isReady(), false);
    sandbox.window.html2canvas = origH2c;

    const origPdf = sandbox.window.jspdf;
    sandbox.window.jspdf = undefined;
    assert.strictEqual(FlyerExport.isReady(), false);
    sandbox.window.jspdf = origPdf;
  });

  await t.test('Proteção contra execução sem páginas selecionadas', async () => {
    let toastType = null;
    sandbox.window.showToast = (msg, type) => { toastType = type; };

    await FlyerExport.exportPDF([], {}, {});
    assert.strictEqual(toastType, 'warning');

    toastType = null;
    await FlyerExport.exportPNG([], {}, {});
    assert.strictEqual(toastType, 'warning');

    toastType = null;
    await FlyerExport.exportJPG([], {}, {});
    assert.strictEqual(toastType, 'warning');
  });

  await t.test('Exportação de PDF monopágina e multipágina', async () => {
    let toastSuccess = false;
    sandbox.window.showToast = (msg, type) => {
      if (type === 'success' && msg.includes('PDF')) toastSuccess = true;
    };

    const dummyPage = [{ id: '1', name: 'Arroz 5kg', price: 25.90 }];
    await FlyerExport.exportPDF([dummyPage], { name: 'Super Loja', color: '#10b981' }, { template: 'market', itemsPerPage: 6 });
    assert.ok(toastSuccess, 'Deve emitir toast de sucesso para PDF monopágina');

    toastSuccess = false;
    await FlyerExport.exportPDF([dummyPage, dummyPage], { name: 'Super Loja' }, { template: 'food', itemsPerPage: 4 });
    assert.ok(toastSuccess, 'Deve emitir toast de sucesso para PDF multipágina');
  });

  await t.test('Exportação PNG monopágina (download direto) e multipágina (ZIP)', async () => {
    let lastToast = '';
    sandbox.window.showToast = (msg, type) => {
      if (type === 'success') lastToast = msg;
    };

    const dummyPage = [{ id: '1', name: 'Item 1', price: 10 }];
    await FlyerExport.exportPNG([dummyPage], { name: 'Loja Teste' }, {});
    assert.ok(lastToast.includes('exportada'), 'Download direto monopágina');
    assert.ok(!lastToast.includes('ZIP'), 'Monopágina não deve usar ZIP');

    await FlyerExport.exportPNG([dummyPage, dummyPage], { name: 'Loja Teste' }, {});
    assert.ok(lastToast.includes('ZIP'), 'Multipágina deve empacotar em ZIP');
  });

  await t.test('Exportação de página avulsa (PNG e JPG)', async () => {
    let lastToast = '';
    sandbox.window.showToast = (msg, type) => {
      if (type === 'success') lastToast = msg;
    };

    const dummyPage = [{ id: '1', name: 'Item 1', price: 10 }];
    await FlyerExport.exportCurrentPagePNG(dummyPage, 0, 2, { name: 'Loja Teste' }, {});
    assert.ok(lastToast.includes('Página 1'), 'Toast deve indicar página 1');

    await FlyerExport.exportCurrentPageJPG(dummyPage, 1, 2, { name: 'Loja Teste' }, {});
    assert.ok(lastToast.includes('Página 2'), 'Toast deve indicar página 2');
  });
});
