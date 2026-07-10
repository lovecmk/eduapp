import { Text, TextInput } from 'react-native';
import { fontBody } from './tokens';

/**
 * 앱 전역 기본 폰트를 Pretendard 로 지정한다.
 * 명시적으로 fontFamily 를 지정하지 않은 모든 Text/TextInput 은 Pretendard-Regular 로 렌더링되며,
 * 브랜드(Jua)·숫자(mono)를 쓰는 곳은 각자 지정한 폰트를 그대로 유지한다.
 */
export function applyGlobalFont() {
  const applyTo = (Component: typeof Text | typeof TextInput) => {
    const c = Component as unknown as { defaultProps?: { style?: unknown } };
    c.defaultProps = c.defaultProps ?? {};
    const existing = c.defaultProps.style;
    c.defaultProps.style = [{ fontFamily: fontBody }, existing];
  };
  applyTo(Text);
  applyTo(TextInput);
}
