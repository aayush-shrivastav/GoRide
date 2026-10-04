import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StatusBar,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import {
  getEmergencyContacts,
  addEmergencyContact,
  deleteEmergencyContact,
} from '../../services/api/authApi';
import { parseApiError } from '../../utils/formatters';

type Contact = { _id: string; name: string; phone: string; email?: string };

export default function EmergencyContactsScreen({ navigation }: NativeStackScreenProps<any, any>) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    fetchContacts();
  }, []);

  async function fetchContacts() {
    try {
      setLoading(true);
      const data = await getEmergencyContacts();
      setContacts(data.contacts);
    } catch (err) {
      Alert.alert('Error', parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Error', 'Please fill in name and phone');
      return;
    }
    if (!/^[0-9]{10}$/.test(phone)) {
      Alert.alert('Error', 'Phone must be exactly 10 digits');
      return;
    }
    setSaving(true);
    try {
      const data = await addEmergencyContact({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      });
      setContacts(data.contacts);
      setModalVisible(false);
      setName('');
      setPhone('');
      setEmail('');
    } catch (err) {
      Alert.alert('Error', parseApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(contactId: string, contactName: string) {
    Alert.alert(
      'Remove Contact',
      `Remove ${contactName} from emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const data = await deleteEmergencyContact(contactId);
              setContacts(data.contacts);
            } catch (err) {
              Alert.alert('Error', parseApiError(err));
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Emergency Contacts</Text>
        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          style={styles.addBtn}
          disabled={contacts.length >= 5}>
          <Text style={[styles.addBtnText, contacts.length >= 5 && styles.addBtnDisabled]}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        These contacts will be notified via Email & Notifications with your live location if you trigger an SOS during a ride.
      </Text>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={Colors.primary} />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🆘</Text>
              <Text style={styles.emptyTitle}>No emergency contacts</Text>
              <Text style={styles.emptyText}>Add up to 5 trusted contacts who will receive emergency location alerts.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.contactName}>{item.name}</Text>
                <Text style={styles.contactPhone}>📞 {item.phone}</Text>
                {item.email ? <Text style={styles.contactEmail}>✉️ {item.email}</Text> : null}
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(item._id, item.name)}
                style={styles.deleteBtn}>
                <Text style={styles.deleteIcon}>🗑</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Add Contact Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Emergency Contact</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Full name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="10-digit mobile number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address (For SOS live location email)</Text>
              <TextInput
                style={styles.input}
                placeholder="contact@example.com (optional)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setModalVisible(false); setName(''); setPhone(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 50,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: Spacing.sm },
  backText: { fontSize: 32, lineHeight: 32, color: Colors.textPrimary },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  addBtn: {
    backgroundColor: Colors.primaryFaint,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  addBtnText: { color: Colors.primary, fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  addBtnDisabled: { color: Colors.textMuted },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    margin: Spacing.lg,
    lineHeight: 20,
  },
  loader: { marginTop: Spacing.xxl },
  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: Spacing.xxxl, paddingHorizontal: Spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.errorFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.error },
  info: { flex: 1 },
  contactName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  contactPhone: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  contactEmail: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  deleteBtn: { padding: Spacing.sm },
  deleteIcon: { fontSize: 18 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.sm },
  inputGroup: { gap: Spacing.xs },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },
  modalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  cancelBtn: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelText: { color: Colors.textSecondary, fontWeight: FontWeight.medium, fontSize: FontSize.base },
  saveBtn: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  saveText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.base },
});
