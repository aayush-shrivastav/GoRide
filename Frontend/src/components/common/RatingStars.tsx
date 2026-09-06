import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { FontSize } from '../../constants/theme';

interface RatingStarsProps {
  value?: number;
  rating?: number;
  onRate?: (stars: number) => void;
  size?: number;
  readonly?: boolean;
  style?: ViewStyle;
}

export default function RatingStars({
  value,
  rating,
  onRate,
  size = 28,
  readonly = false,
  style,
}: RatingStarsProps) {
  const currentRating = rating ?? value ?? 0;
  const stars = [1, 2, 3, 4, 5];

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      disabled={readonly}
      activeOpacity={1}>
      {stars.map(star => (
        <Text
          key={star}
          onPress={() => !readonly && onRate?.(star)}
          style={[styles.star, { fontSize: size }]}>
          {star <= currentRating ? '⭐' : '☆'}
        </Text>
      ))}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  star: {
    color: Colors.warning,
  },
});
