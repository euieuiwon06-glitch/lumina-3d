// 첫 챕터 화면: 시작 화면, 내 모습 만들기, 선택지 대화, 등불 조율, 교환·엮기, 항로 선택, 항해 연출,
// 설정, 안내 말풍선, 챕터 완료. 모든 버튼은 실제 동작하거나 비활성 이유를 보여준다.
import { ACCESSORIES, BASES, BODY_COLORS, CHEST_COLORS, COLORS, FORMS, ROUTES, SYMBOLS, byId, cleanName, lightName } from '../game/catalog.js';
import { glowAt, offsetFromPeak } from '../game/tuning.js';
import { assetUrl } from './assets.js';
import { artIcon, h, icon, trapFocus } from './dom.js';

function modalLayer(root, cls, labelledby) {
  const box = h('section', { class: `story-card ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelledby });
  const layer = h('div', { class: 'overlay story-layer' }, box);
  layer.hidden = true;
  root.append(layer);
  let release = null;
  return {
    layer,
    box,
    get open() {
      return !layer.hidden;
    },
    show(onEscape, focusSel = '.btn-primary:not([disabled])') {
      layer.hidden = false;
      release?.();
      release = trapFocus(box, onEscape);
      (box.querySelector(focusSel) ?? box.querySelector('button'))?.focus();
    },
    hide() {
      if (layer.hidden) return;
      layer.hidden = true;
      const r = release;
      release = null;
      r?.();
    },
  };
}

// ------------------------------------------------------------------ 시작 화면(정중앙)

export function createTitle(root, actions) {
  const newBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => actions.newJourney() }, icon('sparkle'), '새 여행 시작');
  const contBtn = h('button', { class: 'btn btn-quiet btn-lg', type: 'button', onClick: () => actions.continueJourney() }, icon('play'), '이어하기');
  const contNote = h('p', { class: 'title-note', id: 'continueNote' });
  const confirmBox = h(
    'div',
    { class: 'title-confirm', role: 'alertdialog', 'aria-labelledby': 'confirmText' },
    h('p', { id: 'confirmText' }, '지금까지의 여행 기록이 지워지고 처음부터 시작해요.'),
    h(
      'div',
      { class: 'title-actions' },
      h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => hideConfirm() }, '돌아가기'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => actions.newJourney(true) }, '지우고 새로 시작'),
    ),
  );
  confirmBox.hidden = true;
  // 배경: 포스터(항상 깔림) 위에 타이틀 반복 영상, 그 위에 첫 진입 오프닝 영상.
  // 오프닝 마지막 프레임 = 반복 영상 첫 프레임이라, 반복 영상이 실제로 재생되기 시작한 뒤 오프닝을 치워 검은 화면이 없다
  const poster = assetUrl('ui/title_poster.png');
  const loopVideo = h('video', { class: 'title-video', src: assetUrl('ui/title_loop.mp4'), poster, muted: true, loop: true, playsInline: true, preload: 'auto', 'aria-hidden': 'true' });
  const openingVideo = h('video', { class: 'title-video is-opening', src: assetUrl('ui/opening.mp4'), muted: true, playsInline: true, preload: 'auto', 'aria-hidden': 'true' });
  for (const v of [loopVideo, openingVideo]) {
    // 속성만으로는 자동재생 음소거가 보장되지 않는 브라우저가 있어 속성값으로도 둔다
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
  }
  const skipBtn = h('button', { class: 'btn btn-quiet title-skip', type: 'button', onClick: () => endOpening() }, '건너뛰기', icon('play'));
  // 오프닝 자막(도입 이야기): 영상 컷에 맞춰 띄운다. 컷 = 해파리 외경 0~10초, 멈춘 도시 10~16초, 제작실 16~26초
  const CUES = [
    { from: 1.0, to: 9.4, text: '빛들의 박자가 어긋나면서 해파리의 항해가 멈췄어요.' },
    { from: 10.5, to: 15.7, text: '산책로의 등불은 꺼지고, 판석 다리는 흩어져 이웃들이 만나지 못해요.' },
    { from: 16.8, to: 23.6, text: '작은 빛 하나가 제작실에서 깨어나요.' },
  ];
  const cueText = h('h2', { class: 'qm-title' });
  const caption = h('div', { class: 'chapter-banner hud-panel title-caption', role: 'status', 'aria-live': 'polite' }, h('p', { class: 'qm-eyebrow' }, '첫 번째 숨결'), cueText);
  caption.hidden = true;
  let cueIndex = -1;
  function updateCaption() {
    const t = openingVideo.currentTime;
    const i = opening ? CUES.findIndex((c) => t >= c.from && t < c.to) : -1;
    if (i === cueIndex) return;
    cueIndex = i;
    caption.hidden = i < 0;
    if (i < 0) return;
    cueText.textContent = CUES[i].text;
    caption.classList.remove('is-in');
    void caption.offsetWidth;
    caption.classList.add('is-in');
  }
  openingVideo.addEventListener('timeupdate', updateCaption);
  const card = h(
    'div',
    { class: 'title-card' },
    h('h1', { id: 'titleLogo', class: 'intro-logo' }, h('img', { src: assetUrl('ui/logo.png'), alt: 'LUMINA' })),
    h('p', { class: 'title-tagline' }, '우리, 다시 떠나볼까?'),
    h('p', { class: 'intro-lead' }, '빛들이 박자를 잃고 멈춘 우주 해파리. 나만의 빛을 만들고 이웃과 나누어 첫 숨결을 되살려요.'),
    h('div', { class: 'title-actions' }, contBtn, newBtn),
    contNote,
    confirmBox,
    h('p', { class: 'intro-note' }, '주민과 함께하는 단일 플레이어 데모 · 약 15분'),
  );
  const el = h(
    'section',
    { class: 'overlay title-screen', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'titleLogo' },
    h('div', { class: 'title-media', style: { backgroundImage: `url("${poster}")` }, 'aria-hidden': 'true' }, loopVideo, openingVideo),
    card,
    caption,
    skipBtn,
  );
  el.hidden = true;
  root.append(el);
  let release = null;
  let opening = false;
  let fallbackTimer = 0;
  let focusTarget = newBtn;
  function hideConfirm() {
    confirmBox.hidden = true;
    newBtn.focus();
  }
  const playSafe = (v) => v.play()?.catch?.(() => {});
  function showCard() {
    el.classList.remove('is-opening');
    skipBtn.hidden = true;
    card.inert = false;
    focusTarget.focus({ preventScroll: true });
  }
  function startLoop() {
    playSafe(loopVideo);
  }
  function endOpening() {
    if (!opening) return;
    opening = false;
    clearTimeout(fallbackTimer);
    updateCaption();
    showCard();
    // 반복 영상이 재생되면(또는 이미 재생 중이면) 오프닝을 치운다. 반복 영상이 실패해도 포스터가 남는다
    const drop = () => openingVideo.classList.add('is-gone');
    if (!loopVideo.paused && loopVideo.readyState >= 3) drop();
    else {
      loopVideo.addEventListener('playing', drop, { once: true });
      loopVideo.addEventListener('error', drop, { once: true });
      startLoop();
      setTimeout(drop, 1500);
    }
    openingVideo.pause();
  }
  openingVideo.addEventListener('ended', endOpening);
  openingVideo.addEventListener('error', endOpening);
  loopVideo.addEventListener('error', () => loopVideo.classList.add('is-gone'));
  return {
    get open() {
      return !el.hidden;
    },
    /** playOpening: 첫 진입이면 오프닝 영상부터(건너뛰기 가능), 아니면 바로 타이틀 반복 영상 */
    show({ hasSave, name, legacy, playOpening = false }) {
      contBtn.disabled = !hasSave;
      contBtn.setAttribute('aria-describedby', 'continueNote');
      contNote.textContent = hasSave
        ? `${name}의 여행을 이어서 해요.`
        : legacy
          ? '이전 데모의 저장은 새 이야기와 달라 이어할 수 없어요(기록은 지우지 않았어요).'
          : '저장된 여행이 없어요.';
      confirmBox.hidden = true;
      el.hidden = false;
      release = trapFocus(el, null);
      focusTarget = hasSave ? contBtn : newBtn;
      openingVideo.classList.remove('is-gone');
      loopVideo.classList.remove('is-gone');
      if (playOpening) {
        opening = true;
        el.classList.add('is-opening');
        skipBtn.hidden = false;
        card.inert = true;
        skipBtn.focus();
        openingVideo.currentTime = 0;
        loopVideo.load(); // 반복 영상을 미리 받아 둔다(끝 전환 때 바로 재생)
        playSafe(openingVideo);
        // 영상이 늦거나 자동재생이 막히거나 재생이 멈춰 버리면(시간이 흐르지 않음) 포스터+타이틀로
        const started = performance.now();
        const watch = () => {
          if (!opening) return;
          const elapsed = (performance.now() - started) / 1000;
          const stuck = elapsed > 3.5 && (openingVideo.paused || openingVideo.readyState < 2 || openingVideo.currentTime < 0.5);
          const overdue = Number.isFinite(openingVideo.duration) && elapsed > openingVideo.duration + 4;
          if (stuck || overdue || elapsed > 40) endOpening();
          else fallbackTimer = setTimeout(watch, 500);
        };
        fallbackTimer = setTimeout(watch, 500);
      } else {
        opening = false;
        openingVideo.classList.add('is-gone');
        showCard();
        startLoop();
      }
    },
    confirmNew() {
      confirmBox.hidden = false;
      confirmBox.querySelector('.btn-quiet').focus();
    },
    hide() {
      el.hidden = true;
      opening = false;
      clearTimeout(fallbackTimer);
      updateCaption();
      openingVideo.pause();
      loopVideo.pause();
      release?.();
      release = null;
    },
  };
}

// ------------------------------------------------------------------ 내 모습 만들기

export function createCreator(root, actions) {
  const canvas = h('canvas', { class: 'creator-canvas', 'aria-label': '캐릭터 미리보기. 드래그로 돌려 볼 수 있어요.', role: 'img' });
  const baseDesc = h('p', { class: 'creator-desc' });
  const groups = {};
  const section = (key, title, items, render) => {
    const row = h('div', { class: 'creator-options', role: 'radiogroup', 'aria-label': title });
    const buttons = items.map((it) => {
      const b = h('button', { class: 'chip creator-chip', type: 'button', role: 'radio', onClick: () => actions.pick(key, it.id) }, ...render(it));
      row.append(b);
      return { it, b };
    });
    groups[key] = buttons;
    return h('div', { class: 'creator-section' }, h('h3', {}, title), row);
  };
  const swatch = (hex) => h('span', { class: 'creator-sw', style: { '--sw': hex }, 'aria-hidden': 'true' });
  const nameInput = h('input', { class: 'creator-name', id: 'creatorName', maxlength: '12', autocomplete: 'off', onInput: (e) => actions.pick('name', e.target.value) });
  const waveBtn = h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.previewWave() }, icon('heart'), '인사해 보기');
  const confirm = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => actions.confirmProfile() }, icon('sparkle'), '이 모습으로 깨어나기');
  const back = h('button', { class: 'btn btn-quiet btn-lg', type: 'button', onClick: () => actions.closeCreator() }, '돌아가기');
  const title = h('h2', { class: 'qm-title', id: 'creatorTitle' }, '내 모습 만들기');
  const m = modalLayer(root, 'creator', 'creatorTitle');
  // 뒤 배경: 단색 대신 해파리 도시 일러스트(살짝 흐리게 해 카드가 읽히게)
  m.layer.classList.add('creator-layer');
  m.layer.prepend(h('div', { class: 'creator-bg', style: { backgroundImage: `url("${assetUrl('ui/creator_bg.jpg')}")` }, 'aria-hidden': 'true' }));
  m.box.append(
    h('div', { class: 'creator-preview' }, canvas, h('div', { class: 'creator-preview-tools' }, waveBtn), baseDesc),
    h(
      'div',
      { class: 'creator-form' },
      h('p', { class: 'qm-eyebrow' }, '작은 빛으로 태어나기'),
      title,
      section('base', '기본형', BASES, (b) => [b.label]),
      section('body', '몸 색', BODY_COLORS, (c) => [swatch(c.hex), c.label]),
      section('chest', '가슴 빛', CHEST_COLORS, (c) => [swatch(c.hex), c.label]),
      section('symbol', '심볼', SYMBOLS, (s) => [s.label]),
      section('accessory', '장식', ACCESSORIES, (a) => [a.label]),
      h('div', { class: 'creator-section' }, h('label', { for: 'creatorName' }, h('h3', {}, '이름')), nameInput),
      h('div', { class: 'qm-actions' }, back, confirm),
    ),
  );
  return {
    canvas,
    get open() {
      return m.open;
    },
    show(firstTime) {
      back.hidden = !!firstTime && false;
      back.textContent = firstTime ? '시작 화면으로' : '닫기';
      m.show(() => actions.closeCreator(), '.creator-chip[aria-checked="true"]');
    },
    update(profile, unlocks) {
      for (const [key, list] of Object.entries(groups)) {
        for (const { it, b } of list) {
          const on = profile[key] === it.id;
          b.setAttribute('aria-checked', String(on));
          b.classList.toggle('is-selected', on);
          const locked = it.unlock && !unlocks.includes(it.unlock);
          b.disabled = !!locked;
          b.title = locked ? `${it.label} · 플레이 보상으로 열려요` : '';
        }
      }
      baseDesc.textContent = byId(BASES, profile.base).desc;
      if (document.activeElement !== nameInput) nameInput.value = profile.name;
    },
    hide: () => m.hide(),
  };
}

// ------------------------------------------------------------------ 대화(화자 모습·선택지)

export function createDialogue(root, actions) {
  const portrait = h('span', { class: 'dlg-portrait' });
  const name = h('strong', { class: 'dlg-name', id: 'dlgName' });
  const text = h('p', { class: 'dlg-text', id: 'dlgText', 'aria-live': 'polite' });
  const choices = h('div', { class: 'dlg-choices' });
  const box = h(
    'section',
    { class: 'dialogue hud-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dlgName', 'aria-describedby': 'dlgText' },
    portrait,
    h('div', { class: 'dlg-body' }, name, text, choices),
  );
  const layer = h('div', { class: 'dialogue-layer' }, box);
  layer.hidden = true;
  root.append(layer);
  let release = null;
  let script = null;
  let index = 0;

  function render() {
    const step = script.steps[index];
    name.textContent = step.speaker;
    portrait.style.backgroundImage = step.portrait ? `url("${step.portrait}")` : '';
    text.textContent = step.text;
    const opts = step.choices ?? [{ label: index < script.steps.length - 1 ? '다음' : '닫기', primary: true, next: true }];
    choices.replaceChildren(
      ...opts.map((c) =>
        h(
          'button',
          {
            class: `btn ${c.primary ? 'btn-primary' : 'btn-quiet'}`,
            type: 'button',
            disabled: !!c.disabled,
            title: c.disabled || '',
            onClick: () => {
              if (c.next) advance();
              else {
                close();
                c.onPick?.();
              }
            },
          },
          c.label,
        ),
      ),
    );
    (choices.querySelector('.btn-primary:not([disabled])') ?? choices.querySelector('button:not([disabled])'))?.focus();
  }
  function advance() {
    if (index < script.steps.length - 1) {
      index++;
      render();
    } else close();
  }
  function close() {
    if (layer.hidden) return;
    layer.hidden = true;
    const r = release;
    release = null;
    r?.();
    const done = script?.onClose;
    script = null;
    done?.();
    actions.dialogueClosed();
  }
  return {
    get open() {
      return !layer.hidden;
    },
    /** steps: [{ speaker, portrait, text, choices?: [{label, onPick, primary, disabled}] }] */
    play(s) {
      script = s;
      index = 0;
      layer.hidden = false;
      release?.();
      release = trapFocus(box, () => close());
      render();
    },
    close,
  };
}

// ------------------------------------------------------------------ 등불 조율

export function createTuningPanel(root, actions) {
  const title = h('h2', { class: 'pz-title', id: 'tuneTitle' }, '등불 박자 맞추기');
  const ring = h('span', { class: 'tune-ring', 'aria-hidden': 'true' }, h('span', { class: 'tune-core' }));
  const count = h('p', { class: 'tune-count' });
  const status = h('p', { class: 'pz-status', role: 'status', 'aria-live': 'polite' });
  const hit = h('button', { class: 'btn btn-primary btn-lg tune-hit', type: 'button', onClick: () => actions.tunePress() }, h('span', { class: 'key' }, 'E'), '지금 빛 보내기');
  const auto = h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.tuneAuto() }, '자동으로 맞추기');
  const cancel = h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.tuneCancel() }, '나중에');
  const el = h(
    'section',
    { class: 'puzzle-panel tune-panel hud-panel', role: 'group', 'aria-labelledby': 'tuneTitle' },
    title,
    h('p', { class: 'pz-desc' }, '어긋난 등불이 가장 밝아지는 순간에 빛을 보내요. 고리가 가운데로 모이면 지금이에요.'),
    h('div', { class: 'tune-stage' }, ring, count),
    status,
    h('div', { class: 'pz-actions' }, cancel, auto, hit),
  );
  el.hidden = true;
  root.append(el);
  return {
    el,
    update(t, now) {
      el.hidden = !t;
      if (!t) return;
      const g = glowAt(t, now);
      const off = offsetFromPeak(t, now);
      ring.style.setProperty('--g', g.toFixed(3));
      ring.style.setProperty('--s', (1 + Math.min(1, off / 0.8) * 1.2).toFixed(3));
      ring.classList.toggle('is-window', off <= t.window);
      count.textContent = `등불 ${Math.min(t.index + 1, t.lanterns)} / ${t.lanterns}`;
      auto.hidden = t.misses < 2 || t.status === 'done';
      status.textContent =
        t.status === 'done'
          ? '박자가 맞았어요! 빛이 길을 따라 흘러가요.'
          : t.lastResult === 'hit'
            ? '맞았어요! 다음 등불이 대답해요.'
            : t.lastResult === 'miss'
              ? t.misses >= 2
                ? '괜찮아요. 판정을 넓혔어요. 밝아지는 순간을 조금 더 여유 있게 기다려요.'
                : '조금 어긋났어요. 가장 밝을 때 다시 보내요.'
              : '등불을 보며 기다려요.';
      hit.disabled = t.status !== 'playing';
    },
  };
}

// ------------------------------------------------------------------ 교환·엮기

export function createExchangePanel(root, actions) {
  const m = modalLayer(root, 'exchange', 'exTitle');
  const title = h('h2', { class: 'qm-title', id: 'exTitle' });
  const eyebrow = h('p', { class: 'qm-eyebrow' });
  const give = h('div', { class: 'ex-col' });
  const get = h('div', { class: 'ex-col' });
  const arrow = h('span', { class: 'ex-arrow', 'aria-hidden': 'true' }, icon('sparkle'));
  const rule = h('p', { class: 'qm-hint ex-rule' });
  const cancel = h('button', { class: 'btn btn-quiet btn-lg', type: 'button', onClick: () => actions.exchangeCancel() }, '취소');
  const ok = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => actions.exchangeConfirm() });
  m.box.append(eyebrow, title, h('div', { class: 'ex-compare' }, give, arrow, get), rule, h('div', { class: 'qm-actions' }, cancel, ok));
  const tile = (heading, light, note) =>
    [h('h3', {}, heading), h('span', { class: 'ex-light', style: { '--c': byId(COLORS, light.color)?.hex ?? '#fff' } }, artIcon(light.form)), h('strong', {}, lightName(light)), h('span', { class: 'ex-note' }, note)];
  return {
    get open() {
      return m.open;
    },
    showTrade(myLight) {
      eyebrow.textContent = '리본과 빛 나누기';
      title.textContent = '너의 빛과 나의 빛';
      give.replaceChildren(...tile('건네는 것', myLight, '내 빛을 복제한 작은 조각'));
      get.replaceChildren(...tile('받는 것', { form: 'orb', color: 'mint' }, '리본의 민트빛 구슬'));
      rule.textContent = '내 빛의 원본은 그대로 남아요. 리본은 복제한 조각만 받아요.';
      ok.replaceChildren(icon('heart'), '빛 나누기');
      m.show(() => actions.exchangeCancel());
    },
    showWeave(myLight) {
      eyebrow.textContent = '두 빛을 한 줄기로';
      title.textContent = '항해용 빛 엮기';
      give.replaceChildren(...tile('내 빛의 제작법', myLight, '처음 빚은 색과 맥동'));
      get.replaceChildren(...tile('받은 빛', { form: 'orb', color: 'mint' }, '리본의 민트빛 구슬'));
      rule.textContent = '받은 민트빛은 엮는 데 쓰이고, 엮은 빛은 항해 나무에 보낼 수 있어요.';
      ok.replaceChildren(icon('sparkle'), '엮기');
      m.show(() => actions.exchangeCancel());
    },
    hide: () => m.hide(),
  };
}

// ------------------------------------------------------------------ 항로 선택

export function createRoutePanel(root, actions) {
  const m = modalLayer(root, 'routes', 'routeTitle');
  const cards = h('div', { class: 'route-cards', role: 'radiogroup', 'aria-label': '첫 목적지' });
  const sail = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => actions.routeConfirm() }, icon('jelly'), '이곳으로 항해하기');
  const cancel = h('button', { class: 'btn btn-quiet btn-lg', type: 'button', onClick: () => actions.routeCancel() }, '조금 더 둘러보기');
  m.box.append(
    h('p', { class: 'qm-eyebrow' }, '항해사 보라의 해석'),
    h('h2', { class: 'qm-title', id: 'routeTitle' }, '빛이 읽어 낸 두 항로'),
    cards,
    h('div', { class: 'qm-actions' }, cancel, sail),
  );
  let chosen = null;
  return {
    get open() {
      return m.open;
    },
    show(current) {
      chosen = current ?? null;
      cards.replaceChildren(
        ...ROUTES.map((r) => {
          const b = h(
            'button',
            { class: 'route-card', type: 'button', role: 'radio', onClick: () => pick(r.id) },
            h('span', { class: 'route-view', style: { backgroundImage: `url("${assetUrl(`scenes/${r.id}_pano.jpg`)}")` }, 'aria-hidden': 'true' }),
            h('strong', {}, r.label),
            h('span', {}, r.desc),
            h('span', { class: 'route-gift' }, icon('sparkle'), `얻을 수 있는 빛: ${r.gift}`),
          );
          b.dataset.id = r.id;
          return b;
        }),
      );
      pick(chosen);
      m.show(() => actions.routeCancel(), '.route-card');
    },
    get chosen() {
      return chosen;
    },
    hide: () => m.hide(),
  };
  function pick(id) {
    chosen = id;
    for (const b of cards.children) {
      const on = b.dataset.id === id;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('is-selected', on);
    }
    sail.disabled = !id;
    sail.title = id ? '' : '먼저 목적지를 골라요';
  }
}

// ------------------------------------------------------------------ 해파리의 항해 연출

export function createVoyageCinematic(root, actions) {
  const canvas = h('canvas', { class: 'voy-canvas', 'aria-hidden': 'true' });
  const img = h('div', { class: 'voyage-img', style: { backgroundImage: `url("${assetUrl('ui/voyage.jpg')}")` }, 'aria-hidden': 'true' });
  const caption = h('p', { class: 'voyage-caption', id: 'voyCaption', 'aria-live': 'polite' });
  const wait = h('span', { class: 'voy-wait' });
  const skip = h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.voyageSkip() }, '건너뛰기');
  const el = h(
    'section',
    { class: 'overlay voyage voy', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'voyCaption' },
    img,
    canvas,
    h('div', { class: 'voyage-ui hud-panel' }, caption, wait, skip),
  );
  el.hidden = true;
  root.append(el);
  let release = null;
  let raf = 0;
  const stars = Array.from({ length: 180 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));
  const tints = { solar: [255, 196, 150], ice: [170, 240, 220], overlook: [220, 210, 255] };
  return {
    get open() {
      return !el.hidden;
    },
    /** lines: [{at: 초, text}] */
    /** live: 3D 해파리 항해를 뒤에 그리는 중이면 배경 그림·별 줄기 없이 목적지 빛깔만 살짝 입힌다 */
    show(to, lines, duration, reduced, live = false) {
      el.hidden = false;
      el.classList.toggle('is-reduced', !!reduced);
      el.classList.toggle('is-live', !!live);
      release = trapFocus(el, null);
      skip.focus();
      const t0 = performance.now();
      const ctx = canvas.getContext('2d');
      const tint = tints[to] ?? tints.overlook;
      img.style.animation = 'none';
      void img.offsetWidth;
      img.style.animation = '';
      const draw = (now) => {
        if (el.hidden) return;
        const t = (now - t0) / 1000;
        const W = (canvas.width = canvas.clientWidth);
        const H = (canvas.height = canvas.clientHeight);
        const k = Math.min(1, t / duration);
        const line = [...lines].reverse().find((l) => t >= l.at);
        if (line && caption.textContent !== line.text) caption.textContent = line.text;
        ctx.clearRect(0, 0, W, H);
        // 목적지 색으로 서서히 물드는 성운
        const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
        if (live) {
          // 끝무렵 목적지 빛으로 번지며 도착 장면으로 넘어간다
          const end = Math.max(0, (k - 0.8) / 0.2);
          grad.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},${k * 0.12 + end * 0.75})`);
          grad.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},${end * 0.45})`);
        } else {
          grad.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},${0.05 + k * 0.35})`);
          grad.addColorStop(1, 'rgba(40,36,110,0)');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        if (!reduced && !live) {
          const speed = 0.2 + Math.min(1, t / 3) * 1.4;
          for (const s of stars) {
            s.z -= 0.004 * speed;
            if (s.z <= 0.02) {
              s.z = 1;
              s.x = Math.random() * 2 - 1;
              s.y = Math.random() * 2 - 1;
            }
            const px = W / 2 + (s.x / s.z) * W * 0.3;
            const py = H / 2 + (s.y / s.z) * H * 0.3;
            const len = 18 * speed * (1 - s.z);
            const mix = Math.min(1, k * 1.4);
            ctx.strokeStyle = `rgba(${255 - (255 - tint[0]) * mix},${255 - (255 - tint[1]) * mix},${255 - (255 - tint[2]) * mix},${0.7 * (1 - s.z)})`;
            ctx.lineWidth = 2 * (1 - s.z);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(W / 2 + (s.x / (s.z + 0.02 * speed)) * W * 0.3 + Math.sign(s.x) * len * 0.2, H / 2 + (s.y / (s.z + 0.02 * speed)) * H * 0.3);
            ctx.stroke();
          }
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    },
    setWaiting(on) {
      wait.textContent = on ? '도착 준비 중…' : '';
    },
    hide() {
      el.hidden = true;
      cancelAnimationFrame(raf);
      release?.();
      release = null;
    },
  };
}

