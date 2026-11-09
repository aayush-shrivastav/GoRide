import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { FontSize } from '../../constants/theme';

interface LoaderProps {
  message?: string;
  fullScreen?: boolean;
  size?: 'small' | 'large';
  color?: string;
}

export default function Loader({
  message,
  fullScreen = false,
  size = 'large',
  color = Colors.primary,
}: LoaderProps) {
  if (fullScreen) {
    return (
      <View style={styles.fullScreen}>
        <ActivityIndicator size={size} color={color} />
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.inline}>
      <ActivityIndicator size={size} color={color} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  inline: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  message: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
