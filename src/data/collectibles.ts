// 수집형 안전 카드 카탈로그 — 포켓몬/유희왕st '안전 도감'.
// 학습으로 카드팩을 모아 열고, 등급(희소도)이 높은 카드를 수집하는 재미 요소.
// 등급은 랩드 카드와 동일한 RarityTier 를 공유해 색/연출을 재사용한다.
import type { RarityTier } from '../utils/rarity';

// ── 보석 등급표 ─────────────────────────────────────────────────────────
// 안전 카드 도감의 등급은 '보석'으로 표현한다(낮은 → 높은):
//   사파이어(common) → 에메랄드(rare) → 루비(epic) → 다이아몬드(legendary)
// 내부 로직은 기존 RarityTier(common/rare/epic/legendary)를 그대로 쓰고,
// 도감·팩 연출의 '이름/색'만 이 표를 참조한다(성취 랩드카드 등급과는 별개).
export interface JewelTier {
  /** 보석 등급명 */
  label: string;
  /** 대표 이모지(보석) */
  emoji: string;
  /** 등급 대표색(밝은 톤 — 텍스트/배지용) */
  color: string;
  /** 글로우/테두리색 */
  glow: string;
  /** 테두리 그라데이션 색(2색 이상) */
  colors: string[];
  /** 카드 배경 그라데이션 [진한 위, 더 진한 아래] */
  bg: [string, string];
}

export const JEWEL_META: Record<RarityTier, JewelTier> = {
  common:    { label: '사파이어',   emoji: '🔷', color: '#60A5FA', glow: '#3B82F6', colors: ['#93C5FD', '#3B82F6'], bg: ['#123152', '#0A1E33'] },
  rare:      { label: '에메랄드',   emoji: '💚', color: '#34D399', glow: '#10B981', colors: ['#6EE7B7', '#059669'], bg: ['#0C3D30', '#08241D'] },
  epic:      { label: '루비',       emoji: '🔴', color: '#F87171', glow: '#EF4444', colors: ['#FCA5A5', '#DC2626'], bg: ['#4A1520', '#2C0D14'] },
  legendary: { label: '다이아몬드', emoji: '💎', color: '#67E8F9', glow: '#22D3EE', colors: ['#A5F3FC', '#22D3EE', '#818CF8'], bg: ['#0E4C57', '#083039'] },
};

