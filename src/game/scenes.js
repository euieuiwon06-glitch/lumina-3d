// 장면별 배치. 위치는 블렌더 NAV_동선표시 이름 + three 좌표 오프셋 [dx, dz](m).
// 주민 위치는 상태(관계·복원)에 따라 달라진다: where(state) → { scene, at, offset } | null
// 공간 이름 대응: 제작실=workshop, 캡슐 마을=neighborhood, 촉수 다리·교환 정원=walkway, 전망대=overlook

import { atLeast } from './quests.js';

const rel = (s, id, r) => ['stranger', 'met', 'accepted', 'progress', 'resolved', 'companion'].indexOf(s.relations[id]) >= ['stranger', 'met', 'accepted', 'progress', 'resolved', 'companion'].indexOf(r);

export const NPCS = {
  salgu: {
    name: '살구',
    model: 'flower',
    role: '길 앞 주민',
    where: (s) => {
      if (!s.world.bridgeRestored) {
        return rel(s, 'salgu', 'accepted') ? { scene: 'walkway', at: 'QUEST_다리앞', offset: [-1.2, 1.4] } : { scene: 'neighborhood', at: 'EXIT_촉수산책로', offset: [-4.5, 2.5] };
      }
      // 다리를 건너 친구 곁으로
      return { scene: 'walkway', at: 'POI_씨앗탐색', offset: [3.64, 2.1] };
    },
  },
  ribbon: {
    name: '리본',
    model: 'vine',
    role: '빛 수집가',
    where: () => ({ scene: 'walkway', at: 'POI_씨앗탐색', offset: [3.89, 0.2] }),
  },
  bora: {
    name: '보라',
    model: 'crystal',
    role: '항해사',
    where: () => ({ scene: 'overlook', at: 'POI_출항준비_빛오르간', offset: [3.4, -2.6] }),
  },
  pogeun: {
    name: '포근',
    model: 'cloud',
    role: '쉼터 주민',
    where: (s) => (s.quests.shelter === 'claimed' ? { scene: 'neighborhood', at: 'POI_주민대화', offset: [-2.2, 2.4], resting: true } : { scene: 'neighborhood', at: 'POI_주민대화', offset: [0, 0] }),
  },
  // 도착지 동행(첫 항해를 함께한 주민). 흔적 부탁을 해결하면 조사한 곳 곁으로 옮겨 간다
  ribbonIce: {
    name: '리본',
    model: 'vine',
    role: '빛 수집가',
    where: (s) => (s.quests.icepath === 'claimed' ? { scene: 'ice', at: 'POI_수정바위_채집', offset: [-2.2, 3.4] } : { scene: 'ice', at: 'ENTRY_해파리선착장', offset: [2.6, -3.2] }),
  },
  salguSolar: {
    name: '살구',
    model: 'flower',
    role: '길 앞 주민',
    where: (s) => (s.quests.flower === 'claimed' ? { scene: 'solar', at: 'POI_태양씨앗숲_따뜻한빛재료', offset: [5.2, 3.6] } : { scene: 'solar', at: 'ENTRY_해파리외부항해_착륙지점', offset: [2.6, -3.2] }),
  },
};

