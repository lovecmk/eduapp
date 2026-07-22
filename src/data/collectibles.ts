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
];

export const COLLECTIBLE_BY_ID: Record<string, Collectible> = Object.fromEntries(COLLECTIBLES.map((c) => [c.id, c]));

/** 팩 뽑기 등급 가중치(합 1.0). */
export const DRAW_WEIGHTS: Record<RarityTier, number> = { common: 0.55, rare: 0.3, epic: 0.12, legendary: 0.03 };

/** 한 팩에서 뽑는 카드 수. */
export const PACK_SIZE = 4;
