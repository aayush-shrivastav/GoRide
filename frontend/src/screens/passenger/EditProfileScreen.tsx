import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PassengerStackParamList } from '../../navigation/PassengerNavigator';
import { Colors } from '../../constants/colors';
import { BorderRadius, FontSize, FontWeight, Spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { updateProfile } from '../../services/api/authApi';

type Props = NativeStackScreenProps<PassengerStackParamList, 'EditProfile'>;

export default function EditProfileScreen({ navigation }: Props) {
  const { user, updateLocalUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [photo, setPhoto] = useState(user?.profileImage || '');
  const [gender, setGender] = useState(user?.gender || 'prefer_not_to_say');
  const [shareTripStatus, setShareTripStatus] = useState(user?.safetyPreferences?.shareTripStatus ?? true);
  const [sosConfirmation, setSosConfirmation] = useState(user?.safetyPreferences?.sosConfirmation ?? true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.preferences?.notificationsEnabled ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return Alert.alert('Required', 'Enter your full name.');
    setSaving(true);
    try {
      const result = await updateProfile({ name: name.trim(), gender, profileImage: photo.trim() || undefined, safetyPreferences: { shareTripStatus, sosConfirmation }, preferences: { language: user?.preferences?.language || 'en', notificationsEnabled, communicationPreference: user?.preferences?.communicationPreference || 'push' } });
      updateLocalUser(result.user);
      Alert.alert('Profile saved', 'Your profile and safety preferences were updated.', [{ text: 'Done', onPress: () => navigation.goBack() }]);
    } catch (error: any) { Alert.alert('Could not save', error?.message || 'Please try again.'); }
    finally { setSaving(false); }
  }

  return <View style={styles.container}>
    <View style={styles.header}><TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}><Ionicons name="chevron-back" size={26} color={Colors.textPrimary} /></TouchableOpacity><Text style={styles.title}>Edit profile</Text><View style={styles.back} /></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Section title="Personal information"><Field label="Profile photo URL" value={photo} onChangeText={setPhoto} placeholder="https://..." autoCapitalize="none" /><Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" /><ReadOnly label="Phone number" value={user?.phone} note="Change through support after OTP verification." /><ReadOnly label="Email address" value={user?.email} note="Change through support after email verification." /><Text style={styles.label}>Gender</Text><View style={styles.genderRow}>{(['male', 'female', 'other', 'prefer_not_to_say'] as const).map(value => <TouchableOpacity key={value} onPress={() => setGender(value)} style={[styles.gender, gender === value && styles.genderActive]}><Text style={[styles.genderText, gender === value && styles.genderTextActive]}>{value.replace(/_/g, ' ')}</Text></TouchableOpacity>)}</View></Section>
      <Section title="Emergency & safety"><TouchableOpacity style={styles.link} onPress={() => navigation.navigate('EmergencyContacts')}><Ionicons name="people-outline" size={22} color={Colors.primary} /><View style={{ flex: 1 }}><Text style={styles.linkTitle}>Emergency contacts</Text><Text style={styles.linkSub}>Manage up to 5 trusted SOS contacts.</Text></View><Ionicons name="chevron-forward" size={20} color={Colors.textMuted} /></TouchableOpacity><Toggle label="Share live trip status" value={shareTripStatus} onValueChange={setShareTripStatus} /><Toggle label="Confirm before sending SOS" value={sosConfirmation} onValueChange={setSosConfirmation} /></Section>
      <Section title="Payment & app preferences"><TouchableOpacity style={styles.link} onPress={() => navigation.navigate('PaymentMethods')}><Ionicons name="card-outline" size={22} color={Colors.primary} /><View style={{ flex: 1 }}><Text style={styles.linkTitle}>Payment methods</Text><Text style={styles.linkSub}>Default: {user?.preferredPaymentMethod === 'online' ? 'Online payment' : 'Cash'}</Text></View><Ionicons name="chevron-forward" size={20} color={Colors.textMuted} /></TouchableOpacity><Toggle label="Ride and safety notifications" value={notificationsEnabled} onValueChange={setNotificationsEnabled} /><ReadOnly label="Language" value={user?.preferences?.language === 'hi' ? 'Hindi' : 'English'} /><ReadOnly label="Communication preference" value={user?.preferences?.communicationPreference || 'push'} /></Section>
      <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>Save changes</Text>}</TouchableOpacity>
    </ScrollView>
  </View>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function Field({ label, ...props }: any) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} placeholderTextColor={Colors.textMuted} {...props} /></View>; }
function ReadOnly({ label, value, note }: { label: string; value?: string; note?: string }) { return <View style={styles.readOnly}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value || 'Not provided'}</Text>{note && <Text style={styles.note}>{note}</Text>}</View>; }
function Toggle({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) { return <View style={styles.toggle}><Text style={styles.toggleLabel}>{label}</Text><Switch value={value} onValueChange={onValueChange} trackColor={{ false: Colors.border, true: Colors.primary }} /></View>; }
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: Colors.background }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: Spacing.md, paddingHorizontal: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.divider }, back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary }, content: { padding: Spacing.lg, paddingBottom: Spacing.huge }, section: { padding: Spacing.lg, marginBottom: Spacing.lg, borderRadius: BorderRadius.lg, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.divider }, sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.md }, field: { marginBottom: Spacing.md }, label: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold, marginBottom: 6 }, input: { minHeight: 48, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, backgroundColor: Colors.surface }, readOnly: { paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider }, value: { fontSize: FontSize.base, color: Colors.textPrimary }, note: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 3 }, genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }, gender: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border }, genderActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryFaint }, genderText: { color: Colors.textSecondary, textTransform: 'capitalize', fontSize: FontSize.sm }, genderTextActive: { color: Colors.primary, fontWeight: FontWeight.bold }, link: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider }, linkTitle: { color: Colors.textPrimary, fontWeight: FontWeight.bold, fontSize: FontSize.base }, linkSub: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 }, toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider }, toggleLabel: { color: Colors.textPrimary, fontSize: FontSize.base, flex: 1, marginRight: Spacing.md }, save: { minHeight: 54, backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' }, saveText: { color: Colors.white, fontSize: FontSize.base, fontWeight: FontWeight.bold } });
