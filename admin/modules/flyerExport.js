/**
 * EncartShop — FlyerExport Module (Etapa 4 — v4)
 * Exportação de encartes em PDF A4, PNG e JPG.
 *
 * CORREÇÕES PRINCIPAIS (v4 — Inspiração Guanabara & CrieOferta):
 *   1. PRELOAD MULTI-NÍVEL DE IMAGENS EM BASE64:
 *      - Imagens já em data: URI são mantidas diretamente.
 *      - Tentativa 1: fetch direto com modo CORS.
 *      - Tentativa 2: proxy CORS gratuito de alta velocidade (images.weserv.nl),
 *        garantindo carregamento de imagens de qualquer domínio/CDN.
 *      - Tentativa 3: proxy secundário (allorigins.win).
 *      - Tentativa 4: Canvas Image com crossOrigin='anonymous'.
 *      - Garante que a URL original nunca é apagada caso haja falha.
 *      - Pré-carrega tanto as fotos dos produtos quanto a logo da loja.
 *
 *   2. PREENCHIMENTO COMPLETO DA FOLHA A4 (SEM ESPAÇO EM BRANCO):
 *      - No DOM offscreen, calcula a geometria exata da folha A4 (794x1123px).
 *      - Define altura explícita em pixels para a grade (grid), linhas e cards,
 *        evitando o bug de colapso de CSS Grid com 1fr no html2canvas.
 *
 *   3. AGUARDO TOTAL DE CARREGAMENTO (waitForImages):
 *      - Aguarda o evento load de cada imagem antes de acionar o html2canvas,
 *        impedindo que o export tire snapshot antes das imagens renderizarem.
 *
 * Dependências (CDN, carregadas no HTML):
 *   - html2canvas  >= 1.4
 *   - jsPDF        >= 2.5 (window.jspdf.jsPDF)
 */

