import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PassengerStackParamList } from '../../navigation/PassengerNavigator';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import Button from '../../components/common/Button';
import RatingStars from '../../components/common/RatingStars';
import { submitRating } from '../../services/api/ratingApi';
import { useRide } from '../../context/RideContext';
import { parseApiError } from '../../utils/formatters';

type Props = NativeStackScreenProps<PassengerStackParamList, 'Rating'>;

export default function RatingScreen({ navigation, route }: Props) {
  const { rideId } = route.params;
  const { clearRide } = useRide();
  
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (rating === 0) {
      Alert.alert('Missing Rating', 'Please select a star rating first.');
      return;
    }

    setLoading(true);
    try {
      await submitRating({
        rideId,
        targetRole: 'driver',
        rating,
        comment: comment.trim(),
      });
      clearRide(); // ensure local state is cleared
      navigation.replace('HomeTabs');
    } catch (err) {
      Alert.alert('Error', parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    clearRide();
    navigation.replace('HomeTabs');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>How was your ride?</Text>
          <Text style={styles.subtitle}>
            Your feedback helps us improve the experience for everyone.
          </Text>
        </View>

        <View style={styles.ratingBox}>
          <RatingStars
            rating={rating}
            size={40}
            onRate={setRating}
          />
          <Text style={styles.ratingText}>
            {rating === 0 && 'Tap a star to rate'}
            {rating === 1 && 'Terrible'}
            {rating === 2 && 'Bad'}
            {rating === 3 && 'Okay'}
            {rating === 4 && 'Good'}
            {rating === 5 && 'Excellent!'}
          </Text>
        </View>

        <View style={styles.commentBox}>
          <Text style={styles.label}>Leave a comment (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Tell us what you liked or what could be better..."
            placeholderTextColor={Colors.textMuted}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Submit Feedback"
          onPress={handleSubmit}
          loading={loading}
          fullWidth
          size="lg"
          disabled={rating === 0}
        />
        <Button
          title="Skip for now"
          onPress={handleSkip}
          variant="outline"
          fullWidth
          size="md"
          style={{ marginTop: Spacing.md, borderWidth: 0 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: {
    padding: Spacing.xl,
    paddingTop: 80,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  title: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  ratingBox: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ratingText: {
    marginTop: Spacing.lg,
    fontSize: FontSize.lg,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  commentBox: {
    marginBottom: Spacing.xl,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    minHeight: 120,
  },
  footer: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
