// 생체인증 로그인 — PART 3.4
// 웹/미지원 기기에서는 false 를 반환해 호출부가 일반 로그인으로 폴백하게 한다.
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

export async function tryBiometricLogin(): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: '생체인증으로 로그인',
    fallbackLabel: '비밀번호 입력',
  });
  return result.success;
}
