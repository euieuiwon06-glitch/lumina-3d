// 대상 근처에 뜨는 작은 패널들: 상호작용 안내, 빛 놓기, 빛 작업대, 결정의 노래, 주민 말풍선.
// 앵커는 3D 위치를 화면에 투영한 무대 좌표({ x, y, visible })다.
import { COLORS, MOTIONS, REPLY_SPOTS, SOFT_BRIGHTNESS, byId, lightName } from '../game/catalog.js';
import { carriedLights, lightAt } from '../game/quests.js';
import { craftCost, craftOptions, slotAvailability } from '../game/state.js';
import { stage } from '../engine/stage.js';
import { artIcon, h, icon } from './dom.js';

function place(el, x, y, { w = 0, anchor = 'center' } = {}) {
  let left = anchor === 'center' ? x - w / 2 : x;
  left = Math.max(16, Math.min(stage.W - w - 16, left));
  el.style.left = `${left}px`;
  el.style.top = `${Math.max(16, Math.min(stage.H - (el.offsetHeight || 60) - 120, y))}px`;
}

/** 캐릭터를 가리지 않도록 앵커 옆에 패널을 둔다 */
function placeBeside(el, anchor, player) {
  const w = el.offsetWidth || 330;
  const hgt = el.offsetHeight || 240;
  const gap = 90;
  const preferLeft = player ? player.x >= anchor.x : anchor.x > stage.W / 2;
  let x = preferLeft ? Math.min(anchor.x, player?.x ?? anchor.x) - w - gap : Math.max(anchor.x, player?.x ?? anchor.x) + gap;
  if (x < 16 || x + w > stage.W - 16) x = preferLeft ? Math.max(anchor.x, player?.x ?? anchor.x) + gap : Math.min(anchor.x, player?.x ?? anchor.x) - w - gap;
  // 왼쪽 위 목표 카드(약 380px 너비) 영역은 피한다
  const leftGuard = anchor.y - hgt * 0.5 < 380 ? 380 : 16;
  x = Math.max(leftGuard, Math.min(stage.W - w - 16, x));
  const y = Math.max(150, Math.min(stage.H - hgt - 150, anchor.y - hgt * 0.5));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

// ------------------------------------------------------------------ 상호작용 안내

export function createPrompt(root, actions) {
  const label = h('span', { class: 'prompt-name' });
  const btn = h('button', { class: 'prompt-btn', type: 'button', onClick: () => actions.interact() });
  const el = h('div', { class: 'prompt hud-panel' }, label, btn);
  el.hidden = true;
  root.append(el);
  let lastKey = '';
  return {
    el,
    update(target) {
      if (!target || !target.anchor?.visible) {
        el.hidden = true;
        lastKey = '';
        return;
      }
      el.hidden = false;
      const key = `${target.name}|${target.verb}|${target.locked ? 1 : 0}`;
      if (key !== lastKey) {
        lastKey = key;
        label.textContent = target.name;
        btn.replaceChildren(...[h('span', { class: 'key', 'aria-hidden': 'true' }, 'E'), target.locked ? icon('lock') : null, target.verb].filter(Boolean));
        btn.setAttribute('aria-label', `${target.name} ${target.verb} (E 키)`);
        el.classList.toggle('is-locked', !!target.locked);
      }
      place(el, target.anchor.x, target.anchor.y, { w: el.offsetWidth || 220 });
    },
  };
}

// ------------------------------------------------------------------ 주민 말풍선

export function createBubble(root) {
  const el = h('p', { class: 'bubble', role: 'status' });
  el.hidden = true;
  root.append(el);
  let timer = 0;
  let anchorFn = null;
  return {
    show(text, getAnchor) {
      el.textContent = text;
      el.hidden = false;
      anchorFn = getAnchor;
      this.follow();
      clearTimeout(timer);
      timer = setTimeout(() => {
        el.hidden = true;
        anchorFn = null;
      }, 3800);
    },
    follow() {
      if (el.hidden || !anchorFn) return;
      const a = anchorFn();
      el.style.visibility = a.visible ? 'visible' : 'hidden';
      place(el, a.x, a.y - 70, { w: el.offsetWidth || 300 });
    },
    hide() {
      el.hidden = true;
      anchorFn = null;
    },
  };
}

// ------------------------------------------------------------------ 빛 놓기 패널(시안의 작은 "살구빛 꽃 · 맥동 · 놓기" 카드)

export function createSlotPanel(root, actions) {
  const name = h('strong', { class: 'sp-name', id: 'slotPanelTitle' });
  const where = h('span', { class: 'sp-where' });
  const props = h('p', { class: 'sp-placed' });
  const hint = h('p', { class: 'sp-hint' }, icon('wave'), h('span', {}, '놓기 전 자리에 미리 보여요. 거두면 다시 들고 다녀요.'));
  const reason = h('p', { class: 'sp-reason' });
  const needText = h('span', {});
  const need = h('p', { class: 'sp-hint use-need' }, icon('sun'), needText);
  const placeBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => actions.place() }, icon('check', 'btn-check'), '놓기');
  const retrieveBtn = h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.retrieve() }, '거두기');
  const closeBtn = h('button', { class: 'icon-btn sp-close', type: 'button', 'aria-label': '패널 닫기', onClick: () => actions.closePanel() }, icon('close'));
  const el = h(
    'section',
    { class: 'slot-panel hud-panel', role: 'group', 'aria-labelledby': 'slotPanelTitle' },
    h('div', { class: 'sp-head' }, h('div', {}, name, where), closeBtn),
    props,
    need,
    hint,
    reason,
    h('div', { class: 'sp-actions' }, retrieveBtn, placeBtn),
  );
  el.hidden = true;
  root.append(el);

  return {
    el,
    update({ state, slot, anchor, player }) {
      if (!slot) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      const av = slotAvailability(state, slot.id);
      const placed = lightAt(state, slot.id);
      const carried = carriedLights(state).filter((l) => l.origin === 'crafted');
      const L = placed ?? carried[carried.length - 1] ?? null;
      where.textContent = slot.label;
      name.textContent = L ? lightName(L) : '들고 있는 빛 없음';
      props.textContent = L ? `${byId(MOTIONS, L.motion).label} · 밝기 ${L.brightness}` : '';
      props.hidden = !L;
      hint.hidden = !av.canPlace;
      placeBtn.hidden = !!placed;
      placeBtn.disabled = !av.canPlace;
      retrieveBtn.hidden = !placed;
      retrieveBtn.disabled = !av.canRetrieve;
      reason.textContent = av.reason ?? '';
      reason.hidden = !av.reason;
      // 답장 자리: 어떤 빛이 어울리는지 조건과 지금 빛의 충족 여부(색은 자유)
      const rule = REPLY_SPOTS.find((r) => r.slot === slot.id);
      need.hidden = !rule;
      if (rule) needText.textContent = `어울리는 빛: ${rule.need} · 색과 형태는 자유${L ? (rule.check(L) ? ' — 지금 빛이 잘 어울려요 ✓' : ' — 지금 빛은 조건과 달라요') : ''}`;
      if (anchor) placeBeside(el, anchor, player);
    },
  };
}

