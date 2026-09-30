import type { Ionicons } from '@expo/vector-icons';
import { APP_NAME } from './brand';

/**
 * 법적 고지 콘텐츠 단일 소스 — 설정 최하단 '약관 · 법적 고지'(/legal) 화면이 이 파일만 읽는다.
 *
 * 이 앱은 **회사 내부 구성원 대상 사내 학습 서비스**다(외부 일반 이용자 대상 서비스가 아님).
 * 따라서 전자상거래법상 통신판매 관련 고지·청약철회 같은 항목 대신,
 *  · 개인정보 보호법(수집·이용, 보유·파기, 위탁, 정보주체 권리)
 *  · 정보통신망법(앱 접근권한 고지·광고성 정보 수신 동의)
 *  · 오픈소스 라이선스 고지
 *  · 사내 정보보안·저작권 준수
 * 를 중심으로 구성했다.
 *
 * ⚠️ 운영 주체·연락처·보유기간 등 아래 `LEGAL_META` 값은 배포 전 법무/정보보호 담당자의
 *    확인을 받아 실제 값으로 확정해야 한다. 문구를 화면에 하드코딩하지 말고 여기만 고친다.
 */

export const LEGAL_META = {
  /** 서비스를 운영하는 조직. */
  operator: '한국화재보험협회(KFPA)',
  /** 서비스 운영 부서. */
  department: '안전점검 교육 운영 담당 부서',
  /** 개인정보 보호책임자(직위/부서로 표기 — 개인 신상 대신 역할로 고지). */
  privacyOfficer: '개인정보 보호책임자 (정보보호 담당 부서)',
  /** 문의 채널 — 앱 내 고객센터가 1차 창구다. */
  contactChannel: '앱 내 [설정 › 지원 › 고객센터 문의]',
  /** 문서 최종 개정일. 내용이 바뀌면 반드시 함께 갱신한다. */
  revisedAt: '2026년 7월 25일',
  /** 시행일. */
  effectiveAt: '2026년 7월 25일',
} as const;

export type LegalBlock =
  | { kind: 'p'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'rows'; rows: { k: string; v: string }[] }
  | { kind: 'note'; text: string };

export interface LegalSection {
  /** 설정 검색 색인(SETTINGS_INDEX)의 id 와 반드시 일치시킨다. */
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  summary: string;
  blocks: LegalBlock[];
}

