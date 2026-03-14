import { StyleSheet, View, Text, Pressable } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { stations } from "../../data/stations";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRef } from "react";
import * as Location from "expo-location";
import { useState, useEffect } from "react";
import { db } from "../../firebase"; // correct path
import { collection, onSnapshot } from "firebase/firestore";

export default function HomeScreen() {
  // State to hold real-time station status
  const [stationStatus, setStationStatus] = useState({});
  const mapRef = useRef<MapView | null>(null);

  // Real-time updates from Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "fuelReports"), (snapshot) => {
      const reports = {};

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        reports[data.stationId] = {
          petrol: data.petrol,
          diesel: data.diesel,
          timestamp: data.timestamp,
        };
      });

      setStationStatus(reports);
    });

    // Cleanup listener on unmount
    return unsubscribe;
  }, []); // ✅ Properly closed useEffect

  // ✅ Moved outside useEffect, defined before it's used
  const getMarkerColor = (stationId: string) => {
    const report = stationStatus[stationId];

    if (!report) return "#f1c40f"; // yellow if no reports

    if (report.petrol || report.diesel) {
      return "#2ecc71"; // green
    }

    return "#e74c3c"; // red
  };

  // Center map on real user location
  const goToMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      alert("Permission denied");
      return;
    }

    const location = await Location.getCurrentPositionAsync({});

    mapRef.current?.animateToRegion({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    });
  };

  // Developer test button (centers Addis)
  const goToAddis = () => {
    mapRef.current?.animateToRegion({
      latitude: 9.03,
      longitude: 38.74,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    });
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: 9.03,
          longitude: 38.74,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
      >
        {stations.map((station) => (
          <Marker
            key={station.id}
            coordinate={{
              latitude: station.latitude,
              longitude: station.longitude,
            }}
            onPress={() =>
              router.push({
                pathname: "/station/[id]",
                params: {
                  id: station.id,
                  name: station.name,
                },
              })
            }
          >
            <View style={styles.markerContainer}>
              <View style={styles.markerBubble}>
                <MaterialCommunityIcons
                  name="gas-station"
                  size={24}
                  color={getMarkerColor(station.id)}
                />
              </View>
              <View style={styles.markerLabel}>
                <Text style={styles.markerText}>{station.name}</Text>
              </View>
            </View>
          </Marker>
        ))}
      </MapView>

      <Pressable style={styles.locationButton} onPress={goToMyLocation}>
        <Text style={styles.locationText}>📍 My Location</Text>
      </Pressable>

      <Pressable style={styles.testButton} onPress={goToAddis}>
        <Text style={styles.locationText}>🧪 Test Addis</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    alignItems: "center",
    width: 60,
  },
  markerBubble: {
    backgroundColor: "white",
    padding: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  markerLabel: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  markerText: {
    fontSize: 11,
    fontWeight: "600",
    color: "white",
    textAlign: "center",
  },
  locationButton: {
    position: "absolute",
    bottom: 110,
    right: 20,
    backgroundColor: "#2ecc71",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 25,
    elevation: 5,
  },
  testButton: {
    position: "absolute",
    bottom: 60,
    right: 20,
    backgroundColor: "#3498db",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 25,
    elevation: 5,
  },
  locationText: {
    color: "white",
    fontWeight: "600",
  },
});