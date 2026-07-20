// QR 코드 렌더러 — src/utils/qrcode 로 만든 모듈 행렬을 react-native-svg 로 그린다.
// 모듈을 한 줄(row)씩 이어붙여 Path 하나로 그려, 셀이 많아도 성능이 좋다.
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';
import { generateQR, type ErrorCorrectionLevel } from '../../utils/qrcode';

interface Props {
  /** 인코딩할 문자열(URL·딥링크 등) */
  value: string;
  /** 전체 픽셀 크기(정사각) */
  size?: number;
  /** 어두운 모듈 색 */
  color?: string;
  /** 배경 색 */
  background?: string;
  /** 조용한 여백(모듈 단위, 권장 4) */
  quietZone?: number;
  /** 오류정정 레벨(기본 M) */
  ecLevel?: ErrorCorrectionLevel;
}

export function QRCode({
  value,
  size = 200,
  color = '#000000',
  background = '#FFFFFF',
  quietZone = 4,
  ecLevel = 'M',
}: Props) {
  const { path, dim } = useMemo(() => {
    let matrix: boolean[][];
    try {
      matrix = generateQR(value || ' ', ecLevel);
    } catch {
      // 용량 초과 등 인코딩 실패 시 빈 행렬로 폴백(앱이 죽지 않도록).
      matrix = [[false]];
    }
    const count = matrix.length;
    const total = count + quietZone * 2;
    // 어두운 모듈을 SVG Path 로 합쳐 그린다(1 = 1 모듈 단위 좌표).
    let d = '';
    for (let r = 0; r < count; r++) {
      for (let cc = 0; cc < count; cc++) {
        if (matrix[r][cc]) {
          const x = cc + quietZone;
          const y = r + quietZone;
          d += `M${x} ${y}h1v1h-1z`;
        }
      }
    }
    return { path: d, dim: total };
  }, [value, ecLevel, quietZone]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${dim} ${dim}`}>
        <Rect x={0} y={0} width={dim} height={dim} fill={background} />
        {path ? <Path d={path} fill={color} /> : null}
      </Svg>
    </View>
  );
}
