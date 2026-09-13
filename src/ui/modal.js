// 주민 부탁 모달: 초상 → 부탁 제목 → 대화 → 함께 할 일 → 고마움의 선물 → 나중에·수락.
import { MATERIALS, UNLOCKS } from '../game/catalog.js';
import { QUESTS, taskResults } from '../game/quests.js';
import { h, icon, artIcon, portrait, trapFocus } from './dom.js';

function rewardTile(item) {
  const info = item.kind === 'material' ? MATERIALS[item.id] : UNLOCKS[item.id];
  const label = item.kind === 'material' && item.amount > 1 ? `${info.label} ×${item.amount}` : info.label;
  return h('li', { class: 'reward' }, artIcon(info.icon), h('span', {}, label));
}

export function createQuestModal(root, actions) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('section', { class: 'quest-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'questTitle', 'aria-describedby': 'questLines' });
  const layer = h('div', { class: 'modal-layer' }, backdrop, box);
  layer.hidden = true;
  root.append(layer);
  let release = null;
  let current = null;

  backdrop.addEventListener('click', () => actions.closeModal());

  function render(state, npc) {
    const id = npc.questId;
    const q = QUESTS[id];
    const st = state.quests[id];
    const tasks = taskResults(state, id);
    const lines = st === 'completed' || st === 'claimed' ? q.doneLines : q.lines;

    const primary = (() => {
      if (st === 'available')
        return h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => actions.acceptQuest(id) }, icon('heart'), '도와줄게');
      if (st === 'completed')
        return h('button', { class: 'btn btn-primary btn-lg', type: 'button', onClick: () => actions.claimReward(id) }, icon('sparkle'), '선물 받기');
      if (st === 'claimed') return h('button', { class: 'btn btn-primary btn-lg', type: 'button', disabled: true }, icon('check'), '받았어요');
      return h('button', { class: 'btn btn-primary btn-lg', type: 'button', disabled: true, 'aria-describedby': 'questHint' }, '진행 중');
    })();
    const hint =
      st === 'active'
        ? h('p', { class: 'qm-hint', id: 'questHint' }, '함께 할 일을 모두 채우면 선물을 받을 수 있어요.')
        : st === 'claimed'
          ? h('p', { class: 'qm-hint', id: 'questHint' }, '이미 받은 선물이에요.')
          : null;

    const parts = [
      h('button', { class: 'icon-btn qm-close', type: 'button', 'aria-label': '닫기', onClick: () => actions.closeModal() }, icon('close')),
      h(
        'header',
        { class: 'qm-head' },
        h('span', { class: 'qm-portrait' }, portrait(npc.model)),
        h('div', {}, h('p', { class: 'qm-eyebrow' }, `${npc.name}의 부탁`), h('h2', { id: 'questTitle', class: 'qm-title' }, q.title)),
      ),
      h('p', { class: 'qm-lines', id: 'questLines' }, ...lines.flatMap((l, i) => (i ? [h('br'), l] : [l]))),
      h('div', { class: 'qm-divider', 'aria-hidden': 'true' }, icon('sparkle')),
      h('p', { class: 'qm-chip' }, '함께 할 일'),
      h(
        'ul',
        { class: 'qm-tasks' },
        ...tasks.map((t) =>
          h(
            'li',
            { class: `task ${t.done && st !== 'available' ? 'is-done' : ''}` },
            h('span', { class: 'task-box', 'aria-hidden': 'true' }, t.done && st !== 'available' ? icon('check') : null),
            h('span', {}, t.label),
            h('span', { class: 'sr-only' }, t.done && st !== 'available' ? '(완료)' : '(아직)'),
          ),
        ),
      ),
      h('p', { class: 'qm-chip' }, '고마움의 선물'),
      h('ul', { class: 'qm-rewards' }, ...q.rewards.map(rewardTile)),
      hint,
      h(
        'footer',
        { class: 'qm-actions' },
        h('button', { class: 'btn btn-quiet btn-lg', type: 'button', onClick: () => actions.closeModal() }, st === 'available' ? '나중에' : '닫기'),
        primary,
      ),
    ];
    box.replaceChildren(...parts.filter(Boolean));
  }

  return {
    get open() {
      return !layer.hidden;
    },
    show(state, npc, playerScreenX = 0, stageW = 1672) {
      current = npc;
      // 캐릭터와 주민이 보이도록 플레이어 반대편에 연다
      box.classList.toggle('is-left', playerScreenX > stageW / 2);
      render(state, npc);
      layer.hidden = false;
      release?.();
      release = trapFocus(box, () => actions.closeModal());
      const focusTarget = box.querySelector('.qm-actions .btn-primary:not([disabled])') || box.querySelector('.qm-actions .btn');
      focusTarget?.focus();
    },
    refresh(state) {
      if (!layer.hidden && current) {
        const focusedPrimary = document.activeElement?.classList.contains('btn-primary');
        render(state, current);
        (focusedPrimary ? box.querySelector('.qm-actions .btn-primary:not([disabled])') : null)?.focus() ??
          box.querySelector('.qm-actions .btn')?.focus();
      }
    },
    hide() {
      if (layer.hidden) return;
      layer.hidden = true;
      current = null;
      const r = release;
      release = null;
      r?.();
    },
  };
}
