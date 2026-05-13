/**
 * EncartShop — Subscription Module
 * Gerenciamento de assinatura e prazos.
 */

const SubscriptionModule = (() => {
  const GRACE_PERIOD_DAYS = 5;

  function getStatus(expiresAt, storeStatus = 'active') {
    if (!expiresAt) return { expired: false, blocked: false, daysLeft: 999 };
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry - now;
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Lógica diferenciada:
    // 1. Lojas em Demonstração (pending) -> Bloqueio imediato após 3 dias.
    // 2. Lojas Ativas -> Bloqueio após 5 dias de graça (GRACE_PERIOD_DAYS).
    
    let blocked = now > expiry;
    if (storeStatus === 'active') {
      const graceExpiry = new Date(expiry.getTime() + GRACE_PERIOD_DAYS * 86400000);
      blocked = now > graceExpiry;
    }

    return {
      expired: now > expiry,
      blocked,
      daysLeft,
      graceDaysLeft: Math.ceil((new Date(expiry.getTime() + GRACE_PERIOD_DAYS * 86400000) - now) / 86400000)
    };
  }

  function getAlert(status, storeStatus = '') {
    if (storeStatus === 'pending') {
      return {
        type: 'warning',
        title: 'Loja em Demonstração',
        message: 'Aguardando primeiro pagamento para ativação definitiva.',
        btnText: 'Ativar Agora',
        btnUrl: 'pagamento.html'
      };
    }

    if (status.blocked) {
      return {
        type: 'danger',
        title: 'Loja Bloqueada',
        message: 'O período de carência terminou. Regularize seu pagamento para reativar sua loja.',
        btnText: 'Ir para Pagamento',
        btnUrl: 'pagamento.html'
      };
    }

    if (status.expired) {
      return {
        type: 'danger',
        title: 'Assinatura Vencida!',
        message: `Sua loja será bloqueada em ${status.graceDaysLeft} dia(s). Pague agora para evitar a interrupção das vendas.`,
        btnText: 'Pagar Agora',
        btnUrl: 'pagamento.html'
      };
    }

    if (status.daysLeft <= 2 && status.daysLeft >= 0) {
      return {
        type: 'warning',
        title: 'Assinatura Vence em Breve',
        message: `Sua assinatura vence em ${status.daysLeft === 0 ? 'menos de 24h' : status.daysLeft + ' dia(s)'}.`,
        btnText: 'Renovar Assinatura',
        btnUrl: 'pagamento.html'
      };
    }

    return null;
  }

  function injectAlert(alert) {
    if (!alert) return;

    const bannerId = 'subscription-alert-banner';
    if (document.getElementById(bannerId)) return;

    const banner = document.createElement('div');
    banner.id = bannerId;
    banner.style.cssText = `
      position: sticky; top: 0; z-index: 1000;
      background: ${alert.type === 'danger' ? 'var(--danger)' : 'var(--warning)'};
      color: #fff; padding: 12px 24px;
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1); font-size: 0.9rem;
    `;

    banner.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:1.2rem;">${alert.type === 'danger' ? '⚠️' : '🔔'}</span>
        <div>
          <strong style="display:block; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">${alert.title}</strong>
          <span>${alert.message}</span>
        </div>
      </div>
      <a href="${alert.btnUrl}" class="btn btn-sm" style="background:#fff; color:${alert.type === 'danger' ? 'var(--danger)' : 'var(--warning)'}; border:none;">
        ${alert.btnText}
      </a>
    `;

    // Insere no topo do body ou após a sidebar
    const mainContent = document.querySelector('.main-content') || document.body;
    if (mainContent.firstChild) {
      mainContent.insertBefore(banner, mainContent.firstChild);
    } else {
      mainContent.appendChild(banner);
    }
  }

  return {
    getStatus,
    getAlert,
    injectAlert
  };
})();

window.SubscriptionModule = SubscriptionModule;
