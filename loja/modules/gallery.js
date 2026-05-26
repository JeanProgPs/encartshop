/**
 * EncartShop — Gallery Manager for FASHION segment
 * Gerencia galeria simples de imagens para produtos FASHION
 */

window.GalleryManager = (() => {
  let activeProductId = null;
  let activeGalleryIndex = 0;
  let galleryImages = [];

  function init() {
    EventBus.log('GalleryManager', 'Inicializando...');
    
    // Delega evento de clique nas imagens de produto para abrir galeria
    document.addEventListener('click', (e) => {
      const card = e.target.closest('[data-gallery]');
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

    const html = `
      <div id="gallery-modal-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;">
        <div style="position:relative;width:100%;max-width:600px;display:flex;flex-direction:column;">
          <!-- Main Image -->
          <div style="position:relative;width:100%;padding-bottom:100%;background:rgba(0,0,0,0.5);border-radius:12px;overflow:hidden;margin-bottom:12px;">
            <img id="gallery-main-img" src="${escapeHTML(galleryImages[0])}" alt="Imagem do produto" 
                 style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;cursor:zoom-in;"
                 onerror="this.src='https://images.placeholders.dev/?width=600&height=600&text=Imagem%20Indispon%C3%ADvel'">
          </div>

          <!-- Thumbnails -->
          ${galleryImages.length > 1 ? `
            <div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px;flex-wrap:wrap;">
              ${galleryImages.map((img, i) => `
                <div style="width:60px;height:60px;border:2px solid ${i === 0 ? 'var(--accent, #4f46e5)' : 'transparent'};border-radius:8px;cursor:pointer;overflow:hidden;background:rgba(0,0,0,0.3);" 
                     onclick="GalleryManager.selectImage(${i})">
                  <img src="${escapeHTML(img)}" alt="Thumbnail ${i+1}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='https://images.placeholders.dev/?width=60&height=60&text=X'">
                </div>
              `).join('')}
            </div>
          ` : ''}

          <!-- Navigation -->
          <div style="display:flex;justify-content:space-between;align-items:center;color:#fff;font-size:0.9rem;margin-bottom:12px;">
            <span id="gallery-counter">${activeGalleryIndex + 1} de ${galleryImages.length}</span>
            <span style="font-size:0.8rem;opacity:0.7;">Deslize ou clique nas miniaturas</span>
          </div>

          <!-- Close Button -->
          <button onclick="GalleryManager.closeGallery()" 
                  style="position:absolute;top:-40px;right:0;background:rgba(255,255,255,0.2);border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.5rem;transition:all 0.2s;">
            ✕
          </button>

          <!-- Prev/Next Buttons (mobile-friendly) -->
          ${galleryImages.length > 1 ? `
            <button onclick="GalleryManager.prevImage()" 
                    style="position:absolute;left:-50px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.2);border:none;color:#fff;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:1.5rem;display:none;align-items:center;justify-content:center;transition:all 0.2s;" 
                    class="gallery-nav-btn"
                    onmouseover="this.style.background='rgba(255,255,255,0.4)'"
                    onmouseout="this.style.background='rgba(255,255,255,0.2)'">
              ◀
            </button>
            <button onclick="GalleryManager.nextImage()" 
                    style="position:absolute;right:-50px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.2);border:none;color:#fff;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:1.5rem;display:none;align-items:center;justify-content:center;transition:all 0.2s;" 
                    class="gallery-nav-btn"
                    onmouseover="this.style.background='rgba(255,255,255,0.4)'"
                    onmouseout="this.style.background='rgba(255,255,255,0.2)'">
              ▶
            </button>
          ` : ''}
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

    // Evento de teclado para navegação
    setTimeout(() => {
      document.addEventListener('keydown', handleGalleryKeypress);
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

    // Atualiza border dos thumbnails
    document.querySelectorAll('#gallery-modal-overlay [onclick*="selectImage"]').forEach((el, i) => {
      el.style.borderColor = i === activeGalleryIndex ? 'var(--accent, #4f46e5)' : 'transparent';
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
