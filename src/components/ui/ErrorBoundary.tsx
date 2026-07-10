import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' }}>
          <Ionicons name="warning" size={48} color="#FF3B30" />
          <Text style={{ fontSize: 18, fontWeight: '700', marginTop: 12, color: '#1A1D24' }}>문제가 발생했어요</Text>
          <Text style={{ fontSize: 13, color: '#8E95A2', marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
            {this.state.error.message}
          </Text>
          <Pressable
            onPress={() => this.setState({ error: null })}
            style={{ marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#2563EB', borderRadius: 999 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>다시 시도</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
