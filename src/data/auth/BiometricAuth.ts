// 생체인증 — 앱 잠금 해제·잠금 켜기 확인에 쓴다.
// 웹/미지원 기기에서는 false 를 반환해 호출부가 비밀번호 로그인으로 폴백하게 한다.
//
// ⚠️ 이 함수의 true 는 "기기 주인의 지문/얼굴이 맞다"는 뜻일 뿐, **세션이 아니다.**
// 예전 로그인 화면은 이 결과가 true 면 곧바로 홈으로 보냈는데, 그 순간 authStore 에는
// 사용자가 없었다 — 로그인하지 않은 채 로그인한 사람의 화면이 열렸다. 생체인증은
// 이미 있는 세션을 여는 열쇠로만 쓴다(components/auth/BiometricLockGate).
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

/** 지문·얼굴 확인을 요청한다. 취소·실패·미지원이면 false. */
export async function authenticateWithBiometrics(promptMessage: string): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: '기기 암호 사용',
      cancelLabel: '취소',
    });
    return result.success;
  } catch {
    return false;
  }
}