const FlyerExport = (() => {
  const A4_WIDTH_MM  = 210;
  const A4_HEIGHT_MM = 297;
  const A4_PX_WIDTH  = 794;
  const A4_PX_HEIGHT = 1123;
  const SCALE        = 2;
  const JPEG_QUALITY = 0.94;

  /* ------------------------------------------------------------------ */
  /* Helpers básicos                                                      */
  /* ------------------------------------------------------------------ */

  function isReady() {
    return (
      typeof window.html2canvas === 'function' &&
      typeof window.jspdf !== 'undefined' &&
      typeof window.jspdf.jsPDF === 'function'
    );
  }

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

  function toast(msg, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    }
  }

  function _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Pré-carregamento robusto de imagens como Base64 (Multi-nível)       */
  /* ------------------------------------------------------------------ */

  /**
   * Converte uma URL de imagem para Base64 data URI com múltiplos fallbacks.
   */
  async function urlToBase64(url) {
    if (!url || typeof url !== 'string') return null;
    url = url.trim();
    if (!url) return null;
    if (url.startsWith('data:')) return url;

    // Tentativa 1: fetch direto com CORS
    try {
      const resp = await fetch(url, { mode: 'cors', cache: 'force-cache' });
      if (resp.ok) {
        const blob = await resp.blob();
        return await blobToDataUrl(blob);
      }
    } catch (_) { /* continua para proxy */ }

    // Tentativa 2: proxy global de imagens com CORS liberado (images.weserv.nl)
    try {
      const cleanUrl = url.replace(/^https?:\/\//i, '');
      const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl)}&output=jpg&q=88`;
      const resp = await fetch(proxyUrl, { mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        return await blobToDataUrl(blob);
      }
    } catch (_) { /* continua para próximo fallback */ }

    // Tentativa 3: proxy allorigins.win
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl, { mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        return await blobToDataUrl(blob);
      }
    } catch (_) { /* continua para Image element */ }

    // Tentativa 4: Image element + canvas offscreen
    return await new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => resolve(url), 3500); // Se falhar, preserva URL original

      img.onload = () => {
        clearTimeout(timer);
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || 1;
          c.height = img.naturalHeight || 1;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(c.toDataURL('image/jpeg', 0.92));
        } catch (_) {
          resolve(url); // Preserva a URL original
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve(url); // Preserva a URL original
      };

      img.src = url;
    });
  }

  /**
   * Prepara os produtos e dados da loja, substituindo as URLs por Base64.
   */
  async function preloadPageAssets(products, store) {
    const prods = Array.isArray(products) ? products : [];
    
    // Converte imagens dos produtos
    const convertedProducts = await Promise.all(
      prods.map(async (p) => {
        if (!p) return p;
        const rawImg = p.image || p.image_url || p.img || '';
        if (!rawImg) return { ...p };
        const b64 = await urlToBase64(rawImg);
        return {
          ...p,
          image: b64 || rawImg,
          image_url: b64 || rawImg
        };
      })
    );

    // Converte logo da loja
    let convertedStore = { ...(store || {}) };
    if (convertedStore.logo_url && typeof convertedStore.logo_url === 'string') {
      const logoB64 = await urlToBase64(convertedStore.logo_url);
      if (logoB64) {
        convertedStore.logo_url = logoB64;
      }
    }

    return { products: convertedProducts, store: convertedStore };
  }

  /* ------------------------------------------------------------------ */
  /* Aguarda carregamento total de imagens no DOM                      */
  /* ------------------------------------------------------------------ */

  async function waitForImages(container, timeoutMs = 6000) {
    const imgs = Array.from(container.querySelectorAll('img'));
    if (imgs.length === 0) return;

    const promises = imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(resolve => {
        const cleanup = () => {
          img.removeEventListener('load', onLoad);
          img.removeEventListener('error', onError);
        };
        const onLoad = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); resolve(); };
        img.addEventListener('load', onLoad);
        img.addEventListener('error', onError);
      });
    });

    await Promise.race([
      Promise.all(promises),
      new Promise(r => setTimeout(r, timeoutMs))
    ]);
  }

  /* ------------------------------------------------------------------ */
  /* Montagem do DOM offscreen com geometria A4 exata                   */
  /* ------------------------------------------------------------------ */

  function buildOffscreenPage(pageProducts, pageIndex, totalPages, store, options) {
    const wrapper = document.createElement('div');
    wrapper.id = 'flyer-export-offscreen';
    wrapper.style.cssText = [
      'position: fixed',
      'left: -9999px',
      'top: 0',
      `width: ${A4_PX_WIDTH}px`,
      `height: ${A4_PX_HEIGHT}px`,
      'overflow: hidden',
      'z-index: -9999',
      'background: #ffffff',
      'margin: 0',
      'padding: 0',
      'box-sizing: border-box',
    ].join(';');

    wrapper.innerHTML = FlyerTemplates.renderPage(
      pageProducts, pageIndex, totalPages, store, options
    );

    const sheet = wrapper.querySelector('.flyer-page-sheet');
    if (sheet) {
      sheet.style.cssText += [
        `;width: ${A4_PX_WIDTH}px`,
        `min-width: ${A4_PX_WIDTH}px`,
        `max-width: ${A4_PX_WIDTH}px`,
        `height: ${A4_PX_HEIGHT}px`,
        `min-height: ${A4_PX_HEIGHT}px`,
        `max-height: ${A4_PX_HEIGHT}px`,
        `aspect-ratio: unset`,
        `display: flex`,
        `flex-direction: column`,
        `box-sizing: border-box`,
        `overflow: hidden`,
        `margin: 0`,
        `padding: 0`,
        `border-radius: 0`,
        `box-shadow: none`,
      ].join(';');

      // Geometria precisa para preencher 100% da folha A4
      const header = sheet.querySelector('.flyer-header');
      const banner = sheet.querySelector('.flyer-promo-banner');
      const footer = sheet.querySelector('.flyer-footer');
      const grid   = sheet.querySelector('.flyer-grid-container');

      const headerH = header ? (header.offsetHeight || 76) : 76;
      const bannerH = banner ? (banner.offsetHeight || 24) : 0;
      const footerH = footer ? (footer.offsetHeight || 30) : 30;
      const availableGridH = A4_PX_HEIGHT - headerH - bannerH - footerH;

      const itemsPerPage = Number(options && options.itemsPerPage) || 6;
      let rows = 2;
      let cols = 3;
      if (itemsPerPage === 4) { rows = 2; cols = 2; }
      else if (itemsPerPage === 6) { rows = 2; cols = 3; }
      else if (itemsPerPage === 8) { rows = 2; cols = 4; }
      else if (itemsPerPage === 9) { rows = 3; cols = 3; }

      const rowH = Math.floor(availableGridH / rows);

      if (grid) {
        grid.style.cssText += [
          `;height: ${availableGridH}px`,
          `min-height: ${availableGridH}px`,
          `max-height: ${availableGridH}px`,
          `flex: none`,
          `display: grid`,
          `grid-template-columns: repeat(${cols}, 1fr)`,
          `grid-template-rows: repeat(${rows}, ${rowH}px)`,
          `gap: 2px`,
          `overflow: hidden`,
          `box-sizing: border-box`,
        ].join(';');

        const cards = grid.querySelectorAll('.flyer-card');
        cards.forEach(card => {
          card.style.cssText += [
            `;height: ${rowH}px`,
            `min-height: ${rowH}px`,
            `max-height: ${rowH}px`,
            `display: flex`,
            `flex-direction: column`,
            `justify-content: space-between`,
            `box-sizing: border-box`,
            `overflow: hidden`,
          ].join(';');

          const imgWrap  = card.querySelector('.flyer-card-img-wrap');
          const cardBody = card.querySelector('.flyer-card-body');
          const bodyH    = cardBody ? (cardBody.offsetHeight || 80) : 80;
          const imgH     = Math.max(60, rowH - bodyH - 14);

          if (imgWrap) {
            imgWrap.style.cssText += [
              `;height: ${imgH}px`,
              `min-height: ${imgH}px`,
              `max-height: ${imgH}px`,
              `flex: none`,
              `display: flex`,
              `align-items: center`,
              `justify-content: center`,
              `overflow: hidden`,
            ].join(';');
          }
        });
      }
    }

    return wrapper;
  }

  async function captureNode(node) {
    document.body.appendChild(node);
    void node.offsetHeight; // Força reflow

    // Aguarda o término do carregamento de todas as imagens da folha
    await waitForImages(node, 6000);
    await _delay(120);

    try {
      const sheet = node.querySelector('.flyer-page-sheet') || node;
      const canvas = await window.html2canvas(sheet, {
        scale:           SCALE,
        useCORS:         true,
        allowTaint:      false,
        backgroundColor: '#ffffff',
        logging:         false,
        imageTimeout:    10000,
        scrollX:         0,
        scrollY:         0,
        x:               0,
        y:               0,
        width:           A4_PX_WIDTH,
        height:          A4_PX_HEIGHT,
        windowWidth:     A4_PX_WIDTH,
        windowHeight:    A4_PX_HEIGHT,
      });
      return canvas;
    } finally {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Download helpers                                                     */
  /* ------------------------------------------------------------------ */

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((res, rej) => {
      canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob falhou')), mime, quality);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Exportação PDF                                                       */
  /* ------------------------------------------------------------------ */

  async function exportPDF(paginationPages, store, options = {}) {
    if (!isReady()) {
      toast('Bibliotecas de exportação ainda não foram carregadas.', 'warning');
      return;
    }
    if (!paginationPages || paginationPages.length === 0) {
      toast('Sem páginas para exportar.', 'warning');
      return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const total = paginationPages.length;

    toast('Preparando imagens e produtos para o PDF…', 'info');

    for (let i = 0; i < total; i++) {
      toast(`Gerando página ${i + 1} de ${total}…`, 'info');
      const { products, store: prepStore } = await preloadPageAssets(paginationPages[i], store);
      const node   = buildOffscreenPage(products, i, total, prepStore, options);
      const canvas = await captureNode(node);
      const imgData = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      
      if (i > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(imgData, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, '', 'FAST');
    }

    const name = `encarte_${safeFileName(FlyerTemplates.getStoreBranding(store).name)}_${total}pg.pdf`;
    pdf.save(name);
    toast(`PDF exportado com sucesso! (${total} página(s))`, 'success');
  }

  /* ------------------------------------------------------------------ */
  /* Exportação PNG / JPG — todas as páginas                             */
  /* ------------------------------------------------------------------ */

  async function exportPNG(pages, store, opts) {
    await _exportImages(pages, store, opts, 'png');
  }

  async function exportJPG(pages, store, opts) {
    await _exportImages(pages, store, opts, 'jpg');
  }

  async function _exportImages(pages, store, options, format) {
    if (!isReady() || !pages || pages.length === 0) {
      toast('Sem páginas para exportar.', 'warning');
      return;
    }
    const mime  = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const qual  = format === 'jpg' ? JPEG_QUALITY : undefined;
    const ext   = format;
    const total = pages.length;
    const base  = safeFileName(FlyerTemplates.getStoreBranding(store).name);

    toast('Preparando imagens para exportação…', 'info');

    if (total === 1) {
      const { products, store: prepStore } = await preloadPageAssets(pages[0], store);
      const canvas = await captureNode(buildOffscreenPage(products, 0, 1, prepStore, options));
      downloadBlob(await canvasToBlob(canvas, mime, qual), `encarte_${base}_p1.${ext}`);
      toast(`Imagem ${ext.toUpperCase()} exportada com sucesso!`, 'success');
      return;
    }

    if (typeof window.JSZip === 'function') {
      const zip = new window.JSZip();
      for (let i = 0; i < total; i++) {
        toast(`Gerando ${ext.toUpperCase()}… página ${i + 1} de ${total}`, 'info');
        const { products, store: prepStore } = await preloadPageAssets(pages[i], store);
        const canvas = await captureNode(buildOffscreenPage(products, i, total, prepStore, options));
        zip.file(`encarte_${base}_p${i + 1}.${ext}`, await canvasToBlob(canvas, mime, qual));
      }
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      downloadBlob(zipBlob, `encarte_${base}_${total}pg.zip`);
      toast(`Arquivo ZIP com ${total} imagens exportado com sucesso!`, 'success');
    } else {
      for (let i = 0; i < total; i++) {
        toast(`Exportando página ${i + 1} de ${total}…`, 'info');
        const { products, store: prepStore } = await preloadPageAssets(pages[i], store);
        const canvas = await captureNode(buildOffscreenPage(products, i, total, prepStore, options));
        downloadBlob(await canvasToBlob(canvas, mime, qual), `encarte_${base}_p${i + 1}.${ext}`);
        if (i < total - 1) await _delay(800);
      }
      toast(`${total} imagens exportadas com sucesso!`, 'success');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Exportação da página atual                                           */
  /* ------------------------------------------------------------------ */

  async function exportCurrentPagePNG(prods, idx, total, store, opts) {
    await _single(prods, idx, total, store, opts, 'png');
  }

  async function exportCurrentPageJPG(prods, idx, total, store, opts) {
    await _single(prods, idx, total, store, opts, 'jpg');
  }

  async function _single(pageProducts, pageIndex, totalPages, store, options, format) {
    if (!isReady() || !pageProducts || pageProducts.length === 0) {
      toast('Sem produtos nesta página para exportar.', 'warning');
      return;
    }
    const mime  = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const qual  = format === 'jpg' ? JPEG_QUALITY : undefined;
    const base  = safeFileName(FlyerTemplates.getStoreBranding(store).name);

    toast(`Preparando imagens da página ${pageIndex + 1}…`, 'info');
    const { products, store: prepStore } = await preloadPageAssets(pageProducts, store);
    const canvas = await captureNode(buildOffscreenPage(products, pageIndex, totalPages, prepStore, options));
    downloadBlob(await canvasToBlob(canvas, mime, qual), `encarte_${base}_p${pageIndex + 1}.${format}`);
    toast(`Página ${pageIndex + 1} exportada em ${format.toUpperCase()} com sucesso!`, 'success');
  }

  /* ------------------------------------------------------------------ */
  /* API pública                                                          */
  /* ------------------------------------------------------------------ */
  return {
    isReady,
    exportPDF,
    exportPNG,
    exportJPG,
    exportCurrentPagePNG,
    exportCurrentPageJPG
  };
})();

if (typeof window !== 'undefined') {
  window.FlyerExport = FlyerExport;
}
