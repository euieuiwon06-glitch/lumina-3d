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
      if (S.story.guideStep >= 3) return [line(name, '작은 해파리 소식 들었어! 다리 등불도 손님 오는 날처럼 반짝여.')];
      if (S.story.clues.includes('solar')) return [line(name, '태양 정원 꽃, 기억나? 이제 밝은 게 늘 좋은 건 아니란 걸 알겠어.')];
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
        if (!W.budAwake) return [line(name, '봉오리 주변에 반짝이는 곳 세 군데를 살펴봐. 봉오리가 그 빛들에 반응하고 있어.')];
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
      if (S.story.guideStep >= 3) return [line(name, '작은 손님이 품고 온 빛, 나도 모아 두고 싶어. 서로 다른 빛이 만나면 길이 되네.')];
      if (S.story.traceSeen) return [line(name, '다른 해파리의 빛을 봤다고? 빛에는 지나온 곳의 흔적이 남아. 잘 따라가 봐.')];
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
        const T = S.story;
        const rs = S.quests.reply;
        if (rs === 'available') {
          return [
            line(name, '작은 해파리를 데려와 줘서 고마워요.'),
            line(name, QUESTS.reply.lines.join(' '), [{ label: '답장 준비할게요', act: 'accept:reply', primary: true }, { label: '조금 있다가요', act: 'close' }]),
          ];
        }
        if (rs === 'active') return [line(name, S.story.replySent ? '답장이 떠났어요. 멀리서 대답이 오는지 봐요.' : '쉼터엔 은은한 빛, 산책길엔 길잡이 빛, 여기엔 멀리 닿을 신호 빛이에요. 색과 모양은 마음대로요.')];
        if (rs === 'completed') return [line(name, QUESTS.reply.doneLines[0]), line(name, QUESTS.reply.doneLines[1], [{ label: '함께 들어요', act: 'claim:reply', primary: true }])];
        if (rs === 'claimed') return [line(name, '작은 손님은 전망대 곁에서 쉬고 있어요. 이제 가고 싶은 곳으로 자유롭게 항해해요.', [{ label: '항로 보기', act: 'route:open', primary: true }, { label: '다음에', act: 'close' }])];
        if (S.quests.guide === 'active') return [line(name, '두 흔적이 황혼 합류지를 가리켜요. 항해 나무에서 그곳으로 가요.', [{ label: '항로 보기', act: 'route:open', primary: true }, { label: '다음에', act: 'close' }])];
        if (T.traceSeen && T.clues.length > T.shown) {
          return [line(name, '무언가 찾아왔군요?', [{ label: '발견한 흔적 보여 주기', act: 'showClues', primary: true }, { label: '나중에요', act: 'close' }])];
        }
        if (T.traceSeen && T.clues.length >= 2) return [line(name, '두 흔적이 모였어요. 항해 나무에서 함께 엮어 봐요.', [{ label: '항해 나무로 가기', act: 'goto:organ', primary: true }])];
        if (T.traceSeen && T.clues.length === 1) {
          const other = T.clues.includes('solar') ? '얼음 성운' : '태양 정원';
          return [line(name, '여기까진 보이는데, 그다음이 흐리네요.'), line(name, `${other}에 남은 빛도 찾아오면 이어 볼 수 있겠어요.`, [{ label: '항로 보기', act: 'route:open', primary: true }, { label: '다음에', act: 'close' }])];
        }
        if (T.traceSeen) return [line(name, '낯선 빛은 따뜻한 곳과 차가운 곳에 흔적을 남긴 것 같아요. 태양 정원이나 얼음 성운부터 살펴봐요.', [{ label: '항로 보기', act: 'route:open', primary: true }, { label: '다음에', act: 'close' }])];
        return [line(name, '해파리가 다시 헤엄쳐요. 따뜻한 빛은 태양 정원, 차가운 빛은 얼음 성운으로 이어져요.', [{ label: '다시 항해하기', act: 'route:open', primary: true }, { label: '다음에', act: 'close' }])];
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
      if (S.quests.reply === 'active' && !S.slots.replyRest) return [line(name, '답장 자리요? 제 쉼터 곁이라면 눈부시지 않은 빛이 좋겠어요.')];
      if (S.story.guideStep >= 3) return [line(name, '작은 손님이 왔다며요? 쉬어 갈 수 있게 쉼터 빛을 더 은은하게 해 둘게요.')];
      return [line(name, '쉼터에서 푹 쉬고 있어요. 목도리는 캡슐 마을 설정에서 둘러 볼 수 있어요.')];
    }
    case 'ribbonIce':
    case 'salguSolar': {
      if (!W.arrived) return [line(ctx.name, '움직인다…! 우리가 만든 빛을 따라가고 있어.')];
      const T = S.story;
      if (npcId === 'salguSolar' && T.traceSeen) {
        const fs = S.quests.flower;
        if (fs === 'available') {
          return [
            line(ctx.name, QUESTS.flower.lines[0]),
            line(ctx.name, QUESTS.flower.lines[1], [
              { label: '같이 살펴보자', act: 'flower:together', primary: true },
              { label: '이 빛을 써 볼게', act: 'flower:direct' },
            ]),
          ];
        }
        if (fs === 'active') {
          if (!T.flowerTries) return [line(ctx.name, '꽃 앞에서 네 빛을 비춰 봐. 꽃이 어떻게 반응하는지 보자.')];
          if (!T.flowerOpen) return [line(ctx.name, '빛이 강하면 꽃이 몸을 오므려. 밝기를 낮추거나 부드럽게 퍼지는 빛으로 해 봐.')];
          return [line(ctx.name, '열렸어! 꽃 안쪽에 뭔가 반짝여. 가까이서 살펴봐.')];
        }
        if (fs === 'completed') return [line(ctx.name, QUESTS.flower.doneLines[0]), line(ctx.name, QUESTS.flower.doneLines[1], [{ label: '햇살 조각 받기', act: 'claim:flower', primary: true }])];
        if (fs === 'claimed') return [line(ctx.name, T.clues.length >= 2 ? '두 흔적이 모였으면 보라에게 가자!' : '꽃이 열린 채로 있어. 주변 풀도 은은하게 빛나네. 보라에게 이 빛을 보여 주자.')];
      }
      if (npcId === 'ribbonIce' && T.traceSeen) {
        const is = S.quests.icepath;
        if (is === 'available') {
          return [
            line(ctx.name, QUESTS.icepath.lines[0]),
            line(ctx.name, QUESTS.icepath.lines[1], [
              { label: '같이 살펴보자', act: 'icepath:together', primary: true },
              { label: '이 빛을 써 볼게', act: 'icepath:direct' },
            ]),
          ];
        }
        if (is === 'active') {
          if (!S.discovered.includes('iceAurora')) return [line(ctx.name, '먼저 오로라 결정에서 이곳의 빛을 받아 와. 작업대 색에 오로라빛이 생길 거야.')];
          if (T.iceTraces.length < 3) return [line(ctx.name, `민트·하늘·오로라처럼 차가운 빛을 비추면 흔적이 드러나. 지금 ${T.iceTraces.length} / 3.`)];
          return [line(ctx.name, '흔적이 다 이어졌어. 마지막 흔적 앞에서 방향을 읽어 봐.')];
        }
        if (is === 'completed') return [line(ctx.name, QUESTS.icepath.doneLines[0]), line(ctx.name, QUESTS.icepath.doneLines[1], [{ label: '잔상의 기억 받기', act: 'claim:icepath', primary: true }])];
      }
      if (npcId === 'ribbonIce') {
        const st = S.quests.song;
        if (st === 'available') return [line(ctx.name, QUESTS.song.lines.join(' '), [{ label: '들어 볼게', act: 'accept:song', primary: true }, { label: '나중에', act: 'close' }])];
        if (st === 'completed') return [line(ctx.name, QUESTS.song.doneLines.join(' '), [{ label: '기억을 받기', act: 'claim:song', primary: true }])];
        if (S.quests.icepath === 'claimed') return [line(ctx.name, '결정에 남은 흔적이 아직 희미하게 빛나. 이 길 끝에 누가 있을까?')];
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
  'ribbon:why': '해파리는 서로 다른 빛이 모일 때 새 항로를 알아보거든. 한 가지 빛만으로는 길이 드러나지 않아.',
  'flower:together': '같이 가자! 숲 끝 꽃 앞에서 기다릴게.',
  'flower:direct': '좋아. 꽃 앞에서 네 빛을 비춰 봐. 필요하면 그 자리에서 빛을 다시 빚을 수 있어.',
  'icepath:together': '이쪽이야. 첫 흔적 앞까지 같이 가 줄게.',
  'icepath:direct': '오로라 결정의 빛을 받고, 차가운 빛으로 결정 앞을 비춰 봐.',
  'ribbon:rule': '네 빛의 원본은 그대로야. 나는 복제한 작은 조각만 받아. 교환 전에 무엇을 주고받는지 먼저 보여 줄게.',
};

export const isMainNpc = (id) => ['salgu', 'ribbon', 'bora'].includes(id);
export { atLeast };
