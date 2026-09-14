// 평상시 HUD: 로고, 위치, 현재 목표(행동+목적, 접으면 세부 조건 숨김), 설정·귀환, 형태 도크, 색 선택, 시점 조작.
import { COLORS, FORMS, MOTIONS, byId } from '../game/catalog.js';
import { progress as puzzleProgress } from '../game/puzzle.js';
import { MAIN_ORDER, QUESTS, carriedLights, chapterProgress, currentObjective, isDestination, taskResults } from '../game/quests.js';
import { craftOptions, hasUnlock } from '../game/state.js';
import { assetUrl } from './assets.js';
import { artIcon, h, icon } from './dom.js';

export function createHud(root, actions) {
  const logo = h('img', { class: 'logo', src: assetUrl('ui/logo.png'), alt: 'LUMINA' });
  const locIcon = h('span', { class: 'loc-ico' });
  const locText = h('span', { class: 'loc-text' });
  const location = h('p', { class: 'location hud-pill', 'aria-label': '현재 위치' }, locIcon, locText);

  const qTitle = h('strong', { class: 'q-title' });
  const qSteps = h('span', { class: 'q-steps', 'aria-hidden': 'true' });
  const qCount = h('span', { class: 'q-count' });
  const qText = h('span', { class: 'q-text' });
  const qTasks = h('ul', { class: 'q-tasks' });
  const qSeed = h('span', { class: 'q-seed' });
  const qToggle = h('button', { class: 'q-toggle icon-btn', type: 'button', onClick: () => actions.toggleQuestCard() });
  const qBody = h('div', { class: 'q-body', id: 'questBody' }, h('div', { class: 'q-progress' }, qSteps, qCount), qText, qTasks, qSeed);
  const questCard = h(
    'section',
    { class: 'quest-card hud-panel', 'aria-label': '현재 목표' },
    h('div', { class: 'q-head' }, h('span', { class: 'q-ico' }, icon('sprout')), qTitle, qToggle),
    qBody,
  );
  const left = h('div', { class: 'hud-left' }, logo, location, questCard);

  const settingsBtn = h('button', { class: 'return-btn settings-toggle', type: 'button', 'aria-label': '설정 (Esc)', title: '설정', onClick: () => actions.openSettings() }, icon('gear'));
  const returnBtn = h(
    'button',
    { class: 'return-btn', type: 'button', 'aria-label': '해파리로 항해 전망대에 돌아가기', title: '해파리로 돌아가기', onClick: () => actions.requestDepart() },
    icon('jelly'),
  );
  const right = h('div', { class: 'hud-right hud-right-row' }, returnBtn, settingsBtn);

  const camRow = h(
    'div',
    { class: 'cam-controls hud-panel', role: 'group', 'aria-label': '시점 돌리기' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': '시점 왼쪽으로 돌리기 (Q)', title: '왼쪽으로 돌리기 (Q)', onClick: () => actions.rotateCamera(-1) }, icon('rotL')),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': '캐릭터 뒤로 시점 맞추기', title: '뒤로 맞추기', onClick: () => actions.recenterCamera() }, icon('eye')),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': '시점 오른쪽으로 돌리기 (R)', title: '오른쪽으로 돌리기 (R)', onClick: () => actions.rotateCamera(1) }, icon('rotR')),
  );

  const palette = h('div', { class: 'palette', role: 'radiogroup', 'aria-label': '빛의 색' });
  const colorBtns = COLORS.map((c, i) => {
    const b = h(
      'button',
      { class: `swatch sw-${i}`, type: 'button', role: 'radio', style: { '--sw': c.hex }, onClick: () => actions.setDraft('color', c.id) },
      h('span', { class: 'sw-check' }, icon('check')),
      h('span', { class: 'sr-only' }, c.label),
    );
    palette.append(b);
    return { c, b };
  });

  const dockLabel = h('span', { class: 'dock-label', 'aria-hidden': 'true' });
  const dock = h('nav', { class: 'dock', 'aria-label': '빛의 형태' });
  const formBtns = FORMS.map((f) => {
    const b = h('button', { class: 'dock-btn', type: 'button', onClick: () => actions.setDraft('form', f.id) }, artIcon(f.id, ''), h('span', { class: 'sr-only' }, f.label));
    dock.append(b);
    return { f, b };
  });
  const dockWrap = h('div', { class: 'dock-wrap' }, dockLabel, dock);

  root.append(left, right, camRow, palette, dockWrap);
  const unlockHint = { sunset: '살구의 선물', mint: '리본과 빛을 나누면', slowpulse: '결정의 노래' };

  return {
    elements: { left, right, palette, dockWrap, camRow },
    update({ state, info, view }) {
      const away = isDestination(state.scene);
      locIcon.replaceChildren(icon(info.icon ?? 'sprout'));
      locText.textContent = info.name;

      const collapsed = view.questCollapsed;
      questCard.classList.toggle('is-collapsed', collapsed);
      qBody.hidden = collapsed;
      qToggle.replaceChildren(icon(collapsed ? 'chevronDown' : 'chevronUp'));
      qToggle.setAttribute('aria-expanded', String(!collapsed));
      qToggle.setAttribute('aria-controls', 'questBody');
      qToggle.setAttribute('aria-label', collapsed ? '목표 펼치기' : '목표 접기');

      const songActive = state.scene === 'ice' && state.quests.song === 'active';
      if (songActive) {
        qTitle.textContent = '결정이 부르는 순서 따라 하기';
        const pp = view.puzzle ? puzzleProgress(view.puzzle) : { done: 0, total: 4 };
        qSteps.replaceChildren(...Array.from({ length: pp.total }, (_, i) => h('span', { class: `step ${i < pp.done ? 'on' : ''}` }, artIcon('crystal'))));
        qCount.textContent = `${pp.done} / ${pp.total}`;
        qText.textContent = '빛나는 순서를 기억해요';
        qTasks.replaceChildren();
      } else {
        const obj = currentObjective(state);
        const pr = chapterProgress(state);
        qTitle.textContent = obj.title;
        qSteps.replaceChildren(...MAIN_ORDER.map((id, i) => h('span', { class: `step ${i < pr.done ? 'on' : ''}`, title: QUESTS[id].title }, artIcon(['flower', 'thread', 'crystal', 'orb'][i]))));
        qCount.textContent = `첫 번째 숨결 ${pr.done} / ${pr.total}`;
        qText.textContent = obj.text;
        const tasks = obj.id && state.quests[obj.id] !== 'available' ? taskResults(state, obj.id) : [];
        qTasks.replaceChildren(...tasks.map((t) => h('li', { class: t.done ? 'is-done' : '' }, h('span', { class: 'task-box', 'aria-hidden': 'true' }, t.done ? icon('check') : null), t.label)));
      }
      const carried = carriedLights(state);
      qSeed.textContent = `별빛 씨앗 ${state.materials.seed}개${state.materials.shard ? ` · 결정 조각 ${state.materials.shard}개` : ''}${carried.length ? ` · 들고 있는 빛 ${carried.length}` : ''}`;

      returnBtn.hidden = !away;

      const opt = craftOptions(state);
      for (const { c, b } of colorBtns) {
        const unlocked = hasUnlock(state, c.unlock);
        const selected = state.draft.color === c.id;
        b.setAttribute('aria-checked', String(selected));
        b.classList.toggle('is-selected', selected);
        b.disabled = !unlocked;
        const why = unlockHint[c.unlock] ? `${unlockHint[c.unlock]} 배워요` : '';
        b.title = unlocked ? c.label : `${c.label} · ${why}`;
        b.setAttribute('aria-label', unlocked ? c.label : `${c.label}, 잠김: ${why}`);
      }
      for (const { f, b } of formBtns) {
        const selected = state.draft.form === f.id;
        b.classList.toggle('is-selected', selected);
        b.setAttribute('aria-pressed', String(selected));
        const locked = !opt.forms && !selected;
        b.disabled = locked;
        b.title = locked ? '형태는 첫 등불에 빛을 놓은 뒤 고를 수 있어요' : f.label;
        b.setAttribute('aria-label', locked ? `${f.label}, 잠김: 첫 설치 뒤 열려요` : f.label);
        if (selected) {
          dockLabel.textContent = `${f.label} · ${byId(MOTIONS, state.draft.motion)?.label ?? ''}`;
          dockLabel.style.left = `${b.offsetLeft + b.offsetWidth / 2}px`;
        }
      }
      // 첫 제작 전에는 제작 도구를 숨겨 한 번에 하나만 배우게 한다
      const craftingKnown = state.world.benchOpened;
      palette.hidden = away || !craftingKnown;
      dockWrap.hidden = away || !craftingKnown;
    },
  };
}
