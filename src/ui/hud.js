// 평상시 HUD: 로고, 위치, 현재 목표 1개(접기 가능), 목적지 게이지 / 귀환 버튼, 형태 도크, 색 선택, 시점 조작.
import { COLORS, COOL_LIMIT, FORMS, WARM_LIMIT, colorTemp } from '../game/catalog.js';
import { progress as puzzleProgress } from '../game/puzzle.js';
import { QUESTS, currentObjective, isDestination, lightAt, pathProgress } from '../game/quests.js';
import { hasUnlock } from '../game/state.js';
import { assetUrl } from './assets.js';
import { artIcon, h, icon } from './dom.js';

const DEST_LABEL = { ice: '얼음 성운', solar: '태양 정원', twilight: '황혼 합류지' };

export function createHud(root, actions) {
  // ---------------- 왼쪽 위
  const logo = h('img', { class: 'logo', src: assetUrl('ui/logo.png'), alt: 'LUMINA' });
  const locIcon = h('span', { class: 'loc-ico' });
  const locText = h('span', { class: 'loc-text' });
  const location = h('p', { class: 'location hud-pill', 'aria-label': '현재 위치' }, locIcon, locText);

  const qTitle = h('strong', { class: 'q-title' });
  const qSteps = h('span', { class: 'q-steps', 'aria-hidden': 'true' });
  const qCount = h('span', { class: 'q-count' });
  const qText = h('span', { class: 'q-text' });
  const qSeed = h('span', { class: 'q-seed' });
  const qToggle = h('button', { class: 'q-toggle icon-btn', type: 'button', onClick: () => actions.toggleQuestCard() });
  const qBody = h('div', { class: 'q-body', id: 'questBody' }, h('div', { class: 'q-progress' }, qSteps, qCount), qText, qSeed);
  const questCard = h(
    'section',
    { class: 'quest-card hud-panel', 'aria-label': '현재 목표' },
    h('div', { class: 'q-head' }, h('span', { class: 'q-ico' }, icon('sprout')), qTitle, qToggle),
    qBody,
  );
  const left = h('div', { class: 'hud-left' }, logo, location, questCard);

  // ---------------- 오른쪽 위
  const gaugeLabel = h('span', { class: 'gauge-label' });
  const gaugeKnob = h('span', { class: 'gauge-knob' });
  const gaugeTrack = h('span', { class: 'gauge-track' }, gaugeKnob);
  const gauge = h(
    'section',
    { class: 'gauge hud-panel', role: 'group', 'aria-label': '목적지 게이지' },
    gaugeLabel,
    h('div', { class: 'gauge-row' }, h('span', { class: 'g-sun' }, icon('sun')), gaugeTrack, h('span', { class: 'g-cool' }, icon('sparkle'))),
  );
  const returnBtn = h(
    'button',
    { class: 'return-btn', type: 'button', 'aria-label': '해파리로 항해 전망대에 돌아가기', title: '해파리로 돌아가기', onClick: () => actions.requestDepart() },
    icon('jelly'),
  );
  const right = h('div', { class: 'hud-right' }, gauge, returnBtn);

  // ---------------- 시점(오른쪽 아래)
  const camRow = h(
    'div',
    { class: 'cam-controls hud-panel', role: 'group', 'aria-label': '시점 돌리기' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': '시점 왼쪽으로 돌리기 (Q)', title: '왼쪽으로 돌리기 (Q)', onClick: () => actions.rotateCamera(-1) }, icon('rotL')),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': '캐릭터 뒤로 시점 맞추기', title: '뒤로 맞추기', onClick: () => actions.recenterCamera() }, icon('eye')),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': '시점 오른쪽으로 돌리기 (R)', title: '오른쪽으로 돌리기 (R)', onClick: () => actions.rotateCamera(1) }, icon('rotR')),
  );

  // ---------------- 색 선택(왼쪽 가운데)
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

  // ---------------- 형태 도크(아래)
  const dockLabel = h('span', { class: 'dock-label', 'aria-hidden': 'true' });
  const dock = h('nav', { class: 'dock', 'aria-label': '빛의 형태' });
  const formBtns = FORMS.map((f) => {
    const b = h('button', { class: 'dock-btn', type: 'button', onClick: () => actions.setDraft('form', f.id) }, artIcon(f.id, ''), h('span', { class: 'sr-only' }, f.label));
    dock.append(b);
    return { f, b };
  });
  const dockWrap = h('div', { class: 'dock-wrap' }, dockLabel, dock);

  root.append(left, right, camRow, palette, dockWrap);

  return {
    elements: { left, right, palette, dockWrap, camRow },
    update({ state, info, view, destination }) {
      const away = isDestination(state.scene);
      locIcon.replaceChildren(icon(info.icon ?? 'sprout'));
      locText.textContent = info.name;

      const obj = currentObjective(state);
      const collapsed = view.questCollapsed;
      questCard.classList.toggle('is-collapsed', collapsed);
      qBody.hidden = collapsed;
      qToggle.replaceChildren(icon(collapsed ? 'chevronDown' : 'chevronUp'));
      qToggle.setAttribute('aria-expanded', String(!collapsed));
      qToggle.setAttribute('aria-controls', 'questBody');
      qToggle.setAttribute('aria-label', collapsed ? '목표 펼치기' : '목표 접기');

      const showSong = state.scene === 'ice' && (state.quests.song === 'active' || state.quests.song === 'available');
      if (showSong) {
        qTitle.textContent = '결정의 노래';
        const pp = view.puzzle ? puzzleProgress(view.puzzle) : { done: 0, total: 4 };
        const solved = state.puzzle.solved;
        qSteps.replaceChildren(...Array.from({ length: pp.total }, (_, i) => h('span', { class: `step ${solved || i < pp.done ? 'on' : ''}` }, artIcon('crystal'))));
        qCount.textContent = `${solved ? pp.total : pp.done} / ${pp.total}`;
        qText.textContent = state.quests.song === 'available' ? '리본의 부탁 듣기' : '빛나는 순서를 기억해요';
      } else {
        const pr = pathProgress(state);
        qTitle.textContent = '잠든 산책로 깨우기';
        qSteps.replaceChildren(...Array.from({ length: pr.total }, (_, i) => h('span', { class: `step ${i < pr.done ? 'on' : ''}` }, artIcon('flower'))));
        qCount.textContent = `${pr.done} / ${pr.total}`;
        qText.textContent = obj.text;
        qText.title = obj.id ? QUESTS[obj.id].title : '';
      }
      qSeed.textContent = `별빛 씨앗 ${state.materials.seed}개${state.materials.shard ? ` · 결정 조각 ${state.materials.shard}개` : ''}`;

      // 목적지 게이지 / 귀환
      gauge.hidden = away;
      returnBtn.hidden = !away;
      if (!away) {
        const helm = lightAt(state, 'helm');
        const temp = helm ? colorTemp(helm.color) : 0;
        gaugeKnob.style.left = `${((1 - temp) / 2) * 100}%`;
        const label = !helm ? '항로 미정' : (DEST_LABEL[destination] ?? '항로 미정');
        gaugeLabel.textContent = label;
        gauge.setAttribute('aria-label', `목적지 게이지: ${label}${temp >= WARM_LIMIT ? ', 따뜻함' : temp <= COOL_LIMIT ? ', 차가움' : ''}`);
      }

      for (const { c, b } of colorBtns) {
        const unlocked = hasUnlock(state, c.unlock);
        const selected = state.draft.color === c.id;
        b.setAttribute('aria-checked', String(selected));
        b.classList.toggle('is-selected', selected);
        b.disabled = !unlocked;
        b.title = unlocked ? c.label : `${c.label} · 살구의 부탁을 마치면 배워요`;
        b.setAttribute('aria-label', unlocked ? c.label : `${c.label}, 잠김: 살구의 부탁을 마치면 배워요`);
      }
      for (const { f, b } of formBtns) {
        const selected = state.draft.form === f.id;
        b.classList.toggle('is-selected', selected);
        b.setAttribute('aria-pressed', String(selected));
        b.setAttribute('aria-label', f.label);
        if (selected) {
          dockLabel.textContent = f.label;
          dockLabel.style.left = `${b.offsetLeft + b.offsetWidth / 2}px`;
        }
      }
      palette.hidden = away;
      dockWrap.hidden = away;
    },
  };
}