// ------------------------------------------------------------------ 설정

export function createSettings(root, actions) {
  const m = modalLayer(root, 'settings', 'setTitle');
  const toggle = (id, label) => {
    const input = h('input', { type: 'checkbox', id, onChange: (e) => actions.setSetting(id, e.target.checked) });
    return { input, row: h('label', { class: 'set-row', for: id }, input, h('span', {}, label)) };
  };
  const hints = toggle('hints', '튜토리얼 안내 보기');
  const guide = toggle('guide', '길 안내 표시(목표 핀·방향 화살표·바닥 빛 길)');
  const motion = toggle('reducedMotion', '움직임 줄이기(항해·승강대 짧게, 흔들림 없음)');
  const sound = toggle('sound', '소리');
  m.box.append(
    h('h2', { class: 'qm-title', id: 'setTitle' }, '여행 설정'),
    hints.row,
    guide.row,
    motion.row,
    sound.row,
    h(
      'div',
      { class: 'set-actions' },
      h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.showControls() }, icon('eye'), '조작 안내 다시 보기'),
      h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.openCreatorFromMenu() }, icon('heart'), '내 모습 바꾸기'),
      h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.toTitle() }, icon('retry'), '시작 화면으로'),
    ),
    h('div', { class: 'qm-actions' }, h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => actions.closeSettings() }, '닫기')),
  );
  return {
    get open() {
      return m.open;
    },
    show(settings, canEditLook) {
      hints.input.checked = settings.hints;
      guide.input.checked = settings.guide !== false;
      motion.input.checked = settings.reducedMotion;
      sound.input.checked = !settings.muted;
      m.box.querySelectorAll('.set-actions .btn')[1].disabled = !canEditLook;
      m.box.querySelectorAll('.set-actions .btn')[1].title = canEditLook ? '' : '길을 복원한 뒤 캡슐 마을에서 바꿀 수 있어요';
      m.show(() => actions.closeSettings());
    },
    hide: () => m.hide(),
  };
}

