import { StyleSheet, View, Text, Pressable } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { stations } from "../../data/stations";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRef } from "react";
import * as Location from "expo-location";
import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, onSnapshot } from "firebase/firestore";

export default function HomeScreen() {
  // State to hold real-time station status
  type StationReport = {
    petrol: boolean;
    diesel: boolean;
    timestamp?: any;
  };

  const [stationStatus, setStationStatus] = useState<Record<string, StationReport>>({});
  const mapRef = useRef<MapView | null>(null);

  // Real-time updates from Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "fuelReports"), (snapshot) => {
      const reports = {};

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const existing = reports[data.stationId];

        if (
          !existing ||
          (data.timestamp &&
            existing.timestamp &&
            data.timestamp.seconds > existing.timestamp.seconds)
        ) {
          reports[data.stationId] = {
            petrol: data.petrol,
            diesel: data.diesel,
            timestamp: data.timestamp,
          };
        }
      });

      setStationStatus(reports);
    });

    return unsubscribe;
  }, []);

  // Color coding based on fuel availability
  const getMarkerColor = (stationId: string) => {
    const report = stationStatus[stationId];

    // No report yet - gray
    if (!report) return "#94a3b8";

    // Both unavailable - red
    if (!report.petrol && !report.diesel) return "#e74c3c";

    // Any fuel available - green
    return "#2ecc71";
  };

  // Icon logic based on what fuels are available
  const getFuelIcon = (stationId: string) => {
    const report = stationStatus[stationId];

    // No report yet - show gray gas station
    if (!report) return "gas-station";

    // Case 1: Both petrol AND diesel available
    if (report.petrol && report.diesel) {
      return "gas-station"; // You could also use "local-gas-station" or keep as gas-station
    }

    // Case 2: Only petrol available
    if (report.petrol && !report.diesel) {
      return "gas-station";
    }

    // Case 3: Only diesel available
    if (!report.petrol && report.diesel) {
      return "truck";
    }

    // Case 4: No fuel available - red X or close icon
    return "close-circle";
  };

  // Optional: Get subtitle for marker (shows what's available)
  const getFuelSubtitle = (stationId: string) => {
    const report = stationStatus[stationId];
    if (!report) return "No reports";
    
    const available = [];
    if (report.petrol) available.push("⛽");
    if (report.diesel) available.push("🚛");
    
    if (available.length === 0) return "No fuel";
    return available.join(" ");
  };

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
                  name={getFuelIcon(station.id)}
                  size={24}
                  color={getMarkerColor(station.id)}
                />
                {/* Small indicator for both fuels available */}
                {stationStatus[station.id]?.petrol && stationStatus[station.id]?.diesel && (
                  <View style={styles.bothIndicator}>
                    <Text style={styles.bothIndicatorText}>⛽🚛</Text>
                  </View>
                )}
              </View>
              <View style={styles.markerLabel}>
                <Text style={styles.markerText}>{station.name}</Text>
                <Text style={styles.markerSubText}>{getFuelSubtitle(station.id)}</Text>
              </View>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Legend */}
      <View style={styles.legendContainer}>
        <Text style={{ fontWeight: "bold", marginBottom: 5 }}>Legend</Text>

        <View style={styles.legendItem}>
          <MaterialCommunityIcons name="gas-station" size={16} color="#94a3b8" />
          <Text style={styles.legendText}> No reports (gray)</Text>
        </View>

        <View style={styles.legendItem}>
          <MaterialCommunityIcons name="gas-station" size={16} color="#2ecc71" />
          <Text style={styles.legendText}> Petrol only</Text>
        </View>

        <View style={styles.legendItem}>
          <MaterialCommunityIcons name="truck" size={16} color="#2ecc71" />
          <Text style={styles.legendText}> Diesel only</Text>
        </View>

        <View style={styles.legendItem}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <MaterialCommunityIcons name="gas-station" size={16} color="#2ecc71" />
            <Text style={{ marginHorizontal: 2 }}>+</Text>
            <MaterialCommunityIcons name="truck" size={16} color="#2ecc71" />
          </View>
          <Text style={styles.legendText}> Both available</Text>
        </View>

        <View style={styles.legendItem}>
          <MaterialCommunityIcons name="close-circle" size={16} color="#e74c3c" />
          <Text style={styles.legendText}> No fuel</Text>
        </View>
      </View>

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
    width: 70,
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
    position: "relative",
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
  markerSubText: {
    fontSize: 9,
    color: "#ddd",
    textAlign: "center",
  },
  bothIndicator: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#2ecc71",
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  bothIndicatorText: {
    fontSize: 8,
    color: "white",
    fontWeight: "bold",
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
  legendContainer: {
    position: "absolute",
    top: 20,
    left: 15,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    padding: 12,
    borderRadius: 10,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  legendText: {
    fontSize: 12,
    color: "#333",
    marginLeft: 4,
  },
});