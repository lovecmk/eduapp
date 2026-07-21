// 수집형 안전 카드 카탈로그 — 포켓몬/유희왕st '안전 도감'.
// 학습으로 카드팩을 모아 열고, 등급(희소도)이 높은 카드를 수집하는 재미 요소.
// 등급은 랩드 카드와 동일한 RarityTier 를 공유해 색/연출을 재사용한다.
import type { RarityTier } from '../utils/rarity';

export type CollectibleCategory = '전기 위험' | '공정 위험' | '위험물' | '현장 점검' | '공통';

export interface Collectible {
  id: string;
  /** 카드 이름 */
  name: string;
  /** 대표 아트(이모지) */
  emoji: string;
  rarity: RarityTier;
  category: CollectibleCategory;
  /** 한 줄 소개(플레이버) */
  tagline: string;
  /** 카드에 박힌 안전 상식 한 줄(교육 요소) */
  tip: string;
  /** 재미용 스탯(유희왕st) — 안전지수 */
  power: number;
}

export const COLLECTIBLES: Collectible[] = [
  // ── COMMON ──
  { id: 'safety-helmet', name: '안전모', emoji: '⛑️', rarity: 'common', category: '공통', tagline: '머리를 지키는 첫 번째 방패', tip: '턱끈을 조여야 충격 시 벗겨지지 않아요.', power: 40 },
  { id: 'extinguisher', name: '소화기', emoji: '🧯', rarity: 'common', category: '위험물', tagline: '초기 진화의 든든한 친구', tip: '분말소화기는 1년에 한 번 압력계를 확인하세요.', power: 45 },
  { id: 'insul-glove', name: '절연장갑', emoji: '🧤', rarity: 'common', category: '전기 위험', tagline: '감전을 막는 손의 갑옷', tip: '사용 전 공기주입 테스트로 구멍을 확인해요.', power: 42 },
  { id: 'safety-shoes', name: '안전화', emoji: '🥾', rarity: 'common', category: '공통', tagline: '발끝까지 안전하게', tip: '정전기 위험장소에선 정전화를 신어야 해요.', power: 38 },
  { id: 'goggles', name: '보안경', emoji: '🥽', rarity: 'common', category: '공정 위험', tagline: '눈을 지키는 투명 방패', tip: '분진·비산물 작업엔 밀착형 고글이 안전해요.', power: 36 },
  { id: 'warning-sign', name: '경고표지', emoji: '⚠️', rarity: 'common', category: '현장 점검', tagline: '위험을 미리 알리는 눈', tip: '표지는 잘 보이는 높이·위치에 부착해야 효과가 있어요.', power: 34 },
  { id: 'dust-mask', name: '방진마스크', emoji: '😷', rarity: 'common', category: '공정 위험', tagline: '보이지 않는 분진을 막는다', tip: '가연성 분진은 폐 손상뿐 아니라 분진폭발도 일으켜요.', power: 41 },
  { id: 'ground-wire', name: '접지선', emoji: '🔌', rarity: 'common', category: '전기 위험', tagline: '전류의 안전한 탈출로', tip: '접지 저항이 낮아야 누설전류를 잘 흘려보내요.', power: 44 },

  // ── RARE ──
  { id: 'elb', name: '누전차단기', emoji: '🛡️', rarity: 'rare', category: '전기 위험', tagline: '한순간의 누전을 끊어내는 수호자', tip: 'ELB는 감전 보호, MCCB는 과부하 보호가 주 목적이에요.', power: 66 },
  { id: 'ex-lamp', name: '방폭등', emoji: '💡', rarity: 'rare', category: '위험물', tagline: '폭발위험장소를 밝히는 빛', tip: '방폭구조 등급(Ex d, Ex e…)이 장소에 맞아야 해요.', power: 70 },
  { id: 'gas-detector', name: '가스검지기', emoji: '📟', rarity: 'rare', category: '위험물', tagline: '보이지 않는 위험을 감지', tip: '밀폐공간 진입 전 산소·가연성가스를 먼저 측정해요.', power: 72 },
  { id: 'ground-clamp', name: '접지 클램프', emoji: '🔗', rarity: 'rare', category: '전기 위험', tagline: '정전기를 붙잡는 집게', tip: '인화성 액체 이송 시 본딩·접지로 정전기를 없애요.', power: 64 },
  { id: 'hydrant', name: '옥내소화전', emoji: '🚰', rarity: 'rare', category: '위험물', tagline: '현장을 지키는 물의 방어선', tip: '호스 접힘·밸브 잠김이 없는지 정기 점검이 필요해요.', power: 68 },

  // ── EPIC ──
  { id: 'arc-guardian', name: '아크플래시 가디언', emoji: '⚡', rarity: 'epic', category: '전기 위험', tagline: '섬광과 폭압으로부터 작업자를 지킨다', tip: '활선 근접작업은 아크플래시 방호복과 절연공구가 필수예요.', power: 88 },
  { id: 'hazmat-officer', name: '위험물 관리관', emoji: '☢️', rarity: 'epic', category: '위험물', tagline: '위험물의 저장·취급을 통솔하는 전문가', tip: '지정수량 이상은 허가·안전거리·방유제 기준을 지켜야 해요.', power: 90 },
  { id: 'ex-specialist', name: '방폭 스페셜리스트', emoji: '🧪', rarity: 'epic', category: '공정 위험', tagline: '폭발위험장소를 설계로 제압한다', tip: '분류(0·1·2종)에 맞는 방폭기기 선정이 폭발을 막아요.', power: 86 },

  // ── LEGENDARY ──
  { id: 'zero-accident', name: '무재해 레전드', emoji: '🏆', rarity: 'legendary', category: '공통', tagline: '무재해 기록을 이어온 살아있는 전설', tip: '작은 습관(정리·점검·보고)이 무재해를 만들어요.', power: 120 },
  { id: 'kfpa-safeguard', name: 'KFPA 세이프가디언', emoji: '🦸', rarity: 'legendary', category: '공통', tagline: '모든 현장의 안전을 수호하는 최후의 방패', tip: '위험은 예방이 최선 — 오늘의 점검이 내일의 안전이에요.', power: 130 },
];

export const COLLECTIBLE_BY_ID: Record<string, Collectible> = Object.fromEntries(COLLECTIBLES.map((c) => [c.id, c]));

/** 팩 뽑기 등급 가중치(합 1.0). */
export const DRAW_WEIGHTS: Record<RarityTier, number> = { common: 0.55, rare: 0.3, epic: 0.12, legendary: 0.03 };

/** 한 팩에서 뽑는 카드 수. */
export const PACK_SIZE = 4;
