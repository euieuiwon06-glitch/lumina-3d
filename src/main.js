import './styles/tokens.css';
import './styles/game.css';
import './styles/three.css';
import './styles/story.css';

import * as THREE from 'three';

import { chime, isMuted, setMuted, softBuzz, unlockAudio } from './engine/audio.js';
import { FollowCamera } from './engine/camera.js';
import { Character, loadCharacters } from './engine/character.js';
import { CharacterPreview } from './engine/preview.js';
import { GroundRing, LightProp, SongCrystal, Sparkles, glowTexture, preloadLightImages, starTexture } from './engine/props.js';
import { clientToStage, mountStage, stage } from './engine/stage.js';
import { BridgeGate, BudPod, Glimmer, GuideWisp, Lantern, LightFlow, LightGate, loadLiftTemplate, NavBeacon, PetalLift, SlabBridge, SleepingBud } from './engine/story-props.js';
import { ObjectiveMarker, PathTrail } from './engine/guide-fx.js';
import { DistantReplies, GlowPath, HiddenFlower, IceGlyph, LittleJelly, OrganBranches, StrangeLight } from './engine/story2-props.js';
import { guideTarget } from './game/guide.js';
import { airMove, cellCenter, findPath, floodReachable, groundAt, nearestReachable, nearestWalkable, pickGround, smoothGround, stepMove, supportAt } from './engine/walkgrid.js';
import { loadVoyageAssets, VoyageScene } from './engine/voyage.js';
import { BASE, gltfLoader, World } from './engine/world.js';
import { BASES, BODY_COLORS, CHEST_COLORS, DISCOVERIES, GUIDE_SOFT, MATERIALS, REPLY_SPOTS, UNLOCKS, byId, lightName } from './game/catalog.js';
import { BRANCH_LINES, dialogueFor } from './game/dialogue.js';
import { createPuzzle, finishListening, listen, press } from './game/puzzle.js';
import { GIVER_NAMES, QUESTS, carriedLights, isDestination, lightAt } from './game/quests.js';
import { NPCS, SCENE_INFO, npcsInScene } from './game/scenes.js';
import { LEGACY_KEYS, LINKS, SAVE_KEY, SCENES, availableRoutes, canDepart, createInitialState, isDiscovered, lightInHand, loadState, reduce, replyReady, saveState, slotAvailability } from './game/state.js';
import { autoTune, createTuning, glowAt, press as tunePressLogic, start as tuneStart } from './game/tuning.js';
import { assetUrl } from './ui/assets.js';
import { createHud } from './ui/hud.js';
import { createFader, createToast } from './ui/overlays.js';
import { createBubble, createCraftPanel, createPrompt, createPuzzlePanel, createSlotPanel, createUsePanel } from './ui/panels.js';
import {
  createBanner,
  createControlsHelp,
  createCreator,
  createDialogue,
  createExchangePanel,
  createHint,
  createRoutePanel,
  createSettings,
  createTitle,
  createTuningPanel,
  createVoyageCinematic,
  createObjectivePointer,
} from './ui/story.js';

const WALK_SPEED = 3.0;
const RUN_SPEED = 5.2;
const TALK_RADIUS = 2.4;
const PANEL_CLOSE_RADIUS = 5;
const SETTINGS_KEY = 'lumina-3d-settings';
const JUMP_SPEED = 5.2;
const GRAVITY = 16;
const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

