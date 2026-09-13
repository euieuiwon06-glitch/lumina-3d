import './styles/tokens.css';
import './styles/game.css';
import './styles/three.css';

import * as THREE from 'three';

import { chime, isMuted, setMuted, softBuzz, unlockAudio } from './engine/audio.js';
import { FollowCamera } from './engine/camera.js';
import { Character, loadCharacters } from './engine/character.js';
import { Beacon, GroundRing, LightProp, SongCrystal, Sparkles, glowTexture, preloadLightImages, starTexture } from './engine/props.js';
import { clientToStage, mountStage, stage } from './engine/stage.js';
import { findPath, floodReachable, groundAt, nearestReachable, nearestWalkable, pickGround, smoothGround, stepMove } from './engine/walkgrid.js';
import { World } from './engine/world.js';
import { DISCOVERIES, MATERIALS, UNLOCKS, lightName } from './game/catalog.js';
import { createPuzzle, finishListening, listen, press } from './game/puzzle.js';
import { NPC_LINES, SCENE_INFO } from './game/scenes.js';
import { GIVER_NAMES, QUESTS, QUEST_ORDER, isDestination, lightAt } from './game/quests.js';
import { SAVE_KEY, SCENES, canDepart, destinationFor, isDiscovered, loadState, reduce, saveState, slotAvailability } from './game/state.js';
import { createHud } from './ui/hud.js';
import { createQuestModal } from './ui/modal.js';
import { createFader, createFinale, createIntro, createToast, createVoyage } from './ui/overlays.js';
import { createBubble, createCraftPanel, createPrompt, createPuzzlePanel, createSlotPanel } from './ui/panels.js';

const WALK_SPEED = 3.0;
const RUN_SPEED = 5.2;
const TALK_RADIUS = 2.4;
const PANEL_CLOSE_RADIUS = 5;
const KEYMAP = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
};

