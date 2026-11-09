import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DriverStackParamList } from '../../navigation/DriverNavigator';
import { Colors } from '../../constants/colors';
import { BorderRadius, FontSize, FontWeight, Spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { updateDriverProfile } from '../../services/api/driverApi';

type Props = NativeStackScreenProps<DriverStackParamList, 'EditProfile'>;
type DocKey = 'drivingLicense' | 'registrationCertificate' | 'insurance' | 'permit' | 'pollutionCertificate' | 'other';
const docs: Array<[DocKey, string]> = [['drivingLicense', 'Driving licence'], ['registrationCertificate', 'RC (registration certificate)'], ['insurance', 'Vehicle insurance'], ['permit', 'Vehicle permit'], ['pollutionCertificate', 'PUC'], ['other', 'Other required document']];

export default function EditProfileScreen({ navigation }: Props) {
  const { driver, user, updateLocalDriver } = useAuth();
  const current = driver || (user as any);
  const [name, setName] = useState(current?.name || '');
  const [profileImage, setProfileImage] = useState(current?.profileImage || '');
  const [vehicleModel, setVehicleModel] = useState(current?.vehicleModel || '');
  const [vehicleMake, setVehicleMake] = useState(current?.vehicleMake || '');
  const [vehicleColor, setVehicleColor] = useState(current?.vehicleColor || '');
  const [registrationDetails, setRegistrationDetails] = useState(current?.vehicleRegistrationDetails || '');
  const [licenseExpiryDate, setLicenseExpiryDate] = useState(current?.licenseExpiryDate ? String(current.licenseExpiryDate).slice(0, 10) : '');
  const [contactName, setContactName] = useState(current?.emergencyContacts?.[0]?.name || '');
  const [contactPhone, setContactPhone] = useState(current?.emergencyContacts?.[0]?.phone || '');
  const [contactEmail, setContactEmail] = useState(current?.emergencyContacts?.[0]?.email || '');
  const [shareTripStatus, setShareTripStatus] = useState(current?.safetyPreferences?.shareTripStatus ?? true);
  const [sosConfirmation, setSosConfirmation] = useState(current?.safetyPreferences?.sosConfirmation ?? true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(current?.preferences?.notificationsEnabled ?? true);
  const [documents, setDocuments] = useState<Record<DocKey, string>>(() => docs.reduce((value, [key]) => ({ ...value, [key]: current?.documents?.[key] || '' }), {} as Record<DocKey, string>));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || !vehicleModel.trim()) return Alert.alert('Required details', 'Name and vehicle model are required.');
    if (contactPhone && !/^\d{10}$/.test(contactPhone)) return Alert.alert('Invalid emergency contact', 'Enter a 10-digit phone number.');
    const documentPayload = Object.fromEntries(Object.entries(documents).filter(([, value]) => value.trim()));
    const hasChangedDocuments = Object.entries(documentPayload).some(([key, value]) => value !== current?.documents?.[key]);
    setSaving(true);
    try {
      const response = await updateDriverProfile({
        name: name.trim(), vehicleModel: vehicleModel.trim(), vehicleMake: vehicleMake.trim(), vehicleColor: vehicleColor.trim(), vehicleRegistrationDetails: registrationDetails.trim(), profileImage: profileImage.trim() || undefined,
        licenseExpiryDate: licenseExpiryDate ? new Date(`${licenseExpiryDate}T00:00:00.000Z`).toISOString() : undefined,
        ...(hasChangedDocuments ? { documents: documentPayload } : {}),
        emergencyContacts: contactName && contactPhone ? [{ name: contactName.trim(), phone: contactPhone, ...(contactEmail.trim() ? { email: contactEmail.trim() } : {}) }] : [],
        safetyPreferences: { shareTripStatus, sosConfirmation }, preferences: { language: current?.preferences?.language || 'en', notificationsEnabled, communicationPreference: current?.preferences?.communicationPreference || 'push' },
      } as any);
      updateLocalDriver(response.driver as any);
      Alert.alert('Profile saved', hasChangedDocuments ? 'Your profile was updated. New document links are pending verification.' : 'Your profile preferences were updated.', [{ text: 'Done', onPress: () => navigation.goBack() }]);
    } catch (error: any) { Alert.alert('Could not save', error?.message || 'Please check your details and try again.'); }
    finally { setSaving(false); }
  }

  return <View style={styles.container}>
    <View style={styles.header}><TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Ionicons name="chevron-back" size={26} color={Colors.textPrimary} /></TouchableOpacity><Text style={styles.title}>Edit driver profile</Text><View style={styles.back} /></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Section title="Personal information"><Field label="Profile photo URL" value={profileImage} onChangeText={setProfileImage} placeholder="https://..." autoCapitalize="none" /><Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" /><ReadOnly label="Phone number" value={current?.phone} note="Change through support after OTP verification." /><ReadOnly label="Email address" value={current?.email} note="Change through support after email verification." /></Section>
      <Section title="Driver information"><ReadOnly label="Driver ID" value={current?._id} /><ReadOnly label="Licence number" value={current?.licenseNumber} note="Licence-number changes require document review." /><Field label="Licence expiry date" value={licenseExpiryDate} onChangeText={setLicenseExpiryDate} placeholder="YYYY-MM-DD" autoCapitalize="none" /><Verification status={current?.documents?.verificationStatus || (current?.isVerified ? 'VERIFIED' : 'PENDING')} /></Section>
      <Section title="Vehicle information"><ReadOnly label="Vehicle number" value={current?.vehicleNumber} note="Registration changes require admin verification." /><ReadOnly label="Vehicle type" value={current?.vehicleType} /><Field label="Vehicle model" value={vehicleModel} onChangeText={setVehicleModel} placeholder="Model" /><Field label="Vehicle make" value={vehicleMake} onChangeText={setVehicleMake} placeholder="Make" /><Field label="Vehicle color" value={vehicleColor} onChangeText={setVehicleColor} placeholder="Color" /><Field label="Registration details" value={registrationDetails} onChangeText={setRegistrationDetails} placeholder="Registration details" /></Section>
      <Section title="Documents"><Text style={styles.helper}>Paste a secure document link. Updating a document marks it pending for admin verification.</Text>{docs.map(([key, label]) => <Field key={key} label={label} value={documents[key]} onChangeText={(value: string) => setDocuments(old => ({ ...old, [key]: value }))} placeholder="https://secure-document-link" autoCapitalize="none" />)}</Section>
      <Section title="Emergency & safety"><Field label="Emergency contact name" value={contactName} onChangeText={setContactName} placeholder="Contact name" /><Field label="Emergency contact phone" value={contactPhone} onChangeText={setContactPhone} placeholder="10-digit phone number" keyboardType="phone-pad" /><Field label="Emergency contact email" value={contactEmail} onChangeText={setContactEmail} placeholder="Optional email" keyboardType="email-address" autoCapitalize="none" /><Toggle label="Share live trip status" value={shareTripStatus} onValueChange={setShareTripStatus} /><Toggle label="Confirm before sending SOS" value={sosConfirmation} onValueChange={setSosConfirmation} /></Section>
      <Section title="App preferences"><Toggle label="Ride and safety notifications" value={notificationsEnabled} onValueChange={setNotificationsEnabled} /><ReadOnly label="Language" value={current?.preferences?.language === 'hi' ? 'Hindi' : 'English'} /><ReadOnly label="Communication preference" value={current?.preferences?.communicationPreference || 'push'} /></Section>
      <TouchableOpacity style={styles.walletLink} onPress={() => navigation.navigate('Wallet')}><Ionicons name="card-outline" size={22} color={Colors.primary} /><View style={{ flex: 1 }}><Text style={styles.walletTitle}>Bank & payment details</Text><Text style={styles.walletSub}>Manage account, IFSC and UPI payout details in Wallet.</Text></View><Ionicons name="chevron-forward" size={20} color={Colors.textMuted} /></TouchableOpacity>
      <TouchableOpacity style={[styles.save, saving && styles.saveDisabled]} onPress={handleSave} disabled={saving}>{saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>Save profile changes</Text>}</TouchableOpacity>
    </ScrollView>
  </View>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function Field({ label, ...props }: any) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} placeholderTextColor={Colors.textMuted} {...props} /></View>; }
