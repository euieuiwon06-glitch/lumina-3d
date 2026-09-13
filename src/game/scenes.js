// 장면별 배치. 위치는 블렌더 NAV_동선표시의 이름 + three 좌표 오프셋 [dx, dz](m)로 적는다.
// 실제 좌표는 불러온 뒤 보행 격자의 가장 가까운 칸으로 맞춘다.

export const SCENE_INFO = {
  workshop: {
    name: '빛 제작실',
    icon: 'sprout',
    start: 'PLAYER_START',
    camera: 'CAM_00_Reference',
    exits: [
      { at: 'ENTRY_정원_교환광장', label: '캡슐 마을로 나가기' },
      { at: 'ENTRY_씨앗온실', label: '씨앗 온실로 가기' },
    ],
    workbench: { at: 'POI_작업대_빛제작', label: '빛 작업대' },
    npcs: [],
  },
  neighborhood: {
    name: '캡슐 마을',
    icon: 'sprout',
    start: 'ENTRY_정원_교환광장',
    camera: 'CAM_00_Reference',
    exits: [
      { at: 'ENTRY_정원_교환광장', label: '빛 제작실로 들어가기' },
      { at: 'EXIT_촉수산책로', label: '촉수 산책로로 가기' },
    ],
    npcs: [
      { id: 'pogeun', name: '포근', model: 'cloud', at: 'POI_주민대화', offset: [0, 0] },
      { id: 'hexa', name: '헥사', model: 'hexa', at: 'POI_캡슐방문_A', offset: [1.2, 1.5], decorative: true },
    ],
    slots: [{ id: 'shelter', label: '포근의 쉼터', at: 'POI_주민대화', offset: [-2.2, 1.2] }],
  },
  nursery: {
    name: '씨앗 온실',
    icon: 'sprout',
    start: 'EXIT_빛제작실',
    camera: 'CAM_00_Reference',
    exits: [{ at: 'EXIT_빛제작실', label: '빛 제작실로 돌아가기' }],
    npcs: [],
    discoveries: [{ id: 'nurseryPool', at: 'POI_씨앗연못', offset: [0, 0], label: '씨앗 연못' }],
  },
  walkway: {
    name: '촉수 산책로',
    icon: 'sprout',
    start: 'ENTRY_주거구역',
    camera: 'CAM_00_Reference',
    exits: [
      { at: 'ENTRY_주거구역', label: '캡슐 마을로 돌아가기' },
      { at: 'EXIT_전망대_항해정원', label: '항해 전망대로 오르기' },
    ],
    npcs: [{ id: 'salgu', name: '살구', model: 'flower', at: 'QUEST_빛복원_1', offset: [-1.2, 0.8] }],
    slots: [
      { id: 'path2', label: '산책로 가운데 봉오리', at: 'QUEST_빛복원_2', offset: [0, 0] },
      { id: 'path3', label: '산책로 끝 봉오리', at: 'QUEST_빛복원_4', offset: [0, 0] },
    ],
    // 마지막 부탁을 마치면 함께 깨어나는 봉오리
    sleepers: ['QUEST_빛복원_1', 'QUEST_빛복원_3'],
    discoveries: [{ id: 'walkwaySeed', at: 'POI_씨앗탐색', offset: [0, 0], label: '촉수 아래 빛의 흔적' }],
  },
  overlook: {
    name: '항해 전망대',
    icon: 'jelly',
    start: 'ENTRY_촉수산책로',
    camera: 'CAM_00_Reference',
    exits: [
      { at: 'ENTRY_촉수산책로', label: '촉수 산책로로 내려가기' },
      { at: 'ENTRY_반대편길', label: '반대편 길', locked: '반대편 길은 해파리가 더 깨어나면 열려요.' },
    ],
    npcs: [{ id: 'bora', name: '보라', model: 'crystal', at: 'POI_출항준비_빛오르간', offset: [3.4, -2.6] }],
    slots: [{ id: 'helm', label: '빛 오르간', at: 'POI_출항준비_빛오르간', offset: [0, 3.2], helm: true }],
  },
  ice: {
    name: '얼음 성운',
    icon: 'pin',
    destination: true,
    start: 'ENTRY_해파리선착장',
    camera: 'CAM_00_Reference',
    exits: [
      { at: 'ENTRY_해파리선착장', label: '해파리로 돌아가기', dock: true },
      { at: 'EXIT_징검다리_부유섬', label: '징검다리', locked: '부유섬 징검다리는 다음 항해에서 열려요.' },
      { at: 'EXIT_오른쪽_부유선반', label: '부유 선반', locked: '부유 선반은 다음 항해에서 열려요.' },
    ],
    npcs: [
      { id: 'ribbon', name: '리본', model: 'vine', at: 'POI_수정바위_채집', offset: [-3.2, 2.4] },
      { id: 'far', name: '결정 주민', model: 'hexa', at: 'ENTRY_해파리선착장', offset: [3.5, -4], decorative: true },
    ],
    puzzle: { at: 'POI_수정바위_채집', label: '노래하는 결정', tones: [523.25, 659.25, 783.99] },
  },
  solar: {
    name: '태양 정원',
    icon: 'sun',
    destination: true,
    start: 'ENTRY_해파리외부항해_착륙지점',
    camera: 'CAM_00_Reference',
    exits: [
      { at: 'ENTRY_해파리외부항해_착륙지점', label: '해파리로 돌아가기', dock: true },
      { at: 'EXIT_길굽이_먼섬조망', label: '먼 섬 조망', locked: '먼 섬으로 가는 길은 아직 구름에 덮여 있어요.' },
    ],
    npcs: [],
    discoveries: [{ id: 'solarGrove', at: 'POI_태양씨앗숲_따뜻한빛재료', offset: [0, 0], label: '태양씨앗 숲' }],
  },
  twilight: {
    name: '황혼 합류지',
    icon: 'pin',
    destination: true,
    start: 'ENTRY_외부항해_도착테라스',
    camera: 'CAM_00_Reference',
    exits: [{ at: 'ENTRY_외부항해_도착테라스', label: '해파리로 돌아가기', dock: true }],
    npcs: [],
    discoveries: [{ id: 'twilightShard', at: 'POI_따뜻함차가움_공명조각', offset: [0, 0], label: '공명 조각' }],
  },
};

export const NPC_LINES = {
  idle: {
    pogeun: '빛이 너무 밝으면 눈이 부셔서 쉬기 어려워요.',
    salgu: '산책로 끝 전망대, 예전엔 참 예뻤는데….',
    bora: '해파리가 기운을 차리면 먼 곳까지 갈 수 있어요.',
    ribbon: '결정들이 노래하는 소리, 들려요?',
    hexa: '캡슐 창문에 빛이 비치면 기분이 좋아요.',
    far: '멀리서 결정 주민이 손을 흔들어요.',
  },
  thanks: {
    pogeun: '덕분에 푹 쉬고 있어요.',
    salgu: '살구빛 길을 매일 걸어요!',
    bora: '다음 항로도 함께 정해요.',
    ribbon: '결정들이 아직도 흥얼거려요.',
  },
};
