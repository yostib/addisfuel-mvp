import { StyleSheet, View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { stations, Station } from "../../data/stations";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import * as Location from "expo-location";
import { db } from "../../firebase";
import { collection, onSnapshot, Timestamp, query, orderBy } from "firebase/firestore";

// Types
interface StationReport {
  petrol: boolean;
  diesel: boolean;
  queueLength?: 'low' | 'medium' | 'high';
  timestamp?: Timestamp;
  reportCount?: number;
  lastReportTime?: Timestamp;
}

interface FirebaseReportData {
  stationId: string;
  petrol: boolean;
  diesel: boolean;
  queueLength?: 'low' | 'medium' | 'high';
  timestamp: Timestamp;
}

// Constants
const REPORT_EXPIRY_MINUTES = 90;
const FRESH_REPORT_THRESHOLD = 5;
const DEFAULT_ZOOM_LEVEL = 0.05;
const ADDIS_ABABA_COORDS = {
  latitude: 9.03,
  longitude: 38.74,
};

// Colors
const COLORS = {
  NO_REPORTS: "#94a3b8",
  FUEL_AVAILABLE: "#2ecc71",
  NO_FUEL: "#e74c3c",
  QUEUE_LOW: "#27ae60",
  QUEUE_MEDIUM: "#f39c12",
  QUEUE_HIGH: "#e74c3c",
  BACKGROUND_WHITE: "white",
  BACKGROUND_DARK: "rgba(0, 0, 0, 0.7)",
  BACKGROUND_LIGHT: "rgba(255, 255, 255, 0.95)",
} as const;

export default function HomeScreen() {
  const [stationStatus, setStationStatus] = useState<Record<string, StationReport>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  
  const mapRef = useRef<MapView | null>(null);

  // Real-time updates from Firebase with error handling
  useEffect(() => {
    setIsLoading(true);
    
    // Query ordered by timestamp to get latest reports
    const q = query(collection(db, "fuelReports"), orderBy("timestamp", "desc"));
    
    const unsubscribe = onSnapshot(
      q, 
      (snapshot) => {
        const reports: Record<string, StationReport> = {};
        const reportCounts: Record<string, number> = {};

        // First pass: count reports per station
        snapshot.docs.forEach((doc) => {
          const data = doc.data() as FirebaseReportData;
          reportCounts[data.stationId] = (reportCounts[data.stationId] || 0) + 1;
        });

        // Second pass: get latest report for each station
        snapshot.docs.forEach((doc) => {
          const data = doc.data() as FirebaseReportData;
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
              queueLength: data.queueLength,
              timestamp: data.timestamp,
              reportCount: reportCounts[data.stationId] || 0,
              lastReportTime: data.timestamp,
            };
          }
        });

        setStationStatus(reports);
        setIsLoading(false);
        setIsRefreshing(false);
      },
      (error) => {
        console.error("Firestore listener error:", error);
        Alert.alert(
          "Connection Error",
          "Failed to fetch fuel reports. Please check your internet connection."
        );
        setIsLoading(false);
        setIsRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Memoized helper functions
  const getReportAgeMinutes = useCallback((timestamp?: Timestamp): number | null => {
    if (!timestamp?.seconds) return null;

    const reportTime = timestamp.seconds * 1000;
    const now = Date.now();
    const ageInMinutes = (now - reportTime) / 60000;

    return Math.round(ageInMinutes * 10) / 10;
  }, []);

  const getMarkerColor = useCallback((stationId: string): string => {
    const report = stationStatus[stationId];
    if (!report?.timestamp) return COLORS.NO_REPORTS;

    const age = getReportAgeMinutes(report.timestamp);
    if (age && age > REPORT_EXPIRY_MINUTES) return COLORS.NO_REPORTS;

    if (report.petrol || report.diesel) {
      // If fuel is available, use queue length for color intensity
      if (report.queueLength === 'high') return "#e67e22";
      if (report.queueLength === 'medium') return "#f1c40f";
      return COLORS.FUEL_AVAILABLE;
    }
    return COLORS.NO_FUEL;
  }, [stationStatus, getReportAgeMinutes]);

  const getFuelIcon = useCallback((stationId: string): string => {
    const report = stationStatus[stationId];
    if (!report) return "gas-station";

    if (report.petrol && !report.diesel) return "gas-station";
    if (!report.petrol && report.diesel) return "truck";
    if (report.petrol && report.diesel) return "gas-station";
    return "close-circle";
  }, [stationStatus]);

  const getFuelTypeIndicator = useCallback((stationId: string): string => {
    const report = stationStatus[stationId];
    if (!report) return "⚪";
    
    if (report.petrol && report.diesel) return "⛽🚛";
    if (report.petrol) return "⛽";
    if (report.diesel) return "🚛";
    return "❌";
  }, [stationStatus]);

  const getQueueIcon = useCallback((stationId: string): string => {
    const report = stationStatus[stationId];
    if (!report?.queueLength) return "";
    
    switch(report.queueLength) {
      case 'low': return "🟢";
      case 'medium': return "🟡";
      case 'high': return "🔴";
      default: return "";
    }
  }, [stationStatus]);

  const getFuelSubtitle = useCallback((stationId: string): string => {
    const report = stationStatus[stationId];
    if (!report) return "No reports";
    
    const fuelTypes = [];
    if (report.petrol) fuelTypes.push("⛽ Petrol");
    if (report.diesel) fuelTypes.push("🚛 Diesel");
    
    if (fuelTypes.length === 0) return "No fuel";
    return fuelTypes.join(" • ");
  }, [stationStatus]);

  const getQueueText = useCallback((stationId: string): string => {
    const report = stationStatus[stationId];
    if (!report?.queueLength) return "";
    
    const queueMap = {
      low: "🟢 Low queue",
      medium: "🟡 Medium queue",
      high: "🔴 Long queue"
    };
    return queueMap[report.queueLength];
  }, [stationStatus]);

  const getFreshnessLabel = useCallback((stationId: string): string => {
    const report = stationStatus[stationId];
    if (!report?.timestamp) return "No reports";

    const age = getReportAgeMinutes(report.timestamp);
    if (age === null) return "Unknown";

    if (age < FRESH_REPORT_THRESHOLD) return "🟢 Just reported";
    if (age < 30) return `🟡 ${age} min ago`;
    if (age < REPORT_EXPIRY_MINUTES) return `🟠 ${age} min ago (old)`;
    return "🔴 Report expired";
  }, [stationStatus, getReportAgeMinutes]);

  const hasBothFuels = useCallback((stationId: string): boolean => {
    const report = stationStatus[stationId];
    return report?.petrol && report?.diesel || false;
  }, [stationStatus]);

  // Location functions
  const goToMyLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === "granted");

      if (status !== "granted") {
        Alert.alert(
          "Location Permission Required",
          "Please enable location services to see your position on the map.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Settings", onPress: () => Location.openSettings() }
          ]
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      mapRef.current?.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: DEFAULT_ZOOM_LEVEL,
        longitudeDelta: DEFAULT_ZOOM_LEVEL,
      });
    } catch (error) {
      console.error("Error getting location:", error);
      Alert.alert(
        "Location Error",
        "Could not get your location. Please check if GPS is enabled."
      );
    }
  }, []);

  const goToAddis = useCallback(() => {
    mapRef.current?.animateToRegion({
      ...ADDIS_ABABA_COORDS,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    });
  }, []);

  const handleMarkerPress = useCallback((station: Station) => {
    setSelectedStation(station.id);
    router.push({
      pathname: "/station/[id]",
      params: {
        id: station.id,
        name: station.name,
      },
    });
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setStationStatus({});
  }, []);

  // Memoized markers
  const markers = useMemo(() => (
    stations.map((station) => {
      const report = stationStatus[station.id];
      const fuelIndicator = getFuelTypeIndicator(station.id);
      const queueIcon = getQueueIcon(station.id);
      const isSelected = selectedStation === station.id;
      
      return (
        <Marker
          key={station.id}
          coordinate={{
            latitude: station.latitude,
            longitude: station.longitude,
          }}
          onPress={() => handleMarkerPress(station)}
          tracksViewChanges={false}
        >
          <View style={[
            styles.markerContainer,
            isSelected && styles.selectedMarker
          ]}>
            <View style={styles.markerBubble}>
              <MaterialCommunityIcons
                name={getFuelIcon(station.id)}
                size={24}
                color={getMarkerColor(station.id)}
              />
              {/* Fuel Type Badge */}
              <View style={styles.fuelTypeBadge}>
                <Text style={styles.fuelTypeText}>{fuelIndicator}</Text>
              </View>
              {/* Queue Badge */}
              {queueIcon && (
                <View style={styles.queueBadge}>
                  <Text style={styles.queueText}>{queueIcon}</Text>
                </View>
              )}
            </View>
            <View style={styles.markerLabel}>
              <Text style={styles.markerText} numberOfLines={1}>
                {station.name}
              </Text>
              <Text style={styles.markerSubText} numberOfLines={1}>
                {getFuelSubtitle(station.id)}
              </Text>
              {report?.queueLength && (
                <Text style={styles.queueText} numberOfLines={1}>
                  {getQueueText(station.id)}
                </Text>
              )}
              <Text style={styles.freshnessText} numberOfLines={1}>
                {getFreshnessLabel(station.id)}
              </Text>
              {report?.reportCount && report.reportCount > 0 && (
                <Text style={styles.reportCountText}>
                  📊 {report.reportCount} reports
                </Text>
              )}
            </View>
          </View>
        </Marker>
      );
    })
  ), [stationStatus, selectedStation]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.FUEL_AVAILABLE} />
        <Text style={styles.loadingText}>Loading fuel reports...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          ...ADDIS_ABABA_COORDS,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
        showsUserLocation={locationPermission === true}
        showsMyLocationButton={false}
        loadingEnabled={true}
        loadingIndicatorColor={COLORS.FUEL_AVAILABLE}
        loadingBackgroundColor={COLORS.BACKGROUND_LIGHT}
      >
        {markers}
      </MapView>

      {/* Refresh Button */}
      <Pressable 
        style={[styles.refreshButton, isRefreshing && styles.disabledButton]} 
        onPress={handleRefresh}
        disabled={isRefreshing}
      >
        <MaterialCommunityIcons 
          name={isRefreshing ? "loading" : "refresh"} 
          size={20} 
          color="white" 
        />
      </Pressable>

      {/* Legend Toggle */}
      <Pressable 
        style={styles.legendToggle} 
        onPress={() => setShowLegend(!showLegend)}
      >
        <MaterialCommunityIcons 
          name={showLegend ? "eye" : "eye-off"} 
          size={20} 
          color="white" 
        />
      </Pressable>

      {/* Legend */}
      {showLegend && (
        <View style={styles.legendContainer}>
          <Text style={styles.legendTitle}>📍 Legend</Text>

          <View style={styles.legendItem}>
            <MaterialCommunityIcons name="gas-station" size={16} color={COLORS.NO_REPORTS} />
            <Text style={styles.legendText}> No reports</Text>
          </View>

          <View style={styles.legendItem}>
            <View style={styles.legendFuelRow}>
              <Text style={styles.legendFuelText}>⛽</Text>
              <Text style={styles.legendFuelText}> Petrol</Text>
            </View>
          </View>

          <View style={styles.legendItem}>
            <View style={styles.legendFuelRow}>
              <Text style={styles.legendFuelText}>🚛</Text>
              <Text style={styles.legendFuelText}> Diesel</Text>
            </View>
          </View>

          <View style={styles.legendDivider} />
          
          <Text style={styles.legendSubTitle}>Queue Length:</Text>
          
          <View style={styles.legendItem}>
            <Text style={styles.legendQueueText}>🟢</Text>
            <Text style={styles.legendText}> Low queue</Text>
          </View>

          <View style={styles.legendItem}>
            <Text style={styles.legendQueueText}>🟡</Text>
            <Text style={styles.legendText}> Medium queue</Text>
          </View>

          <View style={styles.legendItem}>
            <Text style={styles.legendQueueText}>🔴</Text>
            <Text style={styles.legendText}> Long queue</Text>
          </View>

          <View style={styles.legendDivider} />
          
          <Text style={styles.legendNote}>
            Reports expire after {REPORT_EXPIRY_MINUTES} minutes
          </Text>
          <Text style={styles.legendNote}>
            • Shows fuel type badges on markers
          </Text>
          <Text style={styles.legendNote}>
            • Queue indicators available
          </Text>
        </View>
      )}

      <Pressable style={styles.locationButton} onPress={goToMyLocation}>
        <MaterialCommunityIcons name="crosshairs-gps" size={20} color="white" />
        <Text style={styles.locationText}> My Location</Text>
      </Pressable>

      <Pressable style={styles.testButton} onPress={goToAddis}>
        <MaterialCommunityIcons name="map-marker" size={20} color="white" />
        <Text style={styles.locationText}> Addis Ababa</Text>
      </Pressable>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          📊 {Object.keys(stationStatus).length} stations with reports
        </Text>
      </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.BACKGROUND_LIGHT,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  markerContainer: {
    alignItems: "center",
    width: 90,
  },
  selectedMarker: {
    transform: [{ scale: 1.1 }],
  },
  markerBubble: {
    backgroundColor: COLORS.BACKGROUND_WHITE,
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
    backgroundColor: COLORS.BACKGROUND_DARK,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
    maxWidth: 120,
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
  freshnessText: {
    fontSize: 8,
    color: "#aaa",
    textAlign: "center",
    marginTop: 2,
  },
  reportCountText: {
    fontSize: 8,
    color: "#f1c40f",
    textAlign: "center",
    marginTop: 2,
  },
  queueText: {
    fontSize: 9,
    color: "#f39c12",
    textAlign: "center",
  },
  fuelTypeBadge: {
    position: "absolute",
    top: -8,
    left: -8,
    backgroundColor: "#2c3e50",
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: "white",
  },
  fuelTypeText: {
    fontSize: 10,
    color: "white",
    fontWeight: "bold",
  },
  queueBadge: {
    position: "absolute",
    bottom: -8,
    right: -8,
    backgroundColor: "white",
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: "#2c3e50",
  },
  bothIndicator: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: COLORS.FUEL_AVAILABLE,
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
    backgroundColor: COLORS.FUEL_AVAILABLE,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 25,
    elevation: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  testButton: {
    position: "absolute",
    bottom: 60,
    right: 20,
    backgroundColor: "#3498db",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 25,
    elevation: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  refreshButton: {
    position: "absolute",
    top: 20,
    right: 20,
    backgroundColor: COLORS.FUEL_AVAILABLE,
    padding: 12,
    borderRadius: 30,
    elevation: 5,
    zIndex: 1,
  },
  disabledButton: {
    opacity: 0.5,
  },
  legendToggle: {
    position: "absolute",
    top: 20,
    left: 15,
    backgroundColor: "#3498db",
    padding: 12,
    borderRadius: 30,
    elevation: 5,
    zIndex: 1,
  },
  legendContainer: {
    position: "absolute",
    top: 80,
    left: 15,
    backgroundColor: COLORS.BACKGROUND_LIGHT,
    padding: 15,
    borderRadius: 10,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    maxWidth: 200,
  },
  legendTitle: {
    fontWeight: "bold",
    marginBottom: 8,
    fontSize: 14,
  },
  legendSubTitle: {
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 4,
    fontSize: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  legendFuelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendFuelText: {
    fontSize: 14,
  },
  legendQueueText: {
    fontSize: 16,
    marginRight: 4,
  },
  legendText: {
    fontSize: 12,
    color: "#333",
    marginLeft: 6,
  },
  legendDivider: {
    height: 1,
    backgroundColor: "#ddd",
    marginVertical: 8,
  },
  legendNote: {
    fontSize: 10,
    color: "#666",
    fontStyle: "italic",
    marginTop: 4,
  },
  locationText: {
    color: "white",
    fontWeight: "600",
    marginLeft: 4,
  },
  statsContainer: {
    position: "absolute",
    top: 20,
    alignSelf: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 5,
  },
  statsText: {
    color: "white",
    fontSize: 12,
    fontWeight: "500",
  },
});