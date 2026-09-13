import { assetUrl } from './assets.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// 단순 기호만 일관된 둥근 선 SVG로 그린다(디자인 가이드 6장 허용 범위).
const P = {
  close: '<path d="M7 7l10 10M17 7L7 17"/>',
  check: '<path d="M6 12.5l4 4 8-9"/>',
  chevronUp: '<path d="M7 14l5-5 5 5"/>',
  chevronDown: '<path d="M7 10l5 5 5-5"/>',
  sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6"/>',
  sparkle: '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 9-.6-6.6-2.4-8.4-7-9 4.6-.6 6.4-2.4 7-7z"/>',
  sprout: '<path d="M12 20v-7"/><path d="M12 13c0-4-3-6-7-6 0 4 3 6 7 6z"/><path d="M12 11c0-3.5 2.6-5.5 6.5-5.5 0 3.5-2.6 5.5-6.5 5.5z"/>',
  pin: '<path d="M12 21s-6-5.6-6-10.5A6 6 0 0 1 18 10.5C18 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>',
  ear: '<path d="M8 19c1.5 1 4 .6 4.8-1.6.7-1.9 3.2-3 3.2-6.4a5 5 0 0 0-10 0"/><path d="M9.5 11a2.5 2.5 0 0 1 5 0c0 1.4-1.4 2-1.4 3"/><path d="M19.5 8.5l1.5-1M20 12h1.8"/>',
  play: '<path d="M8.5 6.5v11l9-5.5z"/>',
  retry: '<path d="M5.5 12a6.5 6.5 0 1 0 2-4.7"/><path d="M5.5 4.5v3.5H9"/>',
  heart: '<path d="M12 19s-7-4.4-7-9.3A3.8 3.8 0 0 1 12 7.6a3.8 3.8 0 0 1 7 2.1C19 14.6 12 19 12 19z"/>',
  wave: '<path d="M3 12h2.5M18.5 12H21M7.5 8v8M10.5 5v14M13.5 8v8M16.5 10v4"/>',
  sun2: '<circle cx="12" cy="12" r="4"/>',
  jelly: '<path d="M5 12a7 7 0 0 1 14 0c-1.2.8-2.3.8-3.5 0-1.2.8-2.3.8-3.5 0-1.2.8-2.3.8-3.5 0-1.2.8-2.3.8-3.5 0z"/><path d="M8.5 13.5c0 2-1 3-.3 5M12 13.5c0 2.5-.8 3.8 0 6.5M15.5 13.5c0 2 1 3 .3 5"/>',
  sound: '<path d="M5 10v4h3l4 3.5v-11L8 10z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/>',
  mute: '<path d="M5 10v4h3l4 3.5v-11L8 10z"/><path d="M16 10l4 4M20 10l-4 4"/>',
  rotL: '<path d="M8 8.5A7 7 0 1 1 5 14"/><path d="M4 5v4.5h4.5"/>',
  rotR: '<path d="M16 8.5A7 7 0 1 0 19 14"/><path d="M20 5v4.5h-4.5"/>',
  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
  door: '<path d="M6 20V6.5A2.5 2.5 0 0 1 8.5 4h7A2.5 2.5 0 0 1 18 6.5V20"/><path d="M4 20h16"/><circle cx="14.5" cy="12.5" r="0.6"/>',
  lock: '<rect x="6.5" y="11" width="11" height="8" rx="2.5"/><path d="M9 11V8.5a3 3 0 0 1 6 0V11"/>',
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `ico ${cls}`.trim();
  span.setAttribute('aria-hidden', 'true');
  const filled = name === 'play' || name === 'sparkle' || name === 'heart';
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] ?? ''}</svg>`;
  return span;
}

export function artIcon(id, alt = '') {
  return h('img', { class: 'art-ico', src: assetUrl(`icons/${id}.png`), alt, draggable: 'false' });
}

export function portrait(sprite) {
  return h('span', { class: 'portrait', style: { backgroundImage: `url("${assetUrl(`portraits/${sprite}.png`)}")` }, 'aria-hidden': 'true' });
}

/** 모달 포커스 가두기. 반환 함수로 해제하고 원래 요소로 포커스를 돌린다. */
export function trapFocus(container, onEscape) {
  const previous = document.activeElement;
  const selector = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onEscape?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...container.querySelectorAll(selector)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  }
  // 모달 안의 빈 곳을 눌러 포커스가 body로 빠져도 Esc·Tab이 동작하도록 문서 전체에서 받는다
  document.addEventListener('keydown', onKey, true);
  return () => {
    document.removeEventListener('keydown', onKey, true);
    if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
  };
}