export const LEGAL_SECTIONS: LegalSection[] = [
  // ── 운영 주체 ────────────────────────────────────────────────────────
  {
    id: 'operator',
    title: '서비스 운영 주체 · 문의처',
    icon: 'information-circle-outline',
    summary: '누가 운영하고, 어디로 문의하면 되는지',
    blocks: [
      {
        kind: 'p',
        text: `${APP_NAME}은(는) ${LEGAL_META.operator}가 소속 구성원의 안전점검 역량 향상을 위해 운영하는 사내 학습 서비스입니다. 일반 대중에게 제공되는 상용 서비스가 아니며, 부여받은 계정으로만 이용할 수 있습니다.`,
      },
      {
        kind: 'rows',
        rows: [
          { k: '운영 주체', v: LEGAL_META.operator },
          { k: '운영 부서', v: LEGAL_META.department },
          { k: '개인정보 보호책임자', v: LEGAL_META.privacyOfficer },
          { k: '문의 창구', v: LEGAL_META.contactChannel },
          { k: '시행일', v: LEGAL_META.effectiveAt },
          { k: '최종 개정일', v: LEGAL_META.revisedAt },
        ],
      },
      {
        kind: 'note',
        text: '약관·처리방침이 바뀌면 앱 공지와 업데이트 내역으로 사전에 알려드립니다.',
      },
    ],
  },

  // ── 이용약관 ─────────────────────────────────────────────────────────
  {
    id: 'terms',
    title: '서비스 이용약관',
    icon: 'document-text-outline',
    summary: '사내 학습 서비스 이용 조건과 이용자의 책임',
    blocks: [
      { kind: 'p', text: '제1조 (목적) 이 약관은 사내 학습 서비스의 이용 조건과 절차, 이용자와 운영 부서의 권리·의무를 정합니다.' },
      { kind: 'p', text: '제2조 (이용 자격) 서비스는 운영 부서가 계정을 부여한 임직원 및 관계 인력만 이용할 수 있습니다. 계정은 본인만 사용해야 하며 타인에게 공유·양도할 수 없습니다.' },
      { kind: 'p', text: '제3조 (서비스 내용) 학습 카드 제공, 복습(간격 반복) 일정 관리, 학습 통계·성취 기록, 공지 및 알림 발송을 제공합니다. 운영상 필요 시 기능은 추가·변경·중단될 수 있습니다.' },
      { kind: 'p', text: '제4조 (이용자의 의무) 이용자는 다음 행위를 해서는 안 됩니다.' },
      {
        kind: 'bullets',
        items: [
          '타인의 계정을 사용하거나 자신의 계정을 대여·양도하는 행위',
          '학습 콘텐츠를 무단으로 복제·촬영·외부 공개·상업적으로 이용하는 행위',
          '자동화 수단으로 학습 기록을 조작하거나 서비스 운영을 방해하는 행위',
          '커뮤니티 기능에서 타인을 비방하거나 업무와 무관한 게시물을 등록하는 행위',
        ],
      },
      { kind: 'p', text: '제5조 (학습 기록의 활용) 학습 이력은 교육 이수 관리와 통계 목적으로 활용될 수 있으며, 개별 인사 평가의 유일한 근거로 사용되지 않습니다. 구체적인 활용 범위는 사내 교육 운영 기준을 따릅니다.' },
      { kind: 'p', text: '제6조 (이용 제한) 제4조를 위반하거나 사내 규정을 어긴 경우 운영 부서는 사전 통지 후 이용을 제한할 수 있습니다. 긴급한 보안 사고 시에는 선조치 후 통지할 수 있습니다.' },
      { kind: 'p', text: '제7조 (면책) 천재지변, 사내 전산망 장애 등 운영 부서의 통제를 벗어난 사유로 인한 서비스 중단에는 책임을 지지 않습니다. 학습 콘텐츠는 교육 목적의 참고 자료이며, 실제 현장 점검은 관련 법령과 사내 기준을 우선합니다.' },
      { kind: 'p', text: '제8조 (약관의 변경) 약관이 변경되면 시행일 7일 전(이용자에게 불리한 변경은 30일 전)까지 앱 공지로 알려드립니다.' },
    ],
  },

  // ── 개인정보 처리방침 ────────────────────────────────────────────────
  {
    id: 'privacy-policy',
    title: '개인정보 처리방침',
    icon: 'lock-closed-outline',
    summary: '무엇을, 왜 수집하고 언제 파기하는지',
    blocks: [
      { kind: 'p', text: '1. 수집하는 개인정보 항목과 목적' },
      {
        kind: 'rows',
        rows: [
          { k: '계정 정보', v: '이름, 사내 이메일, 소속, 닉네임 — 본인 확인 및 교육 이수 관리' },
          { k: '프로필(선택)', v: '프로필 사진, 한 줄 소개 — 커뮤니티 기능 표시용' },
          { k: '학습 기록', v: '학습·복습·출석·정오답·통계 — 학습 일정 산출과 이수 관리' },
          { k: '기기 정보', v: '앱 버전, OS, 푸시 토큰 — 알림 발송과 장애 대응' },
          { k: '문의 내역', v: '문의 내용, 회신용 이메일 — 문의 처리 및 기록 보관' },
        ],
      },
      { kind: 'p', text: '2. 처리 근거 — 사내 교육 운영을 위한 정당한 이익 및 이용자의 동의(개인정보 보호법 제15조). 광고성 정보 수신은 별도 동의를 받으며 언제든 철회할 수 있습니다.' },
      { kind: 'p', text: '3. 보유 및 파기 — 계정 정보는 서비스 이용 종료(퇴사·계정 회수) 시까지 보유하며, 종료 후 지체 없이(늦어도 30일 이내) 파기합니다. 다만 사내 교육 이수 증빙이 필요한 학습 기록은 개인 식별정보를 분리·가명 처리한 뒤 사내 교육 운영 기준에서 정한 기간 동안 보관합니다. 전자적 파일은 복구할 수 없는 방법으로 영구 삭제합니다.' },
      { kind: 'p', text: '4. 제3자 제공 — 이용자의 개인정보를 외부에 제공하지 않습니다. 다만 법령에 따른 요청이 있는 경우에만 관계 법령이 정한 절차에 따릅니다.' },
      { kind: 'p', text: '5. 처리 위탁 — 서비스 제공에 필요한 최소한의 범위에서 다음 업무를 위탁합니다.' },
      {
        kind: 'bullets',
        items: [
          '앱 배포·업데이트 및 푸시 알림 전송 — 앱 배포/알림 인프라 사업자(Apple, Google, Expo)',
          '데이터 저장 및 운영 — 사내 또는 계약된 클라우드 인프라 사업자',
        ],
      },
      { kind: 'p', text: '6. 이용자의 권리 — 언제든 본인의 개인정보에 대해 열람·정정·삭제·처리정지를 요구할 수 있습니다. 아래 [개인정보 열람 · 정정 · 삭제 요청] 항목의 절차를 따라주세요.' },
      { kind: 'p', text: '7. 안전성 확보 조치 — 접근 권한 최소화, 전송 구간 암호화(HTTPS), 로그인 정보의 기기 보안 저장소 저장, 접근 기록 보관 등의 조치를 시행합니다.' },
      { kind: 'p', text: '8. 기기 저장 데이터 — 학습 설정과 캐시는 기기 내부에만 저장되며, [설정 › 데이터 › 데이터 초기화]로 언제든 직접 삭제할 수 있습니다.' },
      { kind: 'note', text: `문의: ${LEGAL_META.privacyOfficer} · ${LEGAL_META.contactChannel}` },
    ],
  },

  // ── 접근 권한 ────────────────────────────────────────────────────────
  {
    id: 'permissions',
    title: '앱 접근 권한 안내',
    icon: 'key-outline',
    summary: '필수 · 선택 권한과 각각의 사용 목적',
    blocks: [
      { kind: 'p', text: '서비스 이용에 필요한 접근 권한을 아래와 같이 안내합니다. 선택 권한은 허용하지 않아도 해당 기능을 제외한 나머지 서비스를 이용할 수 있습니다.' },
      {
        kind: 'rows',
        rows: [
          { k: '네트워크 상태 (필수)', v: '학습 콘텐츠 동기화와 오프라인 안내 표시' },
          { k: '알림 (선택)', v: '학습 리마인더·성취·공지 알림 발송' },
          { k: '사진 · 앨범 (선택)', v: '프로필 사진 등록 시에만 접근하며, 선택한 이미지 외에는 읽지 않습니다' },
          { k: '생체인증 (선택)', v: '앱을 열 때 Face ID·지문으로 잠금 해제. 생체정보는 기기 밖으로 나가지 않습니다' },
          { k: '모션 · 센서 (선택)', v: '학습 카드의 기울임 표현 효과' },
          { k: '기기 재시작 감지 (선택)', v: '재부팅 후 예약된 학습 알림을 다시 등록' },
        ],
      },
      { kind: 'note', text: '권한은 기기의 [설정 › 앱] 메뉴에서 언제든 다시 허용하거나 해제할 수 있습니다.' },
    ],
  },

  // ── 수신 동의 ────────────────────────────────────────────────────────
  {
    id: 'consent-marketing',
    title: '알림 · 수신 동의 및 철회',
    icon: 'megaphone-outline',
    summary: '어떤 알림에 동의했는지 확인하고 바로 철회하기',
    blocks: [
      { kind: 'p', text: '학습 리마인더·성취·공지 등 서비스 운영에 필요한 알림과, 사내 이벤트·혜택 안내(광고성 정보)를 구분해 관리합니다. 광고성 정보는 동의한 경우에만 발송하며, 아래 스위치로 즉시 철회할 수 있습니다.' },
      { kind: 'note', text: '철회하더라도 학습 리마인더와 공지 등 서비스 운영에 필요한 알림은 계속 받을 수 있습니다.' },
    ],
  },

  // ── 정보주체 권리 ────────────────────────────────────────────────────
  {
    id: 'data-rights',
    title: '개인정보 열람 · 정정 · 삭제 요청',
    icon: 'shield-checkmark-outline',
    summary: '내 정보를 확인하고 바로잡는 방법',
    blocks: [
      { kind: 'p', text: '이용자는 정보주체로서 언제든 아래 권리를 행사할 수 있습니다.' },
      {
        kind: 'bullets',
        items: [
          '열람 — 어떤 정보가 저장되어 있는지 확인 요청',
          '정정 — 이름·소속 등 잘못된 정보의 수정 요청(일부는 [내 정보 수정]에서 즉시 가능)',
          '삭제 — 더 이상 필요하지 않은 정보의 삭제 요청',
          '처리정지 — 특정 목적의 개인정보 처리 중단 요청',
        ],
      },
      { kind: 'p', text: `요청은 ${LEGAL_META.contactChannel}로 접수하며, 접수일로부터 10일 이내에 처리 결과를 회신합니다. 법령상 보관 의무가 있는 정보는 삭제가 제한될 수 있으며, 이 경우 사유를 함께 안내합니다.` },
    ],
  },

  // ── 계정 삭제 ────────────────────────────────────────────────────────
  {
    id: 'account-delete',
    title: '계정 삭제(이용 해지) 요청',
    icon: 'person-remove-outline',
    summary: '계정과 학습 기록을 삭제하는 절차',
    blocks: [
      { kind: 'p', text: '사내 계정 체계와 연동된 서비스라 계정 삭제는 운영 부서 확인을 거쳐 처리됩니다. 요청 후 처리 완료까지 영업일 기준 최대 5일이 소요됩니다.' },
      {
        kind: 'bullets',
        items: [
          '삭제되는 정보 — 계정 정보, 프로필, 커뮤니티 게시물, 학습·출석·수집 기록',
          '보관되는 정보 — 사내 교육 이수 증빙에 필요한 기록은 개인 식별정보를 분리·가명 처리해 보관',
          '삭제 후에는 복구할 수 없습니다',
        ],
      },
      { kind: 'note', text: '이 기기에 저장된 데이터만 지우려면 [설정 › 데이터 › 데이터 초기화]를 이용하세요. 계정 자체는 유지됩니다.' },
    ],
  },

  // ── 사내 보안 ────────────────────────────────────────────────────────
  {
    id: 'security-policy',
    title: '사내 정보보안 준수 안내',
    icon: 'business-outline',
    summary: '학습 자료 취급 시 지켜야 할 사항',
    blocks: [
      { kind: 'p', text: '학습 콘텐츠에는 현장 점검 사례와 사내 기준이 포함되어 있어 대외비로 취급합니다.' },
      {
        kind: 'bullets',
        items: [
          '화면 촬영·캡처본을 외부(개인 SNS, 외부 메신저, 사외 메일 등)로 반출하지 않습니다',
          '계정과 비밀번호를 타인과 공유하지 않고, 공용 기기에서는 사용 후 반드시 로그아웃합니다',
          '기기 분실·계정 도용이 의심되면 즉시 운영 부서에 알립니다',
          '커뮤니티에는 고객사·현장을 특정할 수 있는 정보를 게시하지 않습니다',
        ],
      },
      { kind: 'note', text: '위반 시 사내 정보보안 규정에 따른 조치가 있을 수 있습니다.' },
    ],
  },

  // ── 저작권 ───────────────────────────────────────────────────────────
  {
    id: 'copyright',
    title: '저작권 · 콘텐츠 이용 안내',
    icon: 'ribbon-outline',
    summary: '학습 콘텐츠의 저작권 귀속과 허용 범위',
    blocks: [
      { kind: 'p', text: `앱에 실린 학습 카드·이미지·도표 등 모든 콘텐츠의 저작권은 ${LEGAL_META.operator} 또는 정당한 권리자에게 있습니다.` },
      {
        kind: 'bullets',
        items: [
          '사내 교육·업무 목적의 열람과 학습은 자유롭게 할 수 있습니다',
          '무단 복제·배포·전송·2차적 저작물 작성 및 상업적 이용은 금지됩니다',
          '인용이 필요한 경우 출처를 명시하고 운영 부서의 사전 승인을 받아주세요',
        ],
      },
      { kind: 'p', text: '콘텐츠에 오류가 있거나 제3자의 권리를 침해한다고 판단되면 고객센터로 알려주세요. 확인 후 신속히 수정·삭제하겠습니다.' },
    ],
  },
];

