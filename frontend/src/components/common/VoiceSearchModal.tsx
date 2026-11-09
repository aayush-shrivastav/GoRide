/**
 * VoiceSearchModal.tsx
 *
 * Uber-style voice destination search bottom-sheet.
 *
 * Safe & functional across all environments:
 *  - Web (Chrome/Edge): Web Speech API (continuous: true) + hardware microphone stream
 *    (Mic stays open for full 5 seconds or until user taps stop — never closes in 0s!)
 *  - Native Mobile (Expo Go / Dev Client): Safe dynamic loading with zero native module crashes
 *
 * Features:
 *  - Mic opens and stays actively listening with live seconds timer (1s, 2s, 3s...)
 *  - Real-time live transcript updates as you speak
 *  - Auto carrier phrase cleaner ("Mujhe Patna Airport jaana hai" -> "Patna Airport")
 *  - Fast LocationIQ / Mapbox / Nominatim place search
 *  - Language switch between 🇮🇳 Hinglish / हिन्दी and 🇬🇧 English
 *  - Quick tap popular destination chips & editable search box
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '../../constants/colors';
import { BorderRadius, FontSize, FontWeight, Spacing } from '../../constants/theme';
import { extractDestinationQuery } from '../../utils/voiceDestinationExtractor';
import {
  searchPlacesFast,
  transcribeVoiceAndSearch,
  PlaceResult,
} from '../../services/maps/placeSearchService';

// ── Dynamic safe requires (zero crash on missing native modules in Expo Go) ──
let SafeExpoAudio: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SafeExpoAudio = require('expo-audio');
} catch {
  SafeExpoAudio = null;
}

let SafeExpoAV: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SafeExpoAV = require('expo-av');
} catch {
  SafeExpoAV = null;
}

let SafeFileSystem: any = null;
try {
  // Expo SDK 54+ legacy export
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SafeFileSystem = require('expo-file-system/legacy');
} catch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    SafeFileSystem = require('expo-file-system');
  } catch {
    SafeFileSystem = null;
  }
}

/**
 * Universal Base64 Audio Reader
 * Works across Expo SDK 52/54/57+, legacy file-system, modern File API, and Web/Blob
 */
async function readAudioFileAsBase64(uri: string): Promise<string> {
  // 1. Try legacy readAsStringAsync (official Expo SDK 54+ legacy method)
  if (SafeFileSystem?.readAsStringAsync) {
    try {
      const b64 = await SafeFileSystem.readAsStringAsync(uri, {
        encoding: SafeFileSystem.EncodingType?.Base64 || 'base64',
      });
      if (b64) return b64;
    } catch (e: any) {
      console.warn('[VoiceSearch] legacy readAsStringAsync failed:', e?.message || e);
    }
  }

  // 2. Try modern expo-file-system File class (Expo SDK 54+ new File API)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const modernFS = require('expo-file-system');
    if (modernFS?.File) {
      const file = new modernFS.File(uri);
      if (typeof file.base64 === 'function') {
        const b64 = await file.base64();
        if (b64) return b64;
      }
    }
  } catch (e: any) {
    console.warn('[VoiceSearch] modern File.base64 failed:', e?.message || e);
  }

  // 3. Fallback: fetch blob and read via FileReader (works for local file:// URIs too)
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = (reader.result as string) || '';
        const commaIdx = res.indexOf(',');
        resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e: any) {
    console.warn('[VoiceSearch] fetch blob fallback failed:', e?.message || e);
  }

  return '';
}

// ── Types ─────────────────────────────────────────────────────────────────
export interface VoiceSearchLocation {
  address: string;
  latitude: number;
  longitude: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onLocationSelected: (loc: VoiceSearchLocation) => void;
  userLatitude?: number | null;
  userLongitude?: number | null;
}

const SAMPLE_PROMPTS = [
  'Delhi Airport',
  'Connaught Place',
  'India Gate',
  'Darbhanga Junction',
  'Patna AIIMS',
  'Railway Station',
];

type RecognitionState = 'idle' | 'listening' | 'processing' | 'results' | 'error';