/** 등급(보석) 오름차순 — 사파이어 → 에메랄드 → 루비 → 다이아몬드. */
export const JEWEL_ORDER: RarityTier[] = ['common', 'rare', 'epic', 'legendary'];

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

  // ── 추가 50장 (사파이어=common) ──────────────────────────────
  { id: 'ear-muff', name: '귀덮개', emoji: '🎧', rarity: 'common', category: '공통', tagline: '소음으로부터 청력을 지킨다', tip: '85dB 이상 소음 작업엔 청력보호구를 꼭 착용해요.', power: 37 },
  { id: 'safety-harness', name: '안전대(하네스)', emoji: '🪢', rarity: 'common', category: '현장 점검', tagline: '높은 곳에서 나를 붙잡아 준다', tip: '2m 이상 고소작업은 안전대 체결이 원칙이에요.', power: 46 },
  { id: 'first-aid', name: '구급함', emoji: '🩹', rarity: 'common', category: '공통', tagline: '작은 부상에 빠르게 대응', tip: '구급함 위치와 사용법은 모두가 알고 있어야 해요.', power: 33 },
  { id: 'eye-wash', name: '세안기', emoji: '🚿', rarity: 'common', category: '공정 위험', tagline: '눈에 튄 화학물질을 즉시 씻어낸다', tip: '화학물질이 눈에 들어가면 15분 이상 흐르는 물로 세척해요.', power: 39 },
  { id: 'rubber-boots', name: '절연장화', emoji: '👢', rarity: 'common', category: '전기 위험', tagline: '발밑의 감전을 막는 장화', tip: '젖은 바닥·전기작업엔 절연장화가 안전해요.', power: 40 },
  { id: 'face-shield', name: '안면보호구', emoji: '🛡️', rarity: 'common', category: '공정 위험', tagline: '얼굴 전체를 비산물로부터 보호', tip: '연삭·절단 작업엔 보안경 위에 안면보호구를 더해요.', power: 38 },
  { id: 'traffic-cone', name: '라바콘', emoji: '🚧', rarity: 'common', category: '현장 점검', tagline: '위험 구역을 한눈에 알린다', tip: '작업 구역은 콘·바리케이드로 확실히 구획해요.', power: 30 },
  { id: 'guardrail', name: '안전난간', emoji: '🚏', rarity: 'common', category: '현장 점검', tagline: '추락을 막는 최전선', tip: '개구부·단부엔 상부난간·중간난간·발끝막이를 설치해요.', power: 43 },
  { id: 'lockout-tag', name: '잠금표찰(LOTO)', emoji: '🏷️', rarity: 'common', category: '전기 위험', tagline: '정비 중 전원 투입을 원천 차단', tip: '정비 전 전원을 끄고 잠금·표찰(LOTO)로 재가동을 막아요.', power: 48 },
  { id: 'spill-kit', name: '유출방지키트', emoji: '🧰', rarity: 'common', category: '위험물', tagline: '누출을 빠르게 흡수·봉쇄', tip: '흡착포·둑재는 누출 지점 가까이 비치해요.', power: 41 },
  { id: 'msds-sheet', name: '물질안전보건자료', emoji: '📄', rarity: 'common', category: '위험물', tagline: '취급 물질의 위험을 알려주는 설명서', tip: 'MSDS는 취급 장소에 비치하고 내용을 숙지해요.', power: 35 },
  { id: 'reflective-vest', name: '반사조끼', emoji: '🦺', rarity: 'common', category: '현장 점검', tagline: '어디서든 작업자를 눈에 띄게', tip: '야간·차량 이동구간에선 반사조끼로 존재를 알려요.', power: 32 },
  { id: 'knee-pad', name: '무릎보호대', emoji: '🦵', rarity: 'common', category: '공통', tagline: '쪼그린 작업에서 무릎을 보호', tip: '반복 굴신 작업엔 보호대로 관절 부담을 줄여요.', power: 31 },
  { id: 'anti-slip-mat', name: '미끄럼방지매트', emoji: '🟨', rarity: 'common', category: '현장 점검', tagline: '넘어짐 사고를 발밑에서 막는다', tip: '물기·유분이 있는 통로엔 미끄럼방지 조치를 해요.', power: 34 },
  { id: 'fire-blanket', name: '방화담요', emoji: '🧣', rarity: 'common', category: '위험물', tagline: '초기 불씨를 덮어 끈다', tip: '유류·조리 화재엔 담요로 덮어 산소를 차단해요.', power: 44 },
  { id: 'smoke-alarm', name: '화재감지기', emoji: '🚨', rarity: 'common', category: '위험물', tagline: '연기를 가장 먼저 알아챈다', tip: '감지기 주변엔 물건을 쌓지 말고 정기 점검해요.', power: 42 },
  { id: 'safety-net', name: '추락방망', emoji: '🕸️', rarity: 'common', category: '현장 점검', tagline: '떨어져도 받아내는 안전망', tip: '방망은 처짐·파손·연결부를 수시로 점검해요.', power: 45 },
  { id: 'hand-lamp', name: '이동등(방수형)', emoji: '🔦', rarity: 'common', category: '전기 위험', tagline: '어두운 밀폐공간을 안전하게 밝힌다', tip: '습한 장소엔 방수·저전압 이동등을 사용해요.', power: 36 },
  { id: 'voltage-tester', name: '검전기', emoji: '🖊️', rarity: 'common', category: '전기 위험', tagline: '전기가 살아있는지 먼저 확인', tip: '작업 전 검전기로 무전압을 반드시 확인해요.', power: 47 },
  { id: 'dust-collector', name: '집진기', emoji: '🌀', rarity: 'common', category: '공정 위험', tagline: '분진을 빨아들여 폭발을 예방', tip: '가연성 분진 집진기는 정전기·퇴적 관리가 중요해요.', power: 43 },
  { id: 'wheel-chock', name: '바퀴굄목', emoji: '🧱', rarity: 'common', category: '현장 점검', tagline: '차량의 갑작스런 밀림을 막는다', tip: '주차·상하차 시엔 굄목으로 차량을 고정해요.', power: 33 },
  { id: 'barrier-tape', name: '접근금지 테이프', emoji: '🚸', rarity: 'common', category: '현장 점검', tagline: '위험 구역을 선으로 알린다', tip: '위험구역은 테이프로 구획하고 출입을 통제해요.', power: 30 },

  // ── 추가 (에메랄드=rare) ──
  { id: 'scba', name: '공기호흡기(SCBA)', emoji: '🤿', rarity: 'rare', category: '위험물', tagline: '유독가스 속에서 숨을 지킨다', tip: '밀폐·유독 환경 진입 전 공기호흡기 잔압을 확인해요.', power: 68 },
  { id: 'gas-mask', name: '방독면', emoji: '😶‍🌫️', rarity: 'rare', category: '위험물', tagline: '유해가스를 정화통으로 걸러낸다', tip: '정화통은 대상 가스·유효기간이 맞는지 확인해요.', power: 60 },
  { id: 'rcd-tester', name: '누전차단기 시험기', emoji: '🧪', rarity: 'rare', category: '전기 위험', tagline: '차단기가 제때 작동하는지 검증', tip: '누전차단기는 월 1회 시험버튼으로 동작을 확인해요.', power: 62 },
  { id: 'thermal-camera', name: '열화상카메라', emoji: '📸', rarity: 'rare', category: '전기 위험', tagline: '보이지 않는 과열을 색으로 본다', tip: '단자 발열은 열화상으로 조기에 찾아낼 수 있어요.', power: 71 },
  { id: 'confined-blower', name: '밀폐공간 송풍기', emoji: '💨', rarity: 'rare', category: '공정 위험', tagline: '갇힌 공기를 신선하게 바꾼다', tip: '밀폐공간은 진입 전·작업 중 계속 환기해요.', power: 64 },
  { id: 'fall-arrester', name: '추락방지장치', emoji: '🧗', rarity: 'rare', category: '현장 점검', tagline: '떨어지는 순간 즉시 붙잡는다', tip: '수직 이동엔 죔줄형 추락방지장치를 연결해요.', power: 66 },
  { id: 'emergency-shower', name: '비상샤워기', emoji: '🚰', rarity: 'rare', category: '공정 위험', tagline: '온몸의 화학물질을 즉시 씻어낸다', tip: '부식성 물질 취급 구역엔 비상샤워를 15초 내 닿게 배치해요.', power: 63 },
  { id: 'explosion-vent', name: '폭발방산구', emoji: '🎇', rarity: 'rare', category: '위험물', tagline: '폭압을 안전한 방향으로 흘려보낸다', tip: '분진·가스 설비의 방산구 앞은 항상 비워둬요.', power: 69 },
  { id: 'flame-arrester', name: '화염방지기', emoji: '🔥', rarity: 'rare', category: '위험물', tagline: '불꽃의 역화를 막아 세운다', tip: '인화성 증기 배관엔 화염방지기를 설치해요.', power: 67 },
  { id: 'insulation-tester', name: '절연저항계', emoji: '📐', rarity: 'rare', category: '전기 위험', tagline: '절연이 살아있는지 측정한다', tip: '절연저항이 기준 이하면 누전·감전 위험이 커져요.', power: 65 },
  { id: 'earth-tester', name: '접지저항계', emoji: '🧭', rarity: 'rare', category: '전기 위험', tagline: '접지가 제 역할을 하는지 확인', tip: '접지저항은 정기적으로 측정·기록해요.', power: 61 },
  { id: 'spill-pallet', name: '방유팬(방액제)', emoji: '🛢️', rarity: 'rare', category: '위험물', tagline: '새어 나온 위험물을 가둬둔다', tip: '드럼 보관 시 용량 이상의 방유팬을 받쳐요.', power: 62 },
  { id: 'safety-interlock', name: '안전 인터록', emoji: '🔒', rarity: 'rare', category: '공정 위험', tagline: '위험할 땐 기계가 스스로 멈춘다', tip: '방호문이 열리면 인터록으로 가동이 정지돼야 해요.', power: 70 },
  { id: 'light-curtain', name: '라이트커튼', emoji: '📶', rarity: 'rare', category: '공정 위험', tagline: '빛의 장막으로 위험구역을 지킨다', tip: '손이 광선을 가리면 프레스가 즉시 멈춰야 해요.', power: 72 },
  { id: 'emergency-stop', name: '비상정지버튼', emoji: '🛑', rarity: 'rare', category: '공정 위험', tagline: '위급할 때 한 번에 멈춘다', tip: '비상정지는 누구나 즉시 누를 수 있어야 해요.', power: 58 },
  { id: 'gas-alarm-panel', name: '가스경보 수신반', emoji: '🖥️', rarity: 'rare', category: '위험물', tagline: '현장의 가스 위험을 한곳에서 감시', tip: '경보 발생 시 대피·차단 절차를 미리 정해둬요.', power: 66 },

  // ── 추가 (루비=epic) ──
  { id: 'arc-flash-suit', name: '아크플래시 방호복', emoji: '🥼', rarity: 'epic', category: '전기 위험', tagline: '섬광과 폭압을 견디는 방패 갑옷', tip: '활선 근접작업은 아크등급에 맞는 방호복이 필수예요.', power: 88 },
  { id: 'hv-bucket-truck', name: '활선작업차', emoji: '🚙', rarity: 'epic', category: '전기 위험', tagline: '전기를 끊지 않고 안전하게 작업', tip: '활선작업은 절연붐·이격거리 확보가 생명이에요.', power: 90 },
  { id: 'foam-system', name: '고정식 포소화설비', emoji: '🫧', rarity: 'epic', category: '위험물', tagline: '유류화재를 거품으로 덮어 끈다', tip: '탱크 유류화재엔 포(foam)로 산소를 차단해요.', power: 86 },
  { id: 'deluge-system', name: '일제살수설비', emoji: '🌧️', rarity: 'epic', category: '위험물', tagline: '위험설비를 한꺼번에 냉각한다', tip: '가연성 설비는 살수로 온도 상승을 막아요.', power: 84 },
  { id: 'hazard-zoning', name: '방폭지역 구분도', emoji: '🗺️', rarity: 'epic', category: '공정 위험', tagline: '폭발위험을 지도로 통제한다', tip: '0·1·2종 구분에 맞는 방폭기기를 선정해요.', power: 87 },
  { id: 'psm-master', name: '공정안전관리(PSM)', emoji: '📋', rarity: 'epic', category: '공정 위험', tagline: '중대재해를 시스템으로 예방한다', tip: 'PSM 12대 요소로 공정 위험을 체계적으로 관리해요.', power: 92 },
  { id: 'permit-to-work', name: '작업허가서 시스템', emoji: '✅', rarity: 'epic', category: '현장 점검', tagline: '위험작업은 허가 없이 시작하지 않는다', tip: '화기·밀폐·고소 작업은 허가서로 위험을 사전 통제해요.', power: 85 },
  { id: 'risk-assessment', name: '위험성평가 마스터', emoji: '🧮', rarity: 'epic', category: '공통', tagline: '위험을 미리 찾아 크기를 매긴다', tip: '빈도×강도로 위험을 평가하고 우선순위로 개선해요.', power: 89 },
  { id: 'safety-plc', name: '안전 PLC(SIL)', emoji: '🔌', rarity: 'epic', category: '공정 위험', tagline: '신뢰도 높은 안전 제어의 두뇌', tip: '안전계장(SIS)은 요구 SIL 등급을 만족해야 해요.', power: 91 },

  // ── 추가 (다이아몬드=legendary) ──
  { id: 'safety-culture', name: '안전문화 챔피언', emoji: '🌟', rarity: 'legendary', category: '공통', tagline: '모두가 안전을 습관으로 만드는 힘', tip: '보고가 자유로운 문화가 사고를 가장 크게 줄여요.', power: 125 },
  { id: 'golden-siren', name: '골든 사이렌', emoji: '📣', rarity: 'legendary', category: '공통', tagline: '무재해를 지켜온 전설의 경보', tip: '아차사고도 신고하면 큰 사고를 미리 막을 수 있어요.', power: 128 },
  { id: 'guardian-angel', name: '세이프티 가디언 엔젤', emoji: '👼', rarity: 'legendary', category: '공통', tagline: '모든 작업자의 곁을 지키는 수호천사', tip: '동료를 한 번 더 살피는 마음이 최고의 안전장치예요.', power: 135 },

  // ── 확장 도감(150종) 추가 · 사파이어(common) ────────────────────────
  { id: 'weld-mask', name: '용접면', emoji: '🪖', rarity: 'common', category: '공정 위험', tagline: '불꽃과 강한 빛에서 눈·얼굴을 지킨다', tip: '용접 작업엔 차광번호가 맞는 용접면을 써요.', power: 41 },
  { id: 'respirator-half', name: '반면형 호흡기', emoji: '🫁', rarity: 'common', category: '위험물', tagline: '유해 증기를 정화통으로 걸러 마신다', tip: '정화통의 대상가스·유효기간을 꼭 확인해요.', power: 43 },
  { id: 'chem-apron', name: '내화학 앞치마', emoji: '🧴', rarity: 'common', category: '위험물', tagline: '화학물질 튐을 막는 앞치마', tip: '부식성 물질 취급 시 앞치마·장갑·보안경을 함께 써요.', power: 38 },
  { id: 'cut-glove', name: '방검장갑', emoji: '✋', rarity: 'common', category: '공통', tagline: '날붙이에 베이지 않게 손을 보호', tip: '칼·유리 취급엔 절단저항 등급이 맞는 장갑을 껴요.', power: 37 },
  { id: 'anti-vib-glove', name: '방진장갑', emoji: '🖐️', rarity: 'common', category: '공통', tagline: '진동공구의 손 저림을 줄인다', tip: '진동공구 장시간 사용은 휴식과 방진장갑으로 완화해요.', power: 34 },
  { id: 'safety-belt-u', name: '안전벨트(U자걸이)', emoji: '🧷', rarity: 'common', category: '현장 점검', tagline: '기둥에 몸을 고정해 추락을 막는다', tip: '이동 시에도 두 개의 고리로 끊김 없이 체결해요.', power: 40 },
  { id: 'hat-liner', name: '안전모 속모', emoji: '🧢', rarity: 'common', category: '공통', tagline: '겨울 현장에서 체온을 지킨다', tip: '방한용품도 안전모 착용에 방해되지 않아야 해요.', power: 30 },
  { id: 'sunscreen', name: '자외선 차단제', emoji: '☀️', rarity: 'common', category: '공통', tagline: '여름 옥외작업의 화상·피로를 막는다', tip: '폭염기엔 그늘·수분·휴식으로 온열질환을 예방해요.', power: 31 },
  { id: 'ice-station', name: '제빙기·냉수대', emoji: '🧊', rarity: 'common', category: '공통', tagline: '폭염기 수분 보충의 오아시스', tip: '더운 날은 목마르기 전에 물을 자주 마셔요.', power: 32 },
  { id: 'wbgt-meter', name: '온열지수계(WBGT)', emoji: '🌡️', rarity: 'common', category: '현장 점검', tagline: '폭염 위험을 숫자로 관리한다', tip: '폭염특보 땐 작업·휴식 시간을 지수에 맞춰 조정해요.', power: 44 },
  { id: 'tool-lanyard', name: '공구 낙하방지끈', emoji: '🪝', rarity: 'common', category: '현장 점검', tagline: '떨어지는 공구로부터 아래를 지킨다', tip: '고소작업 공구엔 낙하방지끈을 걸어요.', power: 42 },
  { id: 'toe-board', name: '발끝막이', emoji: '🪵', rarity: 'common', category: '현장 점검', tagline: '개구부에서 물건이 굴러떨어지지 않게', tip: '난간엔 발끝막이를 더해 낙하물을 막아요.', power: 33 },
  { id: 'cable-cover', name: '케이블 보호덮개', emoji: '🔩', rarity: 'common', category: '전기 위험', tagline: '통로의 전선을 밟힘·손상에서 지킨다', tip: '바닥 배선은 덮개로 보호하고 걸림을 없애요.', power: 32 },
  { id: 'mccb', name: '배선용차단기(MCCB)', emoji: '🔲', rarity: 'common', category: '전기 위험', tagline: '과부하·단락을 끊어 화재를 막는다', tip: 'MCCB는 과전류 보호, ELB는 감전 보호가 주 목적이에요.', power: 46 },
  { id: 'fuse', name: '퓨즈', emoji: '🧨', rarity: 'common', category: '전기 위험', tagline: '과전류를 스스로 끊는 작은 방패', tip: '퓨즈는 정격에 맞는 것으로만 교체해요.', power: 39 },
  { id: 'spd', name: '서지보호기(SPD)', emoji: '🌩️', rarity: 'common', category: '전기 위험', tagline: '낙뢰 과전압에서 기기를 지킨다', tip: '통신·전원선에 SPD를 달아 서지를 흘려보내요.', power: 41 },
  { id: 'insul-mat', name: '절연매트', emoji: '🟦', rarity: 'common', category: '전기 위험', tagline: '배전반 앞 감전 위험을 낮춘다', tip: '고압반 앞바닥엔 절연매트를 깔아요.', power: 40 },
  { id: 'beacon-light', name: '경광등', emoji: '🟠', rarity: 'common', category: '현장 점검', tagline: '회전하는 빛으로 위험을 알린다', tip: '중장비 이동구간엔 경광등으로 존재를 알려요.', power: 33 },
  { id: 'cone-chain', name: '콘 체인바', emoji: '⛓️', rarity: 'common', category: '현장 점검', tagline: '라바콘을 이어 출입을 통제한다', tip: '위험구역은 콘·체인으로 확실히 구획해요.', power: 30 },
  { id: 'spill-berm', name: '방유둑', emoji: '🛢️', rarity: 'common', category: '위험물', tagline: '새어나온 기름이 퍼지지 않게 막는다', tip: '저장탱크 둘레엔 방유제로 유출을 가둬요.', power: 43 },
  { id: 'drip-tray', name: '드립트레이', emoji: '🍽️', rarity: 'common', category: '위험물', tagline: '소량의 누유를 받아내는 받침', tip: '기계 하부 누유는 드립트레이로 바닥 오염을 막아요.', power: 34 },
  { id: 'absorbent-pad', name: '흡착포', emoji: '🧻', rarity: 'common', category: '위험물', tagline: '기름·화학물질을 빠르게 빨아들인다', tip: '누출 초기엔 흡착포로 확산을 먼저 막아요.', power: 36 },
  { id: 'safety-can', name: '안전캔', emoji: '🥫', rarity: 'common', category: '위험물', tagline: '인화성 액체를 새지 않게 담는다', tip: '유증기 누출을 막는 안전캔에 보관·운반해요.', power: 42 },
  { id: 'local-exhaust', name: '국소배기장치', emoji: '🌬️', rarity: 'common', category: '공정 위험', tagline: '유해가스를 발생원에서 바로 뽑아낸다', tip: '후드를 발생원 가까이 두면 포집 효율이 높아요.', power: 45 },
  { id: 'air-horn', name: '비상 경적', emoji: '📯', rarity: 'common', category: '공통', tagline: '위급 상황을 소리로 즉시 알린다', tip: '대피 신호는 모두가 아는 소리로 정해둬요.', power: 31 },
  { id: 'whistle', name: '호루라기', emoji: '🔔', rarity: 'common', category: '공통', tagline: '짧은 신호로 동료에게 위험을 알린다', tip: '신호수·감시자는 호루라기로 즉시 소통해요.', power: 30 },
  { id: 'headlamp', name: '헤드랜턴', emoji: '🔦', rarity: 'common', category: '전기 위험', tagline: '두 손 자유롭게 어두운 곳을 밝힌다', tip: '어두운 곳 작업은 헤드랜턴으로 양손을 확보해요.', power: 34 },
  { id: 'rescue-tripod', name: '밀폐공간 삼각대', emoji: '🔺', rarity: 'common', category: '현장 점검', tagline: '맨홀에서 작업자를 끌어올리는 구조대', tip: '밀폐공간 진입 땐 구조용 삼각대·윈치를 갖춰요.', power: 47 },
  { id: 'lifeline-h', name: '수평 구명줄', emoji: '🪢', rarity: 'common', category: '현장 점검', tagline: '이동 중에도 추락을 잡아주는 생명줄', tip: '긴 이동구간엔 수평구명줄에 죔줄을 걸고 다녀요.', power: 45 },
  { id: 'anti-fog', name: '김서림 방지제', emoji: '💧', rarity: 'common', category: '공통', tagline: '보안경 시야를 맑게 지킨다', tip: '김서림은 시야를 가려 사고로 이어질 수 있어요.', power: 30 },
  { id: 'hand-sanitizer', name: '손소독제', emoji: '🧼', rarity: 'common', category: '공통', tagline: '현장 위생으로 감염을 예방', tip: '식사·교대 전 손 위생으로 건강을 지켜요.', power: 30 },
  { id: 'manual-call', name: '수동발신기', emoji: '🔴', rarity: 'common', category: '위험물', tagline: '화재를 손으로 눌러 즉시 알린다', tip: '발신기 위치를 미리 익혀두면 초기 대응이 빨라요.', power: 38 },
  { id: 'exit-guide', name: '피난구 유도등', emoji: '🟢', rarity: 'common', category: '현장 점검', tagline: '연기 속에서도 대피로를 밝힌다', tip: '유도등 앞은 물건으로 가리지 않아요.', power: 40 },
  { id: 'emergency-lamp', name: '비상조명등', emoji: '🏮', rarity: 'common', category: '전기 위험', tagline: '정전 시 자동으로 켜지는 조명', tip: '비상조명 점검으로 정전 시 대피로를 확보해요.', power: 41 },
  { id: 'fire-damper', name: '방화댐퍼', emoji: '🚪', rarity: 'common', category: '위험물', tagline: '덕트로 번지는 불길을 자동 차단', tip: '방화구획을 지나는 덕트엔 방화댐퍼가 필요해요.', power: 44 },
  { id: 'sand-bucket', name: '소화용 모래함', emoji: '🪣', rarity: 'common', category: '위험물', tagline: '기름·금속 화재 초기 진화용 모래', tip: '유류·금속화재엔 물 대신 마른 모래가 안전해요.', power: 35 },
  { id: 'co-detector', name: '일산화탄소 경보기', emoji: '🟡', rarity: 'common', category: '위험물', tagline: '무색무취 일산화탄소를 감지한다', tip: '연소기구·밀폐공간엔 CO 경보기를 설치해요.', power: 44 },
  { id: 'o2-meter', name: '산소농도측정기', emoji: '🅾️', rarity: 'common', category: '공정 위험', tagline: '밀폐공간의 산소 결핍·과잉을 확인', tip: '진입 전 산소농도 18~23.5%를 확인해요.', power: 46 },
  { id: 'noise-meter', name: '소음측정기', emoji: '🔊', rarity: 'common', category: '공정 위험', tagline: '귀에 해로운 소음 수준을 측정한다', tip: '85dB 이상 구역은 청력보호구 착용을 관리해요.', power: 39 },
  { id: 'ladder-safe', name: '안전 사다리', emoji: '🪜', rarity: 'common', category: '현장 점검', tagline: '오르내림의 기본을 안전하게', tip: '사다리는 4:1 각도로 세우고 최상단 2단은 딛지 않아요.', power: 36 },

  // ── 확장 도감 · 에메랄드(rare) ──────────────────────────────────────
  { id: 'afci', name: '아크결함 차단기(AFCI)', emoji: '⚡', rarity: 'rare', category: '전기 위험', tagline: '전기 아크를 감지해 화재를 막는다', tip: '노후 배선의 아크는 AFCI로 조기에 차단해요.', power: 66 },
  { id: 'leak-relay', name: '누전경보기', emoji: '🚨', rarity: 'rare', category: '전기 위험', tagline: '누설전류를 감시해 미리 경보한다', tip: '경보가 울리면 원인 회로를 찾아 정비해요.', power: 62 },
  { id: 'iot-gas', name: 'IoT 가스센서', emoji: '📡', rarity: 'rare', category: '위험물', tagline: '현장 가스를 실시간 원격 감시', tip: '무선 센서로 사각지대 가스도 상시 감시해요.', power: 65 },
  { id: 'multi-gas', name: '복합가스측정기', emoji: '🎛️', rarity: 'rare', category: '위험물', tagline: '산소·가연성·유독가스를 한 번에', tip: '밀폐공간은 4종 가스를 동시에 측정해요.', power: 70 },
  { id: 'ir-thermo', name: '비접촉 온도계', emoji: '🌡️', rarity: 'rare', category: '공정 위험', tagline: '설비 표면 과열을 안전하게 측정', tip: '뜨거운 설비는 비접촉으로 온도를 확인해요.', power: 60 },
  { id: 'vib-analyzer', name: '진동분석기', emoji: '📈', rarity: 'rare', category: '공정 위험', tagline: '설비 이상을 진동으로 미리 진단', tip: '베어링 결함은 진동 신호로 조기에 잡아내요.', power: 63 },
  { id: 'ultrasonic-leak', name: '초음파 누설탐지기', emoji: '🎧', rarity: 'rare', category: '위험물', tagline: '귀에 안 들리는 가스 누설을 찾는다', tip: '압축가스 배관 누설은 초음파로 탐지해요.', power: 64 },
  { id: 'clamp-meter', name: '클램프미터', emoji: '🗜️', rarity: 'rare', category: '전기 위험', tagline: '전선을 끊지 않고 전류를 측정', tip: '통전 상태 전류 측정은 클램프미터로 안전하게 해요.', power: 61 },
  { id: 'loto-station', name: '다중잠금 스테이션(LOTO)', emoji: '🔐', rarity: 'rare', category: '전기 위험', tagline: '여러 정비원이 함께 잠그는 다중잠금', tip: '작업자 각자가 자기 자물쇠로 잠가 재가동을 막아요.', power: 68 },
  { id: 'safety-mat', name: '안전매트(감압)', emoji: '🟩', rarity: 'rare', category: '공정 위험', tagline: '밟으면 기계를 멈추는 압력매트', tip: '위험구역 바닥 매트로 접근 시 정지시켜요.', power: 66 },
  { id: 'two-hand', name: '양수조작반', emoji: '🎮', rarity: 'rare', category: '공정 위험', tagline: '두 손을 써야만 작동해 끼임을 막는다', tip: '프레스는 양손 조작으로 손 끼임을 원천 차단해요.', power: 67 },
  { id: 'area-scanner', name: '안전 레이저스캐너', emoji: '🛰️', rarity: 'rare', category: '공정 위험', tagline: '작업영역 침입을 감지해 감속·정지', tip: '로봇 셀 진입은 스캐너로 감지해 속도를 줄여요.', power: 71 },
  { id: 'machine-guard', name: '방호덮개', emoji: '🛡️', rarity: 'rare', category: '공정 위험', tagline: '회전부·날에 손이 닿지 않게 덮는다', tip: '동력전달부는 방호덮개 없이 운전하지 않아요.', power: 60 },
  { id: 'rops', name: '전도방지 롤바(ROPS)', emoji: '🚜', rarity: 'rare', category: '현장 점검', tagline: '장비 전복 시 운전자를 지킨다', tip: '건설장비는 ROPS와 안전벨트를 함께 갖춰요.', power: 69 },
  { id: 'outrigger-pad', name: '아웃트리거 받침', emoji: '🟫', rarity: 'rare', category: '현장 점검', tagline: '크레인 전도를 막는 지지 받침', tip: '지반이 약하면 받침을 넓혀 침하를 막아요.', power: 63 },
  { id: 'anemometer', name: '풍속계', emoji: '🌪️', rarity: 'rare', category: '현장 점검', tagline: '강풍 시 고소·크레인 작업 중지 판단', tip: '순간풍속 기준을 넘으면 고소작업을 중지해요.', power: 62 },
  { id: 'gas-shutoff', name: '긴급 가스차단밸브', emoji: '🔧', rarity: 'rare', category: '위험물', tagline: '누출 시 가스를 즉시 차단한다', tip: '비상차단밸브 위치와 조작법을 미리 익혀둬요.', power: 68 },
  { id: 'foam-extinguisher', name: '포소화기', emoji: '🧴', rarity: 'rare', category: '위험물', tagline: '유류화재를 거품으로 덮어 끈다', tip: '유류화재엔 포로 표면을 덮어 산소를 차단해요.', power: 64 },
  { id: 'co2-extinguisher', name: 'CO₂ 소화기', emoji: '💨', rarity: 'rare', category: '위험물', tagline: '전기·정밀기기 화재에 잔여물 없이', tip: '전기화재엔 잔여물 없는 CO₂ 소화기가 좋아요.', power: 65 },
  { id: 'sprinkler', name: '스프링클러 헤드', emoji: '💦', rarity: 'rare', category: '위험물', tagline: '열을 감지해 자동으로 물을 뿌린다', tip: '스프링클러 헤드 주변엔 살수를 막는 물건을 두지 않아요.', power: 66 },
  { id: 'fire-pump', name: '소화펌프', emoji: '⛲', rarity: 'rare', category: '위험물', tagline: '소화수를 힘차게 밀어 올리는 심장', tip: '소화펌프는 정기 기동시험으로 상태를 확인해요.', power: 67 },
  { id: 'escape-respirator', name: '긴급대피용 호흡기', emoji: '🎒', rarity: 'rare', category: '위험물', tagline: '연기 속 탈출을 돕는 비상 호흡기', tip: '유독가스 취급 구역엔 대피용 호흡기를 비치해요.', power: 63 },
  { id: 'wearable-gas', name: '착용형 가스경보기', emoji: '⌚', rarity: 'rare', category: '위험물', tagline: '몸에 지녀 실시간 위험을 알린다', tip: '개인 가스경보기는 호흡기 높이에 착용해요.', power: 61 },
  { id: 'gfci-outlet', name: '누전 콘센트(GFCI)', emoji: '🔌', rarity: 'rare', category: '전기 위험', tagline: '물기 있는 곳의 감전을 막는 콘센트', tip: '욕실·옥외 콘센트는 누전차단형을 써요.', power: 60 },
  { id: 'hv-glove', name: '고압 절연장갑', emoji: '🧤', rarity: 'rare', category: '전기 위험', tagline: '고압 활선에서 손을 지키는 특수장갑', tip: '전압 등급에 맞는 절연장갑을 시험 후 사용해요.', power: 70 },
  { id: 'grounding-rod', name: '접지봉', emoji: '⚓', rarity: 'rare', category: '전기 위험', tagline: '대지로 전류를 안전하게 흘려보낸다', tip: '접지봉은 충분한 깊이로 박아 저항을 낮춰요.', power: 62 },
  { id: 'permit-board', name: '작업허가 관리판', emoji: '🗂️', rarity: 'rare', category: '현장 점검', tagline: '누가 어떤 위험작업 중인지 한눈에', tip: '허가작업은 관리판으로 현황을 공유해요.', power: 64 },

  // ── 확장 도감 · 루비(epic) ─────────────────────────────────────────
  { id: 'gas-suppression', name: '가스계 소화설비', emoji: '🧯', rarity: 'epic', category: '위험물', tagline: '전산실을 청정가스로 지키는 최후 방어', tip: '가스계 소화는 방출 전 대피 경보가 먼저 울려야 해요.', power: 88 },
  { id: 'water-mist', name: '미분무 소화설비', emoji: '💦', rarity: 'epic', category: '위험물', tagline: '미세 물안개로 유류·전기화재를 제압', tip: '적은 물로도 냉각·질식 효과를 내요.', power: 87 },
  { id: 'fixed-gas-detection', name: '고정식 가스검지 시스템', emoji: '🛰️', rarity: 'epic', category: '위험물', tagline: '플랜트 전역 가스를 24시간 감시', tip: '검지기 배치는 가스 비중·바람을 고려해요.', power: 90 },
  { id: 'flare-stack', name: '플레어스택', emoji: '🔥', rarity: 'epic', category: '위험물', tagline: '잉여 가스를 안전하게 태워 방출', tip: '비상 방출 가스는 플레어로 안전하게 연소시켜요.', power: 86 },
  { id: 'relief-valve', name: '안전밸브(PSV)', emoji: '🎚️', rarity: 'epic', category: '공정 위험', tagline: '과압을 스스로 열어 폭발을 막는다', tip: '안전밸브는 주기적으로 분해·정정해 작동을 보증해요.', power: 89 },
  { id: 'rupture-disc', name: '파열판', emoji: '💥', rarity: 'epic', category: '공정 위험', tagline: '설정 압력에서 터져 과압을 즉시 방출', tip: '파열판은 순간 과압 방출용으로 안전밸브와 함께 써요.', power: 85 },
  { id: 'esd-system', name: '비상정지 시스템(ESD)', emoji: '🛑', rarity: 'epic', category: '공정 위험', tagline: '위험 감지 시 공정을 안전정지', tip: 'ESD는 위험을 감지하면 설비를 안전상태로 만들어요.', power: 92 },
  { id: 'fng-system', name: '화재·가스 감지시스템(F&G)', emoji: '🖥️', rarity: 'epic', category: '공정 위험', tagline: '화재·가스를 통합 감시·대응', tip: 'F&G는 감지-경보-소화·차단을 하나로 묶어요.', power: 91 },
  { id: 'lightning-protection', name: '피뢰 시스템', emoji: '🌩️', rarity: 'epic', category: '전기 위험', tagline: '낙뢰를 안전하게 대지로 유도', tip: '피뢰침·접지·본딩이 함께 있어야 낙뢰를 막아요.', power: 86 },
  { id: 'substation-guardian', name: '변전 안전 관리자', emoji: '🏭', rarity: 'epic', category: '전기 위험', tagline: '고압 설비의 무정전·무재해를 지킨다', tip: '고압 작업은 정전·검전·접지 3단계를 지켜요.', power: 90 },
  { id: 'crane-safe-load', name: '크레인 하중관리 시스템', emoji: '🏗️', rarity: 'epic', category: '현장 점검', tagline: '과부하를 막아 전도·낙하를 예방', tip: '정격하중을 넘기지 않도록 모멘트를 관리해요.', power: 88 },
  { id: 'confined-master', name: '밀폐공간 작업 지휘자', emoji: '🕳️', rarity: 'epic', category: '현장 점검', tagline: '환기·감시·구조 절차를 통솔한다', tip: '밀폐공간은 감시인 배치와 구조계획이 필수예요.', power: 89 },

  // ── 확장 도감 · 다이아몬드(legendary) ──────────────────────────────
  { id: 'safety-guardian-ai', name: '세이프티 가디언 AI', emoji: '🤖', rarity: 'legendary', category: '공통', tagline: '현장 위험을 예측해 미리 경고하는 지능', tip: '데이터로 위험을 예측하면 사고 전에 손쓸 수 있어요.', power: 132 },
  { id: 'national-safety-award', name: '대한민국 안전 대상', emoji: '🎖️', rarity: 'legendary', category: '공통', tagline: '무재해를 증명하는 최고의 영예', tip: '꾸준한 안전활동이 모여 최고의 명예가 돼요.', power: 130 },
  { id: 'legendary-mentor', name: '안전 명장', emoji: '🧑‍🏫', rarity: 'legendary', category: '공통', tagline: '수많은 이를 무사히 이끈 살아있는 스승', tip: '경험을 나누는 멘토가 현장을 가장 크게 바꿔요.', power: 134 },
];

export const COLLECTIBLE_BY_ID: Record<string, Collectible> = Object.fromEntries(COLLECTIBLES.map((c) => [c.id, c]));

/** 팩 뽑기 등급 가중치(합 1.0). */
export const DRAW_WEIGHTS: Record<RarityTier, number> = { common: 0.55, rare: 0.3, epic: 0.12, legendary: 0.03 };

/** 한 팩에서 뽑는 카드 수. */
export const PACK_SIZE = 4;