export const SCENE_INFO = {
  workshop: {
    name: '빛 제작실',
    icon: 'sprout',
    start: 'PLAYER_START',
    // 창밖으로 멈춘 해파리 산책로가 보이는 방향(튜토리얼 둘러보기)
    lookAt: [9, 2.8, -4],
    exits: [
      { at: 'ENTRY_정원_교환광장', label: '캡슐 마을로 나가기', kind: 'door' },
      { at: 'ENTRY_씨앗온실', label: '씨앗 온실로 가기', kind: 'door' },
    ],
    workbench: { at: 'POI_작업대_빛제작', label: '둥근 작업대' },
  },
  neighborhood: {
    name: '캡슐 마을',
    icon: 'sprout',
    start: 'ENTRY_정원_교환광장',
    exits: [
      { at: 'ENTRY_정원_교환광장', label: '빛 제작실로 들어가기', kind: 'door' },
      { at: 'EXIT_촉수산책로', label: '촉수 다리로 가기', kind: 'door' },
    ],
    slots: [
      { id: 'shelter', label: '포근의 쉼터', at: 'POI_주민대화', offset: [-2.2, 1.2], showWhen: (s) => atLeast(s, 'shelter', 'active') },
      { id: 'replyRest', label: '쉼터 답장 자리', at: 'POI_주민대화', offset: [2.6, -1.8], need: '밝기 60 이하의 은은한 빛', showWhen: (s) => atLeast(s, 'reply', 'active') },
    ],
  },
  nursery: {
    name: '씨앗 온실',
    icon: 'sprout',
    start: 'EXIT_빛제작실',
    exits: [{ at: 'EXIT_빛제작실', label: '빛 제작실로 돌아가기', kind: 'door' }],
    discoveries: [{ id: 'nurseryPool', at: 'POI_씨앗연못', offset: [0, 0], label: '씨앗 연못' }],
  },
  walkway: {
    name: '촉수 다리',
    icon: 'sprout',
    start: 'ENTRY_주거구역',
    exits: [
      { at: 'ENTRY_주거구역', label: '캡슐 마을로 돌아가기', kind: 'door' },
      { at: 'EXIT_전망대_항해정원', label: '꽃잎 승강대로 전망대 오르기', kind: 'lift', lockedUntil: (s) => (s.world.bridgeRestored ? null : '판석 다리가 흩어져 있어요. 등불 세 개의 박자를 맞추면 길이 이어져요.') },
    ],
    slots: [
      { id: 'lantern', label: '첫 등불', at: 'QUEST_다리앞', offset: [0, 0], showWhen: () => true },
      { id: 'replyPath', label: '산책길 답장 자리', at: 'QUEST_빛복원_4', offset: [1.6, 0.4], need: '밝기 50 이상의 길잡이 빛', showWhen: (s) => atLeast(s, 'reply', 'active') },
    ],
    // 박자가 어긋난 등불(조율 대상)과 복원 뒤 함께 켜지는 등불
    offbeat: ['QUEST_빛복원_2', 'QUEST_빛복원_3'],
    later: ['QUEST_빛복원_4', 'MARK_고정빛봉오리_3'],
    // 끊긴 판석 다리(블렌더 Quest_Bridge_*): from~to 사이 다리 칸은 복원 전 걸을 수 없다
    gate: {
      from: 'GATE_다리_시작',
      to: 'GATE_다리_끝',
      halfWidth: 2.4,
      path: ['QUEST_다리앞', 'GATE_다리_시작', 'GATE_다리_끝', 'QUEST_빛복원_1', 'QUEST_빛복원_2', 'QUEST_빛복원_4', 'MARK_고정빛봉오리_3', 'EXIT_전망대_항해정원'],
    },
    // 교환 정원: 꽃잎 봉오리(블렌더 Quest_Bud_*)와 반짝임 세 곳. 닫혀 있는 동안 봉오리 안(closedRadius)은 들어갈 수 없다
    bud: { at: 'POI_씨앗탐색', offset: [0, 0], closedRadius: 2.5, glimmers: [[2.32, -2.49], [-3.31, -0.76], [-2.32, 2.49]] },
  },
  overlook: {
    name: '항해 전망대',
    icon: 'jelly',
    start: 'ENTRY_촉수산책로',
    exits: [
      { at: 'ENTRY_촉수산책로', label: '꽃잎 승강대로 촉수 다리 내려가기', kind: 'lift' },
      { at: 'ENTRY_반대편길', label: '반대편 길', kind: 'door', lockedUntil: () => '반대편 길의 빛기둥이 아직 잠들어 있어요. 다음 이야기에서 열려요.' },
    ],
    slots: [{ id: 'replySignal', label: '전망대 답장 자리', at: 'POI_출항준비_빛오르간', offset: [-4.2, 4.6], need: '밝기 80 이상의 신호 빛', showWhen: (s) => atLeast(s, 'reply', 'active') }],
    // 누군가 남긴 낯선 빛(첫 항해 뒤 전망대에서 사건을 볼 때)
    trace: { at: 'POI_출항준비_빛오르간', offset: [-2.5, 6.5] },
    // 답장을 받은 뒤 작은 해파리가 머무는 곳(테라스 너머 하늘)
    jellyStay: [8, 3.2, -18],
    organ: {
      at: 'POI_출항준비_빛오르간',
      label: '항해 나무',
      // 항해대 표시(블렌더 NavGarden 좌표, three): 바닥 나침판·세 수반 빛기둥·나무 신호 빛
      beacon: {
        center: [0, 0.13, -9.6],
        radii: [7.3, 4.3],
        basins: [
          { at: [-3.2, 0.92, -10.6], color: '#FFB98A', r: 1.7 },
          { at: [3.2, 0.92, -10.6], color: '#8FF0CC', r: 1.7 },
          { at: [0, 0.78, -8.5], color: '#C3A6FF', r: 2.0 },
        ],
        tree: [0, 4.3, -11.2],
      },
    },
  },
  ice: {
    name: '얼음 성운',
    icon: 'pin',
    destination: true,
    start: 'ENTRY_해파리선착장',
    exits: [
      { at: 'ENTRY_해파리선착장', label: '해파리로 돌아가기', kind: 'dock' },
      { at: 'EXIT_징검다리_부유섬', label: '징검다리', kind: 'door', lockedUntil: () => '부유섬 징검다리가 얼어 있어요. 다음 챕터에서 녹아요.' },
      { at: 'EXIT_오른쪽_부유선반', label: '부유 선반', kind: 'door', lockedUntil: () => '부유 선반으로 가는 결정이 잠들어 있어요.' },
    ],
    discoveries: [{ id: 'iceAurora', at: 'POI_수정바위_채집', offset: [2.4, 1.2], label: '오로라 결정' }],
    trace: { at: 'ENTRY_해파리선착장', offset: [-3.2, -4.5] },
    // 얼음 속에 남은 길: 결정 앞 조사 지점 세 곳(순서대로 이어진다)
    iceTraces: { at: 'POI_수정바위_채집', offsets: [[-3.6, 0.6], [-6.2, -2.3], [-10.9, -2.0]] },
    puzzle: { at: 'POI_수정바위_채집', label: '노래하는 결정', tones: [523.25, 659.25, 783.99], showWhen: (s) => atLeast(s, 'song', 'active') },
  },
  solar: {
    name: '태양 정원',
    icon: 'sun',
    destination: true,
    start: 'ENTRY_해파리외부항해_착륙지점',
    // 길 가장자리 둔덕(약 0.4m)을 넘어 길 한가운데로 걸어 들어갈 수 있게 한 번에 오를 수 있는 높이를 조금 높인다
    walkStep: 0.36,
    exits: [
      { at: 'ENTRY_해파리외부항해_착륙지점', label: '해파리로 돌아가기', kind: 'dock' },
      { at: 'EXIT_길굽이_먼섬조망', label: '먼 섬 조망', kind: 'door', lockedUntil: () => '먼 섬으로 가는 길은 아직 구름에 덮여 있어요.' },
    ],
    discoveries: [{ id: 'solarGrove', at: 'POI_태양씨앗숲_따뜻한빛재료', offset: [0, 0], label: '태양씨앗 숲' }],
    trace: { at: 'ENTRY_해파리외부항해_착륙지점', offset: [-3.2, -4.5] },
    // 눈부셔서 숨은 꽃: 태양씨앗 숲 가장자리의 닫힌 꽃
    flower: { at: 'POI_태양씨앗숲_따뜻한빛재료', offset: [3.4, 1.8] },
  },
  twilight: {
    name: '황혼 합류지',
    icon: 'pin',
    destination: true,
    start: 'ENTRY_외부항해_도착테라스',
    exits: [{ at: 'ENTRY_외부항해_도착테라스', label: '해파리로 돌아가기', kind: 'dock' }],
    discoveries: [{ id: 'twilightShard', at: 'POI_따뜻함차가움_공명조각', offset: [0, 0], label: '공명 조각' }],
    // 이쪽으로 와도 괜찮아: 먼 계단섬(from)에서 선착장(to)까지 길을 따라 빛길 지점 세 곳(마지막은 선착장 곁)
    jelly: { from: 'POI_따뜻함차가움_공명조각', to: 'ENTRY_외부항해_도착테라스', stops: [0.36, 0.68, 0.94] },
  },
};

export function npcsInScene(state, sceneId) {
  return Object.entries(NPCS)
    .map(([id, n]) => ({ id, ...n, spot: n.where(state) }))
    .filter((n) => n.spot && n.spot.scene === sceneId)
    .filter((n) => (n.id === 'ribbonIce' ? state.voyage.visited.ice : n.id === 'salguSolar' ? state.voyage.visited.solar : true));
}
