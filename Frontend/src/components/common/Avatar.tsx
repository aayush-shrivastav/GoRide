import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Colors } from '../../constants/colors';
import { BorderRadius, FontSize, FontWeight } from '../../constants/theme';
import { getInitials } from '../../utils/formatters';

interface AvatarProps {
  name: string;
  imageUri?: string | null;
  size?: number;
}

export default function Avatar({ name, imageUri, size = 48 }: AvatarProps) {
  const initials = getInitials(name);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <Text
          style={[
            styles.initials,
            { fontSize: size * 0.38 },
          ]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primaryFaint,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
});
