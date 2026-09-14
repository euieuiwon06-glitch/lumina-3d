// 주민 대화 대본: 현재 상태에 맞는 대사와 2~3개의 유효한 선택지.
// 선택지는 { label, act, primary } 이고 act는 main이 실제 활동으로 연결한다(텍스트만 늘리지 않는다).
import { GIVER_NAMES, QUESTS, atLeast } from './quests.js';

const line = (speaker, text, choices) => ({ speaker, text, choices });

export function dialogueFor(state, npcId, ctx = {}) {
  const S = state;
  const W = S.world;
  const name = GIVER_NAMES[npcId] ?? ctx.name ?? '';
  const me = S.profile.name;

  switch (npcId) {
    case 'salgu': {
      const st = S.quests.q02;
      if (st === 'locked') return [line(name, '작업대의 빛이 잠든 걸 봤어? 네 빛이 깨어나면 다시 와 줘.')];
      if (st === 'available') {
        return [
          line(name, `${me}, 맞지? 새로 깨어난 빛이구나.`),
          line(name, QUESTS.q02.lines.join(' '), [
            { label: '어디부터 꺼졌어?', act: 'q02:guide', primary: true },
            { label: '내 빛으로 해볼게.', act: 'q02:direct' },
            { label: '함께 살펴보자.', act: 'q02:together' },
          ]),
        ];
      }
      if (st === 'active') {
        if (!S.slots.lantern) return [line(name, '첫 등불은 바로 여기야. 네 빛을 놓아 주면 나머지 등불도 따라 할 거야.')];
        if (!W.tuned) return [line(name, '저 두 등불, 박자가 어긋났지? 가장 밝을 때 빛을 보내 봐.', [{ label: '박자 맞추기', act: 'tune:open', primary: true }, { label: '조금 있다가', act: 'close' }])];
        return [line(name, '다리가 깨어나고 있어!')];
      }
      if (st === 'completed') {
        return [line(name, QUESTS.q02.doneLines[0]), line(name, QUESTS.q02.doneLines[1], [{ label: '고마워', act: 'claim:q02', primary: true }])];
      }
      // 해결 이후: 대사와 위치가 달라진다
      if (S.relations.salgu === 'companion') return [line(name, '같이 걸으니까 다리가 더 반짝이는 것 같아.')];
      return [
        line(name, '친구를 만나고 왔어! 다음에는 네가 만든 정원도 같이 보고 싶어.', [
          { label: '같이 걷자', act: 'companion:salgu', primary: true },
          { label: '내 빛 보여 주기', act: 'showLight:salgu' },
        ]),
      ];
    }
    case 'ribbon': {
      const st = S.quests.q03;
      if (st === 'locked') return [line(name, '다리 저편에서 누가 오는 소리가 들렸어. 살구니?')];
      if (st === 'available') {
        return [
          line(name, '살구를 데려와 줘서 고마워. 나는 여러 빛을 모으는 리본이야.'),
          line(name, QUESTS.q03.lines.join(' '), [
            { label: '봉오리를 깨워 볼게', act: 'accept:q03', primary: true },
            { label: '빛을 모으는 이유가 뭐야?', act: 'ribbon:why' },
          ]),
        ];
      }
      if (st === 'active') {
        if (!W.budAwake) return [line(name, '봉오리 주변에 반짝이는 곳 세 군데를 살펴봐. 봉오리가 그 박자로 숨 쉬고 있어.')];
        if (!W.traded) {
          return [
            line(name, '봉오리가 깨어났어! 이제 빛을 나눠 볼까?', [
              { label: '빛 나누기', act: 'trade:open', primary: true },
              { label: '나누면 내 빛은 어떻게 돼?', act: 'ribbon:rule' },
            ]),
          ];
        }
        if (!W.woven) return [line(name, '받은 민트빛과 네 빛의 제작법을 엮어 봐. 두 줄기가 하나가 될 거야.', [{ label: '빛 엮기', act: 'weave:open', primary: true }])];
      }
      if (st === 'completed') return [line(name, QUESTS.q03.doneLines[0]), line(name, QUESTS.q03.doneLines[1], [{ label: '전망대로 가 볼게', act: 'claim:q03', primary: true }])];
      return [line(name, W.chapterDone ? '다음 항해에서 새로운 빛을 보여 줘. 교환 정원에서 기다릴게.' : '꽃잎 승강대를 타면 전망대야. 보라가 항해 나무 곁에 있어.')];
    }
    case 'bora': {
      const st = S.quests.q04;
      if (st === 'locked') return [line(name, '항해 나무가 조용하네요. 서로 다른 빛이 모이면 대답할 텐데.')];
      if (st === 'available') {
        return [line(name, QUESTS.q04.lines.join(' '), [{ label: '엮은 빛을 보낼게요', act: 'accept:q04', primary: true }, { label: '조금 둘러볼게요', act: 'close' }])];
      }
      if (st === 'active') {
        if (!W.organFed) return [line(name, '항해 나무 앞에 서서 엮은 빛을 보내 주세요.')];
        if (!W.route) return [line(name, '빛이 두 갈래 항로를 읽어 냈어요. 어디로 가 볼까요?', [{ label: '항로 보기', act: 'route:open', primary: true }])];
        return [line(name, '준비됐어요. 항해 나무에서 출발해요.', [{ label: '출항하기', act: 'depart', primary: true }, { label: '항로 다시 고르기', act: 'route:open' }])];
      }
      if (W.chapterDone) {
        return [line(name, '해파리가 다시 노래해요. 따뜻한 빛은 태양 정원, 차가운 빛은 얼음 성운으로 이어져요.', [{ label: '다시 항해하기', act: 'route:open', primary: true }, { label: '다음에', act: 'close' }])];
      }
      return [line(name, QUESTS.q04.doneLines[0])];
    }
    case 'pogeun': {
      const st = S.quests.shelter;
      if (st === 'locked') return [line(name, '다리가 접힌 뒤로 마을이 조용해요. 살구가 걱정이네요.')];
      if (st === 'available') {
        return [line(name, QUESTS.shelter.lines.join(' '), [{ label: '은은한 빛을 놓아 볼게요', act: 'accept:shelter', primary: true }, { label: '나중에요', act: 'close' }])];
      }
      if (st === 'active') {
        const l = S.lights.find((x) => x.id === S.slots.shelter);
        if (l && l.brightness > 60) return [line(name, '앗, 눈부셔요…! 작업대에서 밝기를 조금만 낮춰 줄래요?')];
        if (l && !['pulse', 'slowpulse'].includes(l.motion)) return [line(name, '예쁘지만 너무 들썩여요. 숨 쉬듯 맥동하는 빛이면 좋겠어요.')];
        return [line(name, '작업대에서 맥동하는 빛을 빚어 쉼터에 놓아 주세요. 밝기는 60 이하가 편해요.')];
      }
      if (st === 'completed') return [line(name, QUESTS.shelter.doneLines[0]), line(name, QUESTS.shelter.doneLines[1], [{ label: '고마워요', act: 'claim:shelter', primary: true }])];
      return [line(name, '쉼터에서 푹 쉬고 있어요. 목도리는 캡슐 마을 설정에서 둘러 볼 수 있어요.')];
    }
    case 'ribbonIce':
    case 'salguSolar': {
      if (!W.arrived) return [line(ctx.name, '움직인다…! 우리가 만든 빛을 따라가고 있어.')];
      if (npcId === 'ribbonIce') {
        const st = S.quests.song;
        if (st === 'available') return [line(ctx.name, QUESTS.song.lines.join(' '), [{ label: '들어 볼게', act: 'accept:song', primary: true }, { label: '나중에', act: 'close' }])];
        if (st === 'completed') return [line(ctx.name, QUESTS.song.doneLines.join(' '), [{ label: '기억을 받기', act: 'claim:song', primary: true }])];
      }
      return [line(ctx.name, '저기 반짝이는 빛 보여? 여기서만 얻을 수 있는 빛이야. 다 둘러보면 선착장에서 돌아가자.')];
    }
    default:
      return [line(ctx.name ?? '', '…')];
  }
}

/** 선택지를 고른 뒤 이어지는 짧은 반응(같은 목표로 합류하되 안내 방식이 다르다) */
export const BRANCH_LINES = {
  'q02:guide': '따라와! 저기 촉수 다리 앞 첫 등불부터 꺼졌어.',
  'q02:direct': '좋아, 다리 앞 첫 등불에 네 빛을 놓아 줘. 나는 먼저 가 있을게.',
  'q02:together': '같이 가자. 가다 보면 등불들이 어떤 박자로 숨 쉬는지 들릴 거야.',
  'ribbon:why': '해파리는 빛들이 만드는 노래를 따라 헤엄치거든. 한 가지 빛만으로는 노래가 되지 않아.',
  'ribbon:rule': '네 빛의 원본은 그대로야. 나는 복제한 작은 조각만 받아. 교환 전에 무엇을 주고받는지 먼저 보여 줄게.',
};

export const isMainNpc = (id) => ['salgu', 'ribbon', 'bora'].includes(id);
export { atLeast };
