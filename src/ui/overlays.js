// 전체 화면 연출: 인트로, 항해, 마무리. 그리고 짧은 알림.
import { assetUrl } from './assets.js';
import { h, icon, trapFocus } from './dom.js';

export function createIntro(root, actions) {
  const start = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => actions.startGame() }, icon('play'), '여행 시작하기');
  const el = h(
    'section',
    { class: 'overlay intro', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'introTitle' },
    h('div', { class: 'intro-bg', style: { backgroundImage: `url("${assetUrl('ui/voyage.jpg')}")` }, 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'intro-card' },
      h('h1', { id: 'introTitle', class: 'intro-logo' }, h('img', { src: assetUrl('ui/logo.png'), alt: 'LUMINA' })),
      h('p', { class: 'intro-lead' }, '긴 항해 끝에 해파리의 빛이 약해지고, 몸속 정원들도 잠들었어요.'),
      h('p', { class: 'intro-lead' }, '작은 빛 하나로 이웃들과 함께 정원을 깨워 볼까요?'),
      h('p', { class: 'intro-keys' }, 'WASD·방향키 또는 바닥 클릭으로 걷기 · 드래그로 360° 둘러보기 · 휠로 확대 · E로 말 걸기'),
      start,
      h('p', { class: 'intro-note' }, '주민과 함께하는 단일 플레이어 데모예요.'),
    ),
  );
  el.hidden = true;
  root.append(el);
  let release = null;
  return {
    get open() {
      return !el.hidden;
    },
    show() {
      el.hidden = false;
      release = trapFocus(el, null);
      start.focus();
    },
    hide() {
      el.hidden = true;
      release?.();
      release = null;
    },
  };
}

export function createVoyage(root, actions) {
  const caption = h('p', { class: 'voyage-caption', id: 'voyageCaption' });
  const bar = h('span', { class: 'voyage-bar-fill' });
  const skip = h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.finishVoyage() }, '건너뛰기');
  const img = h('div', { class: 'voyage-img', style: { backgroundImage: `url("${assetUrl('ui/voyage.jpg')}")` }, 'aria-hidden': 'true' });
  const el = h(
    'section',
    { class: 'overlay voyage', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'voyageCaption' },
    img,
    h('div', { class: 'voyage-ui hud-panel' }, caption, h('span', { class: 'voyage-bar', 'aria-hidden': 'true' }, bar), skip),
  );
  el.hidden = true;
  root.append(el);
  let release = null;
  return {
    get open() {
      return !el.hidden;
    },
    show(to) {
      const names = { ice: '얼음 성운으로', solar: '태양 정원으로', twilight: '황혼 합류지로' };
      caption.textContent = names[to] ? `해파리가 ${names[to]} 헤엄쳐 가요` : '해파리가 항해 전망대로 돌아가요';
      el.classList.toggle('to-ice', !!names[to]);
      el.hidden = false;
      // 애니메이션 재시작
      img.style.animation = 'none';
      bar.style.animation = 'none';
      void img.offsetWidth;
      img.style.animation = '';
      bar.style.animation = '';
      release = trapFocus(el, null);
      skip.focus();
    },
    hide() {
      el.hidden = true;
      release?.();
      release = null;
    },
  };
}

export function createFinale(root, actions) {
  const close = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => actions.closeFinale() }, '정원 계속 둘러보기');
  const el = h(
    'section',
    { class: 'overlay finale', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'finaleTitle' },
    h('div', { class: 'intro-bg finale-bg', style: { backgroundImage: `url("${assetUrl('ui/voyage.jpg')}")` }, 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'intro-card finale-card' },
      h('p', { class: 'qm-eyebrow' }, '첫 항해 기록'),
      h('h2', { id: 'finaleTitle', class: 'qm-title' }, '잠든 산책로가 깨어났어요'),
      h('p', { class: 'intro-lead' }, '포근·살구·보라·리본과 함께 놓은 빛이 해파리의 막을 따라 은은하게 퍼져요.'),
      h('p', { class: 'intro-lead' }, '데모는 여기까지예요. 놓은 빛은 저장되어 다음에 다시 열어도 그대로 남아 있어요.'),
      close,
    ),
  );
  el.hidden = true;
  root.append(el);
  let release = null;
  return {
    get open() {
      return !el.hidden;
    },
    show() {
      el.hidden = false;
      release = trapFocus(el, () => actions.closeFinale());
      close.focus();
    },
    hide() {
      el.hidden = true;
      release?.();
      release = null;
    },
  };
}

/** 장면 전환 가림막(불러오는 동안 입력 차단) */
export function createFader(root) {
  const text = h('p', { class: 'fader-text' });
  const bar = h('span', { class: 'fader-bar-fill' });
  const el = h('div', { class: 'fader', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'fader-card' }, text, h('span', { class: 'fader-bar' }, bar)));
  el.hidden = true;
  root.append(el);
  return {
    show(label) {
      text.textContent = label;
      bar.style.transform = 'scaleX(0)';
      el.hidden = false;
      el.classList.remove('is-out');
    },
    progress(p) {
      bar.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
    },
    hide() {
      el.classList.add('is-out');
      setTimeout(() => {
        if (el.classList.contains('is-out')) el.hidden = true;
      }, 450);
    },
  };
}

export function createToast(root) {
  const el = h('p', { class: 'toast hud-panel', role: 'status', 'aria-live': 'polite' });
  el.hidden = true;
  root.append(el);
  let timer = 0;
  return {
    show(text, ms = 3200) {
      el.textContent = text;
      el.hidden = false;
      el.classList.remove('is-in');
      void el.offsetWidth;
      el.classList.add('is-in');
      clearTimeout(timer);
      timer = setTimeout(() => (el.hidden = true), ms);
    },
  };
}