// ------------------------------------------------------------------ 안내 말풍선·조작 안내·챕터 완료

export function createHint(root) {
  const text = h('span', {});
  const el = h('p', { class: 'story-hint', role: 'status', 'aria-live': 'polite' }, icon('sparkle'), text);
  el.hidden = true;
  root.append(el);
  let last = '';
  return {
    set(message) {
      if (!message) {
        el.hidden = true;
        last = '';
        return;
      }
      el.hidden = false;
      if (message !== last) {
        last = message;
        text.innerHTML = '';
        // **강조** 표기만 살구색으로
        message.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
          if (part.startsWith('**')) text.append(h('b', {}, part.slice(2, -2)));
          else if (part) text.append(part);
        });
        el.classList.remove('is-in');
        void el.offsetWidth;
        el.classList.add('is-in');
      }
    },
  };
}

/** 목표 방향 표시: 화면 안이면 목표 위에 이름·거리, 밖이면 가장자리에 방향 화살표 */
export function createObjectivePointer(root) {
  const arrow = h('span', { class: 'obj-arrow', 'aria-hidden': 'true' }, icon('chevronUp'));
  const name = h('strong', { class: 'obj-name' });
  const dist = h('span', { class: 'obj-dist' });
  const el = h('div', { class: 'obj-pointer', 'aria-hidden': 'true' }, arrow, h('span', { class: 'obj-text' }, name, dist));
  el.hidden = true;
  root.append(el);
  return {
    el,
    /** p: { x, y, z(NDC 깊이), behind }, W/H: 무대 크기 */
    update(info) {
      if (!info) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      name.textContent = info.label;
      dist.textContent = info.distance >= 1 ? `${Math.round(info.distance)}m` : '';
      const margin = 70;
      const top = 110;
      const bottom = info.H - 150;
      const { x, y } = info;
      const inside = !info.behind && x > margin && x < info.W - margin && y > 20 && y < bottom;
      el.classList.toggle('is-edge', !inside);
      if (inside) {
        // 위쪽 안내 말풍선과 겹치지 않게 조금 아래로
        el.style.left = `${Math.max(200, Math.min(info.W - 200, x))}px`;
        el.style.top = `${Math.max(150, y)}px`;
        arrow.style.transform = 'rotate(180deg)';
        return;
      }
      // 화면 가운데에서 목표 방향으로 뻗은 선이 가장자리와 만나는 곳
      const cx = info.W / 2;
      const cy = info.H / 2;
      let dx = x - cx;
      let dy = y - cy;
      if (info.behind) {
        // 뒤쪽 목표는 아래(도구 막대 자리) 대신 돌아야 할 쪽 옆 가장자리로
        dx = (dx > 0 ? -1 : 1) * info.W;
        dy = 0;
      }
      const sx = (info.W / 2 - margin) / Math.max(1e-3, Math.abs(dx));
      const sy = ((dy < 0 ? cy - top : bottom - cy)) / Math.max(1e-3, Math.abs(dy));
      const s = Math.min(sx, sy);
      el.style.left = `${cx + dx * s}px`;
      el.style.top = `${cy + dy * s}px`;
      arrow.style.transform = `rotate(${Math.atan2(dx, -dy)}rad)`;
    },
  };
}

