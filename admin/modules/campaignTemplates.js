window.CampaignTemplates = (() => {
  const templates = {
    // Fashion
    outlet: {
      title: 'OUTLET 50% OFF',
      subtitle: 'Summer Sale',
      button_text: 'Comprar Agora',
      overlay_style: 'dark',
      target_type: 'category',
      target_value: 'Outlet'
    },
    nova_colecao: {
      title: 'Nova Coleção',
      subtitle: 'Outono/Inverno',
      button_text: 'Ver Novidades',
      overlay_style: 'dark',
      target_type: 'category',
      target_value: 'Novidades'
    },
    // Market & Food
    ofertas: {
      title: 'Ofertas da Semana',
      subtitle: 'Economize mais',
      button_text: 'Aproveite',
      overlay_style: 'gradient',
      target_type: 'category',
      target_value: 'Ofertas'
    },
    combo: {
      title: 'Combo Família',
      subtitle: 'Delivery Especial',
      button_text: 'Pedir Agora',
      overlay_style: 'gradient',
      target_type: 'category',
      target_value: 'Combos'
    }
  };

  function toggleMenu() {
    const menu = document.getElementById('templates-menu');
    if (menu) {
      menu.classList.toggle('hidden');
    }
  }

  // Fecha o menu ao clicar fora
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('templates-menu');
    const btn = document.getElementById('btn-templates');
    if (menu && !menu.classList.contains('hidden')) {
      if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
        menu.classList.add('hidden');
      }
    }
  });

  function apply(id) {
    const tpl = templates[id];
    if (!tpl) return;

    document.getElementById('camp-title').value = tpl.title || '';
    document.getElementById('camp-subtitle').value = tpl.subtitle || '';
    document.getElementById('camp-btn-text').value = tpl.button_text || '';
    document.getElementById('camp-overlay').value = tpl.overlay_style || 'none';
    
    document.getElementById('camp-target-type').value = tpl.target_type || 'none';
    document.getElementById('camp-target-value').value = tpl.target_value || '';
    
    // Atualiza a visibilidade do campo de destino se a função existir no escopo global
    if (typeof window.updateTargetInput === 'function') {
      window.updateTargetInput();
    }
    
    // Atualiza preview
    if (window.CampaignPreview) {
      CampaignPreview.update();
    }
    
    const menu = document.getElementById('templates-menu');
    if (menu) menu.classList.add('hidden');
    
    if (typeof window.showToast === 'function') {
      window.showToast('Template selecionado! Ajuste a imagem e salve.', 'info');
    }
  }

  return { toggleMenu, apply, templates };
})();
