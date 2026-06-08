/**
 * EncartShop — Reports Module
 * Módulo para gerenciar Relatórios com arquitetura de sub-relatórios para suportar futuras abas.
 */

const ReportsModule = (() => {

  let _storeId = null;
  let _currentData = []; // Cache dos pedidos buscados no período
  
  // Utilitário para formatar moeda
  const fmtPrice = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // ─── Sub-Módulos ─────────────────────────────────────────────────────────

  const OverviewReport = {
    render: function(orders) {
      this.renderCards(orders);
      this.renderCharts(orders);
      this.renderStatus(orders);
      this.renderTopProducts(orders);
    },

    renderCards: function(orders) {
      const validOrders = orders.filter(o => o.status !== 'cancelado');
      const canceledOrders = orders.filter(o => o.status === 'cancelado');
      
      const totalRevenue = validOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const orderCount = orders.length;
      const averageTicket = validOrders.length > 0 ? (totalRevenue / validOrders.length) : 0;
      
      // Clientes Únicos (usando customer_name e cliente_id)
      const uniqueCustomers = new Set();
      orders.forEach(o => {
        if (o.cliente_id) uniqueCustomers.add(o.cliente_id);
        else if (o.customer_name) uniqueCustomers.add(o.customer_name.trim().toLowerCase());
      });

      document.getElementById('kpi-revenue').textContent = fmtPrice(totalRevenue);
      document.getElementById('kpi-orders').textContent = orderCount;
      document.getElementById('kpi-ticket').textContent = fmtPrice(averageTicket);
      document.getElementById('kpi-customers').textContent = uniqueCustomers.size;
      document.getElementById('kpi-canceled').textContent = canceledOrders.length;
      
      // Taxa de conversão placeholder (Ajuste 1)
      document.getElementById('kpi-conversion').textContent = '--';
    },

    renderCharts: function(orders) {
      const validOrders = orders.filter(o => o.status !== 'cancelado');
      
      // 1. Gráfico de Evolução (Faturamento Diário)
      const dailyData = {};
      validOrders.forEach(o => {
        const dateStr = new Date(o.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        if (!dailyData[dateStr]) dailyData[dateStr] = 0;
        dailyData[dateStr] += Number(o.total) || 0;
      });

      // Ordenar pelas datas (simples sort)
      const sortedDates = Object.keys(dailyData).sort((a,b) => {
        const [d1, m1] = a.split('/'); const [d2, m2] = b.split('/');
        return new Date(`2024-${m1}-${d1}`) - new Date(`2024-${m2}-${d2}`); // dummy year for sorting mm-dd
      });
      const revenueValues = sortedDates.map(d => dailyData[d]);

      const ctxRevenue = document.getElementById('revenueChart');
      if (window._revenueChart) window._revenueChart.destroy();
      
      if (ctxRevenue) {
        window._revenueChart = new Chart(ctxRevenue, {
          type: 'line',
          data: {
            labels: sortedDates,
            datasets: [{
              label: 'Faturamento',
              data: revenueValues,
              borderColor: '#6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              borderWidth: 2,
              fill: true,
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
          }
        });
      }

      // 2. Gráfico de Horários de Pico (Barras - Ajuste 4)
      const hourCounts = {};
      validOrders.forEach(o => {
        const hour = new Date(o.created_at).getHours();
        const hrLabel = `${hour.toString().padStart(2, '0')}h`;
        if (!hourCounts[hrLabel]) hourCounts[hrLabel] = 0;
        hourCounts[hrLabel]++;
      });

      const sortedHours = Object.keys(hourCounts).sort((a,b) => parseInt(a) - parseInt(b));
      const hourValues = sortedHours.map(h => hourCounts[h]);

      const ctxHours = document.getElementById('peakHoursChart');
      if (window._peakHoursChart) window._peakHoursChart.destroy();
      
      if (ctxHours) {
        window._peakHoursChart = new Chart(ctxHours, {
          type: 'bar',
          data: {
            labels: sortedHours,
            datasets: [{
              label: 'Pedidos',
              data: hourValues,
              backgroundColor: '#10b981',
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
          }
        });
      }
    },

    renderStatus: function(orders) {
      if (!orders.length) return;
      const counts = { concluido: 0, andamento: 0, cancelado: 0 };
      orders.forEach(o => {
        if (o.status === 'entregue' || o.status === 'finalizado') counts.concluido++;
        else if (o.status === 'cancelado') counts.cancelado++;
        else counts.andamento++;
      });
      
      const total = orders.length;
      document.getElementById('st-concluido-pct').textContent = Math.round((counts.concluido/total)*100) + '%';
      document.getElementById('st-andamento-pct').textContent = Math.round((counts.andamento/total)*100) + '%';
      document.getElementById('st-cancelado-pct').textContent = Math.round((counts.cancelado/total)*100) + '%';
      
      document.getElementById('st-concluido-val').textContent = counts.concluido + ' pedidos';
      document.getElementById('st-andamento-val').textContent = counts.andamento + ' pedidos';
      document.getElementById('st-cancelado-val').textContent = counts.cancelado + ' pedidos';
    },

    renderTopProducts: function(orders) {
      const validOrders = orders.filter(o => o.status !== 'cancelado');
      const productsMap = {};
      let totalRevenue = 0;
      
      validOrders.forEach(o => {
        if (Array.isArray(o.items)) {
          o.items.forEach(item => {
            const name = item.name || 'Produto Desconhecido';
            const qty = Number(item.qty || item.quantity || 1);
            const price = Number(item.price || 0);
            const rev = qty * price;
            
            totalRevenue += rev;

            if (!productsMap[name]) productsMap[name] = { name, qty: 0, revenue: 0 };
            productsMap[name].qty += qty;
            productsMap[name].revenue += rev;
          });
        }
      });

      const topProducts = Object.values(productsMap)
        .sort((a,b) => b.qty - a.qty)
        .slice(0, 10);

      const tbody = document.getElementById('top-products-tbody');
      if (!tbody) return;

      if (!topProducts.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-textSecondary text-sm">Nenhum produto vendido no período</td></tr>`;
        return;
      }

      tbody.innerHTML = topProducts.map(p => {
        const pct = totalRevenue > 0 ? ((p.revenue / totalRevenue) * 100).toFixed(1) + '%' : '0%';
        return `
        <tr class="border-b border-borderColor last:border-0 hover:bg-bgPrimary/30 transition-colors">
          <td class="py-3 px-4 text-sm font-medium text-textPrimary">${p.name}</td>
          <td class="py-3 px-4 text-sm text-textSecondary text-right">${p.qty}</td>
          <td class="py-3 px-4 text-sm font-semibold text-textPrimary text-right">${fmtPrice(p.revenue)}</td>
          <td class="py-3 px-4 text-sm text-textSecondary text-right">${pct}</td>
        </tr>`;
      }).join('');
    }
  };

  const ProductsReport = {
    render: function(orders) { /* Em Breve */ }
  };
  const CustomersReport = {
    render: function(orders) { /* Em Breve */ }
  };
  const MarketingReport = {
    render: function(orders) { /* Em Breve */ }
  };

  // ─── Core Logic ──────────────────────────────────────────────────────────

  async function loadData(startDate, endDate) {
    if (!_storeId) _storeId = AuthService.getActiveStoreId();
    if (window.UIComponents && window.UIComponents.showToast) {
       document.getElementById('loading-overlay').classList.remove('hidden');
    }
    
    try {
      _currentData = await EncartAPI.OrderAPI.getByStore(_storeId, startDate, endDate);
      OverviewReport.render(_currentData);
    } catch(e) {
      console.error(e);
      if (window.showToast) showToast('Erro ao carregar relatórios', 'error');
    } finally {
      document.getElementById('loading-overlay').classList.add('hidden');
    }
  }

  // ─── Exports ─────────────────────────────────────────────────────────────

  async function exportExcel() {
    if (!_currentData || !_currentData.length) {
      showToast('Nenhum dado para exportar', 'warning');
      return;
    }
    
    try {
      const ExcelJS = window.ExcelJS; // via CDN na view
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Relatorio_Vendas');
      
      sheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Data', key: 'date', width: 20 },
        { header: 'Cliente', key: 'customer', width: 30 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Total (R$)', key: 'total', width: 15 },
      ];

      _currentData.forEach(o => {
        sheet.addRow({
          id: String(o.id).slice(-5).toUpperCase(),
          date: new Date(o.created_at).toLocaleString('pt-BR'),
          customer: o.customer_name || 'N/A',
          status: o.status,
          total: Number(o.total) || 0
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Relatorio_Vendas_${new Date().toISOString().slice(0,10)}.xlsx`;
      link.click();
    } catch (e) {
      console.error('Erro Excel', e);
      showToast('Erro ao exportar Excel', 'error');
    }
  }

  function exportCSV() {
    if (!_currentData || !_currentData.length) {
      showToast('Nenhum dado para exportar', 'warning');
      return;
    }

    let csv = 'ID,Data,Cliente,Status,Total\n';
    _currentData.forEach(o => {
      const id = String(o.id).slice(-5).toUpperCase();
      const date = new Date(o.created_at).toLocaleString('pt-BR');
      const cust = `"${(o.customer_name || 'N/A').replace(/"/g, '""')}"`;
      const status = o.status;
      const total = Number(o.total || 0).toFixed(2);
      csv += `${id},"${date}",${cust},${status},${total}\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_Vendas_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  }

  function printPDF() {
    window.print();
  }

  return { 
    loadData, 
    OverviewReport, 
    ProductsReport, 
    CustomersReport, 
    MarketingReport,
    exportExcel,
    exportCSV,
    printPDF
  };

})();

window.ReportsModule = ReportsModule;