async function boot() {
  const canvas = document.getElementById('world');
  const stageEl = document.getElementById('stage');
  const uiRoot = document.getElementById('ui');
  const overlayRoot = document.getElementById('overlays');
  const bootEl = document.getElementById('boot');
  const params = new URLSearchParams(location.search);

  // ------------------------------------------------------------------ 저장·설정
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  const settings = { hints: true, guide: true, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, muted: false };
  try {
    Object.assign(settings, JSON.parse(storage?.getItem(SETTINGS_KEY) ?? '{}'));
  } catch {
    /* 기본값 */
  }
  setMuted(settings.muted);
  const saveSettings = () => {
    try {
      storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* 저장 불가 */
    }
  };
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
  let loaded = loadState(storage);
  let state = loaded.state;

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
  // 배경은 블렌더 AgX 룩으로 구웠다(캐릭터는 Standard 뷰로 제작 → 캐릭터 재질만 톤매핑 제외)
  renderer.toneMapping = THREE.AgXToneMapping;
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
  const wisp = new GuideWisp();
  scene3.add(wisp.object);
  // 길 안내: 목표 핀 + 바닥 빛 길(장면이 바뀌어도 유지되도록 dynamic 밖에 둔다)
  const objMarker = new ObjectiveMarker();
  const trail = new PathTrail();
  scene3.add(objMarker.object, trail.object);
  const guideState = { key: '', routeAt: 0, spot: null };

  // ------------------------------------------------------------------ 표시 상태
  const view = {
    mode: 'title', // title | creator | loading | cinematic | play | dialogue | panel-modal | voyage | transit | menu
    panel: null, // { kind: 'slot'|'craft'|'puzzle'|'tune', id }
    questCollapsed: false,
    puzzle: createPuzzle(),
    tuning: null,
    crystalWrong: null,
    target: null,
    glimmersFound: new Set(),
    companion: null,
    useResult: null, // 빛 비추기 패널의 마지막 반응 { text, tone }
    traceRunning: false,
    lastProgress: performance.now(),
    wispAt: 0,
    arrivedAt: 0,
    lookYaw: 0,
  };
  const keys = new Set();
  let run = false;
  let path = null;
  let pathDone = null;
  let playToken = 0;
  let wasWalking = false;
  let time = 0;
  let movedDistance = 0;

  const actors = { player: null, npcs: [] };
  let spots = [];
  let clickables = [];
  const props = {
    slots: new Map(),
    rings: [],
    doors: [],
    lifts: new Map(),
    crystals: [],
    preview: null,
    benchPreview: null,
    lanterns: new Map(),
    gate: null,
    bud: null,
    glimmers: [],
    flows: [],
    discoveries: new Map(),
    // 두 번째 이야기
    strange: null,
    flower: null,
    glyphs: [],
    jelly: null,
    guidePts: [],
    branches: null,
    replies: null,
  };
  let reach = null;
  let gridOriginal = null;
  let cinematic = null; // { update(dt), skip() }
  let portraits = {};

  const portraitFor = (id) => {
    if (id === 'player') return portraits.player;
    const model = NPCS[id]?.model;
    return model ? assetUrl(`portraits/${model}.png`) : null;
  };
  const profileLook = (p = state.profile) => ({
    bodyHex: byId(BODY_COLORS, p.body).hex,
    chestHex: byId(CHEST_COLORS, p.chest).hex,
    symbol: p.symbol,
    accessory: p.accessory,
  });

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
      if (view.mode === 'play' && view.panel?.kind === 'tune') return actions.tunePress();
      if (view.target) interactWith(view.target);
    },
    place() {
      const id = view.panel?.id;
      if (!id) return;
      if (dispatch({ type: 'placeLight', slot: id })) {
        const e = props.slots.get(id);
        sparkles.burst(e.pos.clone().add(V3(0, 1, 0)), 22, settings.reducedMotion);
        chime(659.25, 0.5, 0.1);
        if (id === 'shelter') {
          const l = lightAt(state, 'shelter');
          const pogeun = actors.npcs.find((n) => n.id === 'pogeun');
          if (pogeun && l && l.brightness > 60) bubble.show('포근: 앗, 눈부셔요…! 밝기를 조금만 낮춰 줄래요?', () => project(pogeun.char.position, pogeun.char.height + 0.2));
        }
      }
    },
    retrieve() {
      const id = view.panel?.id;
      if (id) dispatch({ type: 'retrieveLight', slot: id });
    },
    craft() {
      if (dispatch({ type: 'craftLight' })) {
        const top = spots.find((s) => s.kind === 'workbench')?.top;
        if (top) sparkles.burst(top.clone().add(V3(0, 0.3, 0)), 26, settings.reducedMotion);
        chime(783.99, 0.6, 0.1);
      }
    },
    reshape() {
      const carried = carriedLights(state).filter((l) => l.origin === 'crafted');
      if (carried.length) dispatch({ type: 'reshapeLight', lightId: carried[carried.length - 1].id });
    },
    // 두 번째 이야기: 대상에 들고 있는 빛을 비춘다(빛은 사라지지 않음)
    useLight() {
      const p = view.panel;
      if (p?.kind !== 'use') return;
      unlockAudio();
      const type = { flower: 'lightFlower', iceTrace: 'lightIceTrace', guidePt: 'guideLight' }[p.target];
      if (!type) return;
      if (!lightInHand(state)) {
        view.useResult = { text: '들고 있는 빛이 없어요. ‘빛 빚기·조절’로 여기서 바로 빚어요.', tone: 'warn' };
        refresh();
        return;
      }
      dispatch({ type, index: p.index });
    },
    readTrace() {
      const p = view.panel;
      if (p?.kind !== 'use') return;
      if (p.target === 'flower') dispatch({ type: 'readFlowerClue' });
      if (p.target === 'iceTrace') dispatch({ type: 'readIceClue' });
    },
    fieldCraft() {
      const p = view.panel;
      if (p?.kind !== 'use') return;
      view.panel = { kind: 'craft', id: 'field', back: { ...p } };
      refresh();
      craftPanel.el.querySelector('.chip.is-selected')?.focus({ preventScroll: true });
    },
    closePanel,
    requestDepart,
    puzzleStart: () => startListening(),
    puzzleListen: () => startListening(),
    puzzlePress,
    toggleSound() {
      settings.muted = !isMuted();
      setMuted(settings.muted);
      saveSettings();
      refresh();
    },
    rotateCamera(dir) {
      follow.autoYaw = follow.yaw - dir * (Math.PI / 4);
      markLook(Math.PI / 4);
    },
    recenterCamera() {
      follow.autoYaw = actors.player ? actors.player.yaw + Math.PI : follow.yaw;
    },
    // 시작 화면
    newJourney(confirmed = false) {
      if (loaded.hasSave && !confirmed) {
        title.confirmNew();
        return;
      }
      state = createInitialState();
      try {
        storage?.removeItem(SAVE_KEY);
      } catch {
        /* 저장소 접근 불가 */
      }
      loaded = { state, hasSave: false };
      title.hide();
      openCreator(true);
    },
    async continueJourney() {
      if (!loaded.hasSave) return;
      title.hide();
      buildPlayer();
      await enterScene();
      if (loaded.notice) toast.show(loaded.notice, 6000);
    },
    // 내 모습 만들기
    pick(key, value) {
      creatorDraft = { ...creatorDraft, [key]: value };
      creator.update({ ...creatorDraft }, state.unlocks);
      if (key !== 'name') preview.setCharacter(byId(BASES, creatorDraft.base).model, profileLook(creatorDraft));
      if (key === 'base') preview.wave();
    },
    previewWave: () => preview.wave(),
    async confirmProfile() {
      const first = !state.profile.created;
      if (!dispatch({ type: 'setProfile', profile: creatorDraft, confirm: true })) return;
      creator.hide();
      preview.stop();
      portraits.player = preview.snapshot(byId(BASES, state.profile.base).model, profileLook());
      buildPlayer();
      if (first) {
        await playOpening();
      } else {
        view.mode = 'play';
        const pos = actors.player.position.clone();
        world.dynamic.add(actors.player.object);
        actors.player.position.copy(pos);
        refresh();
        toast.show(`${state.profile.name}의 새 모습이에요.`);
      }
    },
    closeCreator() {
      creator.hide();
      preview.stop();
      if (!state.profile.created) {
        pendingDraft = { ...creatorDraft };
        view.mode = 'title';
        title.show({ hasSave: loaded.hasSave, name: state.profile.name, legacy: loaded.legacy });
      } else {
        view.mode = 'play';
        refresh();
      }
    },
    dialogueClosed() {
      if (view.mode === 'dialogue') {
        view.mode = 'play';
        refresh();
      }
    },
    // 조율
    tunePress() {
      if (!view.tuning) return;
      unlockAudio();
      const before = view.tuning;
      view.tuning = tunePressLogic(view.tuning, time);
      const lanternName = SCENE_INFO.walkway.offbeat[before.index];
      if (view.tuning.lastResult === 'hit' && view.tuning.hits > before.hits) {
        const l = props.lanterns.get(lanternName);
        if (l) {
          l.state = 'on';
          l.flash = 1;
          sparkles.burst(l.object.position.clone().add(V3(0, 1.6, 0)), 14, settings.reducedMotion);
        }
        chime(587.33 + before.index * 110, 0.5, 0.12);
      } else {
        softBuzz();
      }
      if (view.tuning.status === 'done') finishTuning(false);
    },
    tuneAuto() {
      view.tuning = autoTune(view.tuning);
      if (view.tuning.status === 'done') finishTuning(true);
    },
    tuneCancel() {
      view.tuning = null;
      view.panel = null;
      for (const n of SCENE_INFO.walkway.offbeat) if (props.lanterns.get(n)) props.lanterns.get(n).state = 'offbeat';
      refresh();
    },
    // 교환·엮기
    exchangeCancel() {
      exchange.hide();
      view.mode = 'play';
      refresh();
    },
    exchangeConfirm() {
      exchange.hide();
      view.mode = 'play';
      if (exchangeMode === 'trade') {
        if (dispatch({ type: 'trade' })) playTradeAnimation();
      } else if (dispatch({ type: 'weave' })) {
        sparkles.burst(actors.player.position.clone().add(V3(0, 1.4, 0)), 34, settings.reducedMotion);
        chime(880, 0.8, 0.12);
        setTimeout(() => talkTo('ribbon'), 900);
      }
      refresh();
    },
    // 항로
    routeCancel() {
      routes.hide();
      view.mode = 'play';
      refresh();
    },
    routeConfirm() {
      const r = routes.chosen;
      routes.hide();
      view.mode = 'play';
      if (r && dispatch({ type: 'chooseRoute', route: r })) startVoyage();
      else refresh();
    },
    voyageSkip() {
      voyageSkipRequested = true;
    },
    // 설정
    openSettings() {
      if (view.mode !== 'play') return;
      closePanel();
      view.mode = 'menu';
      settingsUi.show(settings, state.world.bridgeRestored);
      refresh();
    },
    closeSettings() {
      settingsUi.hide();
      view.mode = 'play';
      refresh();
    },
    setSetting(id, on) {
      if (id === 'sound') {
        settings.muted = !on;
        setMuted(!on);
      } else settings[id] = on;
      saveSettings();
      refresh();
    },
    showControls() {
      settingsUi.hide();
      controls.show();
    },
    closeControls() {
      controls.hide();
      view.mode = 'play';
      refresh();
    },
    openCreatorFromMenu() {
      settingsUi.hide();
      openCreator(false);
    },
    toTitle() {
      settingsUi.hide();
      commitPosition();
      location.reload();
    },
  };

  const hud = createHud(uiRoot, actions);
  const prompt = createPrompt(uiRoot, actions);
  const bubble = createBubble(uiRoot);
  const slotPanel = createSlotPanel(uiRoot, actions);
  const craftPanel = createCraftPanel(uiRoot, actions);
  const puzzlePanel = createPuzzlePanel(uiRoot, actions);
  const tuningPanel = createTuningPanel(uiRoot, actions);
  const usePanel = createUsePanel(uiRoot, actions);
  const hint = createHint(uiRoot);
  const banner = createBanner(uiRoot);
  const toast = createToast(uiRoot);
  const pointer2d = createObjectivePointer(uiRoot);
  const dialogue = createDialogue(overlayRoot, actions);
  const exchange = createExchangePanel(overlayRoot, actions);
  const routes = createRoutePanel(overlayRoot, actions);
  const voyageUi = createVoyageCinematic(overlayRoot, actions);
  const settingsUi = createSettings(overlayRoot, actions);
  const controls = createControlsHelp(overlayRoot, actions);
  const creator = createCreator(overlayRoot, actions);
  const title = createTitle(overlayRoot, actions);
  const fader = createFader(overlayRoot);
  const preview = new CharacterPreview(creator.canvas);
  let creatorDraft = { ...state.profile };
  let exchangeMode = 'trade';
  let voyageSkipRequested = false;
  let voyage3d = null; // 우주 해파리 항해 장면(처음 항해 때 한 번 만든다)
  let voyageLive = null;

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
    if (state.profile.created) save();
    if (r.events.some((e) => !['tutorialStep'].includes(e.type))) view.lastProgress = performance.now();
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
        if (info && e.item.id !== 'bridge') granted.push(e.item.kind === 'material' && e.item.amount > 1 ? `${info.label} ${e.item.amount}개` : info.label);
      } else if (e.type === 'questAccepted' && QUESTS[e.id].giver) {
        toast.show(`‘${QUESTS[e.id].title}’ 부탁을 받았어요.`);
        if (e.id === 'song') view.puzzle = createPuzzle();
      } else if (e.type === 'questCompleted' && !QUESTS[e.id].auto) {
        const q = QUESTS[e.id];
        toast.show(`조건을 모두 채웠어요! ${GIVER_NAMES[q.giver]}에게 알려요.`);
      } else if (e.type === 'questReopened') {
        toast.show(`‘${QUESTS[e.id].title}’ 조건이 다시 비었어요.`);
      } else if (e.type === 'firstLight') {
        banner.show('내 안의 작은 빛', `${lightName(e.light)}이 깨어났어요`, '작업대가 첫 빛의 제작법을 기억해요.', 4200);
      } else if (e.type === 'lightCrafted' && state.world.firstCrafted && !events.some((x) => x.type === 'firstLight')) {
        toast.show(`${lightName(e.light)}을 빚었어요. 들고 다니다가 설치 지점에 놓아요.`);
      } else if (e.type === 'lightPlaced') {
        if (e.slot === 'lantern') {
          dispatchTutorial('place');
          toast.show('첫 등불이 켜지고 주변 꽃이 피었어요! 남은 등불의 박자가 어긋나 있어요.', 4500);
        }
      } else if (e.type === 'lightRetrieved') {
        toast.show('빛을 거두어 다시 들고 있어요.');
      } else if (e.type === 'discovered') {
        toast.show(`발견: ${DISCOVERIES[e.id].label}`);
      } else if (e.type === 'chapterDone') {
        setTimeout(() => banner.show('첫 챕터 완료', '첫 번째 숨결', '해파리가 우리가 만든 빛을 따라 새로운 곳에 닿았어요.', 6500), 400);
      } else if (e.type === 'benchOpened') dispatchTutorial('bench');
      else handleStoryEvent(e);
    }
    if (granted.length) setTimeout(() => toast.show(`받았어요: ${granted.join(', ')}`), 1200);
  }

  /** 두 번째 이야기: 빛을 비춘 결과를 대상의 반응으로 보여 준다 */
  function handleStoryEvent(e) {
    const npcNear = (id) => actors.npcs.find((n) => n.id === id && n.char.object.visible);
    const speak = (id, text) => {
      const n = npcNear(id);
      if (n) bubble.show(`${n.name}: ${text}`, () => project(n.char.position, n.char.height + 0.2));
    };
    const result = (text, tone) => {
      view.useResult = { text, tone };
    };
    if (e.type === 'traceSeen') {
      setTimeout(() => toast.show('새 목표: ‘누군가 남긴 빛’ · 따뜻한 곳과 차가운 곳에 남은 흔적을 찾아요.', 5000), 300);
    } else if (e.type === 'flowerReact') {
      props.flower?.flower.react(e.result);
      if (e.result === 'open') {
        chime(880, 0.9, 0.1);
        sparkles.burst(props.flower.pos.clone().add(V3(0, 1.2, 0)), 26, settings.reducedMotion);
        result('꽃잎이 천천히 열렸어요! 안쪽에 햇살 무늬가 남아 있어요. ‘꽃 속 흔적 살피기’를 눌러요.', 'good');
        speak('salguSolar', '열렸다! 눈부시지 않으니까 안심했나 봐.');
      } else if (e.result === 'half') {
        softBuzz();
        result('꽃잎이 조금 떨리다 멈췄어요. 아직 조금 눈부신가 봐요 — 밝기를 더 낮추거나 안개 형태로 퍼뜨려 봐요.', 'mid');
        speak('salguSolar', '거의 다 왔어. 조금만 더 부드럽게!');
      } else {
        softBuzz();
        result('꽃이 꽃잎을 꼭 오므렸어요. 너무 밝아서 숨은 것 같아요. 밝기를 낮춰 봐요.', 'warn');
        speak('salguSolar', '앗, 눈부신가 봐. 빛을 좀 줄여 볼까?');
      }
    } else if (e.type === 'iceReact') {
      const gl = props.glyphs.find((x) => x.i === e.index);
      if (e.ok) {
        bubble.hide();
        gl?.g.setRevealed(true);
        chime(698.46 + e.index * 110, 0.8, 0.1);
        if (gl) sparkles.burst(gl.pos.clone().add(V3(0, 1.4, 0)), 18, settings.reducedMotion);
        const left = 3 - state.story.iceTraces.length;
        result(left ? `결정 속 무늬가 떠올랐어요! 이어진 선이 다음 결정을 가리켜요. (남은 흔적 ${left})` : '세 무늬가 이어져 한 방향을 가리켜요. ‘흔적의 방향 읽기’를 눌러요.', 'good');
        if (!left) speak('ribbonIce', '봐, 선이 이어졌어! 누군가 여기로 길을 그려 뒀구나.');
      } else {
        gl?.g.faintFlash();
        softBuzz();
        result('결정이 잠깐 흐리게 비쳤다가 사라졌어요. 차가운 빛(민트·오로라 계열)을 넓게 퍼지게 비춰 봐요.', 'warn');
        speak('ribbonIce', '따뜻한 빛에는 얼음이 잘 안 비치나 봐. 차가운 빛으로 해 보자.');
      }
    } else if (e.type === 'clueFound') {
      chime(1046.5, 1, 0.1);
      closePanel(true);
      const two = state.story.clues.length >= 2;
      banner.show(
        '흔적을 찾았어요',
        e.id === 'solar' ? '햇살 꽃이 품은 흔적' : '얼음 결정이 그린 흔적',
        two ? '두 흔적이 모였어요. 보라에게 보여 주고 항해 나무에서 엮어요.' : '보라에게 보여 주면 이어 볼 수 있어요.',
        5000,
      );
      if (e.id === 'solar') setTimeout(() => speak('salguSolar', '이 꽃, 이제 계속 피어 있을 거야. 나 여기서 좀 더 지켜볼래.'), 2000);
      else setTimeout(() => speak('ribbonIce', '결정 빛은 오래 남으니까, 다음에 와도 길이 보일 거야.'), 2000);
    } else if (e.type === 'cluesWoven') {
      chime(1318.5, 1.4, 0.08);
    } else if (e.type === 'jellyMet') {
      view.lastProgress = performance.now();
    } else if (e.type === 'jellyReact') {
      const pj = props.jelly;
      const gp = props.guidePts.find((g) => g.i === e.index);
      if (e.ok && pj) {
        bubble.hide();
        gp?.path.light(true, e.afterglow);
        pj.jelly.swimTo(pj.stops[e.index]);
        chime(659.25 + e.index * 130, 0.8, 0.1);
        if (gp) sparkles.burst(gp.pos.clone().add(V3(0, 0.8, 0)), 16, settings.reducedMotion);
        result(
          e.step >= 3
            ? '작은 해파리가 빛길을 끝까지 따라왔어요!'
            : `작은 해파리가 은은한 빛을 따라 헤엄쳐 왔어요.${e.afterglow ? ' 잔상이 길을 오래 남겨 줘요.' : ''} 다음 지점으로 가요.`,
          'good',
        );
        if (e.step >= 3) {
          closePanel(true);
          setTimeout(() => banner.show('이쪽으로 와도 괜찮아', '작은 해파리가 선착장에 닿았어요', '보라에게 돌아가 이야기를 전해요.', 5500), 900);
        }
      } else {
        pj?.jelly.flinch();
        softBuzz();
        result('작은 해파리가 움찔하며 멈췄어요. 너무 밝아요 — 밝기를 낮춘 부드러운 빛으로 다시 비춰요. (제자리에서 기다려요)', 'warn');
      }
    } else if (e.type === 'cluesShown') {
      view.lastProgress = performance.now();
    } else if (e.type === 'replySent') {
      view.lastProgress = performance.now();
    } else if (e.type === 'questClaimed' && e.id === 'trace') {
      setTimeout(() => toast.show('새 항로 ‘황혼 합류지’가 열렸어요. 항해 나무에서 골라요.', 4500), 1600);
    } else if (e.type === 'questAccepted' && QUESTS[e.id]?.auto && e.id === 'guide') {
      toast.show('새 목표: ‘이쪽으로 와도 괜찮아’ · 황혼 합류지로 항해해요.', 4500);
    }
  }

  function dispatchTutorial(id) {
    if (!state.tutorial.done.includes(id)) {
      const r = reduce(state, { type: 'tutorial', id });
      if (!r.error) {
        state = r.state;
        if (state.profile.created) save();
      }
    }
  }

  function refresh() {
    const info = SCENE_INFO[state.scene];
    const blocked = view.mode !== 'play';
    for (const el of [hud.elements.left, hud.elements.right, hud.elements.palette, hud.elements.dockWrap, hud.elements.camRow, prompt.el, slotPanel.el, craftPanel.el, puzzlePanel.el, tuningPanel.el, usePanel.el]) {
      el.inert = blocked;
    }
    // 항해 중에도 HUD를 숨겨 3D 해파리 연출이 화면을 채운다
    const inGame = !['title', 'creator', 'cinematic', 'voyage'].includes(view.mode) && !!world.root;
    for (const el of [hud.elements.left, hud.elements.right, hud.elements.palette, hud.elements.dockWrap, hud.elements.camRow]) el.classList.toggle('is-away', !inGame);
    // 연출 중에는 HUD만 숨기고 자막(배너)·알림은 보인다
    uiRoot.hidden = !(inGame || view.mode === 'cinematic' || view.mode === 'voyage');
    if (inGame) hud.update({ state, info, view });
    updatePanels();
    stageEl.dataset.scene = state.scene;
    stageEl.dataset.mode = view.mode;
    for (const n of actors.npcs) {
      const q = questFor(n.id);
      n.mark.visible = !!q && (state.quests[q] === 'available' || state.quests[q] === 'completed');
      n.mark.material.color.set(q && state.quests[q] === 'completed' ? '#B9E6D3' : '#FFD0A9');
    }
  }

  function questFor(npcId) {
    const ids = Object.keys(QUESTS).filter((id) => QUESTS[id].giver === npcId);
    return ids.find((id) => state.quests[id] === 'completed') ?? ids.find((id) => state.quests[id] === 'available') ?? ids.find((id) => state.quests[id] === 'active') ?? null;
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
    const player = actors.player && world.root ? project(actors.player.position, 0.6) : null;
    const p = view.panel;
    const slotEntry = p?.kind === 'slot' ? props.slots.get(p.id) : null;
    slotPanel.update({ state, slot: slotEntry?.slot ?? null, anchor: slotEntry ? project(slotEntry.pos, 1.0) : null, player });
    // 퀘스트 대상 앞에서 연 작업대는 그 대상 옆에 뜬다
    const backSpot = p?.kind === 'craft' && p.back ? useSpot(p.back) : null;
    const bench = backSpot ?? spots.find((s) => s.kind === 'workbench');
    craftPanel.update({ state, open: p?.kind === 'craft', anchor: bench ? project(bench.pos, 1.2) : null, player, field: backSpot ? useInfo(p.back)?.title : null });
    const us = p?.kind === 'use' ? useSpot(p) : null;
    usePanel.update({ info: us ? useInfo(p) : null, anchor: us ? project(us.pos, 1.2) : null, player });
    puzzlePanel.update({ state, view, open: p?.kind === 'puzzle', muted: isMuted(), glow: props.crystals.map((c) => c.glow) });
    tuningPanel.update(p?.kind === 'tune' ? view.tuning : null, time);
  }

  // ------------------------------------------------------------------ 빛 비추기(두 번째 이야기)
  function useSpot(panel) {
    if (!panel) return null;
    return spots.find((s) => s.kind === panel.target && s.id === panel.id) ?? null;
  }

  /** 빛 비추기 패널 내용: 대상이 원하는 성질(한두 가지)과 들고 있는 빛, 마지막 반응 */
  function useInfo(panel) {
    const T = state.story;
    const L = lightInHand(state);
    const r = view.useResult;
    if (panel.target === 'flower') {
      const readable = T.flowerOpen && !T.clues.includes('solar');
      return {
        title: '숨은 꽃',
        where: '태양 정원 · 태양씨앗 숲',
        needIcon: 'sun',
        need: T.flowerOpen ? '꽃이 편안하게 열렸어요. 안쪽의 낯선 빛을 살펴봐요.' : '밝은 빛에는 몸을 오므려요. 은은한 빛(밝기를 낮추거나 부드럽게 퍼지는 안개 형태)을 비춰 봐요.',
        light: L,
        result: r?.text,
        resultTone: r?.tone,
        useLabel: '꽃에 빛 비추기',
        canUse: state.quests.flower === 'active' && !T.flowerOpen,
        readLabel: readable ? '꽃 속 흔적 살피기' : null,
      };
    }
    if (panel.target === 'iceTrace') {
      const readable = T.iceTraces.length >= 3 && !T.clues.includes('ice');
      const noAurora = !isDiscovered(state, 'iceAurora');
      return {
        title: readable ? '이어진 흔적' : `결정 속 흔적 ${panel.index + 1} / 3`,
        where: '얼음 성운 · 수정 바위',
        needIcon: 'sparkle',
        need: readable
          ? '세 흔적이 한 줄로 이어졌어요. 흔적이 가리키는 방향을 읽어요.'
          : `차가운 빛(민트·하늘·오로라빛)을 비추면 문양이 드러나요.${noAurora ? ' 오로라 결정에서 이곳의 빛을 먼저 받아도 좋아요.' : ''}`,
        light: L,
        result: r?.text,
        resultTone: r?.tone,
        useLabel: '결정에 빛 비추기',
        canUse: state.quests.icepath === 'active',
        readLabel: readable ? '흔적의 방향 읽기' : null,
      };
    }
    if (panel.target === 'guidePt') {
      return {
        title: `빛길 지점 ${panel.index + 1} / 3`,
        where: panel.index === 2 ? '황혼 합류지 · 선착장 곁' : '황혼 합류지 · 계단섬 길',
        needIcon: 'heart',
        need: `작은 해파리는 눈부신 빛에 다가오지 않아요. 밝기 ${GUIDE_SOFT} 이하의 은은한 빛을 놓아요. 잔상 빛이면 길이 오래 남아요.`,
        light: L,
        result: r?.text,
        resultTone: r?.tone,
        useLabel: '여기에 빛길 놓기',
        canUse: state.quests.guide === 'active' && state.story.jellyMet,
        readLabel: null,
      };
    }
    return null;
  }

  function openUse(spot) {
    view.useResult = null;
    view.panel = { kind: 'use', target: spot.kind, id: spot.id, index: spot.index ?? 0 };
    refresh();
    usePanel.el.querySelector('.btn-primary:not([disabled]):not([hidden]), .btn:not([disabled]):not([hidden])')?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ 캐릭터
  function buildPlayer() {
    if (actors.player) actors.player.object.removeFromParent();
    actors.player = new Character(byId(BASES, state.profile.base).model);
    actors.player.applyProfile(profileLook());
    if (!portraits.player) portraits.player = preview.snapshot(byId(BASES, state.profile.base).model, profileLook());
  }

  let pendingDraft = null; // 첫 설정 화면을 닫았다 돌아와도 고른 모습을 보존
  function openCreator(first) {
    view.mode = 'creator';
    creatorDraft = first && pendingDraft ? { ...pendingDraft } : { ...state.profile };
    creator.update(creatorDraft, state.unlocks);
    creator.show(first);
    preview.setCharacter(byId(BASES, creatorDraft.base).model, profileLook(creatorDraft));
    preview.start();
    setTimeout(() => {
      preview.resize();
      preview.wave();
    }, 60);
    refresh();
  }

  // ------------------------------------------------------------------ 장면 구성
  /** free: 지금 갈 수 있는 곳(reach)에 묶지 않는다(다리 건너편 주민·봉오리처럼 나중에 갈 곳) */
  function snapToGrid(p, maxLift = 3, free = false) {
    if (!world.grid) return p.clone();
    if (reach && !free) {
      const r = nearestReachable(world.grid, reach, p.x, p.z, p.y - 0.2, 80);
      if (r) return V3(r.x, r.y, r.z);
    }
    const w = nearestWalkable(world.grid, p.x, p.z, p.y - 0.2, 24);
    if (!w || Math.abs(w.y - p.y) > maxLift) return p.clone();
    return V3(w.x, w.y, w.z);
  }

  function markerRaw(name, offset = [0, 0]) {
    const m = world.navPoint(name);
    if (!m) return null;
    return V3(m.x + offset[0], m.y - (name.startsWith('QUEST_') ? 1.2 : name.startsWith('POI_') ? 0.8 : 0), m.z + offset[1]);
  }
  function markerGround(name, offset = [0, 0], free = false) {
    const raw = markerRaw(name, offset);
    if (!raw) {
      console.warn('[LUMINA] 동선 표시 없음', world.id, name);
      return null;
    }
    return snapToGrid(raw, 3, free);
  }

  function sceneCenter() {
    const pts = Object.entries(world.nav).filter(([k]) => /^(POI_|QUEST_|PLAYER_START|MARK_)/.test(k)).map(([, v]) => v.p);
    if (!pts.length) return V3();
    return pts.reduce((a, b) => a.add(b), V3()).multiplyScalar(1 / pts.length);
  }

  function arrivalPose(markerName) {
    const m = markerGround(markerName) ?? snapToGrid(sceneCenter());
    const c = sceneCenter();
    let pos = m.clone();
    let dir = V3(c.x - m.x, 0, c.z - m.z);
    if (world.grid) {
      const route = findPath(world.grid, m, snapToGrid(c, 50), 400000);
      if (route && route.length > 1) {
        let left = 3;
        let prev = V3(route[0].x, route[0].y, route[0].z);
        for (let i = 1; i < route.length && left > 0; i++) {
          const next = V3(route[i].x, route[i].y, route[i].z);
          const d = prev.distanceTo(next);
          pos = prev.clone().lerp(next, Math.min(1, left / d));
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

  /**
   * 퀘스트로 막힌 칸(원본 격자는 보관): 복원 전 판석 다리 칸, 깨우기 전 닫힌 봉오리 안
   * 다리 틈은 실제로 끊겨 있어 다리 칸만 막으면 건너편 전체에 갈 수 없다
   */
  function applyGate() {
    const g = world.grid;
    const info = SCENE_INFO[world.id];
    if (!g || !(info?.gate || info?.bud)) return;
    if (!gridOriginal) gridOriginal = g.layers.map((L) => L.slice());
    const zones = [];
    if (info.gate && !state.world.bridgeRestored) {
      const a = markerRaw(info.gate.from);
      const b = markerRaw(info.gate.to);
      if (a && b) {
        const dir = b.clone().sub(a).setY(0);
        const len = dir.length();
        dir.normalize();
        zones.push((x, z) => {
          const t = (x - a.x) * dir.x + (z - a.z) * dir.z;
          const side = Math.abs((x - a.x) * -dir.z + (z - a.z) * dir.x);
          return t > -0.1 && t < len + 0.1 && side <= info.gate.halfWidth;
        });
      }
    }
    if (info.bud && !state.world.budAwake) {
      const c = markerRaw(info.bud.at, info.bud.offset);
      const r = info.bud.closedRadius ?? 0;
      if (c && r > 0) zones.push((x, z) => Math.hypot(x - c.x, z - c.z) <= r);
    }
    g.layers.forEach((L, k) => {
      const src = gridOriginal[k];
      for (let j = 0; j < g.h; j++) {
        for (let i = 0; i < g.w; i++) {
          const n = j * g.w + i;
          if (!zones.length || src[n] === -32768) {
            L[n] = src[n];
            continue;
          }
          const p = cellCenter(g, i, j);
          L[n] = zones.some((f) => f(p.x, p.z)) ? -32768 : src[n];
        }
      }
    });
  }

  function computeReach() {
    reach = null;
    if (!world.grid) return;
    const info = SCENE_INFO[world.id];
    const s0 = world.navPoint(info.start) ?? sceneCenter();
    const w0 = nearestWalkable(world.grid, s0.x, s0.z, s0.y, 40);
    if (w0) reach = floodReachable(world.grid, w0);
  }

  const addSpot = (s) => (spots.push(s), s);
  function markSprite() {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), color: '#FFD0A9', transparent: true, depthWrite: false, toneMapped: false }));
    m.scale.setScalar(0.32);
    return m;
  }

  function clearSceneProps() {
    spots = [];
    clickables = [];
    for (const p of props.slots.values()) p.prop?.dispose();
    props.slots.clear();
    props.preview?.dispose();
    props.preview = null;
    props.benchPreview?.dispose();
    props.benchPreview = null;
    props.rings = [];
    props.doors = [];
    props.lifts.clear();
    props.crystals = [];
    props.lanterns.clear();
    props.gate = null;
    props.beacon = null;
    props.bud = null;
    props.glimmers = [];
    props.flows = [];
    props.discoveries.clear();
    props.strange = null;
    props.flower = null;
    props.glyphs = [];
    props.jelly = null;
    props.guidePts = [];
    props.branches = null;
    props.replies = null;
    actors.npcs = [];
    gridOriginal = null;
    view.glimmersFound = new Set();
    view.companion = null;
  }

  /** 장면을 불러와 구성한다. sceneId를 주면 연출용(플레이어 없이) */
  async function buildScene(id, onProgress) {
    await world.load(id, onProgress);
    clearSceneProps();
    const info = SCENE_INFO[id];
    const dyn = world.dynamic;
    if (world.grid && info.walkStep) world.grid.step = info.walkStep;
    applyGate();
    computeReach();

    // 주민
    for (const n of npcsInScene(state, id)) {
      const pos = markerGround(n.spot.at, n.spot.offset, true);
      if (!pos) continue;
      const char = new Character(n.model);
      char.position.copy(pos);
      const c = sceneCenter();
      char.setYaw(Math.atan2(c.x - pos.x, c.z - pos.z), true);
      const mark = markSprite();
      mark.position.y = char.height + 0.45;
      char.object.add(mark);
      dyn.add(char.object);
      char.model.traverse((o) => o.isMesh && clickables.push(o));
      const npc = { ...n, char, mark, homeYaw: char.yaw, home: pos.clone(), resting: !!n.spot.resting, walk: null };
      actors.npcs.push(npc);
      addSpot({ kind: 'npc', id: n.id, name: n.name, pos: npc.home, radius: TALK_RADIUS, lift: char.height + 0.3, npc, live: () => char.position });
    }

    // 출구: 빛기둥 관문(문) / 꽃잎 승강대 + 민트 빛기둥 / 해파리 선착장 + 민트 빛기둥
    for (const ex of info.exits) {
      const pos = markerGround(ex.at);
      if (!pos) continue;
      const c = sceneCenter();
      const yaw = Math.atan2(c.x - pos.x, c.z - pos.z);
      const door = new LightGate({ label: ex.label, yaw, kind: ex.kind === 'door' ? 'door' : 'lift' });
      door.object.position.copy(pos);
      dyn.add(door.object);
      props.doors.push({ door, ex, pos, walkThrough: ex.kind === 'door' });
      if (ex.kind === 'lift') {
        const lift = new PetalLift(await loadLiftTemplate(gltfLoader, `${BASE}props/petal_lift.glb`));
        lift.object.position.copy(pos);
        lift.baseY = pos.y;
        dyn.add(lift.object);
        props.lifts.set(ex.at, lift);
      }
      addSpot({ kind: 'exit', id: ex.at, name: ex.label, pos, radius: 2.6, lift: 2.2, exit: ex });
    }

    // 설치 지점
    for (const sl of info.slots ?? []) {
      const pos = markerGround(sl.at, sl.offset);
      if (!pos) continue;
      const ring = new GroundRing({ color: '#FFD0A9', radius: 0.8 });
      ring.mesh.position.copy(pos).add(V3(0, 0.05, 0));
      dyn.add(ring.mesh);
      const entry = { slot: sl, pos, ring, prop: null, lamp: null };
      if (sl.id === 'lantern') {
        const lamp = new Lantern();
        lamp.object.position.copy(pos).add(V3(0.9, 0, 0.3));
        dyn.add(lamp.object);
        entry.lamp = lamp;
      }
      props.slots.set(sl.id, entry);
      addSpot({ kind: 'slot', id: sl.id, name: sl.label, pos, radius: 2.2, lift: 1.5, slot: sl });
    }

    // 박자 어긋난 등불·복원 뒤 켜질 등불·접힌 다리
    for (const name of [...(info.offbeat ?? []), ...(info.later ?? [])]) {
      const raw = markerRaw(name);
      if (!raw) continue;
      const lamp = new Lantern();
      lamp.object.position.copy(snapToGrid(raw, 3, true));
      dyn.add(lamp.object);
      props.lanterns.set(name, lamp);
    }
    if (info.gate) {
      const pts = info.gate.path.map((n) => markerRaw(n)).filter(Boolean);
      const byPrefix = (p) => [...world.meshByName.entries()].filter(([k]) => k.startsWith(p)).map(([, m]) => m);
      const slabs = byPrefix('Quest_Bridge_Slab');
      const from = markerRaw(info.gate.from ?? '');
      const to = markerRaw(info.gate.to ?? '');
      if (pts.length > 1) {
        const gate = slabs.length && from && to
          ? new SlabBridge(pts, { from, to, slabs, frame: [...byPrefix('Quest_Bridge_Curb'), ...byPrefix('Quest_Bridge_Post')], veins: byPrefix('Quest_Bridge_Vein') })
          : new BridgeGate(pts);
        dyn.add(gate.object);
        props.gate = gate;
        gate.setRestored(state.world.bridgeRestored);
      }
      const lanternSpot = props.slots.get('lantern');
      if (lanternSpot) addSpot({ kind: 'tune', id: 'tune', name: '어긋난 등불', pos: lanternSpot.pos, radius: 3, lift: 2.2 });
    }
    if (info.bud) {
      const pos = markerGround(info.bud.at, info.bud.offset, true);
      if (pos) {
        const byPrefix = (p) => [...world.meshByName.entries()].filter(([k]) => k.startsWith(p)).map(([, m]) => m);
        const petals = byPrefix('Quest_Bud_Petal');
        const bud = petals.length
          ? new BudPod({ petals, glows: byPrefix('Quest_Bud_Glow'), floors: byPrefix('Quest_Bud_Floor'), veins: byPrefix('Quest_BudVein') })
          : new SleepingBud();
        const center = markerRaw(info.bud.at, info.bud.offset);
        bud.object.position.copy(petals.length && center ? V3(center.x, pos.y, center.z) : pos);
        bud.awake = state.world.budAwake;
        if (bud.awake) bud.openness = 1;
        dyn.add(bud.object);
        props.bud = { bud, pos };
        // 닫힌 동안 안쪽 칸이 막혀 있으므로 바깥에서 닿는 거리
        addSpot({ kind: 'bud', id: 'bud', name: '닫힌 빛 봉오리', pos, radius: (info.bud.closedRadius ?? 0) + 1.3, lift: 3.6 });
        info.bud.glimmers.forEach((off, i) => {
          const gp = snapToGrid(pos.clone().add(V3(off[0], 0, off[1])), 3, true);
          const g = new Glimmer('#B9E6D3');
          g.object.position.copy(gp).add(V3(0, 0.6, 0));
          dyn.add(g.object);
          props.glimmers.push({ g, pos: gp, i });
          addSpot({ kind: 'glimmer', id: `glimmer${i}`, name: '반짝이는 빛', pos: gp, radius: 1.8, lift: 1.0, index: i });
        });
      }
    }

    // 작업대
    if (info.workbench) {
      const m = world.navPoint(info.workbench.at);
      const stand = markerGround(info.workbench.at);
      const top = m ? V3(m.x, m.y + 0.2, m.z) : stand;
      const prev = new LightProp({ ...state.draft }, { preview: true });
      prev.object.position.copy(top).add(V3(0, -0.9, 0));
      prev.object.scale.setScalar(0.9);
      dyn.add(prev.object);
      props.benchPreview = prev;
      addSpot({ kind: 'workbench', id: 'workbench', name: info.workbench.label, pos: stand, radius: 2.6, lift: 1.3, top });
    }

    // 항해 나무
    if (info.organ) {
      const pos = markerGround(info.organ.at, [0, 3.2]);
      const tree = world.navPoint(info.organ.at);
      if (pos && tree) {
        addSpot({ kind: 'organ', id: 'organ', name: info.organ.label, pos, radius: 3, lift: 2.4 });
        if (info.organ.beacon) {
          props.beacon = new NavBeacon(info.organ.beacon);
          dyn.add(props.beacon.object);
        }
        const c = sceneCenter();
        const flowPts = [pos.clone().add(V3(0, 1.2, 0)), tree.clone().add(V3(0, 2.5, 0)), tree.clone().add(V3(0, 7, 0)), tree.clone().add(V3(-10, 14, 6)), c.clone().add(V3(-22, 9, 0)), c.clone().add(V3(-28, -4, -4))];
        const flowR = flowPts.map((p, i) => (i >= 3 ? V3(2 * tree.x - p.x, p.y, p.z) : p.clone()));
        const f1 = new LightFlow(flowPts, '#FFD0A9', 18);
        const f2 = new LightFlow(flowR, '#B9E6D3', 18);
        dyn.add(f1.object, f2.object);
        props.flows.push(f1, f2);
        // 단서마다 돋는 빛 가지, 답장에 응답할 먼 빛
        props.tree = tree.clone();
        props.branches = new OrganBranches(tree);
        props.replies = new DistantReplies(tree, 46);
        dyn.add(props.branches.object, props.replies.object);
      }
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

    // 노래하는 결정(선택형)
    if (info.puzzle && info.puzzle.showWhen(state)) {
      const center = markerGround(info.puzzle.at);
      if (center) {
        [-2, 0, 2].forEach((dx, i) => {
          const pos = snapToGrid(center.clone().add(V3(dx * 0.9, 0, -1.6 - Math.abs(dx) * 0.2)));
          const c = new SongCrystal(i, 1.3 + (i === 1 ? 0.4 : 0));
          c.object.position.copy(pos);
          dyn.add(c.object);
          props.crystals.push(c);
          c.meshes.forEach((m) => clickables.push(m));
        });
        addSpot({ kind: 'puzzle', id: 'puzzle', name: info.puzzle.label, pos: center, radius: 3.2, lift: 2.2 });
      }
    }
    buildStoryProps(info, dyn);
    follow.colliders = world.colliders;
    syncProps();
    if (params.has('debug')) drawDebugGrid();
  }

  /** 경로(격자 경유점)를 따라 비율 k(0~1)의 위치 */
  function routePoint(route, k) {
    const pts = route.map((p) => V3(p.x, p.y, p.z));
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const want = lens[lens.length - 1] * k;
    for (let i = 1; i < pts.length; i++) {
      if (lens[i] >= want) return pts[i - 1].clone().lerp(pts[i], (want - lens[i - 1]) / Math.max(1e-4, lens[i] - lens[i - 1]));
    }
    return pts[pts.length - 1].clone();
  }

  /** 두 번째 이야기 공간 요소(기존 지역에 배치만 한다) */
  function buildStoryProps(info, dyn) {
    if (info.trace) {
      props.strange = new StrangeLight();
      dyn.add(props.strange.object);
    }
    if (info.flower) {
      const pos = markerGround(info.flower.at, info.flower.offset);
      if (pos) {
        const flower = new HiddenFlower();
        flower.object.position.copy(pos);
        flower.setOpen(state.story.flowerOpen);
        dyn.add(flower.object);
        props.flower = { flower, pos };
        addSpot({ kind: 'flower', id: 'flower', name: '숨은 꽃', pos, radius: 2.6, lift: 1.7 });
      }
    }
    if (info.iceTraces) {
      const pts = info.iceTraces.offsets.map((o) => markerGround(info.iceTraces.at, o));
      pts.forEach((pos, i) => {
        if (!pos) return;
        const g = new IceGlyph(i);
        g.object.position.copy(pos);
        dyn.add(g.object);
        if (pts[i + 1]) dyn.add(g.linkTo(pos, pts[i + 1]));
        props.glyphs.push({ g, pos, i });
        addSpot({ kind: 'iceTrace', id: `trace${i}`, name: '결정 속 흔적', pos, radius: 2.4, lift: 2.2, index: i });
      });
    }
    if (info.jelly && world.grid) {
      const from = markerGround(info.jelly.from, [0, 0], true);
      const to = markerGround(info.jelly.to, [0, 0], true);
      const route = from && to ? findPath(world.grid, from, to, 400000) : null;
      if (route && route.length > 1) {
        const start = routePoint(route, 0.06);
        const stops = info.jelly.stops.map((k) => snapToGrid(routePoint(route, k), 3, true));
        const jelly = new LittleJelly();
        const step = state.story.guideStep;
        jelly.placeAt(step > 0 ? stops[step - 1] : start);
        dyn.add(jelly.object);
        props.jelly = { jelly, start, stops };
        addSpot({ kind: 'jelly', id: 'jelly', name: '작은 해파리', pos: start, radius: 4, lift: 2.6, live: () => jelly.object.position.clone().setY(jelly.baseY) });
        stops.forEach((pos, i) => {
          const ring = new GroundRing({ color: '#FFE4D2', radius: 0.75 });
          ring.mesh.position.copy(pos).add(V3(0, 0.05, 0));
          const path = new GlowPath(i === 0 ? start : stops[i - 1], pos, '#FFE4D2');
          dyn.add(ring.mesh, path.object);
          props.guidePts.push({ pos, ring, path, i });
          addSpot({ kind: 'guidePt', id: `guide${i}`, name: '빛길 지점', pos, radius: 2.4, lift: 1.3, index: i });
        });
      }
    }
    // 답장을 받은 뒤: 작은 해파리가 전망대 곁 하늘에 머문다
    if (info.jellyStay && state.story.guideStep >= 3) {
      const jelly = new LittleJelly();
      jelly.placeAt(V3(...info.jellyStay));
      jelly.object.scale.setScalar(1.6);
      dyn.add(jelly.object);
      props.jelly = { jelly, start: V3(...info.jellyStay), stops: [], stay: true };
    }
  }

  async function enterScene({ label } = {}) {
    view.mode = 'loading';
    closePanel(true);
    bubble.hide();
    prompt.update(null);
    keys.clear();
    path = null;
    if (actors.player) {
      actors.player.air = null;
      actors.player.shadowLift = 0;
    }
    refresh();
    const id = state.scene;
    const info = SCENE_INFO[id];
    fader.show(label ?? `${info.name}(으)로 가는 중…`);
    try {
      await buildScene(id, (p) => fader.progress(p));
      // 항해 전망대·도착지에서는 다음 항해 연출 에셋을 미리 받아 둔다
      if (id === 'overlook' || isDestination(id)) loadVoyageAssets().catch(() => {});
    } catch (err) {
      console.error(err);
      fader.show(`장면을 불러오지 못했어요. 새로고침하면 안전한 자리에서 다시 시작해요. (${err.message})`);
      return false;
    }
    if (!actors.player) buildPlayer();
    world.dynamic.add(actors.player.object);
    let pose;
    const saved = state.positions[id];
    if (state.arrival) pose = arrivalPose(state.arrival);
    else if (saved) pose = { pos: snapToGrid(V3(saved.x, saved.y, saved.z)), yaw: saved.yaw };
    else pose = arrivalPose(info.start);
    actors.player.position.copy(pose.pos);
    actors.player.groundY = pose.pos.y;
    actors.player.setYaw(pose.yaw, true);
    follow.snap(actors.player.position, pose.yaw + Math.PI);
    renderer.compile(scene3, camera);
    view.puzzle = createPuzzle();
    view.mode = 'play';
    view.arrivedAt = performance.now();
    commitPosition();
    fader.hide();
    refresh();
    setTimeout(maybeStartTrace, 1500);
    return true;
  }

  /** 게임 상태 → 공간 요소 */
  function syncProps() {
    if (!world.root) return;
    for (const [id, entry] of props.slots) {
      const visible = entry.slot.showWhen(state);
      entry.ring.mesh.visible = visible;
      const light = lightAt(state, id);
      if (light) {
        if (!entry.prop) {
          entry.prop = new LightProp(light);
          entry.prop.object.position.copy(entry.pos);
          world.dynamic.add(entry.prop.object);
        } else if (JSON.stringify(entry.prop.light) !== JSON.stringify(light)) entry.prop.set(light);
      } else if (entry.prop) {
        entry.prop.dispose();
        entry.prop = null;
      }
      const av = slotAvailability(state, id);
      entry.ring.strength = av.canPlace ? 1 : light ? 0.25 : 0.15;
      entry.ring.setColor(av.canPlace ? '#FFD0A9' : '#C9B7EE');
      if (entry.lamp) entry.lamp.state = light ? 'on' : 'off';
      const spot = spots.find((s) => s.kind === 'slot' && s.id === id);
      if (spot) spot.disabled = !visible;
    }
    const pid = view.panel?.kind === 'slot' ? view.panel.id : null;
    const pe = pid ? props.slots.get(pid) : null;
    const carried = carriedLights(state).filter((l) => l.origin === 'crafted');
    if (pe && !lightAt(state, pid) && slotAvailability(state, pid).canPlace && carried.length) {
      const L = carried[carried.length - 1];
      if (!props.preview) {
        props.preview = new LightProp(L, { preview: true });
        world.dynamic.add(props.preview.object);
      } else props.preview.set(L);
      props.preview.object.position.copy(pe.pos);
    } else if (props.preview) {
      props.preview.dispose();
      props.preview = null;
    }
    props.benchPreview?.set({ ...state.draft });
    if (props.benchPreview) props.benchPreview.object.visible = state.world.benchOpened;
    // 등불·다리
    const info = SCENE_INFO[world.id];
    const W = state.world;
    for (const name of info?.offbeat ?? []) {
      const l = props.lanterns.get(name);
      if (l && !(view.panel?.kind === 'tune')) l.state = W.tuned ? 'on' : lightAt(state, 'lantern') ? 'offbeat' : 'off';
    }
    for (const name of info?.later ?? []) {
      const l = props.lanterns.get(name);
      if (l) l.state = W.bridgeRestored ? 'on' : 'off';
    }
    if (props.gate && !cinematic) props.gate.setRestored(W.bridgeRestored);
    const tuneSpot = spots.find((s) => s.kind === 'tune');
    if (tuneSpot) tuneSpot.disabled = !(state.quests.q02 === 'active' && lightAt(state, 'lantern') && !W.tuned);
    // 교환 정원
    if (props.bud) props.bud.bud.awake = W.budAwake;
    const budSpot = spots.find((s) => s.kind === 'bud');
    if (budSpot) budSpot.disabled = W.budAwake || state.quests.q03 !== 'active' || view.glimmersFound.size < props.glimmers.length;
    for (const gl of props.glimmers) {
      gl.g.found = W.budAwake || view.glimmersFound.has(gl.i);
      const s = spots.find((x) => x.id === `glimmer${gl.i}`);
      if (s) s.disabled = gl.g.found || state.quests.q03 !== 'active';
      gl.g.object.visible = state.quests.q03 === 'active' && !gl.g.found;
    }
    for (const [id, d] of props.discoveries) {
      const found = isDiscovered(state, id);
      d.group.visible = !found;
      const spot = spots.find((s) => s.kind === 'discovery' && s.id === id);
      if (spot) spot.disabled = found;
    }
    for (const { door, ex } of props.doors) door.locked = !!ex.lockedUntil?.(state);
    syncStoryProps();
  }

  function syncStoryProps() {
    const T = state.story;
    const Q = state.quests;
    const spot = (kind, id) => spots.find((s) => s.kind === kind && s.id === id);
    if (props.flower) {
      if (T.flowerOpen) props.flower.flower.setOpen(true);
      const s = spot('flower', 'flower');
      if (s) s.disabled = !(Q.flower === 'active');
    }
    for (const { g, i } of props.glyphs) {
      g.setRevealed(T.iceTraces.includes(i));
      const s = spot('iceTrace', `trace${i}`);
      // 다음에 비출 흔적 하나만, 셋이 이어진 뒤에는 마지막 흔적에서 방향을 읽는다
      const readable = i === 2 && T.iceTraces.length >= 3 && !T.clues.includes('ice');
      if (s) s.disabled = Q.icepath !== 'active' || !(i === T.iceTraces.length || readable);
    }
    if (props.jelly && !props.jelly.stay) {
      const s = spot('jelly', 'jelly');
      if (s) s.disabled = T.jellyMet || Q.guide !== 'active';
      props.jelly.jelly.object.visible = Q.guide === 'active' || T.guideStep >= 3;
      for (const gp of props.guidePts) {
        const active = Q.guide === 'active' && T.jellyMet && gp.i === T.guideStep;
        gp.ring.mesh.visible = (Q.guide === 'active' && T.jellyMet) || gp.i < T.guideStep;
        gp.ring.strength = active ? 1 : 0.25;
        gp.ring.setColor(active ? '#FFD0A9' : '#C9B7EE');
        if (gp.i < T.guideStep && gp.path.target === 0) gp.path.light(true, false);
        const gs = spot('guidePt', `guide${gp.i}`);
        if (gs) gs.disabled = !active;
      }
    }
    props.branches?.set(T.clues.length, T.cluesWoven);
    if (props.replies && T.replySent && props.replies.t < 0) props.replies.settle();
  }

  // ------------------------------------------------------------------ 안내
  function currentHint() {
    if (!settings.hints || view.mode !== 'play') return null;
    const S = state;
    const W = S.world;
    const t = S.tutorial.done;
    const sc = S.scene;
    if (S.quests.q01 === 'active') {
      if (sc !== 'workshop') return '빛 제작실로 돌아가 **둥근 작업대**에서 첫 빛을 완성해요';
      if (!t.includes('move')) return '**WASD·방향키**나 **바닥 클릭**으로 걸어 봐요';
      if (!t.includes('look')) return '**드래그**로 둘러봐요 · 창밖에 멈춘 해파리 산책로가 보여요';
      if (!W.benchOpened) return '둥근 작업대에 다가가 **E**로 잠든 빛을 깨워요';
      return view.panel?.kind === 'craft' ? '**색**을 고르고 **첫 빛 완성하기**를 눌러요' : '작업대에서 **E**를 눌러 첫 빛을 완성해요';
    }
    if (S.quests.q02 === 'available') return sc === 'workshop' ? '**빛기둥 문**에 걸어 들어가거나 **E**를 눌러 **캡슐 마을**로 나가요' : sc === 'neighborhood' ? '촉수 다리 문 앞의 **살구**와 이야기해요' : null;
    if (S.quests.q02 === 'active') {
      if (sc === 'neighborhood') return '**빛기둥 문**에 걸어 들어가거나 **E**를 눌러 **촉수 다리**로 가요';
      if (sc !== 'walkway') return '**빛기둥 문**으로 캡슐 마을에 나가 **촉수 다리**로 가요';
      if (!S.slots.lantern) return '첫 등불에 다가가 **E**로 내 빛을 놓아요';
      if (!W.tuned) return view.panel?.kind === 'tune' ? '등불이 **가장 밝을 때 E**를 눌러요' : '등불 앞에서 **E**로 어긋난 박자를 맞춰요';
      return null;
    }
    if (S.quests.q02 === 'completed') return '다리를 건너 **살구**에게 알려요';
    if (S.quests.q03 === 'available') return sc === 'walkway' ? '다리 건너 교환 정원의 **리본**과 이야기해요' : '촉수 다리를 건너 **리본**을 만나요';
    if (S.quests.q03 === 'active') {
      if (!W.budAwake) return view.glimmersFound.size < props.glimmers.length ? `봉오리 주변 **반짝이는 빛**을 클릭하거나 다가가 **E**로 살펴요 (${view.glimmersFound.size} / 3)` : '닫힌 봉오리에 다가가 **E**로 깨워요';
      if (!W.traded) return '**리본**에게 말해 빛을 나눠요';
      if (!W.woven) return '**리본**에게 말해 두 빛을 엮어요';
    }
    if (S.quests.q03 === 'completed') return '**리본**에게 엮은 빛을 보여 줘요';
    if (S.quests.q04 === 'available') return sc === 'overlook' ? '항해사 **보라**와 이야기해요' : '**꽃잎 승강대**를 타고 항해 전망대로 올라가요';
    if (S.quests.q04 === 'active' && !isDestination(sc)) {
      if (!W.organFed) return '**항해 나무** 앞에서 **E**로 엮은 빛을 보내요';
      if (!W.route) return '항해 나무에서 **항로**를 골라요';
      return '항해 나무에서 **출항**해요';
    }
    if (W.chapterDone && S.story.traceSeen) {
      const h = storyHint();
      if (h !== undefined) return h;
    }
    if (W.chapterDone && isDestination(sc)) {
      const d = (SCENE_INFO[sc].discoveries ?? []).find((x) => !isDiscovered(S, x.id));
      return d ? `반짝이는 **${d.label}**의 빛을 찾아봐요` : '선착장에서 **해파리로 돌아가요**';
    }
    return null;
  }

  /** 두 번째 이야기 안내: 지금 해야 할 행동 + 이유 한 줄 */
  function storyHint() {
    const S = state;
    const T = S.story;
    const Q = S.quests;
    const sc = S.scene;
    const p = view.panel;
    if (p?.kind === 'craft' && p.back) return '**밝기·색·형태**를 고르고 **다시 빚기**(또는 빛 빚기) 뒤 창을 닫아 다시 비춰요';
    if (p?.kind === 'use') {
      if (p.target === 'flower') return T.flowerOpen ? '열린 꽃 안의 **낯선 빛**을 살펴요' : '빛을 비춰 **꽃의 반응**을 봐요 · 밝으면 움츠리고 은은하면 열려요';
      if (p.target === 'iceTrace') return '**차가운 빛**을 비추면 결정 속 문양이 드러나요';
      if (p.target === 'guidePt') return `작은 해파리가 따라오도록 **밝기 ${GUIDE_SOFT} 이하** 빛으로 빛길을 놓아요`;
    }
    if (Q.trace !== 'claimed') {
      if (sc === 'solar' && !T.clues.includes('solar')) {
        if (Q.flower === 'available') return '선착장의 **살구**와 이야기해요 · 숲 끝 꽃이 이상하대요';
        if (Q.flower === 'active') return T.flowerOpen ? '열린 꽃에 다가가 **E**로 흔적을 살펴요' : '태양씨앗 숲 끝 **숨은 꽃**에 다가가 **E**로 빛을 비춰요';
      }
      if (sc === 'ice' && !T.clues.includes('ice')) {
        if (Q.icepath === 'available') return '선착장의 **리본**과 이야기해요 · 결정 안에 뭔가 있대요';
        if (Q.icepath === 'active') {
          if (!isDiscovered(S, 'iceAurora')) return '**오로라 결정**에서 이곳의 차가운 빛을 먼저 얻어요';
          return T.iceTraces.length >= 3 ? '마지막 흔적 앞에서 **E**로 방향을 읽어요' : `빛나는 **결정 속 흔적**에 차가운 빛을 비춰요 (${T.iceTraces.length} / 3)`;
        }
      }
      if (Q.flower === 'completed') return '**살구**에게 발견한 흔적을 알려요';
      if (Q.icepath === 'completed') return '**리본**에게 발견한 흔적을 알려요';
      if (T.clues.length >= 1 && T.shown < 1) return sc === 'overlook' ? '**보라**에게 발견한 빛을 보여 줘요' : '항해 전망대의 **보라**에게 발견한 빛을 보여 줘요';
      if (T.clues.length >= 2) return sc === 'overlook' ? '**항해 나무**에서 **E**로 두 흔적을 엮어요' : '항해 전망대의 **항해 나무**에서 두 흔적을 엮어요';
      const other = T.clues.includes('solar') ? '얼음 성운' : T.clues.includes('ice') ? '태양 정원' : '태양 정원이나 얼음 성운';
      return isDestination(sc) ? `선착장에서 해파리로 돌아가 **${other}**으로 항해해요` : `항해 전망대의 **항해 나무**에서 **${other}** 항로를 골라요`;
    }
    if (Q.guide === 'active') {
      if (sc !== 'twilight') return '**항해 나무**에서 **황혼 합류지**로 항해해요';
      if (!T.jellyMet) return '희미한 빛 사이의 **작은 해파리**에게 다가가 살펴요';
      return `빛나는 **빛길 지점**에 은은한 빛을 놓아 작은 해파리를 불러요 (${T.guideStep} / 3)`;
    }
    if (Q.reply === 'available') return '항해 전망대의 **보라**와 이야기해요 · 작은 해파리가 품은 빛의 비밀';
    if (Q.reply === 'active') {
      if (T.replySent) return '**보라**에게 답장이 닿았는지 들어요';
      const here = { replyRest: 'neighborhood', replyPath: 'walkway', replySignal: 'overlook' };
      const missing = REPLY_SPOTS.filter((r) => !r.check(lightAt(S, r.slot)));
      const miss = missing.find((r) => here[r.slot] === sc) ?? missing[0];
      if (miss) return `**${miss.label}**을 놓아요 (${miss.need}) · 색과 모양은 자유예요`;
      return sc === 'overlook' ? '**항해 나무**에서 **E**로 답장을 보내요' : '항해 전망대의 **항해 나무**에서 답장을 보내요';
    }
    if (Q.reply === 'completed') return '**보라**에게 답장이 닿았는지 들어요';
    if (Q.reply === 'claimed') return null;
    return undefined;
  }

  /** 안내 빛이 날아갈 현재 목표 지점 */
  function hintTarget() {
    const S = state;
    const W = S.world;
    const find = (kind, id) => spots.find((s) => s.kind === kind && (id === undefined || s.id === id) && !s.disabled);
    // 두 번째 이야기는 길 안내 목표를 그대로 쓴다
    if (W.chapterDone && S.story.traceSeen) {
      const g = guideTarget(S);
      return g ? find(g.kind, g.id) ?? null : null;
    }
    if (S.quests.q01 === 'active') return S.scene === 'workshop' ? find('workbench') : find('exit', 'ENTRY_정원_교환광장');
    if (S.quests.q02 === 'available') return find('npc', 'salgu') ?? find('exit', S.scene === 'workshop' ? 'ENTRY_정원_교환광장' : 'EXIT_촉수산책로');
    if (S.quests.q02 === 'active') return S.scene === 'walkway' ? (S.slots.lantern ? find('tune') : find('slot', 'lantern')) : find('exit', 'EXIT_촉수산책로') ?? find('exit', 'ENTRY_정원_교환광장');
    if (S.quests.q02 === 'completed') return find('npc', 'salgu');
    if (S.quests.q03 === 'available' || (S.quests.q03 === 'active' && W.budAwake) || S.quests.q03 === 'completed') return find('npc', 'ribbon');
    if (S.quests.q03 === 'active') return props.glimmers.find((g) => !view.glimmersFound.has(g.i)) ? find('glimmer', `glimmer${props.glimmers.find((g) => !view.glimmersFound.has(g.i)).i}`) : find('bud');
    if (S.quests.q04 === 'available') return find('npc', 'bora') ?? find('exit', 'EXIT_전망대_항해정원');
    if (S.quests.q04 === 'active') return find('organ');
    if (W.chapterDone && isDestination(S.scene)) return find('discovery') ?? find('exit');
    return null;
  }

  // ------------------------------------------------------------------ 길 안내(목표 핀·방향 화살표·바닥 빛 길)
  function hideGuide() {
    objMarker.set(null);
    trail.setRoute(null);
    pointer2d.update(null);
    guideState.key = '';
  }

  function updateGuide() {
    if (!settings.guide || !actors.player) return hideGuide();
    const target = guideTarget(state);
    let spot = target && spots.find((s) => s.kind === target.kind && s.id === target.id && !s.disabled);
    // 닫힌 봉오리처럼 목표가 아직 잠겨 있으면(반짝임을 먼저 찾아야 할 때) 지금 해야 할 대상(반짝임)을 가리킨다
    if (target?.final && !spot) {
      const h = hintTarget();
      if (h) {
        spot = h;
        target.label = h.name;
      }
    }
    // 목표 대상 패널을 열고 있으면 안내는 잠시 숨긴다
    const busy =
      view.panel &&
      ((view.panel.kind === 'craft' && (target?.kind === 'workbench' || !!view.panel.back)) ||
        view.panel.kind === 'tune' ||
        view.panel.kind === 'use' ||
        (view.panel.kind === 'slot' && target?.id === view.panel.id));
    if (!spot || busy) return hideGuide();
    const pos = spot.live ? spot.live() : spot.pos;
    const p = actors.player.position;
    const distance = Math.hypot(pos.x - p.x, pos.z - p.z);
    objMarker.set(pos, spot.lift ?? 2);
    // 바닥 빛 길: 목표가 바뀌거나 0.6초마다 다시 계산(가까우면 생략)
    const key = `${state.scene}:${target.kind}:${target.id}`;
    const now = performance.now();
    if (distance < 3) trail.setRoute(null);
    else if (key !== guideState.key || now - guideState.routeAt > 600) {
      guideState.key = key;
      guideState.routeAt = now;
      if (world.grid) {
        const from = { x: p.x, y: actors.player.groundY ?? p.y, z: p.z };
        let route = findPath(world.grid, from, snapToGrid(pos), 200000);
        if (!route) {
          const near = nearestWalkable(world.grid, from.x, from.z, from.y, 4);
          if (near) route = findPath(world.grid, near, snapToGrid(pos), 200000);
        }
        trail.setRoute(route ? [V3(p.x, from.y, p.z), ...route.slice(1).map((r) => V3(r.x, r.y, r.z))] : null);
      }
    }
    // 화면 표시: 목표 머리 위 이름·거리, 화면 밖이면 가장자리 화살표
    _v.set(pos.x, pos.y + (spot.lift ?? 2) + 0.6, pos.z).project(camera);
    const behind = _v.z > 1;
    const label = target.final ? target.label : `${target.label} · ${target.towards?.label ?? ''}`.replace(/ · $/, '');
    pointer2d.update({ x: ((_v.x + 1) / 2) * stage.W, y: ((1 - _v.y) / 2) * stage.H, behind, W: stage.W, H: stage.H, label, distance });
  }

  function markLook(amount) {
    view.lookYaw += Math.abs(amount);
    if (view.lookYaw > 0.8) dispatchTutorial('look');
  }

  // ------------------------------------------------------------------ 상호작용
  function nearestTarget() {
    const p = actors.player.position;
    let best = null;
    let bestD = Infinity;
    // 지금 목표(안내 대상)가 가까우면 E는 그쪽이 먼저. 따라오는 동행 주민이 문 앞을 가로채지 않게
    const goal = hintTarget();
    for (const s of spots) {
      if (s.disabled) continue;
      const sp = s.live ? s.live() : s.pos;
      const d = Math.hypot(sp.x - p.x, sp.z - p.z);
      if (d > s.radius || Math.abs(sp.y - p.y) > 2.2) continue;
      const companion = s.kind === 'npc' && view.companion === s.id;
      const score = d - (s.kind === 'npc' && !companion ? 0.6 : 0) + (companion ? 2 : 0) - (s.kind === 'tune' ? 0.3 : 0) - (s === goal ? 1.5 : 0);
      if (score < bestD) {
        bestD = score;
        best = s;
      }
    }
    if (!best) return null;
    let verb = '살펴보기';
    let locked = false;
    const W = state.world;
    if (best.kind === 'npc') verb = '이야기하기';
    if (best.kind === 'slot') {
      if (best.id === 'lantern' && W.tuned) return null;
      verb = lightAt(state, best.id) ? '빛 살펴보기' : '빛 놓기';
    }
    if (best.kind === 'tune') verb = '박자 맞추기';
    if (best.kind === 'workbench') verb = state.world.benchOpened ? '빛 빚기' : '잠든 빛 깨우기';
    if (best.kind === 'discovery') verb = '빛의 흔적 살피기';
    if (best.kind === 'glimmer') verb = '반짝임 살피기';
    if (best.kind === 'bud') verb = '봉오리 깨우기';
    if (best.kind === 'puzzle') verb = '귀 기울이기';
    const T = state.story;
    if (best.kind === 'flower') verb = T.flowerOpen && !T.clues.includes('solar') ? '꽃 속 흔적 살피기' : '빛 비추기';
    if (best.kind === 'iceTrace') verb = T.iceTraces.length >= 3 ? '흔적의 방향 읽기' : '빛 비추기';
    if (best.kind === 'guidePt') verb = '빛길 놓기';
    if (best.kind === 'jelly') verb = '가만히 살펴보기';
    if (best.kind === 'organ' && W.chapterDone && T.clues.length >= 2 && !T.cluesWoven) verb = '두 흔적 엮기';
    else if (best.kind === 'organ' && state.quests.reply === 'active' && !T.replySent) verb = replyReady(state) ? '답장 보내기' : '답장 준비 살피기';
    else if (best.kind === 'organ') {
      const Q = state.quests.q04;
      if (Q === 'active' && !W.organFed) verb = '엮은 빛 보내기';
      else if (W.organFed && (!W.route || W.chapterDone)) verb = '항로 고르기';
      else if (W.organFed && W.route) verb = '출항하기';
      else verb = '살펴보기';
    }
    if (best.kind === 'exit') {
      const why = best.exit.lockedUntil?.(state);
      locked = !!why;
      verb = locked ? '닫혀 있어요' : best.exit.kind === 'dock' ? '해파리 타기' : best.exit.kind === 'lift' ? '승강대 타기' : '이동하기';
    }
    const sp = best.live ? best.live() : best.pos;
    return { ...best, verb, locked, anchor: project(sp, best.lift) };
  }

  function interactWith(t) {
    if (view.mode !== 'play') return;
    path = null;
    const player = actors.player;
    const tp = t.live ? t.live() : t.pos;
    player.faceTowards(tp.x, tp.z);
    const W = state.world;
    switch (t.kind) {
      case 'npc':
        talkTo(t.id);
        break;
      case 'slot':
        view.panel = { kind: 'slot', id: t.id };
        syncProps();
        refresh();
        slotPanel.el.querySelector('.btn-primary:not([disabled]):not([hidden]), .btn:not([disabled]):not([hidden])')?.focus({ preventScroll: true });
        break;
      case 'workbench':
        if (!W.benchOpened) {
          dispatch({ type: 'openBench' });
          sparkles.burst(t.top.clone(), 18, settings.reducedMotion);
          chime(1046.5, 0.7, 0.08);
        }
        view.panel = { kind: 'craft', id: 'workbench' };
        refresh();
        craftPanel.el.querySelector('.chip.is-selected')?.focus({ preventScroll: true });
        break;
      case 'tune':
        openTuning();
        break;
      case 'glimmer':
        view.glimmersFound.add(t.index);
        sparkles.burst(tp.clone().add(V3(0, 0.6, 0)), 12, settings.reducedMotion);
        chime(659.25 + t.index * 98, 0.5, 0.09);
        view.lastProgress = performance.now();
        syncProps();
        refresh();
        if (view.glimmersFound.size === props.glimmers.length) toast.show('세 반짝임을 모두 찾았어요. 봉오리가 빛에 반응해요. 이제 봉오리를 깨워요.');
        break;
      case 'bud':
        if (dispatch({ type: 'wakeBud' })) {
          // 꽃잎이 열리면 봉오리 안으로 들어갈 수 있다
          applyGate();
          computeReach();
          sparkles.burst(tp.clone().add(V3(0, 1, 0)), 30, settings.reducedMotion);
          chime(783.99, 0.9, 0.12);
          setTimeout(() => talkTo('ribbon'), 1400);
        }
        break;
      case 'organ':
        useOrgan();
        break;
      case 'flower':
        if (state.story.flowerOpen && !state.story.clues.includes('solar')) dispatch({ type: 'readFlowerClue' });
        else openUse(t);
        break;
      case 'iceTrace':
        if (state.story.iceTraces.length >= 3 && !state.story.clues.includes('ice')) dispatch({ type: 'readIceClue' });
        else openUse(t);
        break;
      case 'guidePt':
        openUse(t);
        break;
      case 'jelly':
        meetJelly();
        break;
      case 'discovery':
        if (dispatch({ type: 'discover', id: t.id })) {
          sparkles.burst(tp.clone().add(V3(0, 0.8, 0)), 30, settings.reducedMotion);
          chime(783.99, 0.6, 0.1);
        }
        break;
      case 'puzzle':
        view.panel = { kind: 'puzzle', id: 'puzzle' };
        refresh();
        puzzlePanel.el.querySelector('.btn-primary:not([disabled])')?.focus({ preventScroll: true });
        break;
      case 'exit': {
        const ex = t.exit;
        const why = ex.lockedUntil?.(state);
        if (why) toast.show(why);
        else if (ex.kind === 'dock') requestDepart();
        else if (ex.kind === 'lift') rideLift(ex);
        else passDoor(ex);
        break;
      }
      default:
    }
  }

  // ------------------------------------------------------------------ 대화
  function talkTo(npcId) {
    const npc = actors.npcs.find((n) => n.id === npcId);
    if (!npc || !['play', 'dialogue'].includes(view.mode)) return;
    closePanel(true);
    path = null;
    npc.char.faceTowards(actors.player.position.x, actors.player.position.z);
    npc.char.greet();
    dispatch({ type: 'meet', npc: npcId });
    const lines = dialogueFor(state, npcId, { name: npc.name });
    view.mode = 'dialogue';
    dialogue.play({
      steps: lines.map((l) => ({
        speaker: l.speaker,
        portrait: portraitFor(npcId),
        text: l.text,
        choices: l.choices?.map((c) => ({ label: c.label, primary: c.primary, onPick: () => setTimeout(() => runAct(c.act, npc), 0) })),
      })),
    });
    refresh();
  }

  function say(npc, text, then) {
    view.mode = 'dialogue';
    dialogue.play({ steps: [{ speaker: npc.name, portrait: portraitFor(npc.id), text }], onClose: then });
    refresh();
  }

  function runAct(act, npc) {
    if (!act || act === 'close') return;
    const [verb, arg] = act.split(':');
    if (verb === 'q02') {
      dispatch({ type: 'acceptQuest', id: 'q02' });
      say(npc, BRANCH_LINES[act], () => {
        if (arg === 'guide' || arg === 'together') {
          // 주민이 문제 지점(다리 문)까지 먼저 걸어가 안내한다
          const exitSpot = spots.find((s) => s.kind === 'exit' && s.id === 'EXIT_촉수산책로');
          if (exitSpot) npcWalk(npc, exitSpot.pos, () => (npc.char.object.visible = false));
          if (arg === 'together') view.companion = npc.id;
        }
        const exitSpot = spots.find((s) => s.kind === 'exit' && s.id === 'EXIT_촉수산책로');
        if (exitSpot && settings.hints) wisp.fly(actors.player.position, exitSpot.pos);
      });
      return;
    }
    // 두 번째 이야기: 함께 가 보기 / 혼자 해 보기 — 선택에 따라 주민이 실제로 움직인다
    if (verb === 'flower' || verb === 'icepath') {
      if (!dispatch({ type: 'acceptQuest', id: verb })) return;
      const target = verb === 'flower' ? spots.find((s) => s.kind === 'flower') : spots.find((s) => s.kind === 'iceTrace' && s.index === 0);
      say(npc, BRANCH_LINES[act], () => {
        if (!target) return;
        if (arg === 'together') npcWalk(npc, snapToGrid(target.pos.clone().add(V3(1.4, 0, 1.2))), () => npc.char.faceTowards(target.pos.x, target.pos.z));
        if (settings.hints) wisp.fly(actors.player.position, target.pos);
      });
      return;
    }
    if (verb === 'showClues') {
      if (dispatch({ type: 'showClues' })) {
        const two = state.story.clues.length >= 2;
        say(npc, two ? '두 흔적이 서로 이어져요…! 항해 나무에서 함께 엮어 봐요. 방향이 보일 거예요.' : '여기까진 보이는데, 그다음이 흐리네요. 다른 곳에 남은 빛도 찾아오면 이어 볼 수 있겠어요.', () => {
          if (!two) return;
          const organ = spots.find((s) => s.kind === 'organ');
          if (organ && settings.hints) wisp.fly(actors.player.position, organ.pos);
        });
      }
      return;
    }
    if (verb === 'goto') {
      const organ = spots.find((s) => s.kind === 'organ');
      if (organ) {
        if (settings.hints) wisp.fly(actors.player.position, organ.pos);
        toast.show('항해 나무 앞에서 E를 눌러요.');
      } else toast.show('항해 전망대의 항해 나무로 가요.');
      return;
    }
    if (verb === 'accept') {
      dispatch({ type: 'acceptQuest', id: arg });
      if (arg === 'q04') toast.show('항해 나무 앞에 서서 엮은 빛을 보내요.');
      return;
    }
    if (verb === 'claim') {
      if (dispatch({ type: 'claimReward', id: arg })) {
        sparkles.burst(npc.char.position.clone().add(V3(0, 1.3, 0)), 20, settings.reducedMotion);
        if (arg === 'q02') setTimeout(() => toast.show('다리 건너 교환 정원에서 살구의 친구 리본이 기다려요.', 4500), 1500);
      }
      return;
    }
    if (verb === 'ribbon') {
      say(npc, BRANCH_LINES[act], () => talkTo('ribbon'));
      return;
    }
    if (verb === 'tune') return openTuning();
    if (verb === 'trade') {
      const mine = state.lights.find((l) => l.origin === 'crafted');
      if (!mine) return toast.show('내 빛이 있어야 나눌 수 있어요.');
      exchangeMode = 'trade';
      view.mode = 'panel-modal';
      exchange.showTrade(mine);
      refresh();
      return;
    }
    if (verb === 'weave') {
      const mine = state.lights.find((l) => l.origin === 'crafted');
      if (!mine) return;
      exchangeMode = 'weave';
      view.mode = 'panel-modal';
      exchange.showWeave(mine);
      refresh();
      return;
    }
    if (verb === 'route') return openRoutes();
    if (verb === 'depart') return startVoyage();
    if (verb === 'companion') {
      if (dispatch({ type: 'walkTogether', npc: arg })) {
        view.companion = arg;
        toast.show(`${npc.name}와 함께 걸어요. 다른 곳으로 이동하면 제자리로 돌아가요.`);
      }
      return;
    }
    if (verb === 'showLight') {
      const l = carriedLights(state)[0] ?? lightAt(state, 'lantern');
      say(npc, l ? `와, ${lightName(l)}! 네 빛은 볼 때마다 조금씩 다른 박자로 숨 쉬는 것 같아.` : '다음에 새로 빚은 빛을 보여 줘!');
    }
  }

  function npcWalk(npc, goal, done) {
    if (!world.grid) return;
    const from = { x: npc.char.position.x, y: npc.char.position.y, z: npc.char.position.z };
    const route = findPath(world.grid, from, goal, 400000);
    if (!route) return done?.();
    npc.walk = { pts: route.slice(1).map((p) => V3(p.x, p.y, p.z)), done };
  }

  // ------------------------------------------------------------------ 등불 조율과 다리 복원
  function openTuning() {
    if (!(state.quests.q02 === 'active' && lightAt(state, 'lantern') && !state.world.tuned)) return;
    view.tuning = tuneStart(createTuning(SCENE_INFO.walkway.offbeat.length), time);
    view.panel = { kind: 'tune', id: 'tune' };
    const first = props.lanterns.get(SCENE_INFO.walkway.offbeat[0]);
    if (first) follow.autoYaw = Math.atan2(actors.player.position.x - first.object.position.x, actors.player.position.z - first.object.position.z);
    refresh();
    tuningPanel.el.querySelector('.tune-hit')?.focus({ preventScroll: true });
  }

  function finishTuning(assisted) {
    view.panel = null;
    view.tuning = null;
    dispatch({ type: 'tuned', assisted });
    dispatchTutorial('tune');
    playBridgeRestoration();
  }

  function playBridgeRestoration() {
    const gate = props.gate;
    if (!gate) {
      dispatch({ type: 'restoreBridge' });
      return;
    }
    view.mode = 'cinematic';
    closePanel(true);
    refresh();
    const dur = settings.reducedMotion ? 1.2 : 3.8;
    let t = 0;
    const lamps = [...SCENE_INFO.walkway.offbeat, ...SCENE_INFO.walkway.later].map((n) => props.lanterns.get(n)).filter(Boolean);
    const salgu = actors.npcs.find((n) => n.id === 'salgu');
    const look = gate.center ?? gate.pointAt(0.35);
    follow.autoYaw = Math.atan2(actors.player.position.x - look.x, actors.player.position.z - look.z);
    hint.set(null);
    cinematic = {
      update(dt) {
        t += dt;
        gate.progress = Math.min(1, t / dur);
        gate.apply(time);
        lamps.forEach((l, i) => {
          if (gate.progress > (i + 1) / (lamps.length + 1) && l.state !== 'on') {
            l.state = 'on';
            l.flash = 1;
            chime(523.25 + i * 90, 0.6, 0.08);
          }
        });
        if (t >= dur) this.finish();
      },
      finish() {
        cinematic = null;
        gate.progress = 1;
        gate.apply(time);
        dispatch({ type: 'restoreBridge' });
        applyGate();
        computeReach();
        view.mode = 'play';
        refresh();
        banner.show('길이 깨어났어요', '흩어진 판석 다리가 이어졌어요', '살구가 먼저 건너가 기다려요. 직접 걸어서 건너 보세요.', 4800);
        if (salgu) {
          const ahead = snapToGrid(gate.pointAt(0.3));
          npcWalk(salgu, ahead, () => {
            salgu.home = salgu.char.position.clone();
            salgu.homeYaw = Math.atan2(actors.player.position.x - salgu.home.x, actors.player.position.z - salgu.home.z);
          });
        }
      },
      skip() {
        this.finish();
      },
    };
  }

  function playTradeAnimation() {
    const ribbon = actors.npcs.find((n) => n.id === 'ribbon');
    const mine = state.lights.find((l) => l.origin === 'crafted');
    if (!ribbon || !mine) return;
    const a = new LightProp({ ...mine, brightness: 90 }, { preview: true });
    const b = new LightProp({ form: 'orb', color: 'mint', motion: 'float', brightness: 90 }, { preview: true });
    a.object.scale.setScalar(0.6);
    b.object.scale.setScalar(0.6);
    world.dynamic.add(a.object, b.object);
    const pa = actors.player.position.clone().add(V3(0, 0.2, 0));
    const pb = ribbon.char.position.clone().add(V3(0, 0.2, 0));
    let t = 0;
    const dur = settings.reducedMotion ? 0.6 : 1.8;
    view.mode = 'cinematic';
    refresh();
    ribbon.char.greet();
    actors.player.greet();
    cinematic = {
      update(dt) {
        t += dt;
        const k = Math.min(1, t / dur);
        const e = k * k * (3 - 2 * k);
        a.object.position.lerpVectors(pa, pb, e).add(V3(0, Math.sin(e * Math.PI) * 0.8, 0));
        b.object.position.lerpVectors(pb, pa, e).add(V3(0, Math.sin(e * Math.PI) * 0.8, 0));
        a.update(time);
        b.update(time);
        if (k >= 1) this.finish();
      },
      finish() {
        cinematic = null;
        a.dispose();
        b.dispose();
        sparkles.burst(pa.clone().add(V3(0, 1, 0)), 16, settings.reducedMotion);
        view.mode = 'play';
        refresh();
        talkTo('ribbon');
      },
      skip() {
        this.finish();
      },
    };
  }

  // ------------------------------------------------------------------ 항해 나무·항로·항해
  function useOrgan() {
    const W = state.world;
    const T = state.story;
    if (W.chapterDone && T.clues.length >= 2 && !T.cluesWoven) return playWeaveClues();
    if (state.quests.reply === 'active' && !T.replySent) {
      if (replyReady(state)) return playReply();
      const miss = REPLY_SPOTS.filter((r) => !r.check(lightAt(state, r.slot)));
      return toast.show(`답장 자리가 아직 비었어요: ${miss.map((r) => `${r.label}(${r.need})`).join(', ')}`, 5000);
    }
    if (state.quests.q04 === 'active' && !W.organFed) {
      if (!dispatch({ type: 'feedOrgan' })) return;
      props.flows.forEach((f) => f.start(settings.reducedMotion ? 1.5 : 4.5));
      chime(523.25, 1.2, 0.1);
      setTimeout(() => chime(659.25, 1.2, 0.1), 500);
      setTimeout(() => chime(783.99, 1.4, 0.1), 1000);
      follow.autoYaw = follow.yaw;
      setTimeout(() => {
        const bora = actors.npcs.find((n) => n.id === 'bora');
        if (bora && view.mode === 'play') say(bora, '나무 → 돔의 맥 → 촉수로 빛이 이어졌어요! 빛이 두 갈래 항로를 읽어 냈어요.', () => openRoutes());
      }, settings.reducedMotion ? 1500 : 4200);
      return;
    }
    if (W.organFed && W.route && !W.chapterDone) return startVoyage();
    if (W.organFed) return openRoutes();
    toast.show(state.quests.q04 === 'available' ? '항해사 보라와 먼저 이야기해요.' : '항해 나무가 조용해요. 서로 다른 빛을 엮어 오면 대답할 거예요.');
  }

  function openRoutes() {
    if (!state.world.organFed) return;
    view.mode = 'panel-modal';
    routes.show(state.world.route, availableRoutes(state));
    refresh();
  }

  // ------------------------------------------------------------------ 두 번째 이야기 연출
  /** 짧은 대사 여러 줄(한 화면에 한두 문장) */
  function sayLines(npc, texts, then) {
    view.mode = 'dialogue';
    dialogue.play({ steps: texts.map((text) => ({ speaker: npc.name, portrait: portraitFor(npc.id), text })), onClose: then });
    refresh();
  }

  /** 첫 항해 뒤 낯선 빛: 짧은 시선 유도 → 동행 주민의 반응 → 목표 자동 등록 */
  function maybeStartTrace() {
    const S = state;
    if (!S.world.chapterDone || S.story.traceSeen || view.traceRunning || view.mode !== 'play' || !props.strange) return;
    const info = SCENE_INFO[S.scene];
    if (!info.trace) return;
    const from = markerGround(info.trace.at, info.trace.offset, true);
    if (!from) return;
    const inward = spots.find((s) => s.kind === 'flower') ?? spots.find((s) => s.kind === 'iceTrace') ?? spots.find((s) => s.kind === 'organ');
    const to = inward ? inward.pos.clone().lerp(from, 0.35) : snapToGrid(sceneCenter());
    view.traceRunning = true;
    props.strange.play(from, to, settings.reducedMotion ? 3 : 6.5);
    follow.autoYaw = Math.atan2(actors.player.position.x - from.x, actors.player.position.z - from.z);
    chime(1174.66, 0.9, 0.06);
    const companion = actors.npcs.find((n) => ['ribbonIce', 'salguSolar', 'bora'].includes(n.id));
    const finish = () => {
      view.traceRunning = false;
      dispatch({ type: 'seeTrace' });
    };
    setTimeout(() => {
      if (view.mode !== 'play') return finish();
      if (companion) {
        companion.char.greet();
        const lines =
          companion.id === 'bora'
            ? ['방금 그 빛… 우리 해파리에서 나온 게 아니에요.', '누군가 먼 곳에서 흔적을 남긴 것 같아요. 따뜻한 곳과 차가운 곳 쪽으로요.']
            : ['저 빛, 우리 해파리에서 나온 게 아니야.', '누가 여길 지나갔나 봐. 가까이 가 볼까?'];
        sayLines(companion, lines, finish);
      } else {
        toast.show('우리 해파리의 빛이 아닌, 낯선 작은 빛이 스쳐 갔어요.', 4000);
        finish();
      }
    }, settings.reducedMotion ? 600 : 1800);
  }

  /** 두 흔적 엮기: 따뜻한 흔적과 차가운 흔적이 항해 나무에서 만나 새 방향이 드러난다 */
  function playWeaveClues() {
    if (view.mode !== 'play') return;
    view.mode = 'cinematic';
    closePanel(true);
    refresh();
    const dur = settings.reducedMotion ? 1.5 : 4.5;
    props.flows.forEach((f) => f.start(dur));
    chime(659.25, 1, 0.1);
    setTimeout(() => chime(880, 1.2, 0.1), 700);
    let t = 0;
    const tree = props.tree;
    if (tree) {
      actors.player.faceTowards(tree.x, tree.z);
      follow.autoYaw = Math.atan2(actors.player.position.x - tree.x, actors.player.position.z - tree.z);
      follow.pitch = 0.12;
    }
    cinematic = {
      followCam: true,
      update(dt) {
        t += dt;
        props.branches?.set(2, t > dur * 0.6);
        if (t >= dur) this.finish();
      },
      finish() {
        cinematic = null;
        view.mode = 'play';
        dispatch({ type: 'weaveClues' });
        if (tree) sparkles.burst(tree.clone().add(V3(0, 4.5, 0)), 40, settings.reducedMotion);
        banner.show('두 흔적이 이어졌어요', '새로운 방향: 황혼 합류지', '햇살 꽃과 얼음 결정의 흔적이 한 줄기 항로가 되었어요.', 5500);
        const bora = actors.npcs.find((n) => n.id === 'bora');
        if (bora) setTimeout(() => view.mode === 'play' && sayLines(bora, ['두 빛이 같은 곳을 가리켜요. 노을빛 계단섬, 황혼 합류지예요.', '작은 누군가가 거기서 길을 잃은 것 같아요. 항로를 열어 둘게요.']), 1400);
      },
      skip() {
        this.finish();
      },
    };
  }

  /** 마을의 답장: 실제로 놓은 세 빛이 차례로 떠올라 멀리 보내지고, 먼 작은 빛들이 응답한다 */
  function playReply() {
    if (view.mode !== 'play') return;
    const organ = spots.find((s) => s.kind === 'organ');
    if (!organ) return dispatch({ type: 'sendReply' });
    view.mode = 'cinematic';
    closePanel(true);
    refresh();
    const lights = REPLY_SPOTS.map((r) => lightAt(state, r.slot)).filter(Boolean);
    const tree = props.tree ?? organ.pos;
    const base = organ.pos.clone().lerp(tree, 0.5).add(V3(0, 1.4, 0));
    const out = V3(tree.x - actors.player.position.x, 0, tree.z - actors.player.position.z);
    if (out.lengthSq() < 0.01) out.set(0, 0, -1);
    out.normalize();
    const side = V3(-out.z, 0, out.x);
    const orbs = lights.map((l, i) => {
      const prop = new LightProp({ ...l, brightness: Math.max(70, l.brightness) }, { preview: true });
      prop.object.position.copy(base).add(V3((i - 1) * 1.2, 0, 0));
      prop.object.visible = false;
      world.dynamic.add(prop.object);
      return prop;
    });
    const dur = settings.reducedMotion ? 2.5 : 7;
    let t = 0;
    const sent = new Set();
    actors.player.faceTowards(tree.x, tree.z);
    follow.pitch = 0.08;
    follow.autoYaw = Math.atan2(actors.player.position.x - tree.x, actors.player.position.z - tree.z);
    // 설치한 답장 자리 빛도 차례로 반짝인다(전망대 자리)
    const signal = props.slots.get('replySignal')?.prop;
    cinematic = {
      followCam: true,
      update(dt) {
        t += dt;
        orbs.forEach((o, i) => {
          const start = 0.4 + i * (dur * 0.16);
          const k = THREE.MathUtils.clamp((t - start) / (dur * 0.45), 0, 1);
          o.object.visible = k > 0 && k < 1;
          if (k > 0 && !sent.has(i)) {
            sent.add(i);
            chime(587.33 + i * 130, 0.8, 0.09);
            sparkles.burst(o.object.position.clone().add(V3(0, 1, 0)), 14, settings.reducedMotion);
          }
          o.object.position.copy(base).addScaledVector(side, (i - 1) * 1.2 * (1 - k)).addScaledVector(out, k * 34).add(V3(0, k * k * 22, 0));
          o.object.scale.setScalar(1 - k * 0.6);
          o.update(time);
        });
        if (signal) signal.object.scale.setScalar(1 + Math.max(0, Math.sin(t * 5)) * 0.25);
        if (t > dur * 0.62 && props.replies && props.replies.t < 0) {
          props.replies.play();
          chime(1046.5, 1.4, 0.08);
        }
        if (t >= dur) this.finish();
      },
      finish() {
        cinematic = null;
        orbs.forEach((o) => o.dispose());
        if (signal) signal.object.scale.setScalar(1);
        view.mode = 'play';
        dispatch({ type: 'sendReply' });
        props.replies?.settle();
        banner.show('우리 마을의 답장', '멀리서 작은 빛들이 대답해요', '쉼터·산책길·전망대에 놓은 빛이 함께 떠났어요.', 6000);
        const bora = actors.npcs.find((n) => n.id === 'bora');
        if (bora) setTimeout(() => view.mode === 'play' && talkTo('bora'), 2200);
      },
      skip() {
        this.finish();
      },
    };
  }

  /** 작은 해파리를 처음 만났을 때 */
  function meetJelly() {
    const pj = props.jelly;
    if (!pj || state.quests.guide !== 'active') return;
    if (!dispatch({ type: 'meetJelly' })) return;
    pj.jelly.flinch();
    bubble.show('작은 해파리가 강한 빛을 피해 몸을 움츠려요. 은은한 빛길을 따라오게 해 볼까요?', () => project(pj.jelly.object.position, 0.6));
    const first = spots.find((s) => s.kind === 'guidePt' && s.index === 0);
    if (first && settings.hints) setTimeout(() => wisp.fly(actors.player.position, first.pos), 1200);
  }

  function requestDepart() {
    if (view.mode !== 'play') return;
    const check = canDepart(state);
    if (!check.ok) return toast.show(check.reason);
    startVoyage();
  }

  async function startVoyage() {
    const check = canDepart(state);
    if (!check.ok) return toast.show(check.reason);
    if (!['play', 'dialogue'].includes(view.mode)) return;
    const to = check.to;
    const first = !state.voyage.visited[to] && isDestination(to) && !state.world.chapterDone;
    commitPosition();
    closePanel(true);
    path = null;
    view.mode = 'voyage';
    refresh();
    // 1) 항해 나무로 빛이 들어가 도시 전체로 퍼진다(해파리 안에서 출발할 때)
    if (!isDestination(state.scene) && props.flows.length && !settings.reducedMotion) {
      props.flows.forEach((f) => f.start(2.6));
      follow.pitch = Math.min(follow.maxPitch, 0.5);
      await new Promise((r) => setTimeout(r, 2400));
    }
    // 2) 외부 연출: 수축하며 출발 → 별 흐름과 성운이 목적지 색으로 → 도착 준비
    voyageSkipRequested = false;
    const names = { solar: '태양 정원', ice: '얼음 성운', twilight: '황혼 합류지', overlook: '항해 전망대' };
    const lines = first
      ? [
          { at: 0, text: '해파리가 한 번 크게 숨을 쉬어요' },
          { at: 2.5, text: '도시를 품은 해파리가 몸을 움츠리며 헤엄쳐 나가요' },
          { at: 6, text: `별의 흐름이 ${names[to]}의 빛깔로 물들어요` },
          { at: 10, text: `${names[to]}이 가까워져요` },
        ]
      : [{ at: 0, text: `해파리가 ${names[to]}(으)로 헤엄쳐 가요` }];
    const minTime = settings.reducedMotion ? 1.6 : first ? 12 : 6;
    // 블렌더 우주 해파리를 3D로 헤엄치게 한다(에셋이 늦으면 예전 그림 연출)
    voyageLive = null;
    if (!settings.reducedMotion) {
      const assets = await Promise.race([loadVoyageAssets().catch(() => null), new Promise((r) => setTimeout(() => r(null), 4000))]);
      if (assets) {
        voyage3d ??= new VoyageScene(...assets);
        voyage3d.start(minTime);
        voyageLive = voyage3d;
      }
    }
    voyageUi.show(to, lines, minTime, settings.reducedMotion, !!voyageLive);
    const started = performance.now();
    // 지역 이동 직전 저장: 새로고침하면 목적지 선착장에서 안전하게 시작
    if (!dispatch({ type: 'depart' })) {
      voyageUi.hide();
      voyageLive = null;
      view.mode = 'play';
      refresh();
      return;
    }
    if (to !== 'overlook') dispatchTutorial('voyage');
    let ready = false;
    let failed = null;
    buildScene(state.scene)
      .then(() => (ready = true))
      .catch((e) => (failed = e));
    while (!(ready && ((performance.now() - started) / 1000 >= minTime || voyageSkipRequested))) {
      if (failed) break;
      voyageUi.setWaiting(voyageSkipRequested || (performance.now() - started) / 1000 >= minTime);
      await new Promise((r) => setTimeout(r, 100));
    }
    if (failed) {
      voyageUi.hide();
      voyageLive = null;
      fader.show(`도착 장면을 불러오지 못했어요. 새로고침하면 선착장에서 다시 시작해요. (${failed.message})`);
      return;
    }
    voyageUi.hide();
    voyageLive = null;
    // 3) 선착장: 꽃잎 발판 위, 플레이어 뒤쪽 시점으로 조작 복귀
    if (!actors.player) buildPlayer();
    world.dynamic.add(actors.player.object);
    const pose = arrivalPose(state.arrival ?? SCENE_INFO[state.scene].start);
    actors.player.position.copy(pose.pos);
    actors.player.groundY = pose.pos.y;
    actors.player.setYaw(pose.yaw, true);
    follow.snap(actors.player.position, pose.yaw + Math.PI);
    renderer.compile(scene3, camera);
    view.mode = 'play';
    view.arrivedAt = performance.now();
    commitPosition();
    refresh();
    const companion = actors.npcs.find((n) => n.id === 'ribbonIce' || n.id === 'salguSolar');
    const complete = () => {
      if (isDestination(state.scene)) {
        dispatch({ type: 'arrivalControl' });
        const d = spots.find((s) => s.kind === 'discovery' && !s.disabled);
        const jelly = state.quests.guide === 'active' && !state.story.jellyMet ? spots.find((s) => s.kind === 'jelly') : null;
        const goal = jelly ?? d;
        if (goal) setTimeout(() => wisp.fly(actors.player.position, goal.live?.() ?? goal.pos), 900);
      }
      setTimeout(maybeStartTrace, 1200);
    };
    if (isDestination(state.scene) && companion && !state.world.arrived) {
      setTimeout(() => {
        companion.char.greet();
        say(companion, '움직인다…! 우리가 만든 빛을 따라가고 있어. 봐, 여기까지 왔어!', complete);
      }, 500);
    } else {
      complete();
      toast.show(isDestination(state.scene) ? `${SCENE_INFO[state.scene].name}에 내렸어요.` : '해파리의 항해 전망대로 돌아왔어요.', 3500);
    }
  }

  // ------------------------------------------------------------------ 문·승강대
  async function passDoor(ex) {
    if (view.mode !== 'play') return;
    const link = LINKS[`${state.scene}:${ex.at}`];
    if (!link) return toast.show('이쪽으로는 아직 갈 수 없어요.');
    view.mode = 'transit';
    path = null;
    closePanel(true);
    commitPosition();
    refresh();
    // 캐릭터가 문을 2~3걸음 통과하고, 꽃잎 막이 화면을 가리는 순간 전환
    const door = props.doors.find((d) => d.ex.at === ex.at);
    const target = door ? door.pos.clone() : actors.player.position.clone();
    const start = actors.player.position.clone();
    const dir = target.clone().sub(start).setY(0);
    const through = target.clone().addScaledVector(dir.lengthSq() > 0.01 ? dir.normalize() : V3(0, 0, -1), 1.2);
    actors.player.faceTowards(through.x, through.z);
    const dur = settings.reducedMotion ? 0.3 : 0.9;
    const t0 = performance.now();
    await new Promise((resolve) => {
      cinematic = {
        update() {
          const k = Math.min(1, (performance.now() - t0) / 1000 / dur);
          actors.player.position.lerpVectors(start, through, k);
          actors.player.update(0.016, 2.6, time);
          if (k >= 1) this.finish();
        },
        finish() {
          cinematic = null;
          resolve();
        },
        skip() {
          this.finish();
        },
      };
    });
    if (!dispatch({ type: 'travel', via: ex.at })) {
      view.mode = 'play';
      refresh();
      return;
    }
    await enterScene({ label: `${SCENE_INFO[state.scene].name}(으)로` });
  }

  async function rideLift(ex) {
    if (view.mode !== 'play') return;
    const lift = props.lifts.get(ex.at);
    view.mode = 'transit';
    path = null;
    closePanel(true);
    commitPosition();
    refresh();
    if (lift && !settings.reducedMotion) {
      const top = lift.object.position.clone().add(V3(0, lift.top, 0));
      actors.player.position.copy(top);
      actors.player.groundY = top.y;
      toast.show('꽃잎 승강대가 촉수에 들려 올라가요.', 3000);
      let t = 0;
      await new Promise((resolve) => {
        cinematic = {
          update(dt) {
            t += dt;
            lift.ride = Math.min(3.2, t * 1.1);
            lift.update(dt, time);
            actors.player.position.y = lift.object.position.y + lift.top;
            follow.target.copy(actors.player.position);
            if (t > 3.2) this.finish();
          },
          finish() {
            cinematic = null;
            resolve();
          },
          skip() {
            this.finish();
          },
        };
      });
    }
    if (!dispatch({ type: 'travel', via: ex.at })) {
      view.mode = 'play';
      refresh();
      return;
    }
    await enterScene({ label: `${SCENE_INFO[state.scene].name}에 닿는 중…` });
  }

  // ------------------------------------------------------------------ 첫 깨어남
  // 도입 이야기(멈춘 항해·꺼진 산책로·흩어진 다리)는 시작 화면의 오프닝 영상 자막으로 옮겼다.
  // 내 모습을 정하면 바로 제작실에서 깨어난다
  async function playOpening() {
    dispatch({ type: 'seeOpening' });
    await enterScene({ label: '빛 제작실에서 깨어나는 중…' });
    // 창밖을 향해 한 번 시점을 돌려 목표 방향을 보여 준다
    const lookAt = SCENE_INFO.workshop.lookAt;
    if (lookAt && !settings.reducedMotion) {
      setTimeout(() => {
        follow.autoYaw = Math.atan2(actors.player.position.x - lookAt[0], actors.player.position.z - lookAt[2]);
      }, 1200);
    }
  }

  // ------------------------------------------------------------------ 결정의 노래(선택형)
  function startListening() {
    const st = state.quests.song;
    if (st !== 'active') return toast.show(st === 'available' || st === 'locked' ? '리본의 부탁을 먼저 들어 보세요.' : '이미 노래를 따라 했어요.');
    unlockAudio();
    view.puzzle = listen(view.puzzle);
    const token = ++playToken;
    const seq = view.puzzle.sequence;
    const gap = settings.reducedMotion ? 950 : 820;
    seq.forEach((id, i) => setTimeout(() => token === playToken && flashCrystal(id), 650 + i * gap));
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
    } else if (view.puzzle.status === 'success') {
      props.crystals.forEach((c, i) => setTimeout(() => flashCrystal(c.index), 250 + i * 180));
      dispatch({ type: 'puzzleResult', success: true });
    } else refresh();
  }

  function closePanel(silent = false) {
    if (view.panel?.kind === 'puzzle' && view.puzzle.status === 'listening') {
      playToken += 1;
      view.puzzle = { ...view.puzzle, status: 'idle' };
    }
    if (view.panel?.kind === 'tune') {
      view.tuning = null;
    }
    // 대상 앞에서 연 작업대를 닫으면 그 대상의 빛 비추기로 돌아간다
    if (!silent && view.panel?.kind === 'craft' && view.panel.back) {
      view.panel = view.panel.back;
      syncProps();
      refresh();
      return;
    }
    view.panel = null;
    if (!silent) {
      syncProps();
      refresh();
    }
  }

  // ------------------------------------------------------------------ 이동
  function commitPosition() {
    if (!actors.player || world.id !== state.scene || !state.profile.created || !['play', 'transit', 'voyage', 'loading'].includes(view.mode)) return;
    const p = actors.player.position;
    const r = reduce(state, { type: 'setPosition', scene: state.scene, x: p.x, y: actors.player.groundY ?? p.y, z: p.z, yaw: actors.player.yaw });
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
      const near = nearestWalkable(world.grid, from.x, from.z, from.y, 4);
      if (near) route = findPath(world.grid, near, point, 400000);
      if (route) route.unshift(near);
    }
    if (!route) return false;
    path = route.slice(1).map((p) => V3(p.x, p.y, p.z));
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

  /** Space 점프: 약 0.85m 높이. 공중에서는 발보다 낮은 칸으로만 나아가 낮은 턱에 올라설 수 있다 */
  function startJump() {
    const player = actors.player;
    if (!player || player.air || cinematic) return;
    path = null;
    pathDone = null;
    const y = player.position.y;
    player.air = { y, vy: JUMP_SPEED };
    player.setAir(1);
  }

  function updateJump(player, grid, dt) {
    const air = player.air;
    if (!air) return;
    air.vy -= GRAVITY * dt;
    air.y += air.vy * dt;
    const support = grid ? supportAt(grid, player.position.x, player.position.z, air.y) : player.groundY;
    const floor = support ?? player.groundY ?? air.y;
    // 발밑 바닥(낮은 턱 위로 넘어가면 그 높이)에 그림자를 둔다
    player.shadowLift = Math.max(0, air.y - floor);
    if (air.vy < 0 && air.y <= floor) {
      player.position.y = floor;
      player.groundY = floor;
      player.shadowLift = 0;
      player.air = null;
      player.setAir(0, true);
      commitPosition();
      return;
    }
    player.position.y = air.y;
    if (air.vy < 0) player.setAir(0.6);
  }

  function updatePlayer(dt) {
    const player = actors.player;
    const grid = world.grid;
    let speed = 0;
    const dir = V3();
    // 제작·조율 중에는 이동 입력을 막아 오조작을 막는다(Esc로 닫기)
    const lockedPanel = view.panel?.kind === 'craft' || view.panel?.kind === 'tune';
    if (lockedPanel) {
      path = null;
      if (player.air) {
        player.air = null;
        player.shadowLift = 0;
        player.position.y = player.groundY ?? player.position.y;
        player.setAir(0);
      }
      player.update(dt, 0, time);
      return;
    }
    if (keys.size) {
      const f = follow.forward(V3());
      const r = V3(-f.z, 0, f.x);
      if (keys.has('f')) dir.add(f);
      if (keys.has('b')) dir.sub(f);
      if (keys.has('r')) dir.add(r);
      if (keys.has('l')) dir.sub(r);
      if (dir.lengthSq() > 0) path = null;
    } else if (path) {
      const next = path[0];
      dir.set(next.x - player.position.x, 0, next.z - player.position.z);
      const dist = dir.length();
      if (player.wp !== next) {
        player.wp = next;
        player.wpT = 0;
        player.wpBudget = (dist / WALK_SPEED) * 1.6 + 0.6;
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
          player.update(dt, 0, time);
          return;
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
        const prevY = player.groundY ?? before.y;
        player.position.x += dir.x * step;
        player.position.z += dir.z * step;
        const g = groundAt(grid, player.position.x, player.position.z, prevY, 0.6);
        player.groundY = g ?? prevY + (path[0].y - prevY) * Math.min(1, step / Math.max(0.01, Math.hypot(path[0].x - before.x, path[0].z - before.z)));
        player.position.y += (player.groundY - player.position.y) * Math.min(1, dt * 18);
      } else if (grid && player.air) {
        const res = airMove(grid, before, player.air.y, dir.x * step, dir.z * step);
        player.position.x = res.x;
        player.position.z = res.z;
      } else if (grid) {
        const gy0 = player.groundY ?? before.y;
        const res = stepMove(grid, { x: before.x, y: gy0, z: before.z }, dir.x * step, dir.z * step);
        player.position.x = res.x;
        player.position.z = res.z;
        player.groundY = res.y;
        const gy = smoothGround(grid, res.x, res.z, res.y) ?? res.y;
        player.position.y += (gy - player.position.y) * Math.min(1, dt * 18);
      } else player.position.addScaledVector(dir, step);
      const moved = Math.hypot(player.position.x - before.x, player.position.z - before.z);
      speed = moved / Math.max(dt, 1e-4);
      movedDistance += moved;
      if (movedDistance > 2) dispatchTutorial('move');
      if (moved > 1e-3) player.setYaw(Math.atan2(dir.x, dir.z));
    }
    updateJump(player, grid, dt);
    player.update(dt, player.air ? 0 : speed, time);
    const walking = speed > 0.2;
    if (wasWalking && !walking) commitPosition();
    wasWalking = walking;

    // 자주 오간 문은 문턱을 걸어서 통과(도착 직후·키 입력 없이 다가간 경우는 제외)
    if (walking && performance.now() - view.arrivedAt > 1800) {
      for (const { ex, pos, door, walkThrough } of props.doors) {
        if (door.locked || !walkThrough) continue;
        const target = LINKS[`${state.scene}:${ex.at}`]?.[0];
        // 가 본 곳이거나, 지금 안내하는 목표 문이면 빛기둥 안으로 걸어 들어가기만 해도 이동
        const goal = hintTarget();
        const isGoal = goal?.kind === 'exit' && goal.id === ex.at;
        if (!target || !(state.positions[target] || isGoal)) continue;
        const d = Math.hypot(player.position.x - pos.x, player.position.z - pos.z);
        const toward = dir.x * (pos.x - player.position.x) + dir.z * (pos.z - player.position.z) > 0;
        if (d < 0.9 && toward) {
          passDoor(ex);
          break;
        }
      }
    }
  }

  function updateNpcs(dt) {
    for (const n of actors.npcs) {
      let speed = 0;
      if (n.walk?.pts.length) {
        const next = n.walk.pts[0];
        const d = V3(next.x - n.char.position.x, 0, next.z - n.char.position.z);
        if (d.length() < 0.25) n.walk.pts.shift();
        else {
          d.normalize();
          const step = Math.min(2.4 * dt, d.length() || 1);
          n.char.position.addScaledVector(d, 2.4 * dt > 0 ? step : 0);
          const g = world.grid ? groundAt(world.grid, n.char.position.x, n.char.position.z, n.char.position.y, 0.6) : null;
          if (g !== null) n.char.position.y += (g - n.char.position.y) * Math.min(1, dt * 12);
          n.char.setYaw(Math.atan2(d.x, d.z));
          speed = 2.4;
        }
        if (!n.walk.pts.length) {
          const done = n.walk.done;
          n.walk = null;
          done?.();
        }
      } else if (view.companion === n.id && actors.player) {
        const p = actors.player.position;
        const d = V3(p.x - n.char.position.x, 0, p.z - n.char.position.z);
        const dist = d.length();
        if (dist > 2.2 && world.grid) {
          d.normalize();
          const res = stepMove(world.grid, { x: n.char.position.x, y: n.char.position.y, z: n.char.position.z }, d.x * Math.min(dist - 2, 3.2 * dt), d.z * Math.min(dist - 2, 3.2 * dt));
          n.char.position.set(res.x, n.char.position.y + (res.y - n.char.position.y) * Math.min(1, dt * 12), res.z);
          if (!res.moved && dist > 8) {
            const w = nearestWalkable(world.grid, p.x - d.x * 1.5, p.z - d.z * 1.5, p.y, 8);
            if (w) n.char.position.set(w.x, w.y, w.z);
          }
          n.char.setYaw(Math.atan2(d.x, d.z));
          speed = 3;
        } else n.char.faceTowards(p.x, p.z);
      } else if (actors.player) {
        const d = n.char.position.distanceTo(actors.player.position);
        if (d < 5) n.char.faceTowards(actors.player.position.x, actors.player.position.z);
        else n.char.setYaw(n.homeYaw);
      }
      n.char.update(dt, speed, time);
      if (n.resting) n.char.model.position.y = Math.sin(time * 0.9) * 0.02 - 0.03;
      n.char.object.visible = camera.position.distanceTo(n.char.position) > 1.0 + n.char.height * 0.4 || camera.position.y > n.char.position.y + n.char.height + 0.3;
      n.mark.position.y = n.char.height + 0.45 + Math.sin(time * 2.5) * 0.06;
    }
  }

  // ------------------------------------------------------------------ 입력
  const raycaster = new THREE.Raycaster();
  const pointer = { down: false, x: 0, y: 0, dragged: false, id: null, button: 0 };
  canvas.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (view.mode === 'cinematic' && cinematic?.skip && !props.gate?.progress) return;
    if (view.mode !== 'play') return;
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
      markLook(dx * 0.0065);
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
  canvas.addEventListener('pointercancel', () => {
    pointer.down = false;
    canvas.classList.remove('is-dragging');
  });
  canvas.addEventListener('click', () => {
    if (view.mode === 'cinematic' && cinematic && !world.root?.userData?.noSkip) {
      // 도입 연출만 클릭으로 건너뛴다
      if (!state.world.openingSeen) cinematic.skip();
    }
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
      let root = hit.object;
      while (root && !root.name?.startsWith('char:')) root = root.parent;
      const sp = spots.find((s) => s.kind === 'npc' && s.npc.char.object === root);
      if (sp) return approach(sp);
    }
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
    if (bestSpot) return approach(bestSpot);
    if (!world.grid || view.panel?.kind === 'craft' || view.panel?.kind === 'tune') return;
    const g = pickGround(world.grid, raycaster.ray.origin, raycaster.ray.direction, 90);
    if (g && walkTo(V3(g.x, g.y, g.z))) {
      moveMarker.mesh.position.set(g.x, g.y + 0.05, g.z);
      moveMarkerLife = 1;
    } else toast.show('그곳으로는 걸어갈 수 없어요.', 1600);
  }

  function approach(spot) {
    const p = actors.player.position;
    const sp = spot.live ? spot.live() : spot.pos;
    if (Math.hypot(sp.x - p.x, sp.z - p.z) < spot.radius * 0.8) return interactWith(spot);
    const dir = V3(p.x - sp.x, 0, p.z - sp.z).normalize();
    const goal = snapToGrid(sp.clone().addScaledVector(dir, Math.min(1.4, spot.radius * 0.6)));
    if (walkTo(goal, () => interactWith(spot))) return;
    if (walkTo(snapToGrid(sp), () => interactWith(spot))) return;
    toast.show(`${spot.name}까지 가는 길을 찾지 못했어요.`, 2000);
  }

  window.addEventListener('keydown', (e) => {
    if (view.mode === 'cinematic' && e.code === 'Escape' && cinematic && !state.world.openingSeen) {
      cinematic.skip();
      return;
    }
    if (view.mode !== 'play') return;
    if (e.code === 'Escape') {
      if (view.panel) {
        if (view.panel.kind === 'tune') actions.tuneCancel();
        else closePanel();
      } else actions.openSettings();
      return;
    }
    const tag = e.target?.tagName;
    if (tag === 'INPUT') return;
    if (e.target?.getAttribute?.('role') === 'radio' && e.code.startsWith('Arrow')) return;
    if ((e.code === 'KeyE' || e.code === 'Space') && view.panel?.kind === 'tune' && !e.repeat) {
      e.preventDefault();
      actions.tunePress();
      return;
    }
    const dir = KEYMAP[e.code];
    if (dir) {
      e.preventDefault();
      keys.add(dir);
      return;
    }
    if (e.key === 'Shift') run = true;
    if (e.code === 'Space') {
      // 대화·패널이 열려 있으면 버튼 입력을 그대로 둔다
      if (view.panel || dialogue.open) return;
      e.preventDefault();
      if (!e.repeat) startJump();
      return;
    }
    if (e.code === 'KeyE' && !e.repeat) {
      e.preventDefault();
      actions.interact();
    } else if (e.code === 'KeyQ' && !e.repeat) actions.rotateCamera(-1);
    else if (e.code === 'KeyR' && !e.repeat) actions.rotateCamera(1);
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
  }

  // ------------------------------------------------------------------ 루프
  const clock = new THREE.Clock();
  let fpsAcc = 0;
  let fpsFrames = 0;
  const perf = { fps: 0 };
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    time += dt;
    if (voyageLive) {
      voyageLive.update(dt, camera.aspect);
      renderer.render(voyageLive.scene, voyageLive.camera);
    } else if (world.root) {
      if (cinematic) cinematic.update(dt);
      if (actors.player && actors.player.object.parent) {
        if (view.mode === 'play') updatePlayer(dt);
        else if (view.mode !== 'transit') actors.player.update(dt, 0, time);
      }
      updateNpcs(dt);
      const focus = actors.player?.object.parent ? actors.player.position : camera.position;
      if (view.mode !== 'cinematic' || actors.player?.object.parent) {
        if (actors.player?.object.parent && !(view.mode === 'cinematic' && !state.world.openingSeen && !cinematic?.followCam)) {
          follow.target.copy(actors.player.position);
          follow.update(dt);
        }
      }
      world.update(dt, { camera: camera.position, target: focus });

      for (const e of props.slots.values()) {
        e.ring.update(time);
        e.prop?.update(time);
        e.lamp?.update(dt, time);
      }
      const tuningLamp = view.tuning ? props.lanterns.get(SCENE_INFO.walkway.offbeat[view.tuning.index]) : null;
      for (const [name, l] of props.lanterns) l.update(dt, time, l === tuningLamp ? glowAt(view.tuning, time) : null);
      props.preview?.update(time);
      props.benchPreview?.update(time);
      props.rings.forEach((r) => r.update(time));
      if (actors.player) for (const d of props.doors) d.door.update(dt, time, d.pos.distanceTo(actors.player.position), camera.position);
      for (const lift of props.lifts.values()) {
        if (cinematic) continue;
        const d = actors.player ? Math.hypot(actors.player.position.x - lift.object.position.x, actors.player.position.z - lift.object.position.z) : 99;
        lift.update(dt, time, d);
      }
      if (props.gate && !cinematic) props.gate.apply(time);
      props.bud?.bud.update(dt, time);
      if (props.beacon) {
        const organ = spots.find((s) => s.kind === 'organ');
        const near = !!(organ && actors.player && actors.player.position.distanceTo(organ.pos) < 9);
        props.beacon.update(dt, time, { ready: state.quests.q04 === 'active' || state.world.chapterDone, near, cameraPos: camera.position });
      }
      props.glimmers.forEach((g) => g.g.update(time));
      // 두 번째 이야기 공간 반응
      props.strange?.update(dt, time);
      props.flower?.flower.update(dt, time);
      for (const { g, i } of props.glyphs) {
        const s = spots.find((x) => x.kind === 'iceTrace' && x.index === i);
        g.update(dt, time, !!s && !s.disabled, camera.position);
      }
      props.jelly?.jelly.update(dt, time);
      for (const gp of props.guidePts) {
        gp.ring.update(time);
        gp.path.update(dt, time);
      }
      props.branches?.update(dt, time);
      props.replies?.update(dt, time);
      props.flows.forEach((f) => f.update(dt));
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
      wisp.update(dt, time);

      if (view.mode === 'play' && actors.player) {
        const t = nearestTarget();
        view.target = t;
        const panelOnTarget =
          view.panel &&
          t &&
          ((view.panel.kind === 'slot' && t.kind === 'slot' && t.id === view.panel.id) ||
            (view.panel.kind === 'craft' && (t.kind === 'workbench' || !!view.panel.back)) ||
            (view.panel.kind === 'use' && t.kind === view.panel.target) ||
            (view.panel.kind === 'puzzle' && t.kind === 'puzzle') ||
            (view.panel.kind === 'tune' && (t.kind === 'tune' || t.kind === 'slot')));
        prompt.update(panelOnTarget ? null : t);
        if (view.panel) {
          let anchor;
          if (view.panel.kind === 'use') anchor = useSpot(view.panel);
          else if (view.panel.kind === 'craft' && view.panel.back) anchor = useSpot(view.panel.back);
          else {
            const kind = { slot: 'slot', craft: 'workbench', puzzle: 'puzzle', tune: 'tune' }[view.panel.kind];
            anchor = spots.find((s) => s.kind === kind && (kind !== 'slot' || s.id === view.panel.id));
          }
          if (!anchor || anchor.pos.distanceTo(actors.player.position) > PANEL_CLOSE_RADIUS + (view.panel.kind === 'tune' ? 2 : 0)) {
            if (view.panel.kind === 'tune') actions.tuneCancel();
            else {
              closePanel(true);
              syncProps();
              refresh();
            }
          }
        }
        if (view.panel) updatePanels();
        hint.set(currentHint());
        updateGuide();
        // 오래 진행이 없으면 안내 빛
        if (settings.hints && performance.now() - view.lastProgress > 22000 && performance.now() - view.wispAt > 14000) {
          const target = hintTarget();
          if (target) {
            wisp.fly(actors.player.position, target.live ? target.live() : target.pos);
            view.wispAt = performance.now();
          }
        }
      } else {
        prompt.update(null);
        if (view.mode !== 'dialogue') hint.set(null);
        hideGuide();
      }
      objMarker.update(time, actors.player?.position, camera.position);
      trail.update(time);
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
    setBoot(0.6);
  } catch (err) {
    console.error(err);
    bootEl.querySelector('p').textContent = '에셋을 불러오지 못했어요. tools/export-all.mjs로 변환했는지 확인해 주세요.';
    return;
  }
  bootEl.remove();
  requestAnimationFrame(frame);
  refresh();

  // 검수용: ?dev 는 기본 캐릭터를 만들고, ?scene=… 은 지정 장면을 바로 연다
  if (params.has('dev') && !state.profile.created) {
    dispatch({ type: 'setProfile', profile: {}, confirm: true });
    dispatch({ type: 'seeOpening' });
  }
  if (params.get('tm') === 'neutral') renderer.toneMapping = THREE.NeutralToneMapping;
  if (params.get('scene') && SCENES.includes(params.get('scene')) && state.profile.created) {
    state = { ...state, scene: params.get('scene'), arrival: null };
    buildPlayer();
    await enterScene();
  } else {
    view.mode = 'title';
    // 첫 진입(이 탭에서 처음)에는 오프닝 영상부터. ?skipIntro·움직임 줄이기면 바로 타이틀
    let openingSeen = false;
    try {
      openingSeen = sessionStorage.getItem('lumina-opening-video') === '1';
      sessionStorage.setItem('lumina-opening-video', '1');
    } catch {}
    const playOpening = !openingSeen && !params.has('skipIntro') && !settings.reducedMotion;
    title.show({ hasSave: loaded.hasSave, name: state.profile.name, legacy: loaded.legacy || LEGACY_KEYS.some((k) => storage?.getItem(k)), playOpening });
    refresh();
  }

  window.lumina = {
    get state() {
      return state;
    },
    get view() {
      return view;
    },
    perf,
    world,
    camera: follow,
    settings,
    get player() {
      return actors.player;
    },
    get walking() {
      return !!path;
    },
    get cinematic() {
      return !!cinematic;
    },
    dispatch,
    /** 검수용: 항해 3D 장면만 띄워 at초 시점부터 재생(null이면 끄기) */
    async voyagePreview(at = 0, duration = 12) {
      if (at === null) return (voyageLive = null);
      voyage3d ??= new VoyageScene(...(await loadVoyageAssets()));
      voyage3d.start(duration);
      voyage3d.time = at;
      voyageLive = voyage3d;
      return true;
    },
    spots: () => spots.map((s) => ({ kind: s.kind, id: s.id, name: s.name, disabled: !!s.disabled, pos: (s.live ? s.live() : s.pos).toArray().map((n) => Math.round(n * 100) / 100) })),
    npcs: () => actors.npcs.map((n) => ({ id: n.id, pos: n.char.position.toArray().map((v) => Math.round(v * 100) / 100) })),
    approach(kind, id) {
      const s = spots.find((x) => x.kind === kind && (id === undefined || x.id === id) && !x.disabled);
      if (s) approach(s);
      return !!s;
    },
    skipCinematic: () => cinematic?.skip(),
    hint: () => currentHint(),
    reset() {
      storage?.removeItem(SAVE_KEY);
      location.reload();
    },
  };
}

boot();