// ------------------------------------------------------------------ 빛 비추기(꽃·결정 흔적·빛길): 들고 있는 빛을 대상에 비추고 반응을 본다

/**
 * info: { title, where, need, needIcon, light, result, resultTone, useLabel, canUse, readLabel }
 * light: 들고 있는 빛(없으면 null). 비춘 빛은 사라지지 않는다
 */
export function createUsePanel(root, actions) {
  const name = h('strong', { class: 'sp-name', id: 'usePanelTitle' });
  const where = h('span', { class: 'sp-where' });
  const needIco = h('span', { class: 'use-need-ico', 'aria-hidden': 'true' });
  const needText = h('span', {});
  const need = h('p', { class: 'sp-hint use-need' }, needIco, needText);
  const lightRow = h('p', { class: 'sp-placed use-light' });
  const result = h('p', { class: 'use-result', role: 'status', 'aria-live': 'polite' });
  const craftBtn = h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.fieldCraft() }, '빛 빚기·조절');
  const useBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => actions.useLight() }, icon('sparkle', 'btn-check'), h('span', {}));
  const readBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => actions.readTrace() }, icon('eye', 'btn-check'), h('span', {}));
  const closeBtn = h('button', { class: 'icon-btn sp-close', type: 'button', 'aria-label': '패널 닫기', onClick: () => actions.closePanel() }, icon('close'));
  const el = h(
    'section',
    { class: 'slot-panel use-panel hud-panel', role: 'group', 'aria-labelledby': 'usePanelTitle' },
    h('div', { class: 'sp-head' }, h('div', {}, name, where), closeBtn),
    need,
    lightRow,
    result,
    h('div', { class: 'sp-actions' }, craftBtn, useBtn, readBtn),
  );
  el.hidden = true;
  root.append(el);
  return {
    el,
    update({ info, anchor, player }) {
      if (!info) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      name.textContent = info.title;
      where.textContent = info.where;
      needIco.replaceChildren(icon(info.needIcon ?? 'sparkle'));
      needText.textContent = info.need;
      const L = info.light;
      lightRow.textContent = L ? `들고 있는 빛: ${lightName(L)} · ${byId(MOTIONS, L.motion).label} · 밝기 ${L.brightness}` : '들고 있는 빛이 없어요. 여기서 바로 빚을 수 있어요.';
      result.textContent = info.result ?? '';
      result.hidden = !info.result;
      result.dataset.tone = info.resultTone ?? '';
      useBtn.lastChild.textContent = info.useLabel ?? '이 빛 비추기';
      useBtn.hidden = !!info.readLabel;
      useBtn.disabled = !L || !info.canUse;
      readBtn.hidden = !info.readLabel;
      readBtn.lastChild.textContent = info.readLabel ?? '';
      craftBtn.hidden = !!info.readLabel;
      if (anchor) placeBeside(el, anchor, player);
    },
  };
}