async function boot() {
  const canvas = document.getElementById('world');
  const stageEl = document.getElementById('stage');
  const uiRoot = document.getElementById('ui');
  const overlayRoot = document.getElementById('overlays');
  const bootEl = document.getElementById('boot');
  const params = new URLSearchParams(location.search);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------ 렌더러
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    bootEl.querySelector('p').textContent = '이 브라우저에서 3D(WebGL)를 켤 수 없어요. 하드웨어 가속을 확인해 주세요.';
    throw e;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, params.has('lowres') ? 1 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 배경 .blend는 AgX 룩으로 제작됨(캐릭터 .blend는 Standard 뷰 → 캐릭터 재질만 톤매핑 제외)
  renderer.toneMapping = params.get('tm') === 'neutral' ? THREE.NeutralToneMapping : THREE.AgXToneMapping;
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 2500);
  mountStage(stageEl, () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const world = new World(renderer);
  const scene3 = world.scene;
  const follow = new FollowCamera(camera);
  const sparkles = new Sparkles(scene3);

  // ------------------------------------------------------------------ 저장
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  if (params.has('reset')) {
    try {
      storage?.removeItem(SAVE_KEY);
    } catch {
      /* 저장소 접근 불가 */
    }
    params.delete('reset');
    const qs = params.toString();
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  }
  const loaded = loadState(storage);
  let state = loaded.state;
  if (params.get('scene') && SCENES.includes(params.get('scene'))) state = { ...state, scene: params.get('scene'), arrival: null };

  // ------------------------------------------------------------------ 표시 상태
  const view = {
    mode: 'loading', // loading | play | modal | voyage | intro | finale
    panel: null, // { kind: 'slot'|'craft'|'puzzle', id }
    questCollapsed: false,
    puzzle: createPuzzle(),
    crystalWrong: null,
    target: null,
  };
  const keys = new Set();
  let run = false;
  let path = null; // 클릭 이동 경유점
  let pathDone = null;
  let playToken = 0;
  let wasWalking = false;
  let time = 0;

  const actors = { player: null, npcs: [] };
  let spots = []; // 상호작용 대상
  let clickables = []; // 광선 판정용 메시
  const props = { slots: new Map(), rings: [], beacons: [], crystals: [], preview: null, workbenchPreview: null, sleepers: [], discoveries: new Map() };

  // ------------------------------------------------------------------ UI
  const actions = {
    toggleQuestCard() {
      view.questCollapsed = !view.questCollapsed;
      refresh();
    },
    setDraft(key, value) {
      dispatch({ type: 'setDraft', key, value });
    },
    interact() {
      if (view.target) interactWith(view.target);
    },
    place() {
      const id = view.panel?.id;
      if (!id) return;
      if (dispatch({ type: 'placeLight', slot: id })) {
        const sp = spots.find((s) => s.kind === 'slot' && s.id === id);
        sparkles.burst(sp.pos.clone().add(new THREE.Vector3(0, 1, 0)), 22, reducedMotion);
        chime(659.25, 0.5, 0.1);
      }
    },
    retrieve() {
      const id = view.panel?.id;
      if (id) dispatch({ type: 'retrieveLight', slot: id });
    },
    closePanel,
    requestDepart,
    finishVoyage,
    acceptQuest(id) {
      dispatch({ type: 'acceptQuest', id });
      modal.refresh(state);
    },
    claimReward(id) {
      if (dispatch({ type: 'claimReward', id })) {
        modal.refresh(state);
        if (id === 'finale') {
          closeModal();
          setTimeout(openFinale, 900);
        }
      }
    },
    closeModal,
    startGame() {
      dispatch({ type: 'seeIntro' });
      intro.hide();
      view.mode = 'play';
      refresh();
      toast.show('작업대를 둘러본 뒤, 문으로 나가 캡슐 마을의 포근을 만나 보세요.', 5000);
    },
    closeFinale() {
      finale.hide();
      view.mode = 'play';
      refresh();
    },
    puzzleStart: () => startListening(),
    puzzleListen: () => startListening(),
    puzzlePress,
    toggleSound() {
      setMuted(!isMuted());
      refresh();
    },
    rotateCamera(dir) {
      follow.autoYaw = follow.yaw - dir * (Math.PI / 4);
    },
    recenterCamera() {
      follow.autoYaw = actors.player ? actors.player.yaw + Math.PI : follow.yaw;
    },
  };

  const hud = createHud(uiRoot, actions);
  const prompt = createPrompt(uiRoot, actions);
  const bubble = createBubble(uiRoot);
  const slotPanel = createSlotPanel(uiRoot, actions);
  const craftPanel = createCraftPanel(uiRoot, actions);
  const puzzlePanel = createPuzzlePanel(uiRoot, actions);
  const toast = createToast(uiRoot);
  const modal = createQuestModal(overlayRoot, actions);
  const intro = createIntro(overlayRoot, actions);
  const voyage = createVoyage(overlayRoot, actions);
  const finale = createFinale(overlayRoot, actions);
  const fader = createFader(overlayRoot);

  function save() {
    if (storage && !saveState(storage, state)) toast.show('이 브라우저에서는 진행을 저장할 수 없어요.');
  }

  function dispatch(action) {
    const r = reduce(state, action);
    if (r.error) {
      toast.show(r.error);
      return false;
    }
    state = r.state;
    save();
    handleEvents(r.events);
    syncProps();
    refresh();
    return true;
  }

  function handleEvents(events) {
    const granted = [];
    for (const e of events) {
      if (e.type === 'granted') {
        const info = e.item.kind === 'material' ? MATERIALS[e.item.id] : UNLOCKS[e.item.id];
        granted.push(e.item.kind === 'material' && e.item.amount > 1 ? `${info.label} ${e.item.amount}개` : info.label);
      } else if (e.type === 'questAccepted') {
        toast.show(`‘${QUESTS[e.id].title}’ 부탁을 받았어요.`);
        if (e.id === 'song') view.puzzle = createPuzzle();
      } else if (e.type === 'questCompleted') {
        const q = QUESTS[e.id];
        const npc = actors.npcs.find((n) => n.id === q.giver);
        if (npc) sparkles.burst(npc.char.position.clone().add(new THREE.Vector3(0, 1.3, 0)), 16, reducedMotion);
        toast.show(`조건을 모두 채웠어요! ${GIVER_NAMES[q.giver]}에게 선물을 받을 수 있어요.`);
      } else if (e.type === 'questReopened') {
        toast.show(`‘${QUESTS[e.id].title}’ 조건이 다시 비었어요.`);
      } else if (e.type === 'lightPlaced' && !events.some((x) => x.type === 'questCompleted')) {
        toast.show(`${lightName(e.light)} 빛을 놓았어요. 씨앗 ${state.materials.seed}개 남았어요.`);
      } else if (e.type === 'lightRetrieved') {
        toast.show('빛을 거두어 별빛 씨앗으로 되돌렸어요.');
      } else if (e.type === 'discovered') {
        toast.show(`발견: ${DISCOVERIES[e.id].label}`);
      }
    }
    if (granted.length) {
      setTimeout(() => toast.show(`받았어요: ${granted.join(', ')}`), events.some((e) => e.type === 'questCompleted' || e.type === 'discovered') ? 1800 : 0);
    }
  }

  function questFor(npcId) {
    const ids = QUEST_ORDER.filter((id) => QUESTS[id].giver === npcId);
    return ids.find((id) => state.quests[id] === 'completed') ?? ids.find((id) => state.quests[id] === 'active') ?? ids.find((id) => state.quests[id] === 'available') ?? null;
  }

  function refresh() {
    const info = SCENE_INFO[state.scene];
    const blocked = view.mode !== 'play';
    for (const el of [hud.elements.left, hud.elements.right, hud.elements.palette, hud.elements.dockWrap, hud.elements.camRow, prompt.el, slotPanel.el, craftPanel.el, puzzlePanel.el]) {
      el.inert = blocked;
    }
    hud.update({ state, info, view, destination: destinationFor(state) });
    updatePanels();
    stageEl.dataset.scene = state.scene;
    stageEl.dataset.mode = view.mode;
    // 주민 머리 위 표시
    for (const n of actors.npcs) {
      const q = n.decorative ? null : questFor(n.id);
      n.mark.visible = !!q && (state.quests[q] === 'available' || state.quests[q] === 'completed');
      n.mark.material.color.set(q && state.quests[q] === 'completed' ? '#B9E6D3' : '#FFD0A9');
    }
  }

  // ------------------------------------------------------------------ 투영
  const _v = new THREE.Vector3();
  function project(pos, lift = 0) {
    _v.copy(pos);
    _v.y += lift;
    _v.project(camera);
    const visible = _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.15 && Math.abs(_v.y) < 1.15;
    return { x: ((_v.x + 1) / 2) * stage.W, y: ((1 - _v.y) / 2) * stage.H, visible };
  }

  function updatePanels() {
    const player = actors.player ? project(actors.player.position, 0.6) : null;
    const p = view.panel;
    const slotSpot = p?.kind === 'slot' ? spots.find((s) => s.kind === 'slot' && s.id === p.id) : null;
    slotPanel.update({ state, slot: slotSpot?.slot ?? null, anchor: slotSpot ? project(slotSpot.pos, 1.0) : null, player });
    const bench = spots.find((s) => s.kind === 'workbench');
    craftPanel.update({ state, open: p?.kind === 'craft', anchor: bench ? project(bench.pos, 1.2) : null, player });
    puzzlePanel.update({ state, view, open: p?.kind === 'puzzle', muted: isMuted(), glow: props.crystals.map((c) => c.glow) });
  }

  // ------------------------------------------------------------------ 장면 구성
  let reach = null; // 장면 시작점에서 걸어서 닿는 칸
  function snapToGrid(p, maxLift = 3) {
    if (!world.grid) return p.clone();
    if (reach) {
      const r = nearestReachable(world.grid, reach, p.x, p.z, p.y - 0.2, 80);
      if (r) return new THREE.Vector3(r.x, r.y, r.z);
    }
    const w = nearestWalkable(world.grid, p.x, p.z, p.y - 0.2, 24);
    if (!w || Math.abs(w.y - p.y) > maxLift) return p.clone();
    return new THREE.Vector3(w.x, w.y, w.z);
  }

  function markerGround(name, offset = [0, 0]) {
    const m = world.navPoint(name);
    if (!m) {
      console.warn('[LUMINA] 동선 표시 없음', world.id, name);
      return null;
    }
    // POI·QUEST 표시는 바닥에서 0.6~1.2m 위에 떠 있다
    const raw = new THREE.Vector3(m.x + offset[0], m.y - (name.startsWith('QUEST_') ? 1.2 : name.startsWith('POI_') ? 0.8 : 0), m.z + offset[1]);
    return snapToGrid(raw);
  }

  function sceneCenter() {
    const pts = Object.entries(world.nav).filter(([k]) => /^(POI_|QUEST_|PLAYER_START|MARK_)/.test(k)).map(([, v]) => v.p);
    if (!pts.length) return new THREE.Vector3();
    return pts.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  }

  /** 입구 표시에서 장면 안쪽으로 몇 걸음 들어간 자리와 바라볼 방향 */
  function arrivalPose(markerName) {
    const m = markerGround(markerName) ?? snapToGrid(sceneCenter());
    const c = sceneCenter();
    let pos = m.clone();
    let dir = new THREE.Vector3(c.x - m.x, 0, c.z - m.z);
    if (world.grid) {
      const route = findPath(world.grid, m, snapToGrid(c, 50));
      if (route && route.length > 1) {
        let left = 3;
        let prev = new THREE.Vector3(route[0].x, route[0].y, route[0].z);
        for (let i = 1; i < route.length && left > 0; i++) {
          const next = new THREE.Vector3(route[i].x, route[i].y, route[i].z);
          const d = prev.distanceTo(next);
          const t = Math.min(1, left / d);
          pos = prev.clone().lerp(next, t);
          dir = next.clone().sub(prev).setY(0);
          left -= d;
          prev = next;
        }
        pos = snapToGrid(pos);
      }
    }
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    return { pos, yaw: Math.atan2(dir.x, dir.z) };
  }

  function addSpot(spot) {
    spots.push(spot);
    return spot;
  }

  function markMesh() {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), color: '#FFD0A9', transparent: true, depthWrite: false, toneMapped: false }));
    m.scale.setScalar(0.32);
    return m;
  }

  async function enterScene({ label } = {}) {
    view.mode = 'loading';
    closePanel(true);
    bubble.hide();
    prompt.update(null);
    keys.clear();
    path = null;
    refresh();
    const id = state.scene;
    const info = SCENE_INFO[id];
    fader.show(label ?? `${info.name}(으)로 가는 중…`);
    await world.load(id, (p) => fader.progress(p));

    // 이전 장면 요소 정리
    spots = [];
    clickables = [];
    for (const p of props.slots.values()) p.prop?.dispose();
    props.slots.clear();
    props.preview?.dispose();
    props.preview = null;
    props.workbenchPreview?.dispose();
    props.workbenchPreview = null;
    props.rings = [];
    props.beacons = [];
    props.crystals = [];
    props.sleepers = [];
    props.discoveries.clear();
    actors.npcs = [];

    const dyn = world.dynamic;
    if (!actors.player) actors.player = new Character('flame');
    dyn.add(actors.player.object);

    // 플레이어 위치: 이동해 온 입구 → 저장 위치 → 장면 시작점
    reach = null;
    if (world.grid) {
      const s0 = world.navPoint(info.start) ?? sceneCenter();
      const w0 = nearestWalkable(world.grid, s0.x, s0.z, s0.y, 40);
      if (w0) reach = floodReachable(world.grid, w0);
    }
    let pose;
    const saved = state.positions[id];
    if (state.arrival) pose = arrivalPose(state.arrival);
    else if (saved) pose = { pos: snapToGrid(new THREE.Vector3(saved.x, saved.y, saved.z)), yaw: saved.yaw };
    else pose = arrivalPose(info.start);
    actors.player.position.copy(pose.pos);
    actors.player.groundY = pose.pos.y;
    actors.player.setYaw(pose.yaw, true);

    // 주민
    for (const n of info.npcs) {
      const pos = markerGround(n.at, n.offset);
      if (!pos) continue;
      const char = new Character(n.model);
      char.position.copy(pos);
      const c = sceneCenter();
      char.setYaw(Math.atan2(c.x - pos.x, c.z - pos.z), true);
      const mark = markMesh();
      mark.position.y = char.height + 0.45;
      char.object.add(mark);
      dyn.add(char.object);
      char.model.traverse((o) => o.isMesh && clickables.push(o));
      const npc = { ...n, char, mark, homeYaw: char.yaw };
      actors.npcs.push(npc);
      addSpot({ kind: 'npc', id: n.id, name: n.name, pos, radius: TALK_RADIUS, lift: char.height + 0.3, npc });
    }

    // 출구
    for (const ex of info.exits) {
      const pos = markerGround(ex.at);
      if (!pos) continue;
      const ring = new GroundRing({ color: ex.locked ? '#C9B7EE' : '#FFF4DC', radius: 1.3 });
      ring.mesh.position.copy(pos).add(new THREE.Vector3(0, 0.05, 0));
      dyn.add(ring.mesh);
      props.rings.push(ring);
      if (!ex.locked) {
        const beacon = new Beacon(ex.dock ? '#B9E6D3' : '#FFF4DC', 3.4);
        beacon.mesh.position.copy(pos);
        dyn.add(beacon.mesh);
        props.beacons.push(beacon);
      }
      addSpot({ kind: 'exit', id: ex.at, name: ex.label, pos, radius: 2.6, lift: 1.6, exit: ex });
    }

    // 설치 지점
    for (const sl of info.slots ?? []) {
      const pos = markerGround(sl.at, sl.offset);
      if (!pos) continue;
      const ring = new GroundRing({ color: '#FFD0A9', radius: 0.8 });
      ring.mesh.position.copy(pos).add(new THREE.Vector3(0, 0.05, 0));
      dyn.add(ring.mesh);
      const entry = { slot: sl, pos, ring, prop: null };
      props.slots.set(sl.id, entry);
      addSpot({ kind: 'slot', id: sl.id, name: sl.label, pos, radius: 2.2, lift: 1.5, slot: sl });
    }

    // 산책로의 잠든 봉오리
    for (const name of info.sleepers ?? []) {
      const pos = markerGround(name);
      if (!pos) continue;
      const prop = new LightProp({ form: 'flower', color: 'cream', motion: 'slowpulse', brightness: 70 });
      prop.object.position.copy(pos);
      prop.object.visible = false;
      dyn.add(prop.object);
      props.sleepers.push(prop);
    }

    // 작업대
    if (info.workbench) {
      const m = world.navPoint(info.workbench.at);
      const stand = markerGround(info.workbench.at, [0, 0]);
      const top = m ? new THREE.Vector3(m.x, m.y + 0.2, m.z) : stand;
      const prev = new LightProp({ ...state.draft }, { preview: false });
      prev.object.position.copy(top).add(new THREE.Vector3(0, -1.0, 0));
      prev.object.scale.setScalar(0.8);
      dyn.add(prev.object);
      props.workbenchPreview = prev;
      addSpot({ kind: 'workbench', id: 'workbench', name: info.workbench.label, pos: stand, radius: 2.6, lift: 1.3, top });
    }

    // 발견물
    for (const d of info.discoveries ?? []) {
      const pos = markerGround(d.at, d.offset);
      if (!pos) continue;
      const g = new THREE.Group();
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#FFF4DC', transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      spr.scale.setScalar(0.7);
      spr.position.y = 0.7;
      const ring = new GroundRing({ color: '#B9E6D3', radius: 0.7 });
      ring.mesh.position.y = 0.05;
      g.add(spr, ring.mesh);
      g.position.copy(pos);
      dyn.add(g);
      props.discoveries.set(d.id, { group: g, spr, ring });
      addSpot({ kind: 'discovery', id: d.id, name: d.label, pos, radius: 2.0, lift: 1.2 });
    }

    // 노래하는 결정
    if (info.puzzle) {
      const center = markerGround(info.puzzle.at);
      if (center) {
        const standPos = center.clone();
        [-2, 0, 2].forEach((dx, i) => {
          const pos = snapToGrid(center.clone().add(new THREE.Vector3(dx * 0.9, 0, -1.6 - Math.abs(dx) * 0.2)));
          const c = new SongCrystal(i, 1.3 + (i === 1 ? 0.4 : 0));
          c.object.position.copy(pos);
          dyn.add(c.object);
          props.crystals.push(c);
          c.meshes.forEach((m) => clickables.push(m));
        });
        addSpot({ kind: 'puzzle', id: 'puzzle', name: info.puzzle.label, pos: standPos, radius: 3.2, lift: 2.2 });
      }
    }

    follow.colliders = world.colliders;
    follow.snap(actors.player.position, pose.yaw + Math.PI);
    syncProps();
    if (params.has('debug')) drawDebugGrid();

    // 첫 프레임을 한 번 그려 셰이더를 준비한 뒤 가림막을 연다
    renderer.compile(scene3, camera);
    view.puzzle = createPuzzle();
    view.mode = 'play';
    commitPosition();
    fader.hide();
    refresh();
  }

  /** 게임 상태 → 공간 요소(설치된 빛, 미리보기, 발견물, 봉오리) */
  function syncProps() {
    if (!world.root) return;
    for (const [id, entry] of props.slots) {
      const light = lightAt(state, id);
      if (light) {
        if (!entry.prop) {
          entry.prop = new LightProp(light);
          entry.prop.object.position.copy(entry.pos);
          world.dynamic.add(entry.prop.object);
        } else if (JSON.stringify(entry.prop.light) !== JSON.stringify(light)) {
          entry.prop.set(light);
        }
      } else if (entry.prop) {
        entry.prop.dispose();
        entry.prop = null;
      }
      const av = slotAvailability(state, id);
      entry.ring.strength = av.canPlace ? 1 : light ? 0.25 : 0.15;
      entry.ring.setColor(av.canPlace ? '#FFD0A9' : '#C9B7EE');
    }
    // 설치 미리보기: 빛 놓기 패널이 열린 빈 자리
    const pid = view.panel?.kind === 'slot' ? view.panel.id : null;
    const pe = pid ? props.slots.get(pid) : null;
    if (pe && !lightAt(state, pid) && slotAvailability(state, pid).canPlace) {
      if (!props.preview) {
        props.preview = new LightProp({ ...state.draft }, { preview: true });
        world.dynamic.add(props.preview.object);
      } else props.preview.set({ ...state.draft });
      props.preview.object.position.copy(pe.pos);
    } else if (props.preview) {
      props.preview.dispose();
      props.preview = null;
    }
    props.workbenchPreview?.set({ ...state.draft });
    for (const [id, d] of props.discoveries) {
      const found = isDiscovered(state, id);
      d.group.visible = !found;
      const spot = spots.find((s) => s.kind === 'discovery' && s.id === id);
      if (spot) spot.disabled = found;
    }
    const awake = state.quests.finale === 'claimed';
    props.sleepers.forEach((p) => (p.object.visible = awake));
  }

  // ------------------------------------------------------------------ 상호작용

  function nearestTarget() {
    const p = actors.player.position;
    let best = null;
    let bestD = Infinity;
    for (const s of spots) {
      if (s.disabled) continue;
      const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
      if (d > s.radius || Math.abs(s.pos.y - p.y) > 2.2) continue;
      // 주민을 설치 지점보다 조금 우선
      const score = d - (s.kind === 'npc' ? 0.6 : 0);
      if (score < bestD) {
        bestD = score;
        best = s;
      }
    }
    if (!best) return null;
    let verb = '살펴보기';
    let locked = false;
    if (best.kind === 'npc') verb = best.npc.decorative ? '인사하기' : '이야기하기';
    if (best.kind === 'slot') verb = lightAt(state, best.id) ? '빛 살펴보기' : '빛 놓기';
    if (best.kind === 'workbench') verb = '빛 빚기';
    if (best.kind === 'discovery') verb = '빛의 흔적 살피기';
    if (best.kind === 'puzzle') verb = '귀 기울이기';
    if (best.kind === 'exit') {
      locked = !!best.exit.locked;
      verb = locked ? '닫혀 있어요' : best.exit.dock ? '해파리 타기' : '이동하기';
    }
    return { ...best, verb, locked, anchor: project(best.pos, best.lift) };
  }

  function interactWith(t) {
    if (view.mode !== 'play') return;
    path = null;
    const player = actors.player;
    player.faceTowards(t.pos.x, t.pos.z);
    if (t.kind === 'npc') {
      const npc = t.npc;
      npc.char.faceTowards(player.position.x, player.position.z);
      npc.char.greet();
      if (npc.decorative) {
        bubble.show(`${npc.name}: ${NPC_LINES.idle[npc.id]}`, () => project(npc.char.position, npc.char.height + 0.2));
        return;
      }
      const questId = questFor(npc.id);
      if (!questId) {
        const anyClaimed = QUEST_ORDER.some((id) => QUESTS[id].giver === npc.id && state.quests[id] === 'claimed');
        bubble.show(`${npc.name}: ${anyClaimed ? NPC_LINES.thanks[npc.id] : NPC_LINES.idle[npc.id]}`, () => project(npc.char.position, npc.char.height + 0.2));
        return;
      }
      closePanel();
      view.mode = 'modal';
      modal.show(state, { ...npc, questId }, project(player.position).x, stage.W);
      refresh();
    } else if (t.kind === 'slot') {
      view.panel = { kind: 'slot', id: t.id };
      syncProps();
      refresh();
      slotPanel.el.querySelector('.btn-primary:not([disabled]):not([hidden]), .btn:not([disabled]):not([hidden])')?.focus({ preventScroll: true });
    } else if (t.kind === 'workbench') {
      view.panel = { kind: 'craft', id: 'workbench' };
      refresh();
      craftPanel.el.querySelector('.chip.is-selected')?.focus({ preventScroll: true });
    } else if (t.kind === 'puzzle') {
      view.panel = { kind: 'puzzle', id: 'puzzle' };
      if (state.quests.song === 'available') toast.show('리본이 무언가 부탁하고 싶어 해요.');
      refresh();
      puzzlePanel.el.querySelector('.btn-primary:not([disabled])')?.focus({ preventScroll: true });
    } else if (t.kind === 'discovery') {
      if (dispatch({ type: 'discover', id: t.id })) {
        sparkles.burst(t.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 30, reducedMotion);
        chime(783.99, 0.6, 0.1);
      }
    } else if (t.kind === 'exit') {
      const ex = t.exit;
      if (ex.locked) toast.show(ex.locked);
      else if (ex.dock) requestDepart();
      else travel(ex.at);
    }
  }

  async function travel(via) {
    commitPosition();
    const target = SCENE_INFO[state.scene];
    if (!dispatch({ type: 'travel', via })) return;
    await enterScene({ label: `${SCENE_INFO[state.scene].name}(으)로 가는 중…` });
    toast.show(`${SCENE_INFO[state.scene].name}에 왔어요.`);
    void target;
  }

  function closePanel(silent = false) {
    if (view.panel?.kind === 'puzzle' && view.puzzle.status === 'listening') {
      playToken += 1;
      view.puzzle = { ...view.puzzle, status: 'idle' };
    }
    view.panel = null;
    if (!silent) {
      syncProps();
      refresh();
    }
  }

  function closeModal() {
    if (!modal.open) return;
    modal.hide();
    view.mode = 'play';
    refresh();
  }

  // ------------------------------------------------------------------ 항해

  let voyagePromise = null;
  function requestDepart() {
    if (view.mode !== 'play') return;
    const check = canDepart(state);
    if (!check.ok) {
      toast.show(check.reason);
      return;
    }
    commitPosition();
    closePanel();
    path = null;
    view.mode = 'voyage';
    voyage.show(check.to === 'overlook' ? 'garden' : check.to);
    refresh();
    const started = performance.now();
    voyagePromise = (async () => {
      const r = reduce(state, { type: 'depart' });
      if (r.error) return;
      state = r.state;
      save();
      handleEvents(r.events);
      // 연출 최소 시간
      const wait = (reducedMotion ? 1600 : 3800) - (performance.now() - started);
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    })();
    voyagePromise.then(finishVoyage);
  }

  async function finishVoyage() {
    if (view.mode !== 'voyage') return;
    voyage.hide();
    await voyagePromise;
    if (view.mode !== 'voyage' && view.mode !== 'play') return;
    view.mode = 'loading';
    await enterScene({ label: `${SCENE_INFO[state.scene].name}에 내리는 중…` });
    const arrivedText = {
      ice: '얼음 성운에 도착했어요. 리본이 기다리고 있어요.',
      solar: '태양 정원에 도착했어요. 따뜻한 빛의 재료를 찾아볼까요?',
      twilight: '황혼 합류지에 도착했어요. 따뜻함과 차가움이 만나는 곳이에요.',
      overlook: '해파리의 항해 전망대로 돌아왔어요.',
    };
    toast.show(arrivedText[state.scene] ?? '도착했어요.', 4500);
  }

  function openFinale() {
    if (view.mode !== 'play') return;
    view.mode = 'finale';
    dispatch({ type: 'seeFinale' });
    finale.show();
    refresh();
  }

  // ------------------------------------------------------------------ 결정의 노래

  function startListening() {
    const st = state.quests.song;
    if (st !== 'active') {
      toast.show(st === 'available' || st === 'locked' ? '리본의 부탁을 먼저 들어 보세요.' : '이미 노래를 따라 했어요.');
      return;
    }
    unlockAudio();
    view.puzzle = listen(view.puzzle);
    const token = ++playToken;
    const seq = view.puzzle.sequence;
    const gap = reducedMotion ? 950 : 820;
    seq.forEach((id, i) => {
      setTimeout(() => {
        if (token === playToken) flashCrystal(id);
      }, 650 + i * gap);
    });
    setTimeout(() => {
      if (token !== playToken) return;
      view.puzzle = finishListening(view.puzzle);
      refresh();
      puzzlePanel.el.querySelector('.pz-pad:not([disabled])')?.focus({ preventScroll: true });
    }, 650 + seq.length * gap + 200);
    refresh();
  }

  function flashCrystal(id) {
    props.crystals[id]?.flash();
    chime(SCENE_INFO.ice.puzzle.tones[id]);
    setTimeout(updatePanels, 30);
    setTimeout(updatePanels, 700);
  }

  function puzzlePress(id) {
    if (view.puzzle.status !== 'input' || state.scene !== 'ice') return;
    unlockAudio();
    flashCrystal(id);
    view.puzzle = press(view.puzzle, id);
    if (view.puzzle.status === 'failure') {
      softBuzz();
      props.crystals[id]?.fail();
      view.crystalWrong = id;
      setTimeout(() => {
        view.crystalWrong = null;
        updatePanels();
      }, 1100);
      dispatch({ type: 'puzzleResult', success: false });
      puzzlePanel.el.querySelector('.btn-primary')?.focus({ preventScroll: true });
    } else if (view.puzzle.status === 'success') {
      props.crystals.forEach((c, i) => setTimeout(() => flashCrystal(c.index), 250 + i * 180));
      props.crystals.forEach((c) => sparkles.burst(c.object.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 12, reducedMotion));
      dispatch({ type: 'puzzleResult', success: true });
    } else {
      refresh();
    }
  }

  // ------------------------------------------------------------------ 이동

  function commitPosition() {
    if (!actors.player || world.id !== state.scene) return;
    const p = actors.player.position;
    const r = reduce(state, { type: 'setPosition', scene: state.scene, x: p.x, y: p.y, z: p.z, yaw: actors.player.yaw });
    if (!r.error) {
      state = r.state;
      save();
    }
  }

  function walkTo(point, then = null) {
    if (!world.grid) return false;
    const player = actors.player;
    const from = { x: player.position.x, y: player.groundY ?? player.position.y, z: player.position.z };
    let route = findPath(world.grid, from, point, 400000);
    if (!route) {
      // 칸 경계에 서 있어 시작 칸을 못 찾는 경우: 가장 가까운 보행 칸에서 다시
      const near = nearestWalkable(world.grid, from.x, from.z, from.y, 4);
      if (near) route = findPath(world.grid, near, point, 400000);
      if (route) route.unshift(near);
    }
    if (!route) return false;
    path = route.slice(1).map((p) => new THREE.Vector3(p.x, p.y, p.z));
    pathDone = then;
    if (!path.length) {
      path = null;
      then?.();
    }
    return true;
  }

  const moveMarker = new GroundRing({ color: '#FFF4DC', radius: 0.35, pulse: false });
  scene3.add(moveMarker.mesh);
  let moveMarkerLife = 0;

  function updatePlayerIdle(dt) {
    actors.player.update(dt, 0, time);
  }

  function updatePlayer(dt) {
    const player = actors.player;
    const grid = world.grid;
    let speed = 0;
    const dir = new THREE.Vector3();
    if (keys.size) {
      const f = follow.forward(new THREE.Vector3());
      const r = new THREE.Vector3(-f.z, 0, f.x);
      if (keys.has('f')) dir.add(f);
      if (keys.has('b')) dir.sub(f);
      if (keys.has('r')) dir.add(r);
      if (keys.has('l')) dir.sub(r);
      if (dir.lengthSq() > 0) path = null;
    } else if (path) {
      const next = path[0];
      dir.set(next.x - player.position.x, 0, next.z - player.position.z);
      const dist = dir.length();
      // 진척 감시: 경유점마다 걸어갈 시간 예산을 두고, 칸 경계에 걸려 맴돌면 붙이거나 다시 찾는다
      if (player.wp !== next) {
        player.wp = next;
        player.wpT = 0;
        player.wpBudget = dist / WALK_SPEED * 1.6 + 0.6;
      }
      player.wpT += dt;
      if (player.wpT > player.wpBudget) {
        player.wp = null;
        if (dist < 1.2) {
          player.position.set(next.x, next.y, next.z);
          player.groundY = next.y;
        } else {
          const goal = path[path.length - 1];
          const cb = pathDone;
          path = null;
          walkTo(goal, cb);
          return updatePlayerIdle(dt);
        }
      }
      if (dist < 0.3) {
        path.shift();
        if (!path.length) {
          path = null;
          const cb = pathDone;
          pathDone = null;
          cb?.();
        }
        dir.set(0, 0, 0);
      }
    }
    if (dir.lengthSq() > 0) {
      dir.normalize();
      const sp = run ? RUN_SPEED : WALK_SPEED;
      let step = sp * dt;
      if (path && !keys.size) step = Math.min(step, Math.hypot(path[0].x - player.position.x, path[0].z - player.position.z));
      const before = player.position.clone();
      if (grid && path && !keys.size) {
        // 경로 이동: A*가 이미 확인한 경유점 사이를 그대로 따라간다(칸 반올림 차이로 턱에 걸리지 않게)
        const prevY = player.groundY ?? before.y;
        player.position.x += dir.x * step;
        player.position.z += dir.z * step;
        const g = groundAt(grid, player.position.x, player.position.z, prevY, 0.6);
        player.groundY = g ?? prevY + (path[0].y - prevY) * Math.min(1, step / Math.max(0.01, Math.hypot(path[0].x - before.x, path[0].z - before.z)));
        player.position.y += (player.groundY - player.position.y) * Math.min(1, dt * 18);
      } else if (grid) {
        // 이동 판정은 격자 칸 높이(groundY)로, 화면 높이는 부드럽게 따라가게 분리한다
        // (보간된 높이로 판정하면 비탈을 내려갈 때 턱으로 오인해 멈춘다)
        const gy0 = player.groundY ?? before.y;
        const res = stepMove(grid, { x: before.x, y: gy0, z: before.z }, dir.x * step, dir.z * step);
        player.position.x = res.x;
        player.position.z = res.z;
        player.groundY = res.y;
        const gy = smoothGround(grid, res.x, res.z, res.y) ?? res.y;
        player.position.y += (gy - player.position.y) * Math.min(1, dt * 18);
      } else {
        player.position.addScaledVector(dir, step);
      }
      const moved = Math.hypot(player.position.x - before.x, player.position.z - before.z);
      speed = moved / Math.max(dt, 1e-4);
      if (moved > 1e-3) player.setYaw(Math.atan2(dir.x, dir.z));
    }
    player.update(dt, speed, time);
    const walking = speed > 0.2;
    if (wasWalking && !walking) commitPosition();
    wasWalking = walking;
  }

  // ------------------------------------------------------------------ 입력

  const raycaster = new THREE.Raycaster();
  const pointer = { down: false, x: 0, y: 0, dragged: false, id: null, button: 0 };
  canvas.addEventListener('pointerdown', (e) => {
    if (view.mode !== 'play' && view.mode !== 'modal') return;
    unlockAudio();
    Object.assign(pointer, { down: true, x: e.clientX, y: e.clientY, dragged: false, id: e.pointerId, button: e.button });
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointer.down || e.pointerId !== pointer.id) return;
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    if (!pointer.dragged && Math.hypot(dx, dy) > 6) pointer.dragged = true;
    if (pointer.dragged) {
      follow.rotate(dx * 0.0065, dy * 0.0045);
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      canvas.classList.add('is-dragging');
    }
  });
  const endPointer = (e) => {
    if (!pointer.down || e.pointerId !== pointer.id) return;
    pointer.down = false;
    canvas.classList.remove('is-dragging');
    if (!pointer.dragged && pointer.button === 0 && view.mode === 'play') handleClick(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', (e) => {
    pointer.down = false;
    canvas.classList.remove('is-dragging');
    void e;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (view.mode === 'play') follow.zoom(Math.sign(e.deltaY) * 0.12);
    },
    { passive: false },
  );

  function handleClick(cx, cy) {
    const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    raycaster.far = 80;
    // 주민·결정
    const hit = raycaster.intersectObjects(clickables, false)[0];
    if (hit) {
      const crystal = hit.object.userData.crystal;
      if (crystal !== undefined) {
        if (view.panel?.kind === 'puzzle' && view.puzzle.status === 'input') puzzlePress(crystal);
        else {
          const sp = spots.find((s) => s.kind === 'puzzle');
          if (sp) approach(sp);
        }
        return;
      }
      const charId = hit.object.userData.character;
      const sp = spots.find((s) => s.kind === 'npc' && s.npc.char.model === findCharRoot(hit.object));
      if (sp) {
        approach(sp);
        return;
      }
      void charId;
    }
    // 설치 지점·출구·발견물·작업대: 화면에서 가까운 표시를 누르면 걸어가서 상호작용
    const stageP = clientToStage(cx, cy);
    let bestSpot = null;
    let bestD = 60;
    for (const s of spots) {
      if (s.kind === 'npc' || s.disabled) continue;
      const a = project(s.pos, 0.2);
      if (!a.visible) continue;
      const d = Math.hypot(a.x - stageP.x, a.y - stageP.y);
      if (d < bestD) {
        bestD = d;
        bestSpot = s;
      }
    }
    if (bestSpot) {
      approach(bestSpot);
      return;
    }
    if (!world.grid) return;
    const g = pickGround(world.grid, raycaster.ray.origin, raycaster.ray.direction, 90);
    if (g && walkTo(new THREE.Vector3(g.x, g.y, g.z))) {
      moveMarker.mesh.position.set(g.x, g.y + 0.05, g.z);
      moveMarkerLife = 1;
    } else {
      toast.show('그곳으로는 걸어갈 수 없어요.', 1600);
    }
  }

  function findCharRoot(o) {
    let cur = o;
    while (cur && !(cur.parent && cur.parent.name?.startsWith('char:'))) cur = cur.parent;
    return cur;
  }

  function approach(spot) {
    const p = actors.player.position;
    if (Math.hypot(spot.pos.x - p.x, spot.pos.z - p.z) < spot.radius * 0.8) {
      interactWith(spot);
      return;
    }
    // 대상 앞(플레이어 쪽) 걸을 수 있는 칸
    const dir = new THREE.Vector3(p.x - spot.pos.x, 0, p.z - spot.pos.z).normalize();
    const goal = snapToGrid(spot.pos.clone().addScaledVector(dir, Math.min(1.4, spot.radius * 0.6)));
    if (walkTo(goal, () => interactWith(spot))) return;
    if (walkTo(snapToGrid(spot.pos), () => interactWith(spot))) return;
    toast.show(`${spot.name}까지 가는 길을 찾지 못했어요.`, 2000);
  }

  window.addEventListener('keydown', (e) => {
    if (view.mode !== 'play') return;
    if (e.code === 'Escape' && view.panel) {
      closePanel();
      return;
    }
    const tag = e.target?.tagName;
    if (tag === 'INPUT') return;
    if (e.target?.getAttribute?.('role') === 'radio' && e.code.startsWith('Arrow')) return;
    const dir = KEYMAP[e.code];
    if (dir) {
      e.preventDefault();
      keys.add(dir);
      return;
    }
    if (e.key === 'Shift') run = true;
    if (e.code === 'KeyE' && !e.repeat) {
      e.preventDefault();
      actions.interact();
    } else if (e.code === 'KeyQ' && !e.repeat) actions.rotateCamera(-1);
    else if (e.code === 'KeyR' && !e.repeat) actions.rotateCamera(1);
    else if (e.code === 'Escape' && view.panel) closePanel();
  });
  window.addEventListener('keyup', (e) => {
    const dir = KEYMAP[e.code];
    if (dir) keys.delete(dir);
    if (e.key === 'Shift') run = false;
  });
  window.addEventListener('blur', () => {
    keys.clear();
    run = false;
  });

  // ------------------------------------------------------------------ 디버그
  function drawDebugGrid() {
    const g = world.grid;
    const pts = [];
    for (let j = 0; j < g.h; j += 2) {
      for (let i = 0; i < g.w; i += 2) {
        for (const L of g.layers) {
          const v = L[j * g.w + i];
          if (v !== -32768) pts.push(g.x0 + i * g.cell, v / 100 + 0.05, -(g.y0 + j * g.cell));
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    world.dynamic.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ff5a8a', size: 0.08, toneMapped: false })));
    for (const [name, v] of Object.entries(world.nav)) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: '#00ffcc' }));
      s.position.copy(v.p);
      s.name = name;
      world.dynamic.add(s);
    }
  }

  // ------------------------------------------------------------------ 루프
  const clock = new THREE.Clock();
  let fpsAcc = 0;
  let fpsFrames = 0;
  const perf = { fps: 0 };
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    time += dt;
    if (world.root && actors.player) {
      if (view.mode === 'play') updatePlayer(dt);
      else actors.player.update(dt, 0, time);

      // 주민: 가까우면 플레이어를 바라본다
      for (const n of actors.npcs) {
        const d = n.char.position.distanceTo(actors.player.position);
        if (d < 5) n.char.faceTowards(actors.player.position.x, actors.player.position.z);
        else n.char.setYaw(n.homeYaw);
        // 카메라가 주민 몸 속으로 들어가면 잠시 숨긴다
        n.char.object.visible = camera.position.distanceTo(n.char.position) > 1.0 + n.char.height * 0.4 || camera.position.y > n.char.position.y + n.char.height + 0.3;
        n.char.update(dt, 0, time);
        n.mark.position.y = n.char.height + 0.45 + Math.sin(time * 2.5) * 0.06;
      }
      follow.target.copy(actors.player.position);
      follow.update(dt);
      world.update(dt, { camera: camera.position, target: actors.player.position });

      for (const e of props.slots.values()) {
        e.ring.update(time);
        e.prop?.update(time);
      }
      props.preview?.update(time);
      props.workbenchPreview?.update(time);
      props.sleepers.forEach((p) => p.visible !== false && p.update(time));
      props.rings.forEach((r) => r.update(time));
      props.beacons.forEach((b) => b.update(time, camera.position));
      props.crystals.forEach((c) => c.update(dt, time));
      for (const d of props.discoveries.values()) {
        d.spr.position.y = 0.7 + Math.sin(time * 2) * 0.12;
        d.spr.material.opacity = 0.7 + Math.sin(time * 4) * 0.3;
        d.ring.update(time);
      }
      moveMarkerLife = Math.max(0, moveMarkerLife - dt * 1.5);
      moveMarker.mesh.material.opacity = moveMarkerLife;
      moveMarker.mesh.visible = moveMarkerLife > 0;
      sparkles.update(dt);

      if (view.mode === 'play') {
        const t = nearestTarget();
        view.target = t;
        const panelOnTarget = view.panel && t && ((view.panel.kind === 'slot' && t.kind === 'slot' && t.id === view.panel.id) || (view.panel.kind === 'craft' && t.kind === 'workbench') || (view.panel.kind === 'puzzle' && t.kind === 'puzzle'));
        prompt.update(panelOnTarget ? null : t);
        if (view.panel) {
          const kind = { slot: 'slot', craft: 'workbench', puzzle: 'puzzle' }[view.panel.kind];
          const anchor = spots.find((s) => s.kind === kind && (kind !== 'slot' || s.id === view.panel.id));
          if (!anchor || anchor.pos.distanceTo(actors.player.position) > PANEL_CLOSE_RADIUS) closePanel();
        }
        if (view.panel?.kind === 'slot' || view.panel?.kind === 'craft') updatePanels();
      } else {
        prompt.update(null);
      }
      bubble.follow();
      renderer.render(scene3, camera);
    }
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc > 1) {
      perf.fps = Math.round(fpsFrames / fpsAcc);
      fpsAcc = 0;
      fpsFrames = 0;
    }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ 시작
  const setBoot = (p) => bootEl.style.setProperty('--p', p);
  try {
    setBoot(0.1);
    await Promise.all([loadCharacters(), preloadLightImages()]);
    setBoot(0.5);
  } catch (err) {
    console.error(err);
    bootEl.querySelector('p').textContent = '에셋을 불러오지 못했어요. tools/export-all.mjs로 변환했는지 확인해 주세요.';
    return;
  }
  bootEl.remove();
  requestAnimationFrame(frame);
  try {
    await enterScene({ label: `${SCENE_INFO[state.scene].name}을(를) 여는 중…` });
  } catch (err) {
    console.error(err);
    fader.show(`장면을 불러오지 못했어요: ${err.message}`);
    return;
  }
  if (loaded.notice) toast.show(loaded.notice, 6000);
  if (!state.flags.introSeen && !params.has('skipIntro')) {
    view.mode = 'intro';
    intro.show();
    refresh();
  } else if (params.has('skipIntro') && !state.flags.introSeen) {
    dispatch({ type: 'seeIntro' });
  }

  // 콘솔 검수용
  window.lumina = {
    get state() {
      return state;
    },
    get view() {
      return view;
    },
    perf,
    world,
    get walking() {
      return !!path;
    },
    get path() {
      return path?.map((p) => p.toArray().map((n) => Math.round(n * 100) / 100)) ?? null;
    },
    camera: follow,
    get player() {
      return actors.player;
    },
    dispatch,
    /** 지정 지점까지 실제 경로로 걷기(three 좌표) */
    walkTo: (x, z, y = actors.player.position.y) => view.mode === 'play' && walkTo(new THREE.Vector3(x, y, z)),
    /** 동선 표시 이름으로 걷기 */
    walkToMarker(name) {
      const p = markerGround(name);
      return p ? walkTo(p) : false;
    },
    spots: () => spots.map((s) => ({ kind: s.kind, id: s.id, name: s.name, pos: s.pos.toArray().map((n) => Math.round(n * 100) / 100) })),
    /** 대상 앞까지 걸어가서 상호작용 */
    approach(kind, id) {
      const s = spots.find((x) => x.kind === kind && (id === undefined || x.id === id));
      if (s) approach(s);
      return !!s;
    },
    async goto(sceneId) {
      state = { ...state, scene: sceneId, arrival: null };
      await enterScene();
    },
    reset() {
      storage?.removeItem(SAVE_KEY);
      location.reload();
    },
  };
}

boot();
