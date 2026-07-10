import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function Index() {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);

  if (!bootstrapped) return null;

  return <Redirect href="/(auth)/login" />;
}