export function createControlsHelp(root, actions) {
  const m = modalLayer(root, 'controls', 'ctlTitle');
  const rows = [
    ['WASD · 방향키', '걷기 (Shift 달리기)'],
    ['Space', '점프 (낮은 턱 오르기)'],
    ['바닥 클릭', '그곳까지 걸어가기'],
    ['드래그', '시점 360° 돌리기'],
    ['휠', '가까이 · 멀리'],
    ['Q / R', '시점 45° 돌리기'],
    ['E', '가까운 대상과 상호작용'],
    ['Esc', '패널 닫기 · 설정'],
  ];
  m.box.append(
    h('h2', { class: 'qm-title', id: 'ctlTitle' }, '조작 안내'),
    h('dl', { class: 'ctl-list' }, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    h('div', { class: 'qm-actions' }, h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => actions.closeControls() }, '확인')),
  );
  return { show: () => m.show(() => actions.closeControls()), hide: () => m.hide(), get open() { return m.open; } };
}

export function createBanner(root) {
  const eyebrow = h('p', { class: 'qm-eyebrow' });
  const title = h('h2', { class: 'qm-title' });
  const sub = h('p', { class: 'intro-lead' });
  const el = h('div', { class: 'chapter-banner hud-panel', role: 'status', 'aria-live': 'polite' }, eyebrow, title, sub);
  el.hidden = true;
  root.append(el);
  let timer = 0;
  return {
    show(e, t, s, ms = 5200) {
      eyebrow.textContent = e;
      title.textContent = t;
      sub.textContent = s;
      el.hidden = false;
      el.classList.remove('is-in');
      void el.offsetWidth;
      el.classList.add('is-in');
      clearTimeout(timer);
      timer = setTimeout(() => (el.hidden = true), ms);
    },
  };
}

export { cleanName, FORMS };
