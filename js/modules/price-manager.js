/**
 * EncartShop — PriceManager
 * Fase 1: Interface de Gestão de Preços (SOMENTE PRÉVIA — sem gravação no banco)
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  REGRA ABSOLUTA DESTA FASE                                      ║
 * ║                                                                  ║
 * ║  Este módulo NÃO grava nada no banco de dados.                  ║
 * ║  Todos os reajustes são simulações locais em memória.           ║
 * ║  ProductAPI.update() NÃO é chamado em nenhuma circunstância.   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Responsabilidades:
 *   - Carregar produtos via ProductAPI.getByStore() (leitura apenas)
 *   - Aplicar reajustes percentuais e por valor fixo em memória
 *   - Permitir edição manual de preços inline
 *   - Exibir prévia antes/depois
 *   - Validar preços (sem negativos, sem zero, precisão monetária)
 */

window.PriceManager = (() => {

  // ── Estado ───────────────────────────────────────────────
  let _storeId   = null;
  let _allProds  = [];          // produtos originais do banco (imutável nesta fase)
  let _filtered  = [];          // produtos visíveis após filtros
  let _prices    = new Map();   // id → { price, promo_price } — estado editado em memória
  let _selected  = new Set();   // ids selecionados

  // ── Precisão monetária ───────────────────────────────────
  /**
   * Arredonda para 2 casas decimais usando lógica de centavos
   * para evitar erros de ponto flutuante (ex: 1.005 → 1.01).
   */
  function _round(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function _fmt(v) {
    if (v === null || v === undefined || v === '') return '—';
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function _fmtInput(v) {
    if (v === null || v === undefined || v === '') return '';
    return Number(v).toFixed(2);
  }

  // ── Inicialização ────────────────────────────────────────
  async function init(storeId) {
    _storeId = storeId;
    _setState('loading');

    try {
      const prods = await EncartAPI.ProductAPI.getByStore(storeId);
      _allProds = Array.isArray(prods) ? prods : [];

      // Inicializa o mapa de preços com os valores originais do banco
      _prices.clear();
      _allProds.forEach(p => {
        _prices.set(p.id, {
          price:      p.price,
          promo_price: p.promo_price ?? null,
        });
      });

      _populateCategoryFilter();
      applyFilters();

      document.getElementById('lbl-count')?.classList.remove('hidden');
      _updateCountLabel();

    } catch (err) {
      console.error('[PriceManager] Falha ao carregar produtos:', err);
      showToast('Não foi possível carregar os produtos.', 'error');
      _setState('empty');
    }
  }

  // ── Filtros ──────────────────────────────────────────────
  function applyFilters() {
    const query   = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    const cat     = document.getElementById('cat-filter')?.value  || '';
    const status  = document.getElementById('status-filter')?.value || '';

    _filtered = _allProds.filter(p => {
      if (query && !(p.name || '').toLowerCase().includes(query) &&
                  !(p.category || '').toLowerCase().includes(query)) return false;
      if (cat && (p.category || '').trim() !== cat) return false;
      if (status === 'active'   && !p.active) return false;
      if (status === 'inactive' && p.active)  return false;
      if (status === 'promo'    && !p.promo_price) return false;
      return true;
    });

    _renderTable();
    _updateCountLabel();
    _syncSelectAll();
    document.getElementById('lbl-filtered').textContent =
      _filtered.length !== _allProds.length
        ? `Mostrando ${_filtered.length} de ${_allProds.length}`
        : `${_allProds.length} produto(s)`;
  }

  function _populateCategoryFilter() {
    const sel = document.getElementById('cat-filter');
    if (!sel) return;
    const cats = [...new Set(_allProds.map(p => p.category).filter(Boolean))].sort();
    // Remove opções antigas (mantém a primeira "Todas as categorias")
    while (sel.options.length > 1) sel.remove(1);
    cats.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  }

  // ── Seleção ──────────────────────────────────────────────
  function toggleSelectAll(checked) {
    if (checked) {
      _filtered.forEach(p => _selected.add(p.id));
    } else {
      _filtered.forEach(p => _selected.delete(p.id));
    }
    _renderTable();
    _updateSelectionUI();
  }

  function toggleRow(id, checked) {
    if (checked) _selected.add(id);
    else          _selected.delete(id);
    _syncSelectAll();
    _updateSelectionUI();
    // Atualiza classe da linha sem re-renderizar tudo
    const row = document.getElementById(`row-${id}`);
    if (row) row.classList.toggle('row-selected', checked);
  }

  function clearSelection() {
    _selected.clear();
    _renderTable();
    _updateSelectionUI();
  }

  function _syncSelectAll() {
    const cb = document.getElementById('select-all');
    if (!cb) return;
    const visibleSelected = _filtered.filter(p => _selected.has(p.id)).length;
    cb.checked       = _filtered.length > 0 && visibleSelected === _filtered.length;
    cb.indeterminate = visibleSelected > 0 && visibleSelected < _filtered.length;
  }

  function _updateSelectionUI() {
    const n = _selected.size;
    const lblSel     = document.getElementById('lbl-selected');
    const massAct    = document.getElementById('mass-actions');
    const toolbar    = document.getElementById('adjust-toolbar');
    const btnPreview = document.getElementById('btn-preview');

    if (lblSel) {
      lblSel.textContent = `${n} selecionado(s)`;
      lblSel.classList.toggle('hidden', n === 0);
    }
    if (massAct)    massAct.classList.toggle('hidden', n === 0);
    if (toolbar)    toolbar.classList.toggle('toolbar-hidden', n === 0);
    if (btnPreview) btnPreview.classList.toggle('hidden', n === 0);
    if (btnPreview) btnPreview.style.display = n > 0 ? 'flex' : 'none';
  }

  // ── Edição inline de preço ───────────────────────────────
  function onPriceInput(id, field, input) {
    const raw = parseFloat(input.value);
    const current = _prices.get(id) || {};
    const original = _allProds.find(p => p.id === id);
    if (!original) return;

    input.classList.remove('invalid');

    if (isNaN(raw) || raw < 0) {
      input.classList.add('invalid');
      return;
    }

    // promo_price pode ser 0 (significa "remover promoção") ou > 0
    if (field === 'price' && raw <= 0) {
      input.classList.add('invalid');
      showToast('O preço normal deve ser maior que zero.', 'warning');
      return;
    }

    const newValue = raw === 0 ? null : _round(raw);
    _prices.set(id, { ...current, [field]: newValue });

    // Atualiza diff badge da linha sem re-renderizar tudo
    _updateRowDiff(id, original);
  }

  function _updateRowDiff(id, original) {
    const edited = _prices.get(id);
    if (!edited) return;

    const diffEl = document.getElementById(`diff-${id}`);
    if (diffEl) diffEl.innerHTML = _diffBadge(original.price, edited.price);

    const row = document.getElementById(`row-${id}`);
    if (!row) return;

    const priceChanged  = edited.price !== original.price;
    // Normaliza undefined → null para comparação correcta
    const origPromo     = original.promo_price ?? null;
    const promoRemoved  = origPromo && !edited.promo_price;
    const promoChanged  = edited.promo_price !== origPromo;

    row.classList.toggle('row-changed',      priceChanged || promoChanged);
    row.classList.toggle('row-promo-removed', promoRemoved);
  }

  // ── Reajuste em massa ────────────────────────────────────
  function applyAdjustment() {
    if (_selected.size === 0) {
      showToast('Selecione pelo menos um produto para aplicar o reajuste.', 'warning');
      return;
    }

    const type   = document.getElementById('adj-type')?.value;
    const target = document.getElementById('adj-target')?.value;
    const rawVal = parseFloat(document.getElementById('adj-value')?.value);

    if (isNaN(rawVal) || rawVal <= 0) {
      showToast('Informe um valor válido para o reajuste.', 'warning');
      return;
    }

    let applied = 0;
    let skipped = 0;

    _selected.forEach(id => {
      const original = _allProds.find(p => p.id === id);
      if (!original) return;

      const current = _prices.get(id) || { price: original.price, promo_price: original.promo_price };

      const calc = (base) => {
        if (base === null || base === undefined) return null;
        let result;
        switch (type) {
          case 'pct_up':   result = _round(base * (1 + rawVal / 100)); break;
          case 'pct_down': result = _round(base * (1 - rawVal / 100)); break;
          case 'val_up':   result = _round(base + rawVal); break;
          case 'val_down': result = _round(base - rawVal); break;
          default:         result = base;
        }
        return result;
      };

      let newPrice      = current.price;
      let newPromo      = current.promo_price;

      if (target === 'price' || target === 'both') {
        const candidate = calc(current.price);
        if (candidate !== null && candidate > 0) {
          newPrice = candidate;
        } else {
          skipped++;
          return; // preço resultaria em valor inválido — pula este produto
        }
      }

      if (target === 'promo_price' || target === 'both') {
        if (current.promo_price !== null) {
          const candidate = calc(current.promo_price);
          newPromo = (candidate !== null && candidate > 0) ? candidate : null;
        }
      }

      _prices.set(id, { price: newPrice, promo_price: newPromo });
      applied++;
    });

    _renderTable();

    if (skipped > 0) {
      showToast(`Reajuste aplicado em ${applied} produto(s). ${skipped} ignorado(s) — resultado seria inválido.`, 'warning');
    } else {
      showToast(`Reajuste calculado para ${applied} produto(s). Confira a prévia.`, 'success');
    }
  }

  function resetPrices() {
    if (_selected.size === 0) {
      showToast('Selecione os produtos cujos preços deseja restaurar.', 'warning');
      return;
    }
    _selected.forEach(id => {
      const original = _allProds.find(p => p.id === id);
      if (original) {
        _prices.set(id, { price: original.price, promo_price: original.promo_price ?? null });
      }
    });
    _renderTable();
    showToast('Preços originais restaurados para os produtos selecionados.', 'info');
  }

  // ── Renderização da tabela ───────────────────────────────
  function _renderTable() {
    const tbody = document.getElementById('price-tbody');
    if (!tbody) return;

    if (_filtered.length === 0) {
      tbody.innerHTML = '';
      _setState('empty');
      return;
    }
    _setState('table');

    tbody.innerHTML = _filtered.map(p => {
      const edited    = _prices.get(p.id) || { price: p.price, promo_price: p.promo_price ?? null };
      const isSel     = _selected.has(p.id);
      const original  = _allProds.find(o => o.id === p.id) || p;

      const priceChanged = edited.price !== original.price;
      const promoChanged = edited.promo_price !== (original.promo_price ?? null);
      const promoRemoved = original.promo_price && !edited.promo_price;

      const rowClass = [
        isSel         ? 'row-selected'      : '',
        priceChanged || promoChanged ? 'row-changed' : '',
        promoRemoved  ? 'row-promo-removed' : '',
      ].filter(Boolean).join(' ');

      const activeTag = !p.active
        ? '<span class="text-[10px] font-semibold text-textSecondary bg-bgPrimary border border-borderColor px-1.5 py-0.5 rounded-full ml-1">Inativo</span>'
        : '';

      return `
        <tr id="row-${p.id}" class="${rowClass}">
          <td class="text-center">
            <input type="checkbox" ${isSel ? 'checked' : ''}
              onchange="PriceManager.toggleRow('${p.id}', this.checked)"
              class="w-4 h-4 rounded">
          </td>
          <td>
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-textPrimary max-w-[200px] truncate"
                title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</span>
              ${activeTag}
              ${promoRemoved ? '<span class="text-[10px] font-semibold text-danger bg-danger/10 border border-danger/20 px-1.5 py-0.5 rounded-full">Promo removida</span>' : ''}
            </div>
          </td>
          <td>
            <span class="text-xs text-textSecondary">${escapeHTML(p.category || '—')}</span>
          </td>
          <td class="text-right">
            <span class="text-sm font-mono text-textPrimary">${_fmt(original.price)}</span>
          </td>
          <td class="text-right">
            <span class="text-sm font-mono ${original.promo_price ? 'text-warning' : 'text-textSecondary'}">
              ${original.promo_price ? _fmt(original.promo_price) : '—'}
            </span>
          </td>
          <td class="text-right">
            <input type="number" min="0.01" step="0.01"
              value="${_fmtInput(edited.price)}"
              class="price-input ${priceChanged ? 'border-accent/50' : ''}"
              oninput="PriceManager.onPriceInput('${p.id}', 'price', this)"
              title="Novo preço normal">
          </td>
          <td class="text-right">
            <input type="number" min="0" step="0.01"
              value="${_fmtInput(edited.promo_price)}"
              placeholder="sem promo"
              class="price-input ${promoChanged ? 'border-warning/50' : ''}"
              oninput="PriceManager.onPriceInput('${p.id}', 'promo_price', this)"
              title="Novo preço promocional (deixe vazio para remover)">
          </td>
          <td class="text-right" id="diff-${p.id}">
            ${_diffBadge(original.price, edited.price)}
          </td>
        </tr>`;
    }).join('');

    // Reaplicar lucide nos ícones (não há ícones nas linhas, mas mantemos por padrão)
    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 10);
  }

  function _diffBadge(before, after) {
    if (before === after || after === null || after === undefined) {
      return `<span class="diff-badge diff-none">—</span>`;
    }
    const diff = _round(after - before);
    const pct  = before > 0 ? _round((diff / before) * 100) : 0;
    const sign = diff > 0 ? '+' : '';
    const cls  = diff > 0 ? 'diff-up' : 'diff-down';
    const arrow = diff > 0 ? '↑' : '↓';
    return `<span class="diff-badge ${cls}">${arrow} ${sign}${pct}%</span>`;
  }

  // ── Validação de payload antes de enviar ao RPC ─────────────
  /**
   * Valida todos os valores finais antes de montar o payload para o RPC.
   * Detecta promo >= price (incluindo dados antigos inconsistentes)
   * e exige ação explícita do usuário — não converte automaticamente.
   *
   * @param {Array} changedProducts — resultado de _getChangedProducts()
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function _validatePayload(changedProducts) {
    const errors = [];
    changedProducts.forEach(({ original, edited }) => {
      const name = escapeHTML(original.name || original.id);

      if (!edited.price || edited.price <= 0) {
        errors.push(`"${name}": preço normal deve ser maior que zero.`);
        return;
      }
      if (edited.price > 999999.99) {
        errors.push(`"${name}": preço normal excede o limite de R$ 999.999,99.`);
        return;
      }
      if (edited.promo_price !== null && edited.promo_price !== undefined) {
        if (edited.promo_price <= 0) {
          errors.push(`"${name}": preço promocional deve ser maior que zero ou removido.`);
        } else if (edited.promo_price >= edited.price) {
          errors.push(
            `"${name}": preço promocional (${_fmt(edited.promo_price)}) deve ser ` +
            `menor que o preço normal (${_fmt(edited.price)}). ` +
            `Corrija o valor ou remova a promoção deixando o campo vazio.`
          );
        }
      }
    });
    return { valid: errors.length === 0, errors };
  }

  // ── Confirmação e gravação real ───────────────────────────────
  /**
   * Exibe o modal de confirmação final com campo de motivo.
   * Valida o payload antes de mostrar — não abre o modal se houver erros.
   * A gravação real ocorre em confirmSave(), chamado pelo botão do modal.
   */
  function showPreview() {
    const changed = _getChangedProducts();
    const modal   = document.getElementById('preview-modal');
    const body    = document.getElementById('preview-body');
    if (!modal || !body) return;

    if (changed.length === 0) {
      showToast('Nenhuma alteração de preço para prévia. Aplique um reajuste primeiro.', 'info');
      return;
    }

    // Valida antes de abrir o modal
    const { valid, errors } = _validatePayload(changed);
    if (!valid) {
      _showValidationErrors(errors);
      return;
    }

    const rows = changed.map(({ original, edited }) => {
      const promoRemoved = (original.promo_price ?? null) && !edited.promo_price;
      const promoAdded   = !(original.promo_price ?? null) && edited.promo_price;
      const promoLabel   = promoRemoved
        ? `<span class="text-danger text-xs font-semibold">← Promoção removida</span>`
        : promoAdded
          ? `<span class="text-success text-xs font-semibold">← Promoção adicionada</span>`
          : '';

      return `
        <tr class="border-b border-borderColor last:border-0">
          <td class="py-3 pr-4">
            <div class="text-sm font-medium text-textPrimary max-w-[220px] truncate"
              title="${escapeHTML(original.name)}">${escapeHTML(original.name)}</div>
            <div class="text-xs text-textSecondary">${escapeHTML(original.category || '—')}</div>
          </td>
          <td class="py-3 px-2 text-right">
            <div class="text-xs text-textSecondary line-through">${_fmt(original.price)}</div>
            <div class="text-sm font-bold text-textPrimary">${_fmt(edited.price)}</div>
          </td>
          <td class="py-3 px-2 text-right">
            <div class="text-xs text-textSecondary line-through">
              ${(original.promo_price ?? null) ? _fmt(original.promo_price) : '—'}
            </div>
            <div class="text-sm font-semibold ${edited.promo_price ? 'text-warning' : 'text-textSecondary'}">
              ${edited.promo_price ? _fmt(edited.promo_price) : '—'}
            </div>
            ${promoLabel}
          </td>
          <td class="py-3 pl-2 text-right">
            ${_diffBadge(original.price, edited.price)}
          </td>
        </tr>`;
    }).join('');

    body.innerHTML = `
      <div class="mb-4 px-3 py-2.5 bg-info/10 border border-info/20 rounded-lg
                  text-xs text-info font-semibold flex items-center gap-2">
        <i data-lucide="info" class="w-3.5 h-3.5 flex-shrink-0"></i>
        ${changed.length} produto(s) serão atualizados. Esta operação não pode ser desfeita
        automaticamente — use o histórico para restaurar se necessário.
      </div>
      <table class="w-full">
        <thead>
          <tr class="border-b border-borderColor">
            <th class="py-2 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">Produto</th>
            <th class="py-2 px-2 text-right text-xs font-semibold text-textSecondary uppercase tracking-wider">Preço</th>
            <th class="py-2 px-2 text-right text-xs font-semibold text-textSecondary uppercase tracking-wider">Promoção</th>
            <th class="py-2 pl-2 text-right text-xs font-semibold text-textSecondary uppercase tracking-wider">Δ</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="mt-5 flex flex-col gap-1.5">
        <label class="text-xs font-semibold text-textSecondary uppercase tracking-wider">
          Motivo do reajuste (opcional)
        </label>
        <input id="confirm-reason" type="text" maxlength="120"
          placeholder="Ex: Reajuste dez/2026 +10%"
          class="w-full bg-bgPrimary border border-borderColor rounded-lg px-3 py-2
                 text-sm text-textPrimary focus:outline-none focus:border-accent transition-colors">
      </div>
      <div class="mt-3 text-xs text-textSecondary text-right">
        ${changed.length} produto(s) com alteração
      </div>`;

    // Habilita o botão de salvar no modal
    const btnSave = document.getElementById('btn-save-real');
    if (btnSave) {
      btnSave.disabled  = false;
      btnSave.className = btnSave.className
        .replace('bg-textSecondary/20 text-textSecondary cursor-not-allowed', '')
        .trim() +
        ' bg-accent text-white hover:bg-accent/90 cursor-pointer';
    }

    modal.classList.remove('hidden');
    setTimeout(() => { if (window.lucide) window.lucide.createIcons({ nodes: [body] }); }, 10);
  }

  function closePreview() {
    document.getElementById('preview-modal')?.classList.add('hidden');
    // Restaura o botão ao fechar
    const btnSave = document.getElementById('btn-save-real');
    if (btnSave) {
      btnSave.disabled  = true;
      btnSave.className = btnSave.className
        .replace('bg-accent text-white hover:bg-accent/90 cursor-pointer', '')
        .trim() +
        ' bg-textSecondary/20 text-textSecondary cursor-not-allowed';
    }
  }

  // ── Modal de erros de validação ──────────────────────────────
  function _showValidationErrors(errors) {
    const modal = document.getElementById('preview-modal');
    const body  = document.getElementById('preview-body');
    if (!modal || !body) return;

    body.innerHTML = `
      <div class="px-3 py-2.5 bg-danger/10 border border-danger/20 rounded-lg
                  text-xs text-danger font-semibold flex items-center gap-2 mb-4">
        <i data-lucide="alert-triangle" class="w-3.5 h-3.5 flex-shrink-0"></i>
        Corrija os problemas abaixo antes de confirmar.
      </div>
      <ul class="flex flex-col gap-2">
        ${errors.map(e => `
          <li class="flex items-start gap-2 text-sm text-textPrimary">
            <span class="text-danger mt-0.5 flex-shrink-0">•</span>
            <span>${e}</span>
          </li>`).join('')}
      </ul>
      <p class="mt-4 text-xs text-textSecondary">
        Edite os preços na tabela e tente novamente.
      </p>`;

    // Desabilita o botão de salvar no modal de erros
    const btnSave = document.getElementById('btn-save-real');
    if (btnSave) btnSave.disabled = true;

    modal.classList.remove('hidden');
    setTimeout(() => { if (window.lucide) window.lucide.createIcons({ nodes: [body] }); }, 10);
  }

  // ── Gravação real via RPC ─────────────────────────────────────
  /**
   * Chamado pelo botão "Salvar Preços" no modal de confirmação.
   * Monta o payload, chama supabase.rpc('bulk_update_prices') e
   * recarrega os dados após sucesso.
   *
   * Payload enviado: [{ product_id, price, promo_price }]
   *   - price_before e promo_before NÃO são enviados
   *     (lidos pelo servidor diretamente do banco)
   *   - promo_price = null (JSON null) para remoção intencional
   *   - promo_price = número para novo valor
   */
  async function confirmSave() {
    const btnSave = document.getElementById('btn-save-real');
    if (btnSave) btnSave.disabled = true;

    const changed = _getChangedProducts();
    if (changed.length === 0) {
      showToast('Nenhuma alteração para salvar.', 'info');
      closePreview();
      return;
    }

    // Validação final antes de enviar (defesa em profundidade)
    const { valid, errors } = _validatePayload(changed);
    if (!valid) {
      _showValidationErrors(errors);
      return;
    }

    const reason      = document.getElementById('confirm-reason')?.value?.trim() || null;
    const operationId = _generateUUID();

    const payload = changed.map(({ original, edited }) => ({
      product_id:  original.id,
      price:       edited.price,
      // promo_price: null (JSON null) = remoção; número = novo valor
      promo_price: edited.promo_price ?? null,
    }));

    // Estado de carregamento
    if (btnSave) {
      btnSave.innerHTML =
        '<svg style="width:14px;height:14px;animation:encart-spin 0.8s linear infinite" ' +
        'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
        '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83' +
        'M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>' +
        '&nbsp;Salvando...';
    }

    try {
      const { data, error } = await window.sb.rpc('bulk_update_prices', {
        p_updates:       payload,
        p_operation_id:  operationId,
        p_reason:        reason,
      });

      if (error) throw error;

      closePreview();
      showToast(
        `✅ ${data?.updated ?? changed.length} produto(s) atualizados com sucesso.`,
        'success'
      );

      // Recarrega produtos do banco — atualiza _allProds com novos valores
      await init(_storeId);

    } catch (err) {
      console.error('[PriceManager] confirmSave error:', err);
      // Nunca expõe detalhes do stack ao usuário
      const msg = err?.message?.length < 300
        ? err.message
        : 'Erro ao salvar. Nenhum preço foi alterado — tente novamente.';
      showToast(`Erro: ${msg}`, 'error');

      // Restaura botão para nova tentativa
      if (btnSave) {
        btnSave.disabled  = false;
        btnSave.innerHTML =
          '<i data-lucide="save" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:4px"></i>' +
          'Salvar Preços';
        setTimeout(() => { if (window.lucide) window.lucide.createIcons({ nodes: [btnSave] }); }, 10);
      }
    }
  }

  // ── Gerador de UUID v4 para operation_id ─────────────────────
  function _generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback para navegadores sem crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function _getChangedProducts() {
    return _allProds
      .filter(p => {
        const edited = _prices.get(p.id);
        if (!edited) return false;
        const priceChanged = edited.price !== p.price;
        // Normaliza undefined → null para comparação correcta
        const promoChanged = edited.promo_price !== (p.promo_price ?? null);
        return priceChanged || promoChanged;
      })
      .map(p => ({
        original: p,
        edited:   _prices.get(p.id),
      }));
  }

  // ── Estado da UI ─────────────────────────────────────────
  function _setState(state) {
    const loading = document.getElementById('state-loading');
    const empty   = document.getElementById('state-empty');
    const wrap    = document.getElementById('table-wrap');
    const tbody   = document.getElementById('price-tbody');

    if (loading) loading.classList.toggle('hidden', state !== 'loading');
    if (empty)   empty.classList.toggle('hidden', state !== 'empty');
    if (tbody)   tbody.style.display = state === 'table' ? '' : 'none';
  }

  function _updateCountLabel() {
    const lbl = document.getElementById('lbl-count');
    if (!lbl) return;
    lbl.textContent = `${_allProds.length} produto(s)`;
  }

  // ── API Pública ──────────────────────────────────────────
  return {
    init,
    applyFilters,
    toggleSelectAll,
    toggleRow,
    clearSelection,
    onPriceInput,
    applyAdjustment,
    resetPrices,
    showPreview,
    closePreview,
    confirmSave,
  };

})();
