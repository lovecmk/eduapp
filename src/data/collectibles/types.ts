// 수집형 안전 카드 — 타입과 등급 표기(보석 등급표).
//
// 카탈로그(실제 500종)는 분야별 catalog.*.ts 에 나뉘어 있고,
// 이 파일은 그 파일들이 공통으로 참조하는 형(型)만 담는다.
// 카탈로그가 타입을 import 하고 index 가 카탈로그를 import 하므로,
// 타입을 index 에 두면 순환 참조가 된다 — 그래서 따로 있다.
import type { RarityTier } from '../../utils/rarity';

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