// ─────────────────────────────────────────────────────────────────────────
export default function VoiceSearchModal({
  visible,
  onClose,
  onLocationSelected,
  userLatitude,
  userLongitude,
}: Props) {
  // ── State ──────────────────────────────────────────────────────────────
  const [state, setState] = useState<RecognitionState>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [editableQuery, setEditableQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lang, setLang] = useState<'hi-IN' | 'en-IN'>('hi-IN');
  const [recordSeconds, setRecordSeconds] = useState(0);

  // ── Refs ───────────────────────────────────────────────────────────────
  const activeRecRef = useRef<any>(null);
  const mediaRecorderRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<any>(null);
  const recordTimerRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const inputRef = useRef<TextInput>(null);

  // ── Animations ─────────────────────────────────────────────────────────
  const pulseScale = useRef(new Animated.Value(1)).current;
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(500)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // ── Slide In / Out ─────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 10 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 600, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // ── Pulsing Mic Animation ──────────────────────────────────────────────
  useEffect(() => {
    if (state === 'listening') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.15, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      const startRipple = (ripple: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(ripple, { toValue: 1, duration: 1300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(ripple, { toValue: 0, duration: 0, useNativeDriver: true }),
          ])
        );
      pulse.start();
      const r1 = startRipple(ripple1, 0);
      const r2 = startRipple(ripple2, 650);
      r1.start();
      r2.start();

      return () => {
        pulse.stop();
        r1.stop();
        r2.stop();
        pulseScale.setValue(1);
        ripple1.setValue(0);
        ripple2.setValue(0);
      };
    }
  }, [state]);

  // ── Search places ──────────────────────────────────────────────────────
  const triggerSearch = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) return;
    setState('processing');
    setSearchLoading(true);
    setErrorMsg('');
    try {
      const res = await searchPlacesFast(
        query.trim(),
        userLatitude ?? undefined,
        userLongitude ?? undefined
      );
      setResults(res);
      setState('results');
      if (res.length === 0) {
        setErrorMsg(`"${query}" ke liye koi result nahi mila. Niche edit kare ya prompt tap kare.`);
      }
    } catch {
      setErrorMsg('Search failed. Please check internet connection.');
      setState('error');
    } finally {
      setSearchLoading(false);
    }
  }, [userLatitude, userLongitude]);

  // ── Timer Helper ───────────────────────────────────────────────────────
  function startSecondsTimer(onMaxSeconds?: () => void) {
    clearInterval(recordTimerRef.current);
    setRecordSeconds(0);
    let sec = 0;
    recordTimerRef.current = setInterval(() => {
      sec += 1;
      setRecordSeconds(sec);
      // Keep mic open for 5 full seconds to give user time to speak!
      if (sec >= 5) {
        clearInterval(recordTimerRef.current);
        onMaxSeconds?.();
      }
    }, 1000);
  }

  function stopSecondsTimer() {
    clearInterval(recordTimerRef.current);
  }

  // ── Stop Listening and Process ─────────────────────────────────────────
  async function stopListeningAndProcess() {
    stopSecondsTimer();

    // 1. Web Stop & Process
    if (Platform.OS === 'web') {
      try {
        activeRecRef.current?.stop?.();
      } catch {}

      // Stop MediaRecorder and MediaStream
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks().forEach((track: any) => track.stop());
        } catch {}
        mediaStreamRef.current = null;
      }

      const spokenText = transcriptRef.current.trim();
      if (spokenText) {
        const clean = extractDestinationQuery(spokenText);
        setEditableQuery(clean);
        triggerSearch(clean);
      } else {
        // If web speech didn't catch text, check if MediaRecorder recorded audio
        if (audioChunksRef.current.length > 0) {
          setState('processing');
          try {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = async () => {
              const base64 = (reader.result as string)?.split(',')[1] || '';
              if (base64) {
                const res = await transcribeVoiceAndSearch(
                  base64,
                  lang === 'en-IN' ? 'en' : 'hi',
                  userLatitude ?? undefined,
                  userLongitude ?? undefined
                );
                if (res.cleanQuery) {
                  setLiveTranscript(res.transcript || res.cleanQuery);
                  setEditableQuery(res.cleanQuery);
                  if (res.places.length > 0) {
                    setResults(res.places);
                    setState('results');
                  } else {
                    triggerSearch(res.cleanQuery);
                  }
                  return;
                }
              }
              setState('error');
              setErrorMsg('Aawaz sunai nahi di. Mic par tap kare aur dubara bole ya type kare.');
            };
            return;
          } catch {}
        }

        setState('error');
        setErrorMsg('Aawaz sunai nahi di. Mic par tap kare aur dubara bole ya type kare.');
      }
      return;
    }

    // 2. Mobile Stop & Process
    const recording = activeRecRef.current;
    activeRecRef.current = null;

    if (!recording) {
      setState('error');
      setErrorMsg('Aawaz sunai nahi di. Mic par tap kare aur dubara bole ya type kare.');
      return;
    }

    setState('processing');
    setSearchLoading(true);

    try {
      let uri: string | null = null;
      if (typeof recording.stop === 'function') {
        await recording.stop();
        uri = recording.uri || null;
      } else if (typeof recording.stopAndUnloadAsync === 'function') {
        await recording.stopAndUnloadAsync();
        uri = typeof recording.getURI === 'function' ? recording.getURI() : null;
      }

      if (!uri) {
        setErrorMsg('Aawaz record nahi hui. Mic par tap kare aur dubara bole.');
        setState('error');
        setSearchLoading(false);
        return;
      }

      const base64Audio = await readAudioFileAsBase64(uri);

      if (!base64Audio) {
        setErrorMsg('Audio file read nahi ho saki. Niche diye destination par tap kare.');
        setState('error');
        setSearchLoading(false);
        return;
      }

      const res = await transcribeVoiceAndSearch(
        base64Audio,
        lang === 'en-IN' ? 'en' : 'hi',
        userLatitude ?? undefined,
        userLongitude ?? undefined
      );

      if (res.cleanQuery) {
        setLiveTranscript(res.transcript || res.cleanQuery);
        setEditableQuery(res.cleanQuery);
        if (res.places && res.places.length > 0) {
          setResults(res.places);
          setState('results');
        } else {
          await triggerSearch(res.cleanQuery);
        }
      } else {
        setErrorMsg(res.message || 'Aawaz sunai nahi di. Dubara bole ya type kare.');
        setState('error');
      }
    } catch (err: any) {
      console.warn('[VoiceSearch] Mobile transcribe error:', err);
      setErrorMsg('Voice processing me dikkat aayi. Dubara bole ya type kare.');
      setState('error');
    } finally {
      setSearchLoading(false);
    }
  }

  // ── Start Listening / Recording ────────────────────────────────────────
  async function startListening() {
    transcriptRef.current = '';
    audioChunksRef.current = [];
    setLiveTranscript('');
    setResults([]);
    setErrorMsg('');
    stopSecondsTimer();

    // 1. Web Browser (Chrome / Edge / Firefox / Safari)
    if (Platform.OS === 'web') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      // Start hardware audio stream via getUserMedia so browser keeps mic OPEN
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaStreamRef.current = stream;

          if (typeof MediaRecorder !== 'undefined') {
            const mr = new MediaRecorder(stream);
            mr.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            mr.start();
            mediaRecorderRef.current = mr;
          }
        } catch (err: any) {
          console.warn('[VoiceSearch] getUserMedia error:', err);
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setErrorMsg('Microphone access denied. Browser me microphone allow kare.');
            setState('error');
            return;
          }
        }
      }

      // Start Web Speech API with CONTINUOUS = TRUE so it NEVER closes after 0 seconds!
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = true; // Crucial: prevents early 0s closure!
          rec.interimResults = true;
          rec.lang = lang;

          rec.onstart = () => {
            setState('listening');
            setErrorMsg('');
          };

          rec.onresult = (event: any) => {
            let text = '';
            for (let i = 0; i < event.results.length; i++) {
              text += event.results[i][0].transcript;
            }
            if (text) {
              transcriptRef.current = text;
              setLiveTranscript(text);
            }
          };

          rec.onerror = (e: any) => {
            // Ignore non-fatal no-speech events so timer continues running!
            if (e.error === 'no-speech') return;
            console.warn('[VoiceSearch] Web speech error:', e.error);
            if (e.error === 'not-allowed') {
              setErrorMsg('Microphone permission denied. Browser settings me allow kare.');
              setState('error');
            }
          };

          rec.onend = () => {
            // Only finalize if state is still listening
          };

          activeRecRef.current = rec;
          rec.start();
        } catch (err: any) {
          console.warn('[VoiceSearch] SpeechRecognition start error:', err);
        }
      }

      // Mark state as listening and run the full 5-second countdown timer!
      setState('listening');
      startSecondsTimer(() => {
        stopListeningAndProcess();
      });
      return;
    }

    // 2. Mobile (Android / iOS) - Try expo-audio first (Expo SDK 57 official module)
    if (SafeExpoAudio) {
      try {
        const perm = await SafeExpoAudio.requestRecordingPermissionsAsync?.();
        if (perm && !perm.granted) {
          Alert.alert(
            'Microphone Permission Required',
            'GoRide requires microphone access to search destinations with voice.',
            [{ text: 'OK' }]
          );
          setErrorMsg('Microphone permission denied. Phone settings me allow kare.');
          setState('error');
          return;
        }

        if (SafeExpoAudio.setAudioModeAsync) {
          await SafeExpoAudio.setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          }).catch(() => {});
        }

        const AudioRecorderClass = SafeExpoAudio.AudioRecorder || SafeExpoAudio.AudioModule?.AudioRecorder;
        if (AudioRecorderClass) {
          const recorder = new AudioRecorderClass(SafeExpoAudio.RecordingPresets?.HIGH_QUALITY || {});
          await recorder.prepareToRecordAsync();
          recorder.record();
          activeRecRef.current = recorder;

          setState('listening');
          startSecondsTimer(() => {
            stopListeningAndProcess();
          });
          return;
        }
      } catch (err) {
        console.warn('[VoiceSearch] expo-audio start error:', err);
      }
    }

    // 3. Mobile (Android / iOS) - Try legacy expo-av if available
    if (SafeExpoAV?.Audio?.Recording) {
      try {
        const Audio = SafeExpoAV.Audio;
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            'Microphone Permission Required',
            'GoRide requires microphone access to search destinations with voice.',
            [{ text: 'OK' }]
          );
          setErrorMsg('Microphone permission denied. Phone settings me allow kare.');
          setState('error');
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        }).catch(() => {});

        if (activeRecRef.current?.stopAndUnloadAsync) {
          try { await activeRecRef.current.stopAndUnloadAsync(); } catch {}
          activeRecRef.current = null;
        }

        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await recording.startAsync();
        activeRecRef.current = recording;

        setState('listening');
        startSecondsTimer(() => {
          stopListeningAndProcess();
        });
        return;
      } catch (err) {
        console.warn('[VoiceSearch] SafeExpoAV failed:', err);
      }
    }

    // 4. Mobile Fallback (e.g. basic Expo Go or emulator without native mic module):
    // Run the active listening timer so mic doesn't close in 0s, and open native keyboard mic!
    setState('listening');
    setErrorMsg('Keyboard mic (🎤) se bole ya niche diye destination par tap kare.');
    inputRef.current?.focus();
    startSecondsTimer(() => {
      setState('idle');
    });
  }

  // ── Mic Button Tap Handler ─────────────────────────────────────────────
  function handleMicTap() {
    if (state === 'listening') {
      stopListeningAndProcess();
    } else {
      startListening();
    }
  }

  // ── Reset on Modal Open / Close ────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setState('idle');
      setLiveTranscript('');
      setEditableQuery('');
      setResults([]);
      setErrorMsg('');
      setRecordSeconds(0);
      stopSecondsTimer();
    } else {
      stopSecondsTimer();
      if (Platform.OS === 'web') {
        try { activeRecRef.current?.stop?.(); } catch {}
        if (mediaStreamRef.current) {
          try {
            mediaStreamRef.current.getTracks().forEach((track: any) => track.stop());
          } catch {}
          mediaStreamRef.current = null;
        }
      } else {
        if (typeof activeRecRef.current?.stop === 'function') {
          activeRecRef.current.stop().catch(() => {});
        } else if (typeof activeRecRef.current?.stopAndUnloadAsync === 'function') {
          activeRecRef.current.stopAndUnloadAsync().catch(() => {});
        }
      }
      activeRecRef.current = null;
    }
  }, [visible]);

  // ── Language Toggle Handler ────────────────────────────────────────────
  function handleLangChange(newLang: 'hi-IN' | 'en-IN') {
    if (newLang === lang) return;
    setLang(newLang);
    if (state === 'listening') {
      stopListeningAndProcess();
      setTimeout(() => startListening(), 300);
    }
  }

  // ── Select Location Callback ───────────────────────────────────────────
  function handleSelectLocation(loc: PlaceResult) {
    Keyboard.dismiss();
    onLocationSelected({
      address: loc.address,
      latitude: loc.latitude,
      longitude: loc.longitude,
    });
    onClose();
  }

  if (!visible) return null;

  const rippleStyle = (ripple: Animated.Value) => ({
    opacity: ripple.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.45, 0.2, 0] }),
    transform: [{
      scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }),
    }],
  });

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropAnim }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Grabber */}
        <View style={styles.grabber} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Voice Destination Search</Text>
            <Text style={styles.headerSub}>Speak Hindi, Hinglish, or English</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Language Toggle */}
        <View style={styles.langRow}>
          <TouchableOpacity
            style={[styles.langBtn, lang === 'hi-IN' && styles.langBtnActive]}
            onPress={() => handleLangChange('hi-IN')}>
            <Text style={[styles.langBtnText, lang === 'hi-IN' && styles.langBtnTextActive]}>
              🇮🇳 Hinglish / हिन्दी
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langBtn, lang === 'en-IN' && styles.langBtnActive]}
            onPress={() => handleLangChange('en-IN')}>
            <Text style={[styles.langBtnText, lang === 'en-IN' && styles.langBtnTextActive]}>
              🇬🇧 English
            </Text>
          </TouchableOpacity>
        </View>

        {/* Mic circle with pulsing ripple */}
        <View style={styles.micContainer}>
          {state === 'listening' ? (
            <>
              <Animated.View style={[styles.ripple, rippleStyle(ripple1)]} />
              <Animated.View style={[styles.ripple, rippleStyle(ripple2)]} />
            </>
          ) : null}
          <TouchableOpacity onPress={handleMicTap} activeOpacity={0.85}>
            <Animated.View style={[
              styles.micCircle,
              state === 'listening' && styles.micCircleActive,
              { transform: [{ scale: pulseScale }] },
            ]}>
              {state === 'processing' ? (
                <ActivityIndicator color={Colors.white} size="large" />
              ) : (
                <Ionicons
                  name={state === 'listening' ? 'radio' : 'mic'}
                  size={38}
                  color={Colors.white}
                />
              )}
            </Animated.View>
          </TouchableOpacity>
        </View>

        {/* Dynamic Status text with live timer! */}
        <Text style={styles.statusText}>
          {state === 'idle'
            ? 'Tap mic to speak your destination'
            : state === 'listening'
            ? `Listening… speak destination 🎙️ (${recordSeconds}s / 5s)`
            : state === 'processing'
            ? 'Finding destination & places…'
            : state === 'results'
            ? 'Select your destination below'
            : 'Tap mic to speak or select destination'}
        </Text>

        {/* Real-time live transcript bubble */}
        {Boolean(state === 'listening' || liveTranscript) ? (
          <View style={styles.transcriptBox}>
            <Ionicons name="mic-outline" size={16} color={Colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.transcriptText} numberOfLines={2}>
              {liveTranscript || 'Listening to your voice…'}
            </Text>
          </View>
        ) : null}

        {/* Editable query input + Search button */}
        {Boolean(state === 'results' || state === 'error' || editableQuery) ? (
          <View style={styles.editRow}>
            <TextInput
              ref={inputRef}
              style={styles.editInput}
              value={editableQuery}
              onChangeText={setEditableQuery}
              placeholder="Edit destination or type here…"
              placeholderTextColor={Colors.textMuted}
              returnKeyType="search"
              onSubmitEditing={() => triggerSearch(editableQuery)}
            />
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={() => triggerSearch(editableQuery)}
              disabled={searchLoading}>
              <Ionicons name="search" size={18} color={Colors.white} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Error message */}
        {Boolean(state === 'error' && errorMsg) ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Sample hint chips (quick tap to search) */}
        {Boolean(state === 'idle' || state === 'listening' || (state === 'error' && results.length === 0)) ? (
          <View style={styles.hintSection}>
            <Text style={styles.hintLabel}>Popular destinations:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScrollContainer}
            >
              {SAMPLE_PROMPTS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={styles.chip}
                  onPress={() => {
                    stopSecondsTimer();
                    if (Platform.OS === 'web') {
                      try { activeRecRef.current?.stop?.(); } catch {}
                    }
                    setEditableQuery(p);
                    setLiveTranscript(p);
                    triggerSearch(p);
                  }}>
                  <Ionicons name="location-outline" size={13} color={Colors.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.chipText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Search Results list */}
        {results.length > 0 ? (
          <ScrollView
            style={styles.resultsList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {results.map((loc, idx) => (
              <TouchableOpacity
                key={`${loc.latitude}-${loc.longitude}-${idx}`}
                style={styles.resultItem}
                onPress={() => handleSelectLocation(loc)}
                activeOpacity={0.7}>
                <View style={styles.resultIconWrap}>
                  <Ionicons name="location" size={20} color={Colors.primary} />
                </View>
                <View style={styles.resultTextWrap}>
                  <Text style={styles.resultTitle} numberOfLines={1}>
                    {loc.address.split(',')[0]}
                  </Text>
                  <Text style={styles.resultSub} numberOfLines={1}>
                    {loc.address}
                  </Text>
                </View>
                {idx === 0 ? (
                  <View style={styles.bestMatchBadge}>
                    <Text style={styles.bestMatchText}>Best Match</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const MIC_SIZE = 84;
const RIPPLE_SIZE = MIC_SIZE * 2.5;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '88%',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  grabber: {
    width: 44,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: Spacing.xs,
  },

  // Language toggle
  langRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.full,
    padding: 3,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  langBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  langBtnActive: {
    backgroundColor: Colors.primary,
  },
  langBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  langBtnTextActive: {
    color: Colors.white,
    fontWeight: FontWeight.semibold,
  },

  // Mic & ripples
  micContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: RIPPLE_SIZE,
    marginVertical: Spacing.xs,
  },
  ripple: {
    position: 'absolute',
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    backgroundColor: Colors.primary,
  },
  micCircle: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  micCircleActive: {
    backgroundColor: '#E11D48',
    shadowColor: '#E11D48',
  },

  // Status & transcript
  statusText: {
    textAlign: 'center',
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  transcriptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    marginHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
    minHeight: 42,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  transcriptText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontStyle: 'normal',
    fontWeight: FontWeight.medium,
  },

  // Editable query input
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '60',
    overflow: 'hidden',
  },
  editInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },
  searchBtn: {
    width: 48,
    height: 48,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.errorFaint,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.error,
    fontWeight: FontWeight.medium,
  },

  // Popular chips
  hintSection: {
    marginBottom: Spacing.md,
  },
  hintLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipScrollContainer: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: FontSize.xs,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },

  // Results list
  resultsList: {
    maxHeight: 260,
    marginTop: Spacing.xs,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  resultIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  resultTextWrap: { flex: 1 },
  resultTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  resultSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  bestMatchBadge: {
    backgroundColor: Colors.successFaint,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    marginLeft: Spacing.sm,
  },
  bestMatchText: {
    fontSize: FontSize.xs,
    color: Colors.success,
    fontWeight: FontWeight.bold,
  },
});
