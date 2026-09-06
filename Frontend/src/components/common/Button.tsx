import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacityProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import { BorderRadius, FontSize, FontWeight, Spacing } from '../../constants/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const sizeStyles: Record<Size, { paddingVertical: number; fontSize: number; height: number }> = {
  sm: { paddingVertical: 8, fontSize: FontSize.sm, height: 38 },
  md: { paddingVertical: 14, fontSize: FontSize.base, height: 50 },
  lg: { paddingVertical: 18, fontSize: FontSize.lg, height: 58 },
};

export default function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  style,
  textStyle,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const sz = sizeStyles[size];

  const getGradient = () => {
    switch (variant) {
      case 'primary':
        return Colors.gradientPrimary;
      case 'secondary':
        return Colors.gradientSuccess;
      case 'danger':
        return Colors.gradientSos;
      case 'success':
        return ['#10D98C', '#00B89C'];
      default:
        return [];
    }
  };

  const needsGradient = ['primary', 'secondary', 'danger', 'success'].includes(variant);

  const buttonContent = (
    <>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'ghost' ? Colors.primary : Colors.white}
        />
      ) : (
        <Text
          style={[
            styles.text,
            { fontSize: sz.fontSize },
            variant === 'outline' && styles.outlineText,
            variant === 'ghost' && styles.ghostText,
            isDisabled && styles.disabledText,
            textStyle,
          ]}>
          {title}
        </Text>
      )}
    </>
  );

  if (needsGradient) {
    return (
      <TouchableOpacity
        {...props}
        disabled={isDisabled}
        style={[
          styles.base,
          { height: sz.height },
          fullWidth && styles.fullWidth,
          isDisabled && styles.disabledWrapper,
          style,
        ]}>
        <LinearGradient
          colors={isDisabled ? [Colors.border, Colors.border] : (getGradient() as any)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          pointerEvents="none"
          style={[styles.gradient, { height: sz.height }]}>
          {buttonContent}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      {...props}
      disabled={isDisabled}
      style={[
        styles.base,
        { height: sz.height, paddingVertical: sz.paddingVertical },
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabledWrapper,
        style,
      ]}>
      {buttonContent}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gradient: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
  },
  fullWidth: {
    width: '100%',
  },
  outline: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: 'transparent',
    paddingHorizontal: Spacing.xl,
  },
  ghost: {
    backgroundColor: 'transparent',
    paddingHorizontal: Spacing.xl,
  },
  text: {
    color: Colors.white,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  outlineText: {
    color: Colors.primary,
  },
  ghostText: {
    color: Colors.primary,
  },
  disabledWrapper: {
    opacity: 0.5,
  },
  disabledText: {
    color: Colors.textMuted,
  },
});