function ReadOnly({ label, value, note }: { label: string; value?: string; note?: string }) { return <View style={styles.readOnly}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value || 'Not provided'}</Text>{note && <Text style={styles.note}>{note}</Text>}</View>; }
function Toggle({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) { return <View style={styles.toggle}><Text style={styles.toggleLabel}>{label}</Text><Switch value={value} onValueChange={onValueChange} trackColor={{ false: Colors.border, true: Colors.primary }} /></View>; }
function Verification({ status }: { status: string }) { const verified = status === 'VERIFIED'; return <View style={[styles.verification, verified ? styles.verified : styles.pending]}><Ionicons name={verified ? 'checkmark-circle' : 'time-outline'} size={18} color={verified ? Colors.secondary : Colors.warning} /><Text style={styles.verificationText}>Document verification: {verified ? 'Verified' : 'Pending review'}</Text></View>; }
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: Spacing.md, paddingHorizontal: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.divider }, back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary }, content: { padding: Spacing.lg, paddingBottom: Spacing.huge }, section: { padding: Spacing.lg, backgroundColor: Colors.card, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.divider, marginBottom: Spacing.lg }, sectionTitle: { color: Colors.textPrimary, fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: Spacing.md }, field: { marginBottom: Spacing.md }, label: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginBottom: 6 }, input: { minHeight: 48, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, color: Colors.textPrimary, backgroundColor: Colors.surface }, readOnly: { paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider }, value: { color: Colors.textPrimary, fontSize: FontSize.base }, note: { color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 17, marginTop: 3 }, helper: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 19, marginBottom: Spacing.md }, toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider }, toggleLabel: { color: Colors.textPrimary, flex: 1, marginRight: Spacing.md, fontSize: FontSize.base }, verification: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, marginTop: Spacing.sm, borderRadius: BorderRadius.md }, verified: { backgroundColor: Colors.secondaryFaint }, pending: { backgroundColor: Colors.warningFaint }, verificationText: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.semibold }, walletLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, marginBottom: Spacing.lg, backgroundColor: Colors.primaryFaint, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.divider }, walletTitle: { color: Colors.textPrimary, fontSize: FontSize.base, fontWeight: FontWeight.bold }, walletSub: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 3 }, save: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.lg, backgroundColor: Colors.primary }, saveDisabled: { opacity: 0.65 }, saveText: { color: Colors.white, fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
