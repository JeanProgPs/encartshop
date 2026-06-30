/**
 * EncartShop — Customers Module
 * Lógica de negócio para a tela de Clientes.
 */

const CustomersModule = (() => {

  function fmtPrice(v) {
    if (v === undefined || v === null) return 'R$ 0,00';
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtPhone(phone) {
    if (!phone) return '—';
    const d = phone.replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return phone;
  }

  function getInitials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  }

  function avatarColor(name) {
    const palette = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
    if (!name) return palette[0];
    const idx = name.charCodeAt(0) % palette.length;
    return palette[idx];
  }

  async function getAll(storeId, options = {}) {
    return await EncartAPI.CustomerAPI.getByStore(storeId, options);
  }

  async function search(storeId, query) {
    return await EncartAPI.CustomerAPI.search(storeId, query);
  }

  async function getById(id) {
    return await EncartAPI.CustomerAPI.getById(id);
  }

  async function getOrderHistory(customerId, storeId) {
    return await EncartAPI.CustomerAPI.getOrdersByCustomer(customerId, storeId);
  }

  async function getCount(storeId) {
    return await EncartAPI.CustomerAPI.countByStore(storeId);
  }

  function getTicketMedio(customer) {
    if (!customer || !customer.total_pedidos || customer.total_pedidos === 0) return 0;
    return (customer.total_gasto || 0) / customer.total_pedidos;
  }

  function renderRow(customer) {
    const initials = getInitials(customer.nome);
    const color    = avatarColor(customer.nome);
    const phone    = fmtPhone(customer.telefone);
    const lastDate = fmtDate(customer.ultimo_pedido);
    const spent    = fmtPrice(customer.total_gasto);
    const name     = customer.nome || 'Cliente sem nome';

    return `
      <tr class="customer-row" data-id="${customer.id}" onclick="CustomersModule.openDetail('${customer.id}')">
        <td>
          <div class="customer-cell">
            <div class="customer-avatar" style="background:${color}">${initials}</div>
            <div class="customer-info">
              <div class="customer-name">${escapeHTML(name)}</div>
              <div class="customer-phone">${escapeHTML(phone)}</div>
            </div>
          </div>
        </td>
        <td class="hide-mobile"><span class="customer-phone-pill">${escapeHTML(phone)}</span></td>
        <td class="text-center"><span class="orders-badge">${customer.total_pedidos || 0}</span></td>
        <td class="text-right font-mono">${spent}</td>
        <td class="hide-mobile text-muted">${lastDate}</td>
        <td>
          <button class="btn-detail" onclick="event.stopPropagation();CustomersModule.openDetail('${customer.id}')">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </td>
      </tr>`;
  }

  function renderCard(customer) {
    const initials = getInitials(customer.nome);
    const color    = avatarColor(customer.nome);
    const phone    = fmtPhone(customer.telefone);
    const lastDate = fmtDate(customer.ultimo_pedido);
    const spent    = fmtPrice(customer.total_gasto);
    const name     = customer.nome || 'Cliente sem nome';

    return `
      <div class="customer-card" onclick="CustomersModule.openDetail('${customer.id}')">
        <div class="customer-card-header">
          <div class="customer-avatar lg" style="background:${color}">${initials}</div>
          <div class="customer-card-info">
            <div class="customer-name">${escapeHTML(name)}</div>
            <div class="customer-phone">${escapeHTML(phone)}</div>
          </div>
          <svg class="card-arrow" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        <div class="customer-card-stats">
          <div class="stat-item">
            <span class="stat-label">Pedidos</span>
            <span class="stat-value">${customer.total_pedidos || 0}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Gasto</span>
            <span class="stat-value accent">${spent}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Último Pedido</span>
            <span class="stat-value">${lastDate}</span>
          </div>
        </div>
      </div>`;
  }

  let _detailCache = {};

  async function openDetail(customerId) {
    const overlay = document.getElementById('detail-overlay');
    const panel   = document.getElementById('detail-panel');
    if (!overlay || !panel) return;

    panel.innerHTML = `<div class="detail-loading"><div class="spinner"></div></div>`;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    const storeId = window._customersStoreId;
    const customer = await getById(customerId);
    if (!customer) {
      panel.innerHTML = `<div class="detail-error">Cliente não encontrado.</div>`;
      return;
    }
    _detailCache[customerId] = customer;

    const orders = await getOrderHistory(customerId, storeId);
    const ticket = getTicketMedio(customer);

    panel.innerHTML = renderDetailPanel(customer, orders, ticket);
    setTimeout(() => { if (window.lucide) window.lucide.createIcons({ root: panel }); }, 10);
  }

  function renderDetailPanel(customer, orders, ticket) {
    const color    = avatarColor(customer.nome);
    const initials = getInitials(customer.nome);
    const name     = customer.nome || 'Cliente sem nome';

    const ordersHtml = orders.length === 0
      ? `<div class="detail-empty">Nenhum pedido registrado ainda.</div>`
      : orders.map(o => {
          const ref   = String(o.id).slice(-5).toUpperCase();
          const date  = fmtDate(o.created_at);
          const total = fmtPrice(o.total);
          const statusClass = {
            novo: 'status-novo', confirmado: 'status-confirmado',
            em_entrega: 'status-entrega', finalizado: 'status-finalizado',
            cancelado: 'status-cancelado'
          }[o.status] || 'status-novo';
          const statusLabel = {
            novo: 'Novo', confirmado: 'Confirmado', em_entrega: 'Em Entrega',
            finalizado: 'Finalizado', cancelado: 'Cancelado'
          }[o.status] || o.status;

          return `
            <div class="order-history-item">
              <div class="order-history-left">
                <span class="order-ref">#${ref}</span>
                <span class="order-date">${date}</span>
              </div>
              <div class="order-history-right">
                <span class="order-total">${total}</span>
                <span class="order-status ${statusClass}">${statusLabel}</span>
              </div>
            </div>`;
        }).join('');

    return `
      <div class="detail-header">
        <button class="detail-close" onclick="CustomersModule.closeDetail()">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <div class="detail-hero">
          <div class="customer-avatar xl" style="background:${color}">${initials}</div>
          <h2 class="detail-name">${escapeHTML(name)}</h2>
          ${customer.telefone ? `<a class="detail-phone-link" href="https://wa.me/${customer.telefone.replace(/\D/g,'')}" target="_blank">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            ${escapeHTML(fmtPhone(customer.telefone))}
          </a>` : ''}
        </div>
      </div>

      <div class="detail-stats-grid">
        <div class="detail-stat">
          <div class="detail-stat-value">${customer.total_pedidos || 0}</div>
          <div class="detail-stat-label">Pedidos</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-value accent">${fmtPrice(customer.total_gasto)}</div>
          <div class="detail-stat-label">Total Gasto</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-value">${fmtPrice(ticket)}</div>
          <div class="detail-stat-label">Ticket Médio</div>
        </div>
      </div>

      ${customer.endereco ? `
      <div class="detail-section">
        <div class="detail-section-title">
          <i data-lucide="map-pin" style="width:14px;height:14px;"></i> Endereço
        </div>
        <div class="detail-address">${escapeHTML(customer.endereco)}</div>
      </div>` : ''}

      <div class="detail-section">
        <div class="detail-section-title">
          <i data-lucide="clock" style="width:14px;height:14px;"></i> Histórico de Pedidos
        </div>
        <div class="order-history-list">${ordersHtml}</div>
      </div>`;
  }

  function closeDetail() {
    const overlay = document.getElementById('detail-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  return { getAll, search, getById, getOrderHistory, getCount, getTicketMedio, openDetail, closeDetail, renderRow, renderCard, fmtPrice, fmtDate, fmtPhone, getInitials, avatarColor };
})();

window.CustomersModule = CustomersModule;
