import React from 'react';
import { Pressable } from 'react-native';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';

export function TabBarButton({ children, style, onPress, onLongPress, accessibilityLabel,
  accessibilityState, testID, 'aria-selected': selected, 'aria-label': label }: BottomTabBarButtonProps) {
  return (
    <Pressable accessibilityRole="tab"
      accessibilityLabel={label ?? accessibilityLabel}
      accessibilityState={{ ...accessibilityState, selected: selected ?? accessibilityState?.selected }}
      testID={testID}
      onLongPress={onLongPress}
      onPress={onPress}
      android_ripple={null}
      style={state => [style, { flex: 1, alignItems: 'center', justifyContent: 'center' },
        state.pressed && { opacity: 0.55 }]}
    >
      {children}
    </Pressable>
  );
}
