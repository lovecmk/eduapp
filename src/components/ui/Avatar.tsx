import React from 'react';
import { View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';

interface Props {
  uri?: string | null;
  size?: number;
  /** 테두리 두께(0이면 없음) */
  ring?: number;
  ringColor?: string;
}

/**
 * 공용 아바타 — 사진이 있으면 그대로, 없으면 카카오톡처럼
 * 회색 원 안에 사람 실루엣을 보여주는 기본 프로필.
 * (닉네임 첫 글자 대신 사람 모양을 기본으로 통일한다.)
 */
export function Avatar({ uri, size = 48, ring = 0, ringColor }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const border = ring > 0 ? { borderWidth: ring, borderColor: ringColor ?? c.border } : null;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, ...border }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...border,
      }}
    >
      {/* 실루엣 — 머리+어깨가 원 하단에 자연스럽게 걸치도록 약간 아래로 내려 배치. */}
      <Ionicons name="person" size={size * 0.62} color={c.textSecondary} style={{ marginTop: size * 0.14 }} />
    </View>
  );
}
