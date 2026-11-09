import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Speech from 'expo-speech';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PassengerStackParamList } from '../../navigation/PassengerNavigator';
import { Colors } from '../../constants/colors';
import { BorderRadius, FontSize, FontWeight, Spacing } from '../../constants/theme';
import { getCurrentUserLocation } from '../../services/maps/locationService';
import { createRide, getVoiceBookingPreview } from '../../services/api/rideApi';
import { useRide } from '../../context/RideContext';
import { parseApiError } from '../../utils/formatters';

type Props = NativeStackScreenProps<PassengerStackParamList, 'VoiceBooking'>;

const SAMPLE_VOICE_PROMPTS = [
  'मुझे इंडिया गेट जाना है, कार चाहिए, online payment',
  'Drop me at Connaught Place by bike, cash payment',
  'मुझे नई दिल्ली रेलवे स्टेशन जाना है, ऑटो चाहिए',
  'Take me to Cyber Hub Gurgaon, SUV ride',
];

export default function VoiceBookingScreen({ navigation }: Props) {
  const { setCurrentRide } = useRide();
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  const inputRef = useRef<TextInput>(null);
  const webRecognitionRef = useRef<any>(null);

  useEffect(() => {
    // Web speech recognition initialization (Chrome / Edge built-in Web Speech API)
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = false;
          rec.interimResults = true;
          rec.lang = 'hi-IN';

          rec.onstart = () => setListening(true);
          rec.onend = () => setListening(false);
          rec.onresult = (event: any) => {
            const text = event.results?.[0]?.[0]?.transcript || '';
            setTranscript(text);
          };
          rec.onerror = () => setListening(false);

          webRecognitionRef.current = rec;
        } catch {
          // Ignore
        }
      }
    }

    return () => {
      try {
        webRecognitionRef.current?.abort?.();
      } catch {}
      Speech.stop();
    };
  }, []);

  async function handleTapToSpeak() {
    // 1. Web: use browser's built-in Web Speech recognition
    if (Platform.OS === 'web') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        Alert.alert(
          'Browser Unsupported',
          'Speech recognition is not supported in this browser. Please use Chrome or type your request below.'
        );
        inputRef.current?.focus();
        return;
      }

      if (listening) {
        try { webRecognitionRef.current?.stop(); } catch {}
        setListening(false);
        if (transcript.trim()) {
          getPreview(transcript.trim());
        }
        return;
      }

      setPreview(null);
      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'hi-IN';

        rec.onstart = () => setListening(true);
        rec.onresult = (event: any) => {
          let text = '';
          for (let i = 0; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
          }
          if (text) {
            setTranscript(text);
          }
        };
        rec.onend = () => {
          setListening(false);
        };
        rec.onerror = (e: any) => {
          if (e.error === 'no-speech') return;
          console.warn('[VoiceBooking] Web speech error:', e);
          setListening(false);
        };

        webRecognitionRef.current = rec;
        rec.start();
        setListening(true);
      } catch (err) {
        console.warn('[VoiceBooking] Start error:', err);
        setListening(false);
        inputRef.current?.focus();
      }
      return;
    }

    // 2. Mobile in Expo Go:
    // Focus the text input so the Android/iOS keyboard opens immediately.
    // The user can tap the keyboard's built-in Google mic (🎤) to speak freely in Hindi/English!
    setListening(true);
    setPreview(null);
    inputRef.current?.focus();

    // Auto-reset listening indicator after 5 seconds
    setTimeout(() => {
      setListening(false);
    }, 5000);
  }

  async function getPreview(overrideText?: string) {
    const textToProcess = (overrideText || transcript).trim();
    if (!textToProcess) {
      return Alert.alert(
        'Speak or choose a request',
        'Type your request or select one of the quick voice prompts below!'
      );
    }
    setLoading(true);
    try {
      const location = await getCurrentUserLocation();
      if (!location) throw new Error('Current location is unavailable. Turn on GPS and try again.');
      const result = await getVoiceBookingPreview({
        transcript: textToProcess,
        currentLocation: location,
      });
      setPreview(result);
      if (result.reply) {
        Speech.speak(result.reply, { language: 'hi-IN', rate: 0.95 });
      }
    } catch (error) {
      Alert.alert('Could not prepare ride', parseApiError(error));
    } finally {
      setLoading(false);
    }
  }

  function handleSelectSamplePrompt(prompt: string) {
    setTranscript(prompt);
    setPreview(null);
    getPreview(prompt);
  }

  async function confirmBooking() {
    if (!preview?.pickup || !preview?.drop) return;
    setBooking(true);
    try {
      const ride = await createRide({
        pickup: preview.pickup,
        drop: preview.drop,
        vehicleType: preview.vehicleType,
        paymentMethod: preview.paymentMethod,
        preferFemaleDriver: false,
      });
      setCurrentRide(ride);
      Speech.stop();
      navigation.replace('SearchingDriver', { rideId: ride._id });
    } catch (error) {
      Alert.alert('Booking failed', parseApiError(error));
    } finally {
      setBooking(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={27} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>AI Voice Booking</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Hero Section */}
        <View style={styles.hero}>
          <TouchableOpacity
            style={[styles.micCircle, listening && styles.micActive]}
            onPress={handleTapToSpeak}
            activeOpacity={0.8}>
            <Ionicons name={listening ? 'radio' : 'mic'} size={38} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>
            {listening ? 'Listening via Keyboard Mic…' : 'Book with AI Voice'}
          </Text>
          <Text style={styles.heroText}>
            Tap the button below, then speak in Hindi or English using your keyboard microphone (🎤)
          </Text>
          <TouchableOpacity
            style={[styles.listenButton, listening && styles.stopButton]}
            onPress={handleTapToSpeak}>
            <Ionicons name="mic" size={18} color={Colors.white} style={{ marginRight: 6 }} />
            <Text style={styles.listenText}>
              {listening ? 'Keyboard open — Speak now' : 'Tap to speak'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Prompts */}
        <Text style={styles.label}>Quick voice examples (1-tap preview)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickList}>
          {SAMPLE_VOICE_PROMPTS.map((prompt, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.promptChip}
              onPress={() => handleSelectSamplePrompt(prompt)}>
              <Text style={styles.promptChipIcon}>🗣️</Text>
              <Text style={styles.promptChipText} numberOfLines={2}>
                {prompt}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input Field */}
        <Text style={[styles.label, { marginTop: Spacing.md }]}>Voice / Text request</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          multiline
          value={transcript}
          onChangeText={(value) => {
            setTranscript(value);
            setPreview(null);
          }}
          placeholder="Tap keyboard mic (🎤) to speak in Hindi/English, or type here…"
          placeholderTextColor={Colors.textMuted}
        />

        <TouchableOpacity
          style={[styles.previewButton, loading && styles.disabled]}
          onPress={() => getPreview()}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.previewText}>Get live AI ride details</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclosure}>
          AI Voice Assistant uses intelligent route & fare matching with speech feedback.
        </Text>

        {preview?.needsDestination ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>{preview.reply}</Text>
          </View>
        ) : null}

        {preview?.pickup && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Confirm your ride</Text>
            <Text style={styles.reply}>{preview.reply}</Text>
            <Detail icon="navigate-outline" label="Pickup" value={preview.pickup.address} />
            <Detail icon="location-outline" label="Destination" value={preview.drop.address} />
            <View style={styles.grid}>
              <Metric label="Distance" value={`${preview.distanceKm} km`} />
              <Metric label="ETA" value={`${Math.round(preview.durationMin)} min`} />
              <Metric label="Seats" value={`${preview.seats}`} />
              <Metric label="Nearby drivers" value={`${preview.availableDrivers}`} />
            </View>
            <View style={styles.fare}>
              <Text style={styles.fareLabel}>Estimated fare</Text>
              <Text style={styles.fareValue}>₹{preview.fare.totalFare}</Text>
            </View>
            <Text style={styles.payment}>
              {preview.paymentMethod === 'online' ? 'Online payment' : 'Cash to driver'} ·{' '}
              {String(preview.vehicleType).toUpperCase()}
            </Text>
            {preview.driverPreview && (
              <Text style={styles.driver}>
                Closest preview: {preview.driverPreview.vehicleModel} · ★{' '}
                {Number(preview.driverPreview.rating || 0).toFixed(1)}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.confirm, booking && styles.disabled]}
              onPress={confirmBooking}
              disabled={booking}>
              {booking ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.confirmText}>Confirm & book ride</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Detail({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Ionicons name={icon} size={18} color={Colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 52,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  content: { padding: Spacing.lg, paddingBottom: Spacing.huge },
  hero: {
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.primaryFaint,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.lg,
  },
  micCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    marginBottom: Spacing.md,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  micActive: { backgroundColor: Colors.error },
  heroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  heroText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  listenButton: {
    backgroundColor: Colors.primary,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stopButton: { backgroundColor: Colors.error },
  listenText: { color: Colors.white, fontWeight: FontWeight.bold },
  quickList: {
    marginVertical: Spacing.xs,
  },
  promptChip: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginRight: Spacing.sm,
    maxWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  promptChipIcon: { fontSize: 16 },
  promptChipText: { fontSize: FontSize.xs, color: Colors.textPrimary, lineHeight: 16 },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  input: {
    minHeight: 80,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
    backgroundColor: Colors.surface,
    fontSize: FontSize.base,
  },
  previewButton: {
    marginTop: Spacing.md,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
  },
  previewText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.base },
  disabled: { opacity: 0.65 },
  disclosure: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 17,
    marginTop: Spacing.md,
  },
  warning: {
    padding: Spacing.md,
    backgroundColor: Colors.warningFaint,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
  },
  warningText: { color: Colors.textPrimary, lineHeight: 20 },
  card: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  reply: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.md },
  detail: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
  },
  detailLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  detailValue: { fontSize: FontSize.sm, color: Colors.textPrimary, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: Spacing.md },
  metric: { width: '50%', paddingVertical: Spacing.sm },
  metricValue: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  metricLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  fare: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  fareLabel: { fontSize: FontSize.base, color: Colors.textSecondary },
  fareValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  payment: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.sm },
  driver: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  confirm: {
    marginTop: Spacing.lg,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
    borderRadius: BorderRadius.lg,
  },
  confirmText: { color: Colors.white, fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
