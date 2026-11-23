/**
 * EncartShop — Loja Pública / StoreSchedule
 * Avaliação inteligente de horários de funcionamento e status da loja (Aberto/Fechado).
 */

window.StoreSchedule = (() => {
  const DAY_MAP = {
    'dom': 0, 'domingo': 0,
    'seg': 1, 'segunda': 1, '2a': 1, '2ª': 1,
    'ter': 2, 'terca': 2, 'terça': 2, '3a': 2, '3ª': 2,
    'qua': 3, 'quarta': 3, '4a': 3, '4ª': 3,
    'qui': 4, 'quinta': 4, '5a': 4, '5ª': 4,
    'sex': 5, 'sexta': 5, '6a': 5, '6ª': 5,
    'sab': 6, 'sabado': 6, 'sábado': 6
  };

  const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  /**
   * Normaliza texto para parsing resiliente
   */
  function _clean(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[–—]/g, '-')
      .replace(/[\r\n]+/g, ' | ');
  }

  /**
   * Extrai regras estruturadas a partir da string de horários
   */
  function parseRules(hoursStr) {
    if (!hoursStr || typeof hoursStr !== 'string') return null;
    const clean = _clean(hoursStr).trim();
    if (!clean) return null;

    if (clean.includes('24h') || clean.includes('24 horas') || clean.includes('sempre aberto')) {
      return { is24h: true, rules: [] };
    }

    const normalized = clean.replace(/,\s*(?=(?:seg|ter|qua|qui|sex|sab|dom|todos|diar))/gi, ' | ');
    const blocks = normalized.split(/[|;]+/).map(b => b.trim()).filter(Boolean);
    const rules = [];

    for (const block of blocks) {
      // Reconhece formatos de hora: 7h às 20h, 08:00 - 18:00, 8h30 as 18h, etc.
      const timeMatch = block.match(/(\d{1,2})(?:[h:](\d{2}))?\s*(?:h|hs|hrs)?\s*(?:as|a|-|ate)\s*(\d{1,2})(?:[h:](\d{2}))?\s*(?:h|hs|hrs)?/);
      if (!timeMatch) continue;

      const startH = parseInt(timeMatch[1], 10);
      const startM = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const endH = parseInt(timeMatch[3], 10);
      const endM = timeMatch[4] ? parseInt(timeMatch[4], 10) : 0;

      const startMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;

      let days = [];
      if (block.includes('todos os dias') || block.includes('diariamente') || block.includes('seg - dom') || block.includes('seg a dom')) {
        days = [0, 1, 2, 3, 4, 5, 6];
      } else {
        const rangeMatch = block.match(/(dom|seg|ter|qua|qui|sex|sab)(?:[a-z0-9]*)?\s*(?:a|-|ate)\s*(dom|seg|ter|qua|qui|sex|sab)(?:[a-z0-9]*)?/);
        if (rangeMatch) {
          const from = DAY_MAP[rangeMatch[1]];
          const to = DAY_MAP[rangeMatch[2]];
          if (from !== undefined && to !== undefined) {
            let cur = from;
            while (true) {
              days.push(cur);
              if (cur === to) break;
              cur = (cur + 1) % 7;
            }
          }
        } else {
          for (const [k, d] of Object.entries(DAY_MAP)) {
            const reg = new RegExp('\\b' + k + '\\b');
            if (reg.test(block) && !days.includes(d)) days.push(d);
          }
        }
      }

      if (days.length > 0) {
        rules.push({ days, startMin, endMin, raw: block });
      }
    }

    return rules.length > 0 ? { is24h: false, rules } : null;
  }

  /**
   * Calcula a próxima previsão de abertura quando fechado
   */
  function getNextOpening(rules, currentDay, currentMin) {
    if (!rules || !rules.length) return '';

    // 1. Verifica se ainda abre hoje mais tarde
    const todayRules = rules.filter(r => r.days.includes(currentDay) && r.startMin > currentMin);
    if (todayRules.length > 0) {
      todayRules.sort((a, b) => a.startMin - b.startMin);
      const h = String(Math.floor(todayRules[0].startMin / 60)).padStart(2, '0');
      const m = String(todayRules[0].startMin % 60).padStart(2, '0');
      return `Abre hoje às ${h}:${m}`;
    }

    // 2. Procura nos próximos dias
    for (let offset = 1; offset <= 7; offset++) {
      const nextD = (currentDay + offset) % 7;
      const nextRules = rules.filter(r => r.days.includes(nextD));
      if (nextRules.length > 0) {
        nextRules.sort((a, b) => a.startMin - b.startMin);
        const h = String(Math.floor(nextRules[0].startMin / 60)).padStart(2, '0');
        const m = String(nextRules[0].startMin % 60).padStart(2, '0');
        const timeStr = `${h}:${m}`;
        return offset === 1 ? `Abre amanhã às ${timeStr}` : `Abre ${DAY_NAMES[nextD]} às ${timeStr}`;
      }
    }

    return '';
  }

  /**
   * Avalia se a loja está aberta no momento presente (ou em data de referência)
   */
  function evaluate(hoursStr, refDate = new Date()) {
    if (!hoursStr || typeof hoursStr !== 'string') {
      return { hasSchedule: false, isOpen: true, badgeText: '', nextOpening: '', raw: '' };
    }

    const raw = hoursStr.trim();
    if (!raw) {
      return { hasSchedule: false, isOpen: true, badgeText: '', nextOpening: '', raw: '' };
    }

    const parsed = parseRules(raw);
    if (!parsed) {
      // Texto existe mas não foi possível estruturar horários: não bloqueia a loja
      return { hasSchedule: false, isOpen: true, badgeText: '', nextOpening: '', raw };
    }

    if (parsed.is24h) {
      return { hasSchedule: true, isOpen: true, badgeText: 'Aberto agora (24h)', nextOpening: '', raw };
    }

    const currentDay = refDate.getDay();
    const currentMin = refDate.getHours() * 60 + refDate.getMinutes();
    const prevDay = (currentDay + 6) % 7;

    let isOpen = false;

    for (const r of parsed.rules) {
      // Turno regular no mesmo dia
      if (r.days.includes(currentDay)) {
        if (r.endMin > r.startMin) {
          if (currentMin >= r.startMin && currentMin < r.endMin) {
            isOpen = true;
            break;
          }
        } else {
          // Turno que vira a noite (ex 18h às 02h)
          if (currentMin >= r.startMin) {
            isOpen = true;
            break;
          }
        }
      }

      // Madrugada que faz parte do turno da noite anterior
      if (r.days.includes(prevDay) && r.endMin <= r.startMin) {
        if (currentMin < r.endMin) {
          isOpen = true;
          break;
        }
      }
    }

    const nextOpening = !isOpen ? getNextOpening(parsed.rules, currentDay, currentMin) : '';

    return {
      hasSchedule: true,
      isOpen,
      badgeText: isOpen ? 'Aberto agora' : 'Fechado no momento',
      nextOpening,
      raw
    };
  }

  return { evaluate, parseRules, getNextOpening };
})();
