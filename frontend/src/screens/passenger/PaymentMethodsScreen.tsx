import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PassengerStackParamList } from '../../navigation/PassengerNavigator';
import { Colors } from '../../constants/colors';
import { BorderRadius, FontSize, FontWeight, Spacing } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { updateProfile } from '../../services/api/authApi';

type Props = NativeStackScreenProps<PassengerStackParamList, 'PaymentMethods'>;
type Method = 'cash' | 'online';

export default function PaymentMethodsScreen({ navigation }: Props) {
  const { user, updateLocalUser } = useAuth();
  const [selected, setSelected] = useState<Method>(user?.preferredPaymentMethod || 'cash');
  const [saving, setSaving] = useState(false);

  async function save(method: Method) {
    setSelected(method);
    setSaving(true);
    try {
      const result = await updateProfile({ preferredPaymentMethod: method });
      updateLocalUser(result.user || { preferredPaymentMethod: method });
    } catch (error: any) {
      setSelected(user?.preferredPaymentMethod || 'cash');
      Alert.alert('Could not save', error?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Payment methods</Text>
        <View style={styles.back} />
      </View>
      <View style={styles.content}>
        <Text style={styles.intro}>Choose the payment method selected by default when you book a ride.</Text>
        <MethodCard icon="wallet-outline" title="Cash" subtitle="Pay the driver after the ride" selected={selected === 'cash'} disabled={saving} onPress={() => save('cash')} />
        <MethodCard icon="card-outline" title="Online payment" subtitle="Pay securely by UPI or card after the ride" selected={selected === 'online'} disabled={saving} onPress={() => save('online')} />
        {saving && <ActivityIndicator color={Colors.primary} style={styles.loader} />}
        <View style={styles.note}><Ionicons name="shield-checkmark-outline" size={18} color={Colors.secondary} /><Text style={styles.noteText}>Online payments are completed through Razorpay on the final payment screen.</Text></View>
      </View>
    </View>
  );
}

function MethodCard({ icon, title, subtitle, selected, disabled, onPress }: { icon: any; title: string; subtitle: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <TouchableOpacity style={[styles.card, selected && styles.cardSelected]} onPress={onPress} disabled={disabled} activeOpacity={0.8}>
    <View style={[styles.icon, selected && styles.iconSelected]}><Ionicons name={icon} size={24} color={selected ? Colors.white : Colors.primary} /></View>
    <View style={styles.cardText}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardSubtitle}>{subtitle}</Text></View>
    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? Colors.primary : Colors.textMuted} />
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: Spacing.md, paddingHorizontal: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  back: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }, title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  content: { padding: Spacing.lg }, intro: { color: Colors.textSecondary, fontSize: FontSize.base, lineHeight: 22, marginBottom: Spacing.xl },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.divider, padding: Spacing.lg, borderRadius: BorderRadius.lg, marginBottom: Spacing.md },
  cardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryFaint }, icon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceElevated }, iconSelected: { backgroundColor: Colors.primary },
  cardText: { flex: 1 }, cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 3 }, cardSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 }, loader: { marginTop: Spacing.sm },
  note: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, marginTop: Spacing.xl, backgroundColor: Colors.secondaryFaint, borderRadius: BorderRadius.md }, noteText: { flex: 1, color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 19 },
});
