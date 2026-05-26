window.CampaignAnalytics = (() => {
  function renderStats(views, clicks) {
    const v = views || 0;
    const c = clicks || 0;
    const ctr = v > 0 ? ((c / v) * 100).toFixed(1) : '0.0';

    return `
      <div class="flex items-center gap-4 text-xs font-medium text-gray-500">
        <div class="flex items-center gap-1" title="Visualizações (Views)">
          <i data-lucide="eye" class="w-3.5 h-3.5 text-gray-400"></i> ${v}
        </div>
        <div class="flex items-center gap-1" title="Cliques (Clicks)">
          <i data-lucide="mouse-pointer-click" class="w-3.5 h-3.5 text-gray-400"></i> ${c}
        </div>
      </div>
      <div class="text-xs font-bold ${ctr > 2 ? 'text-green-600' : 'text-blue-500'}" title="Taxa de Conversão (Click Through Rate)">
        ${ctr}% CTR
      </div>
    `;
  }

  return { renderStats };
})();
