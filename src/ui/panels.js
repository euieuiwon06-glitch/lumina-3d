// 대상 근처에 뜨는 작은 패널들: 상호작용 안내, 빛 놓기, 빛 작업대, 결정의 노래, 주민 말풍선.
// 앵커는 3D 위치를 화면에 투영한 무대 좌표({ x, y, visible })다.
import { MOTIONS, SOFT_BRIGHTNESS, byId, lightName } from '../game/catalog.js';
import { SLOT_QUEST, lightAt } from '../game/quests.js';
import { canDepart, hasUnlock, slotAvailability } from '../game/state.js';
import { stage } from '../engine/stage.js';
import { artIcon, h, icon } from './dom.js';

const DEST_NAME = { ice: '얼음 성운', solar: '태양 정원', twilight: '황혼 합류지', overlook: '항해 전망대' };

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
  x = Math.max(16, Math.min(stage.W - w - 16, x));
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
  const hint = h('p', { class: 'sp-hint' }, icon('wave'), h('span', {}, '움직임·밝기는 빛 제작실 작업대에서 골라요'));
  const reason = h('p', { class: 'sp-reason' });
  const placeBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => actions.place() }, icon('check', 'btn-check'), '놓기');
  const retrieveBtn = h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => actions.retrieve() }, '거두기');
  const departBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => actions.requestDepart() }, icon('jelly'), h('span', {}, '출항하기'));
  const closeBtn = h('button', { class: 'icon-btn sp-close', type: 'button', 'aria-label': '패널 닫기', onClick: () => actions.closePanel() }, icon('close'));
  const el = h(
    'section',
    { class: 'slot-panel hud-panel', role: 'group', 'aria-labelledby': 'slotPanelTitle' },
    h('div', { class: 'sp-head' }, h('div', {}, name, where), closeBtn),
    props,
    hint,
    reason,
    h('div', { class: 'sp-actions' }, retrieveBtn, departBtn, placeBtn),
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
      const L = placed ?? state.draft;
      where.textContent = `${slot.label} · 씨앗 ${state.materials.seed}개`;
      name.textContent = lightName(L);
      props.textContent = `${byId(MOTIONS, L.motion).label} · 밝기 ${L.brightness}`;
      hint.hidden = !av.canPlace;

      placeBtn.hidden = !!placed;
      placeBtn.disabled = !av.canPlace;
      retrieveBtn.hidden = !placed;
      retrieveBtn.disabled = !av.canRetrieve;

      const questActive = ['active', 'completed', 'claimed'].includes(state.quests[SLOT_QUEST.helm]);
      const dep = canDepart(state);
      departBtn.hidden = !(slot.helm && placed && questActive);
      departBtn.disabled = !dep.ok;
      departBtn.lastChild.textContent = dep.to ? `${DEST_NAME[dep.to]}으로 출항` : '출항하기';

      let msg = av.reason;
      if (!departBtn.hidden) msg = dep.ok ? `빛이 ${DEST_NAME[dep.to]} 쪽으로 항로를 틀었어요.` : dep.reason;
      if (placed && !av.canRetrieve && departBtn.hidden) msg = av.reason;
      reason.textContent = msg ?? '';
      reason.hidden = !msg;
      if (anchor) placeBeside(el, anchor, player);
    },
  };
}

// ------------------------------------------------------------------ 빛 작업대(움직임·밝기)

export function createCraftPanel(root, actions) {
  const name = h('strong', { class: 'sp-name', id: 'craftTitle' });
  const where = h('span', { class: 'sp-where' }, '빛 작업대 · 도크와 팔레트로 형태·색도 바꿔요');
  const motionRow = h('div', { class: 'sp-motions', role: 'radiogroup', 'aria-label': '움직임' });
  const motionBtns = MOTIONS.map((m) => {
    const b = h('button', { class: 'chip', type: 'button', role: 'radio', onClick: () => actions.setDraft('motion', m.id) }, m.label);
    motionRow.append(b);
    return { m, b };
  });
  const lockedNote = h('p', { class: 'sp-reason' });
  const brightValue = h('output', { class: 'sp-bright-value', for: 'brightness' });
  const bright = h('input', {
    id: 'brightness',
    class: 'sp-bright',
    type: 'range',
    min: '20',
    max: '100',
    step: '5',
    onInput: (e) => actions.setDraft('brightness', Number(e.target.value)),
  });
  const brightRow = h('label', { class: 'sp-bright-row', for: 'brightness' }, h('span', {}, '밝기'), bright, brightValue);
  const closeBtn = h('button', { class: 'icon-btn sp-close', type: 'button', 'aria-label': '작업대 닫기', onClick: () => actions.closePanel() }, icon('close'));
  const doneBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => actions.closePanel() }, icon('check', 'btn-check'), '다 빚었어요');
  const el = h(
    'section',
    { class: 'slot-panel craft-panel hud-panel', role: 'group', 'aria-labelledby': 'craftTitle' },
    h('div', { class: 'sp-head' }, h('div', {}, name, where), closeBtn),
    h('div', { class: 'sp-editor' }, h('div', { class: 'sp-motion-head' }, icon('wave'), h('span', {}, '움직임')), motionRow, lockedNote, brightRow),
    h('p', { class: 'sp-hint' }, icon('sparkle'), h('span', {}, '빚은 빛은 씨앗을 들고 설치 지점에서 놓아요')),
    h('div', { class: 'sp-actions' }, doneBtn),
  );
  el.hidden = true;
  root.append(el);
  return {
    el,
    update({ state, open, anchor, player }) {
      el.hidden = !open;
      if (!open) return;
      const d = state.draft;
      name.textContent = lightName(d);
      let lockedCount = 0;
      for (const { m, b } of motionBtns) {
        const unlocked = hasUnlock(state, m.unlock);
        b.hidden = !unlocked;
        if (!unlocked) lockedCount++;
        b.setAttribute('aria-checked', String(d.motion === m.id));
        b.classList.toggle('is-selected', d.motion === m.id);
      }
      lockedNote.hidden = !lockedCount;
      lockedNote.textContent = '새로운 움직임은 먼 곳의 현상에서 기억으로 얻어요.';
      if (document.activeElement !== bright) bright.value = String(d.brightness);
      brightValue.textContent = String(d.brightness);
      brightRow.classList.toggle('is-soft', d.brightness <= SOFT_BRIGHTNESS);
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