// ------------------------------------------------------------------ 둥근 작업대(색·움직임·밝기, 빚기)

export function createCraftPanel(root, actions) {
  const name = h('strong', { class: 'sp-name', id: 'craftTitle' });
  const where = h('span', { class: 'sp-where' });
  const colorRow = h('div', { class: 'sp-motions', role: 'radiogroup', 'aria-label': '빛의 색' });
  const colorBtns = COLORS.map((c) => {
    const b = h('button', { class: 'chip creator-chip', type: 'button', role: 'radio', onClick: () => actions.setDraft('color', c.id) }, h('span', { class: 'creator-sw', style: { '--sw': c.hex }, 'aria-hidden': 'true' }), c.label);
    colorRow.append(b);
    return { c, b };
  });
  const motionRow = h('div', { class: 'sp-motions', role: 'radiogroup', 'aria-label': '움직임' });
  const motionBtns = MOTIONS.map((m) => {
    const b = h('button', { class: 'chip', type: 'button', role: 'radio', onClick: () => actions.setDraft('motion', m.id) }, m.label);
    motionRow.append(b);
    return { m, b };
  });
  const lockedNote = h('p', { class: 'sp-reason' });
  const brightValue = h('output', { class: 'sp-bright-value', for: 'brightness' });
  const bright = h('input', { id: 'brightness', class: 'sp-bright', type: 'range', min: '20', max: '100', step: '5', onInput: (e) => actions.setDraft('brightness', Number(e.target.value)) });
  const brightRow = h('label', { class: 'sp-bright-row', for: 'brightness' }, h('span', {}, '밝기'), bright, brightValue);
  const brightNote = h('p', { class: 'sp-reason' }, '밝기 조절은 캡슐 마을의 포근에게 배울 수 있어요.');
  const closeBtn = h('button', { class: 'icon-btn sp-close', type: 'button', 'aria-label': '작업대 닫기', onClick: () => actions.closePanel() }, icon('close'));
  const craftBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => actions.craft() });
  const reshapeBtn = h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.reshape(), title: '들고 있는 빛을 지금 고른 색·움직임으로 다시 빚어요(재료 없음)' }, '다시 빚기');
  const status = h('p', { class: 'sp-hint' }, icon('sparkle'), h('span', {}));
  const el = h(
    'section',
    { class: 'slot-panel craft-panel hud-panel', role: 'group', 'aria-labelledby': 'craftTitle' },
    h('div', { class: 'sp-head' }, h('div', {}, name, where), closeBtn),
    h(
      'div',
      { class: 'sp-editor' },
      h('div', { class: 'sp-motion-head' }, icon('sparkle'), h('span', {}, '색')),
      colorRow,
      h('div', { class: 'sp-motion-head' }, icon('wave'), h('span', {}, '움직임')),
      motionRow,
      lockedNote,
      brightRow,
      brightNote,
    ),
    status,
    h('div', { class: 'sp-actions' }, reshapeBtn, craftBtn),
  );
  el.hidden = true;
  root.append(el);
  return {
    el,
    update({ state, open, anchor, player, field = null }) {
      el.hidden = !open;
      if (!open) return;
      const d = state.draft;
      const opt = craftOptions(state);
      name.textContent = lightName(d);
      const cost0 = craftCost(state);
      where.textContent = field
        ? `${field} 앞에서 빚기 · ${cost0 ? `별빛 씨앗 ${state.materials.seed}개` : '손에 든 빛이 없으면 재료 없이'}`
        : state.world.firstCrafted
          ? `둥근 작업대 · 별빛 씨앗 ${state.materials.seed}개`
          : '둥근 작업대 · 첫 빛은 재료 없이 빚어요';
      for (const { c, b } of colorBtns) {
        const on = d.color === c.id;
        b.hidden = !opt.colors.includes(c.id);
        b.setAttribute('aria-checked', String(on));
        b.classList.toggle('is-selected', on);
      }
      let hiddenMotions = 0;
      for (const { m, b } of motionBtns) {
        const ok = opt.motions.includes(m.id);
        b.hidden = !ok;
        if (!ok) hiddenMotions++;
        b.setAttribute('aria-checked', String(d.motion === m.id));
        b.classList.toggle('is-selected', d.motion === m.id);
      }
      lockedNote.hidden = !hiddenMotions;
      lockedNote.textContent = state.world.firstCrafted ? '새로운 움직임은 먼 곳의 현상에서 기억으로 얻어요.' : '첫 빛은 숨 쉬듯 맥동해요. 다른 움직임은 첫 빛을 완성하면 열려요.';
      brightRow.hidden = !opt.brightness;
      brightNote.hidden = opt.brightness;
      if (document.activeElement !== bright) bright.value = String(d.brightness);
      brightValue.textContent = String(d.brightness);
      brightRow.classList.toggle('is-soft', d.brightness <= SOFT_BRIGHTNESS);
      const cost = craftCost(state);
      craftBtn.replaceChildren(icon('check', 'btn-check'), state.world.firstCrafted ? `빛 빚기 (씨앗 ${cost})` : '첫 빛 완성하기');
      craftBtn.disabled = state.materials.seed < cost;
      craftBtn.title = craftBtn.disabled ? '별빛 씨앗이 필요해요' : '';
      const carried = carriedLights(state).filter((l) => l.origin === 'crafted');
      reshapeBtn.hidden = !carried.length;
      status.lastChild.textContent = field
        ? carried.length
          ? '다시 빚기로 들고 있는 빛을 바꾼 뒤, 닫고 다시 비춰 봐요'
          : '빛을 빚은 뒤 닫고 대상에 비춰 봐요'
        : carried.length
          ? `들고 있는 빛 ${carried.length}개 · 다시 빚기는 재료가 들지 않아요`
          : '빚은 빛은 들고 다니다가 설치 지점에 놓아요';
      if (anchor) placeBeside(el, anchor, player);
    },
  };
}

