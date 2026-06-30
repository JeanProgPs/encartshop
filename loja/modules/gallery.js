window.GalleryManager = (() => {
  let activeProductId = null;
  let activeGalleryIndex = 0;
  let galleryImages = [];

  // Variáveis para swipe
  let touchStartX = 0;
  let touchEndX = 0;

  function init() {
    EventBus.log('GalleryManager', 'Inicializando...');
    
    // Delega evento de clique nas imagens de produto para abrir galeria
    document.addEventListener('click', (e) => {
      const imageWrap = e.target.closest('.product-image-wrap');
      if (!imageWrap) return;
      
      const card = imageWrap.closest('[data-gallery]');
      if (!card) return;
      
      const gallery = card.getAttribute('data-gallery');
      if (!gallery) return;
      
      try {
        galleryImages = JSON.parse(gallery);
        activeProductId = card.getAttribute('data-product-id');
        activeGalleryIndex = 0;
        openGalleryModal();
      } catch (err) {
        console.error('Erro ao abrir galeria:', err);
      }
    });

    EventBus.log('GalleryManager', 'Galeria inicializada');
  }

  function openGalleryModal() {
    if (!galleryImages.length) return;

    // Recupera dados do produto do catálogo
    const products = window.ProductCatalog ? window.ProductCatalog.getProducts() : [];
    const product = products.find(p => String(p.id) === String(activeProductId)) || {};
    const hasMultiple = galleryImages.length > 1;

    const isPromo = !!product.promo_price;
    const priceStr = window.UIRender ? window.UIRender.fmtPrice(product.price) : `R$ ${Number(product.price).toFixed(2).replace('.', ',')}`;
    const promoStr = product.promo_price ? (window.UIRender ? window.UIRender.fmtPrice(product.promo_price) : `R$ ${Number(product.promo_price).toFixed(2).replace('.', ',')}`) : '';
    const unit = product.unit || 'un';

    const description = product.description || '';
    const brand = product.brand || '';
    const gender = product.gender || '';
    const color = product.color || '';
    const size = product.size || '';

    const html = `
      <div id="gallery-modal-overlay" class="fashion-gallery-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(10,10,10,0.95);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;transition:opacity 0.3s ease;">
        <style>
          .gallery-modal-content {
            position: relative;
            width: 100%;
            max-width: 850px;
            background: #111113;
            border: 1px solid #27272a;
            border-radius: 12px;
            display: flex;
            flex-direction: row;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0,0,0,0.8);
            max-height: 90vh;
            color: #fff;
          }
          .gallery-left-pane {
            flex: 1.2;
            display: flex;
            flex-direction: column;
            padding: 24px;
            border-right: 1px solid #27272a;
            justify-content: center;
            background: #09090b;
            position: relative;
          }
          .gallery-right-pane {
            flex: 1;
            padding: 32px 28px;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            overflow-y: auto;
            max-height: 90vh;
          }
          .gallery-product-title {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 12px;
            color: #ffffff;
            line-height: 1.3;
          }
          .gallery-product-price-row {
            display: flex;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 20px;
          }
          .gallery-price-regular {
            font-size: 1.4rem;
            font-weight: 800;
            color: #ffffff;
          }
          .gallery-price-promo {
            font-size: 1.4rem;
            font-weight: 800;
            color: #10b981;
          }
          .gallery-price-normal {
            font-size: 0.95rem;
            text-decoration: line-through;
            color: #a1a1aa;
          }
          .gallery-product-desc-title {
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 700;
            color: #71717a;
            margin-bottom: 8px;
          }
          .gallery-product-description {
            font-size: 0.95rem;
            line-height: 1.6;
            color: #d4d4d8;
            margin-bottom: 24px;
            white-space: pre-wrap;
          }
          .gallery-info-tag {
            display: inline-flex;
            align-items: center;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 600;
            background: #27272a;
            color: #e4e4e7;
            margin-right: 8px;
            margin-bottom: 8px;
          }
          .gallery-close-btn {
            position: absolute;
            top: 16px;
            right: 16px;
            background: rgba(255, 255, 255, 0.08);
            border: none;
            color: #fff;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.1rem;
            transition: all 0.2s;
            z-index: 10;
          }
          .gallery-close-btn:hover {
            background: rgba(255, 255, 255, 0.2);
          }
          @media (max-width: 768px) {
            .gallery-modal-content {
              flex-direction: column;
              max-height: 95vh;
              overflow-y: auto;
            }
            .gallery-left-pane {
              border-right: none;
              border-bottom: 1px solid #27272a;
              padding: 16px;
            }
            .gallery-right-pane {
              padding: 20px;
              max-height: none;
            }
          }
        </style>

        <div class="gallery-modal-content" onclick="event.stopPropagation()">
          <!-- Close Button -->
          <button class="gallery-close-btn" onclick="GalleryManager.closeGallery()">✕</button>

          <!-- Left Pane (Image & Controls) -->
          <div class="gallery-left-pane">
            <div id="gallery-image-container" style="position:relative;width:100%;padding-bottom:120%;background:#18181b;border-radius:8px;overflow:hidden;margin-bottom:16px;">
              <img id="gallery-main-img" src="${escapeHTML(galleryImages[0])}" alt="${escapeHTML(product.name || 'Imagem do produto')}" 
                   style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;cursor:zoom-in;transition:opacity 0.3s ease;"
                   onerror="this.src='https://images.placeholders.dev/?width=600&height=600&text=Imagem%20Indispon%C3%ADvel'">
            </div>

            <!-- Thumbnails (Only if multiple images) -->
            ${hasMultiple ? `
              <div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px;flex-wrap:wrap;">
                ${galleryImages.map((img, i) => `
                  <div style="width:60px;height:80px;border:2px solid ${i === 0 ? '#fff' : 'transparent'};border-radius:4px;cursor:pointer;overflow:hidden;background:#18181b;opacity:${i === 0 ? '1' : '0.6'};transition:all 0.2s;" 
                       onclick="GalleryManager.selectImage(${i})" id="gallery-thumb-${i}">
                    <img src="${escapeHTML(img)}" alt="Thumbnail ${i+1}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='https://images.placeholders.dev/?width=60&height=60&text=X'">
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <!-- Navigation & Counter (Only if multiple images) -->
            ${hasMultiple ? `
              <div style="display:flex;justify-content:between;align-items:center;color:#fff;font-size:0.9rem;margin-bottom:12px;width:100%;">
                <span id="gallery-counter">${activeGalleryIndex + 1} de ${galleryImages.length}</span>
                <span style="font-size:0.8rem;opacity:0.7;margin-left:auto;">Clique nas miniaturas ou use as setas do teclado</span>
              </div>

              <!-- Prev/Next Buttons -->
              <button onclick="GalleryManager.prevImage()" 
                      style="position:absolute;left:12px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);color:#fff;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:1.2rem;display:flex;align-items:center;justify-content:center;transition:all 0.2s;" 
                      class="gallery-nav-btn"
                      onmouseover="this.style.background='rgba(0,0,0,0.7)'"
                      onmouseout="this.style.background='rgba(0,0,0,0.5)'">
                ◀
              </button>
              <button onclick="GalleryManager.nextImage()" 
                      style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);color:#fff;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:1.2rem;display:flex;align-items:center;justify-content:center;transition:all 0.2s;" 
                      class="gallery-nav-btn"
                      onmouseover="this.style.background='rgba(0,0,0,0.7)'"
                      onmouseout="this.style.background='rgba(0,0,0,0.5)'">
                ▶
              </button>
            ` : ''}
          </div>

          <!-- Right Pane (Details) -->
          <div class="gallery-right-pane">
            <h3 class="gallery-product-title">${escapeHTML(product.name || 'Sem nome')}</h3>
            
            <div class="gallery-product-price-row">
              ${isPromo 
                ? `<span class="gallery-price-promo">${promoStr}</span><span class="gallery-price-normal">${priceStr}</span>`
                : `<span class="gallery-price-regular">${priceStr}</span>`
              }
              <span style="font-size:0.85rem;color:#a1a1aa;margin-left:4px;">/${unit}</span>
            </div>

            <!-- Tags (brand, size, color, gender) if any -->
            <div style="margin-bottom:24px;">
              ${brand ? `<span class="gallery-info-tag">Marca: ${escapeHTML(brand)}</span>` : ''}
              ${gender ? `<span class="gallery-info-tag">Gênero: ${escapeHTML(gender)}</span>` : ''}
              ${color ? `<span class="gallery-info-tag">Cor: ${escapeHTML(color)}</span>` : ''}
              ${size ? `<span class="gallery-info-tag">Tamanho: ${escapeHTML(size)}</span>` : ''}
            </div>

            ${description ? `
              <div class="gallery-product-desc-title">Descrição</div>
              <div class="gallery-product-description">${escapeHTML(description)}</div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    // Remove modal anterior se existir
    const oldModal = document.getElementById('gallery-modal-overlay');
    if (oldModal) oldModal.remove();

    // Cria novo modal
    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);

    // Evento de teclado para navegação e swipe
    setTimeout(() => {
      document.addEventListener('keydown', handleGalleryKeypress);
      
      const imgContainer = document.getElementById('gallery-image-container');
      if (imgContainer) {
        imgContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
        imgContainer.addEventListener('touchend', handleTouchEnd, { passive: true });
      }
    }, 100);
  }

  function selectImage(index) {
    if (index < 0 || index >= galleryImages.length) return;
    activeGalleryIndex = index;
    updateGalleryDisplay();
  }

  function prevImage() {
    activeGalleryIndex = (activeGalleryIndex - 1 + galleryImages.length) % galleryImages.length;
    updateGalleryDisplay();
  }

  function nextImage() {
    activeGalleryIndex = (activeGalleryIndex + 1) % galleryImages.length;
    updateGalleryDisplay();
  }

  function updateGalleryDisplay() {
    const mainImg = document.getElementById('gallery-main-img');
    const counter = document.getElementById('gallery-counter');
    
    if (mainImg) {
      mainImg.src = galleryImages[activeGalleryIndex];
      mainImg.onerror = function() {
        this.src = 'https://images.placeholders.dev/?width=600&height=600&text=Imagem%20Indispon%C3%ADvel';
      };
    }
    
    if (counter) {
      counter.textContent = `${activeGalleryIndex + 1} de ${galleryImages.length}`;
    }

    // Atualiza thumbnails
    document.querySelectorAll('[id^="gallery-thumb-"]').forEach((el, i) => {
      el.style.borderColor = i === activeGalleryIndex ? '#fff' : 'transparent';
      el.style.opacity = i === activeGalleryIndex ? '1' : '0.6';
    });
  }

  function closeGallery() {
    const modal = document.getElementById('gallery-modal-overlay');
    if (modal) modal.remove();
    document.removeEventListener('keydown', handleGalleryKeypress);
    activeProductId = null;
    galleryImages = [];
  }

  function handleGalleryKeypress(e) {
    if (!document.getElementById('gallery-modal-overlay')) return;
    
    if (e.key === 'ArrowLeft') GalleryManager.prevImage();
    if (e.key === 'ArrowRight') GalleryManager.nextImage();
    if (e.key === 'Escape') GalleryManager.closeGallery();
  }

  function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
  }

  function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }

  function handleSwipe() {
    if (galleryImages.length <= 1) return;
    const threshold = 50;
    if (touchEndX < touchStartX - threshold) {
      GalleryManager.nextImage();
    }
    if (touchEndX > touchStartX + threshold) {
      GalleryManager.prevImage();
    }
  }

  // Fecha modal ao clicar no overlay
  document.addEventListener('click', (e) => {
    if (e.target.id === 'gallery-modal-overlay') {
      GalleryManager.closeGallery();
    }
  }, true);

  return {
    init,
    selectImage,
    prevImage,
    nextImage,
    closeGallery,
    openGalleryModal
  };
})();

window.GalleryManager.init();