/** 앱이 사용하는 오픈소스 구성요소 — 라이선스 고지 의무 이행용(package.json 기준). */
export const OPEN_SOURCE_LIBRARIES: { name: string; version: string; license: string }[] = [
  { name: '@expo/metro-runtime', version: '4.0.1', license: 'MIT' },
  { name: '@expo/vector-icons', version: '14.0.4', license: 'MIT' },
  { name: '@react-native-async-storage/async-storage', version: '1.23.1', license: 'MIT' },
  { name: '@react-native-community/netinfo', version: '11.4.1', license: 'MIT' },
  { name: '@tanstack/react-query', version: '5.101.2', license: 'MIT' },
  { name: 'expo', version: '52.0.49', license: 'MIT' },
  { name: 'expo-asset', version: '11.0.5', license: 'MIT' },
  { name: 'expo-blur', version: '14.0.3', license: 'MIT' },
  { name: 'expo-constants', version: '17.0.8', license: 'MIT' },
  { name: 'expo-font', version: '13.0.4', license: 'MIT' },
  { name: 'expo-haptics', version: '14.0.1', license: 'MIT' },
  { name: 'expo-image', version: '2.0.7', license: 'MIT' },
  { name: 'expo-image-picker', version: '16.0.6', license: 'MIT' },
  { name: 'expo-linking', version: '7.0.5', license: 'MIT' },
  { name: 'expo-local-authentication', version: '15.0.2', license: 'MIT' },
  { name: 'expo-notifications', version: '0.29.14', license: 'MIT' },
  { name: 'expo-router', version: '4.0.22', license: 'MIT' },
  { name: 'expo-secure-store', version: '14.0.1', license: 'MIT' },
  { name: 'expo-sensors', version: '14.0.2', license: 'MIT' },
  { name: 'expo-splash-screen', version: '0.29.24', license: 'MIT' },
  { name: 'expo-status-bar', version: '2.0.1', license: 'MIT' },
  { name: 'expo-updates', version: '0.27.5', license: 'MIT' },
  { name: 'react', version: '18.3.1', license: 'MIT' },
  { name: 'react-dom', version: '18.3.1', license: 'MIT' },
  { name: 'react-hook-form', version: '7.81.0', license: 'MIT' },
  { name: 'react-native', version: '0.76.9', license: 'MIT' },
  { name: 'react-native-gesture-handler', version: '2.20.2', license: 'MIT' },
  { name: 'react-native-reanimated', version: '3.16.7', license: 'MIT' },
  { name: 'react-native-safe-area-context', version: '4.12.0', license: 'MIT' },
  { name: 'react-native-screens', version: '4.4.0', license: 'MIT' },
  { name: 'react-native-svg', version: '15.8.0', license: 'MIT' },
  { name: 'react-native-view-shot', version: '4.0.3', license: 'MIT' },
  { name: 'react-native-web', version: '0.19.13', license: 'MIT' },
  { name: 'zod', version: '4.4.3', license: 'MIT' },
  { name: 'zustand', version: '5.0.14', license: 'MIT' },
  // 폰트 — 코드 라이브러리와 라이선스 체계가 달라 별도로 고지한다.
  { name: 'Pretendard (글꼴)', version: '—', license: 'SIL Open Font License 1.1' },
  { name: 'Jua (글꼴)', version: '—', license: 'SIL Open Font License 1.1' },
];

/** MIT 라이선스 전문(고지 의무 대상 — 요약이 아니라 원문을 그대로 싣는다). */
export const MIT_LICENSE_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