// ------------------------------------------------------------------ 결정의 노래 패널

export function createPuzzlePanel(root, actions) {
  const title = h('h2', { class: 'pz-title', id: 'puzzleTitle' });
  const desc = h('p', { class: 'pz-desc' });
  const pads = [0, 1, 2].map((i) =>
    h('button', { class: `pz-pad pad-${i}`, type: 'button', onClick: () => actions.puzzlePress(i) }, artIcon(i === 2 ? 'crystal' : 'shard'), h('span', { class: 'sr-only' }, `${i + 1}번 결정`)),
  );
  const dots = h('div', { class: 'pz-dots', 'aria-hidden': 'true' });
  const status = h('p', { class: 'pz-status', role: 'status', 'aria-live': 'polite' });
  const listenBtn = h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.puzzleListen() }, icon('ear'), '다시 듣기');
  const startBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => actions.puzzleStart() });
  const soundBtn = h('button', { class: 'icon-btn pz-sound', type: 'button', onClick: () => actions.toggleSound() });
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': '퍼즐 패널 닫기', onClick: () => actions.closePanel() }, icon('close'));
  const el = h(
    'section',
    { class: 'puzzle-panel hud-panel', role: 'group', 'aria-labelledby': 'puzzleTitle' },
    h('div', { class: 'pz-head' }, title, h('div', { class: 'pz-tools' }, soundBtn, closeBtn)),
    desc,
    h('div', { class: 'pz-pads' }, ...pads),
    dots,
    status,
    h('div', { class: 'pz-actions' }, listenBtn, startBtn),
  );
  el.hidden = true;
  root.append(el);

  return {
    el,
    update({ state, view, open, muted, glow }) {
      el.hidden = !open;
      if (!open) return;
      const p = view.puzzle;
      const questReady = ['active', 'completed', 'claimed'].includes(state.quests.song);
      soundBtn.replaceChildren(icon(muted ? 'mute' : 'sound'));
      soundBtn.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');

      const solved = state.puzzle.solved;
      title.textContent = solved ? '결정이 기억해 줬어요' : '귀 기울여 볼까요?';
      desc.textContent = solved ? '결정들이 천천히 맥동하고 있어요.' : '결정이 들려주는 순서대로 빛을 건드려요. 결정을 직접 눌러도 돼요.';

      const inputOn = p.status === 'input' && !solved;
      pads.forEach((b, i) => {
        b.disabled = !inputOn;
        b.classList.toggle('is-lit', glow[i] > 0.4);
        b.classList.toggle('is-wrong', view.crystalWrong === i);
      });
      dots.replaceChildren(
        ...p.sequence.map((_, i) => {
          const cls = solved || i < p.input.length ? (p.status === 'failure' && i === p.wrongAt ? 'dot wrong' : 'dot on') : 'dot';
          return h('span', { class: cls });
        }),
      );

      let text = '';
      if (!questReady) text = '리본의 부탁을 먼저 들어 보세요.';
      else if (solved) text = '성공! 리본에게 돌아가 선물을 받아요.';
      else if (p.status === 'idle') text = '시작하면 결정이 차례로 빛나며 노래해요.';
      else if (p.status === 'listening') text = '듣는 중… 빛나는 결정을 잘 봐 두세요.';
      else if (p.status === 'input') text = `따라 하기: ${p.input.length} / ${p.sequence.length}`;
      else if (p.status === 'failure') text = `${p.wrongAt + 1}번째 음이 달랐어요. 다시 들어 볼까요?`;
      status.textContent = text;

      listenBtn.disabled = !questReady || solved || !p.heard || p.status === 'listening';
      listenBtn.title = !p.heard ? '처음 한 번 들은 뒤 사용할 수 있어요' : '';
      startBtn.hidden = solved;
      startBtn.disabled = !questReady || p.status === 'listening' || p.status === 'input';
      startBtn.replaceChildren(icon(p.status === 'failure' ? 'retry' : 'play'), p.status === 'failure' ? '다시 하기' : '시작하기');
    },
  };
}
