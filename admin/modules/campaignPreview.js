window.CampaignPreview = (() => {
  let mode = 'desktop'; // desktop, mobile
  let storeSegment = 'market';

  function init(segment) {
    storeSegment = segment || 'market';
    update();
  }

  function setMode(newMode) {
    mode = newMode;
    const btnD = document.getElementById('prev-btn-desktop');
    const btnM = document.getElementById('prev-btn-mobile');
    
    if(mode === 'desktop') {
      btnD.classList.remove('text-gray-500');
      btnD.classList.add('bg-gray-100', 'text-gray-800');
      btnM.classList.remove('bg-gray-100', 'text-gray-800');
      btnM.classList.add('text-gray-500');
    } else {
      btnM.classList.remove('text-gray-500');
      btnM.classList.add('bg-gray-100', 'text-gray-800');
      btnD.classList.remove('bg-gray-100', 'text-gray-800');
      btnD.classList.add('text-gray-500');
    }
    update();
  }

  function update() {
    const container = document.getElementById('preview-container');
    if (!container) return;

    const title = document.getElementById('camp-title').value;
    const subtitle = document.getElementById('camp-subtitle').value;
    const btnText = document.getElementById('camp-btn-text').value;
    const overlay = document.getElementById('camp-overlay').value;
    const imageUrl = document.getElementById('desktop-url').value;
    const status = document.getElementById('camp-status').value;

    if (!imageUrl) {
      container.innerHTML = `<div class="text-gray-400 text-sm flex flex-col items-center gap-2">
        <i data-lucide="image" class="w-8 h-8"></i>
        Faça o upload da imagem para ver o preview
      </div>`;
      if(window.lucide) lucide.createIcons();
      return;
    }

    // Desktop: largura máxima para preview; Mobile: tamanho reduzido e responsivo
    const widthClass = mode === 'desktop'
      ? 'w-full max-w-[800px] h-[300px] md:h-[400px] rounded-lg'
      : 'w-full max-w-[360px] h-[160px] sm:h-[200px] rounded-2xl border-8 border-gray-800 shadow-2xl';
    
    let overlayHtml = '';
    let contentHtml = '';
    
    if (storeSegment === 'fashion' && overlay === 'dark') {
      overlayHtml = `<div class="absolute inset-0 bg-black/40 transition-opacity"></div>`;
      contentHtml = `
        <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-white fade-in">
          ${subtitle ? `<p class="text-xs md:text-sm font-light tracking-[0.2em] uppercase mb-2 opacity-90">${escapeHTML(subtitle)}</p>` : ''}
          ${title ? `<h2 class="text-3xl md:text-5xl font-serif font-bold mb-6 drop-shadow-lg">${escapeHTML(title)}</h2>` : ''}
          ${btnText ? `<button class="bg-white text-black px-8 py-3 text-sm font-semibold tracking-widest uppercase hover:bg-gray-100 transition-colors shadow-xl">${escapeHTML(btnText)}</button>` : ''}
        </div>
      `;
    } else if (overlay === 'gradient') {
      overlayHtml = `<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>`;
      contentHtml = `
        <div class="absolute inset-x-0 bottom-0 p-6 md:p-8 flex flex-col items-start text-white fade-in">
          ${subtitle ? `<p class="text-accent text-sm md:text-base font-bold mb-1 uppercase drop-shadow-md">${escapeHTML(subtitle)}</p>` : ''}
          ${title ? `<h2 class="text-2xl md:text-4xl font-bold mb-4 drop-shadow-xl leading-tight">${escapeHTML(title)}</h2>` : ''}
          ${btnText ? `<button class="bg-accent text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-xl hover:bg-accent/90 transition-colors">${escapeHTML(btnText)}</button>` : ''}
        </div>
      `;
    } else {
      contentHtml = `
        <div class="absolute inset-x-0 bottom-0 p-6 flex flex-col items-start text-white drop-shadow-2xl fade-in">
          ${title ? `<h2 class="text-xl md:text-3xl font-bold mb-3">${escapeHTML(title)}</h2>` : ''}
          ${btnText ? `<button class="bg-black/60 backdrop-blur-md border border-white/30 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-black/80">${escapeHTML(btnText)}</button>` : ''}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="${widthClass} relative overflow-hidden bg-gray-200 transition-all duration-500 flex-shrink-0 ${status === 'false' ? 'opacity-50 grayscale' : ''}">
        <img src="${escapeHTML(imageUrl)}" class="w-full h-full object-cover transition-transform duration-700 hover:scale-105">
        ${overlayHtml}
        ${contentHtml}
        ${status === 'false' ? `<div class="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded shadow-md z-10">INATIVO</div>` : ''}
      </div>
    `;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  return { init, update, setMode };
})();
