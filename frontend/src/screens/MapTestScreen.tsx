/**
 * MapTestScreen — Minimal Map test for Expo Go and Web.
 * Purpose: prove Map component renders cleanly across platforms.
 */
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { MapContainer } from '../components/map/MapContainer';

export default function MapTestScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>GoRide Map Test</Text>
        <Text style={styles.sub}>Testing map rendering across Mobile and Web.</Text>
      </View>

      <View style={styles.mapBox}>
        <MapContainer
          initialRegion={{
            latitude: 28.6139,
            longitude: 77.209,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? 48 : 60,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111' },
  sub: { fontSize: 14, color: '#666', marginTop: 4 },
  mapBox: {
    flex: 1,
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
});


