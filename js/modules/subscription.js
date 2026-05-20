/**
 * EncartShop — Subscription Module v2
 *
 * Gerencia dois cenários distintos:
 *   A) Loja PENDING  → nunca ativou (status !== 'active')
 *   B) Loja EXPIRADA → foi ativa, assinatura venceu (expires_at ultrapassado + carência)
 */

const SubscriptionModule = (() => {
  const GRACE_PERIOD_DAYS   = 5;
  const PENDING_EXPIRE_DAYS = 7; // lojas pending expiram após 7 dias

  /**
   * Retorna o status de uma assinatura pelo campo expires_at.
   */
  function getStatus(expiresAt) {
    if (!expiresAt) return { expired: false, blocked: false, daysLeft: 999, graceDaysLeft: 999 };

    const now        = new Date();
    const expiry     = new Date(expiresAt);
    const diffMs     = expiry - now;
    const daysLeft   = Math.ceil(diffMs / 86400000);
    const graceExpiry = new Date(expiry);
    graceExpiry.setDate(expiry.getDate() + GRACE_PERIOD_DAYS);
    const blocked = now > graceExpiry;

    return {
      expired: now > expiry,
      blocked,
      daysLeft,
      graceDaysLeft: Math.ceil((graceExpiry - now) / 86400000)
    };
  }

  /**
   * Verifica se uma loja pending expirou (criada há mais de PENDING_EXPIRE_DAYS dias).
   * Usada pela loja pública e auth guard.
   */
  function isPendingExpired(store) {
    if (!store || store.status === 'active') return false;
    if (!store.created_at) return false;
    const created = new Date(store.created_at);
    const diffDays = (Date.now() - created.getTime()) / 86400000;
    return diffDays > PENDING_EXPIRE_DAYS;
  }

  /**
   * Verifica se a loja está disponível para o público.
   * Retorna { available: bool, reason: string }
   */
  function getPublicAvailability(store) {
    if (!store) return { available: false, reason: 'not_found' };

    // Loja nunca ativada
    if (store.status === 'pending') {
      if (isPendingExpired(store)) {
        return { available: false, reason: 'pending_expired' };
      }
      return { available: false, reason: 'pending' };
    }

    // Loja expirada + carência esgotada
    const subStatus = getStatus(store.expires_at);
    if (subStatus.blocked) {
      return { available: false, reason: 'subscription_expired' };
    }

    return { available: true, reason: 'active' };
  }

  /**
   * Gera o objeto de alerta para o painel admin.
   */
  function getAlert(status, storePending = false) {
    // Alerta especial para lojas pending (nunca pagaram)
    if (storePending) {
      return {
        type: 'warning',
        title: 'Loja Não Publicada',
        message: 'Sua loja ainda não está visível ao público. Finalize o pagamento para ativar.',
        btnText: '💳 Ativar Loja',
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
        message: `Sua loja será bloqueada em ${status.graceDaysLeft} dia(s). Pague agora para evitar interrupção.`,
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

  /**
   * Injeta banner de alerta no painel admin.
   */
  function injectAlert(alert) {
    if (!alert) return;

    const bannerId = 'subscription-alert-banner';
    if (document.getElementById(bannerId)) return;

    const banner = document.createElement('div');
    banner.id = bannerId;
    const isWarning = alert.type === 'warning';
    banner.style.cssText = `
      position: sticky; top: 0; z-index: 1000;
      background: ${isWarning ? '#f59e0b' : 'var(--danger)'};
      color: #fff; padding: 12px 24px;
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 0.875rem; flex-wrap: wrap;
    `;
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:1.2rem">${isWarning ? '🔔' : '⚠️'}</span>
        <div>
          <strong style="display:block;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px">${escapeHTML(alert.title)}</strong>
          <span>${escapeHTML(alert.message)}</span>
        </div>
      </div>
      <a href="${escapeHTML(alert.btnUrl)}" style="
        background:#fff;color:${isWarning ? '#b45309' : 'var(--danger)'};
        padding:8px 16px;border-radius:8px;font-weight:700;font-size:0.82rem;
        white-space:nowrap;text-decoration:none;flex-shrink:0;
      ">${escapeHTML(alert.btnText)}</a>`;

    const target = document.querySelector('.main-content') || document.body;
    target.insertBefore(banner, target.firstChild);
  }

  return { getStatus, getAlert, injectAlert, getPublicAvailability, isPendingExpired, PENDING_EXPIRE_DAYS };
})();

window.SubscriptionModule = SubscriptionModule;
