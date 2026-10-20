/**
 * EncartShop — FlyerExport Module (Etapa 4)
 * Exportação de encartes em PDF A4, PNG e JPG.
 *
 * Dependências (CDN, carregadas no HTML):
 *   - html2canvas  >= 1.4
 *   - jsPDF        >= 2.5 (window.jspdf.jsPDF)
 *
 * API pública:
 *   FlyerExport.exportPDF(pages, store, options)   → Promise<void>
 *   FlyerExport.exportPNG(pages, store, options)   → Promise<void>  (todas as páginas em ZIP)
 *   FlyerExport.exportJPG(pages, store, options)   → Promise<void>  (todas as páginas em ZIP)
 *   FlyerExport.exportCurrentPagePNG(pageProducts, pageIndex, totalPages, store, options) → Promise<void>
 *   FlyerExport.exportCurrentPageJPG(pageProducts, pageIndex, totalPages, store, options) → Promise<void>
 *   FlyerExport.isReady()                          → boolean
 */

const FlyerExport = (() => {
  /* ─── Constantes ────────────────────────────────────────────── */
  const A4_WIDTH_MM   = 210;
  const A4_HEIGHT_MM  = 297;
  const A4_PX_WIDTH   = 794;     // 210 mm → px a 96 dpi
  const A4_PX_HEIGHT  = 1123;    // 297 mm → px a 96 dpi
  const SCALE         = 2;       // Fator de resolução do canvas (2× = 1588×2246 px, alta definição e estabilidade)
  const JPEG_QUALITY  = 0.92;    // Qualidade JPEG (0–1)

  /* ─── Helpers internos ──────────────────────────────────────── */

  /**
   * Verifica se as bibliotecas necessárias foram carregadas.
   */
  function isReady() {
    return (
      typeof window.html2canvas === 'function' &&
      typeof window.jspdf !== 'undefined' &&
      typeof window.jspdf.jsPDF === 'function'
    );
  }

  /**
   * Sanitiza o nome da loja para uso em nome de arquivo.
   */
  function safeFileName(name) {
    return (name || 'encarte')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase()
      .slice(0, 40) || 'encarte';
  }

  /**
   * Cria e monta um nó DOM com a página de encarte em coordenadas seguras
   * (atrás da interface com z-index negativo) para captura precisa em resolução A4 real.
   *
   * @param {Array}  pageProducts  Produtos desta página
   * @param {number} pageIndex
   * @param {number} totalPages
   * @param {Object} store         Dados da loja ativa
   * @param {Object} options       { template, itemsPerPage }
   * @returns {HTMLElement}        O nó montado (ainda não está no DOM)
   */
  function buildOffscreenPage(pageProducts, pageIndex, totalPages, store, options) {
    const wrapper = document.createElement('div');
    wrapper.id = `flyer-export-offscreen-${pageIndex}`;
    wrapper.style.cssText = [
      `position:fixed`,
      `left:0`,
      `top:0`,
      `width:${A4_PX_WIDTH}px`,
      `height:${A4_PX_HEIGHT}px`,
      `overflow:hidden`,
      `z-index:-9999`,
      `pointer-events:none`,
      `background:#ffffff`,
      `margin:0`,
      `padding:0`,
    ].join(';');

    // Reutiliza FlyerTemplates para gerar o HTML exatamente como na prévia
    const pageHtml = FlyerTemplates.renderPage(
      pageProducts,
      pageIndex,
      totalPages,
      store,
      options
    );
    wrapper.innerHTML = pageHtml;

    // Garante que a folha ocupe 100% do wrapper em A4 exato
    const sheet = wrapper.querySelector('.flyer-page-sheet');
    if (sheet) {
      sheet.style.cssText += [
        `;width:${A4_PX_WIDTH}px`,
        `max-width:${A4_PX_WIDTH}px`,
        `height:${A4_PX_HEIGHT}px`,
        `min-height:${A4_PX_HEIGHT}px`,
        `max-height:${A4_PX_HEIGHT}px`,
        `border-radius:0`,
        `box-shadow:none`,
        `padding:0`,
        `margin:0`,
        `box-sizing:border-box`,
      ].join('');
    }

    return wrapper;
  }

  /**
   * Captura um nó DOM como canvas usando html2canvas.
   * O nó precisa estar no DOM durante a captura.
   *
   * @param {HTMLElement} node
   * @returns {Promise<HTMLCanvasElement>}
   */
  async function captureNode(node) {
    document.body.appendChild(node);

    // Força reflow síncrono para que flex e grid calculem as alturas completas
    void node.offsetHeight;
    await new Promise(r => setTimeout(r, 60));

    // Aguarda carregamento de todas as imagens do nó antes do print
    const imgs = Array.from(node.querySelectorAll('img'));
    if (imgs.length > 0) {
      await Promise.all(imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(res => {
          img.onload = res;
          img.onerror = res;
          setTimeout(res, 2500);
        });
      }));
    }

    try {
      const sheet = node.querySelector('.flyer-page-sheet') || node;
      const canvas = await window.html2canvas(sheet, {
        scale: SCALE,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        width: A4_PX_WIDTH,
        height: A4_PX_HEIGHT,
        windowWidth: A4_PX_WIDTH,
        windowHeight: A4_PX_HEIGHT,
      });
      return canvas;
    } finally {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
  }

  /**
   * Dispara o download de um Blob no navegador.
   */
  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /**
   * Converte canvas para Blob de forma assíncrona.
   */
  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('toBlob falhou')),
        mime,
        quality
      );
    });
  }

  /**
   * Notifica o usuário com showToast se disponível.
   */
  function toast(msg, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    }
  }

  /* ─── Exportação PDF ────────────────────────────────────────── */

  /**
   * Exporta todas as páginas do encarte em um único PDF A4.
   *
   * @param {Array}  paginationPages  Array de arrays de produtos (resultado de FlyerTemplates.paginate)
   * @param {Object} store            Dados da loja ativa
   * @param {Object} options          { template, itemsPerPage }
   */
  async function exportPDF(paginationPages, store, options = {}) {
    if (!isReady()) {
      toast('Bibliotecas de exportação não carregadas ainda. Tente novamente em instantes.', 'warning');
      return;
    }
    if (!paginationPages || paginationPages.length === 0) {
      toast('Nenhuma página para exportar. Selecione ao menos 1 produto.', 'warning');
      return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const totalPages = paginationPages.length;
    toast(`Gerando PDF… (0 de ${totalPages} página(s))`, 'info');

    for (let i = 0; i < totalPages; i++) {
      const node   = buildOffscreenPage(paginationPages[i], i, totalPages, store, options);
      const canvas = await captureNode(node);

      const imgData = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      if (i > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(imgData, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, '', 'FAST');

      if ((i + 1) % 2 === 0 || i === totalPages - 1) {
        toast(`Gerando PDF… (${i + 1} de ${totalPages} página(s))`, 'info');
      }
    }

    const storeName = FlyerTemplates.getStoreBranding(store).name;
    const fileName  = `encarte_${safeFileName(storeName)}_${totalPages}pg.pdf`;
    pdf.save(fileName);
    toast(`PDF exportado com sucesso! (${totalPages} página(s))`, 'success');
  }

  /* ─── Exportação PNG / JPG (todas as páginas) ───────────────── */

  /**
   * Exporta todas as páginas como arquivos PNG individuais.
   * Se houver apenas 1 página, faz download direto.
   * Se houver múltiplas, usa JSZip para criar um ZIP.
   */
  async function exportPNG(paginationPages, store, options = {}) {
    await _exportImages(paginationPages, store, options, 'png');
  }

  /**
   * Exporta todas as páginas como arquivos JPG individuais.
   */
  async function exportJPG(paginationPages, store, options = {}) {
    await _exportImages(paginationPages, store, options, 'jpg');
  }

  async function _exportImages(paginationPages, store, options, format) {
    if (!isReady()) {
      toast('Bibliotecas de exportação não carregadas ainda. Tente novamente.', 'warning');
      return;
    }
    if (!paginationPages || paginationPages.length === 0) {
      toast('Nenhuma página para exportar.', 'warning');
      return;
    }

    const mime    = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpg' ? JPEG_QUALITY : undefined;
    const ext     = format === 'jpg' ? 'jpg' : 'png';
    const total   = paginationPages.length;
    const branding = FlyerTemplates.getStoreBranding(store);
    const baseName = safeFileName(branding.name);

    toast(`Gerando imagens ${ext.toUpperCase()}… (0 de ${total})`, 'info');

    // Caso de página única: download direto sem ZIP
    if (total === 1) {
      const node   = buildOffscreenPage(paginationPages[0], 0, 1, store, options);
      const canvas = await captureNode(node);
      const blob   = await canvasToBlob(canvas, mime, quality);
      downloadBlob(blob, `encarte_${baseName}_p1.${ext}`);
      toast(`Imagem ${ext.toUpperCase()} exportada!`, 'success');
      return;
    }

    // Múltiplas páginas: empacota em ZIP se JSZip disponível
    if (typeof window.JSZip === 'function') {
      const zip = new window.JSZip();
      for (let i = 0; i < total; i++) {
        const node   = buildOffscreenPage(paginationPages[i], i, total, store, options);
        const canvas = await captureNode(node);
        const blob   = await canvasToBlob(canvas, mime, quality);
        zip.file(`encarte_${baseName}_p${i + 1}.${ext}`, blob);
        toast(`Gerando imagens ${ext.toUpperCase()}… (${i + 1} de ${total})`, 'info');
      }
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      downloadBlob(zipBlob, `encarte_${baseName}_${total}pg.zip`);
      toast(`ZIP com ${total} imagens ${ext.toUpperCase()} exportado!`, 'success');
    } else {
      // Fallback: baixa imagens uma a uma (sem ZIP)
      for (let i = 0; i < total; i++) {
        const node   = buildOffscreenPage(paginationPages[i], i, total, store, options);
        const canvas = await captureNode(node);
        const blob   = await canvasToBlob(canvas, mime, quality);
        downloadBlob(blob, `encarte_${baseName}_p${i + 1}.${ext}`);
        toast(`Exportando página ${i + 1} de ${total}…`, 'info');
        // Pequeno atraso para não sobrecarregar o browser com múltiplos downloads
        if (i < total - 1) await _delay(800);
      }
      toast(`${total} imagens ${ext.toUpperCase()} exportadas!`, 'success');
    }
  }

  /* ─── Exportação da Página Atual ────────────────────────────── */

  async function exportCurrentPagePNG(pageProducts, pageIndex, totalPages, store, options) {
    await _exportSinglePage(pageProducts, pageIndex, totalPages, store, options, 'png');
  }

  async function exportCurrentPageJPG(pageProducts, pageIndex, totalPages, store, options) {
    await _exportSinglePage(pageProducts, pageIndex, totalPages, store, options, 'jpg');
  }

  async function _exportSinglePage(pageProducts, pageIndex, totalPages, store, options, format) {
    if (!isReady()) {
      toast('Bibliotecas de exportação não carregadas ainda.', 'warning');
      return;
    }
    if (!pageProducts || pageProducts.length === 0) {
      toast('Nenhum produto nesta página para exportar.', 'warning');
      return;
    }

    const mime    = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpg' ? JPEG_QUALITY : undefined;
    const ext     = format === 'jpg' ? 'jpg' : 'png';
    const branding = FlyerTemplates.getStoreBranding(store);
    const baseName = safeFileName(branding.name);

    toast(`Gerando ${ext.toUpperCase()} da página ${pageIndex + 1}…`, 'info');
    const node   = buildOffscreenPage(pageProducts, pageIndex, totalPages, store, options);
    const canvas = await captureNode(node);
    const blob   = await canvasToBlob(canvas, mime, quality);
    downloadBlob(blob, `encarte_${baseName}_p${pageIndex + 1}.${ext}`);
    toast(`Página ${pageIndex + 1} exportada em ${ext.toUpperCase()}!`, 'success');
  }

  /* ─── Utilitários ───────────────────────────────────────────── */
  function _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  /* ─── API pública ───────────────────────────────────────────── */
  return {
    isReady,
    exportPDF,
    exportPNG,
    exportJPG,
    exportCurrentPagePNG,
    exportCurrentPageJPG,
  };
})();

if (typeof window !== 'undefined') {
  window.FlyerExport = FlyerExport;
}
