import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { stations, Station } from "../../data/stations";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import * as Location from "expo-location";
import { db } from "../../firebase";
import {
  collection,
  onSnapshot,
  Timestamp,
  query,
  orderBy,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";

// Types
interface StationReport {
  petrol: boolean;
  diesel: boolean;
  queueLength?: "low" | "medium" | "high";
  timestamp?: Timestamp;
  reportCount?: number;
  lastReportTime?: Timestamp;
}

interface FirebaseReportData {
  stationId: string;
  petrol: boolean;
  diesel: boolean;
  queueLength?: "low" | "medium" | "high";
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
  const [stationStatus, setStationStatus] = useState<
    Record<string, StationReport>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(
    null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [forceUpdate, setForceUpdate] = useState(0);
  const [lastCleanupTime, setLastCleanupTime] = useState<Date>(new Date());
  
  // Map type state - simple version without persistence
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'hybrid'>('standard');
  const [showMapTypeSelector, setShowMapTypeSelector] = useState(false);

  const mapRef = useRef<MapView | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());

  // Simple function to change map type (no persistence)
  const changeMapType = useCallback((type: 'standard' | 'satellite' | 'hybrid') => {
    setMapType(type);
    setShowMapTypeSelector(false);
    console.log('Map type changed to:', type);
  }, []);

  // Function to delete expired reports from Firestore
  const cleanupExpiredReports = useCallback(async () => {
    try {
      const q = query(collection(db, "fuelReports"));
      const snapshot = await getDocs(q);
      const now = Date.now();
      let deletedCount = 0;

      for (const docSnapshot of snapshot.docs) {
        const data = docSnapshot.data() as FirebaseReportData;
        if (data.timestamp) {
          const reportTime = data.timestamp.seconds * 1000;
          const ageInMinutes = (now - reportTime) / 60000;

          if (ageInMinutes > REPORT_EXPIRY_MINUTES) {
            await deleteDoc(doc(db, "fuelReports", docSnapshot.id));
            deletedCount++;
          }
        }
      }

      if (deletedCount > 0) {
        console.log(`🗑️ Deleted ${deletedCount} expired reports`);
        setLastCleanupTime(new Date());
      }
    } catch (error) {
      console.error("Error cleaning up expired reports:", error);
    }
  }, []);

  // Function to fetch and process reports (only include non-expired)
  const processReports = useCallback((snapshot: any) => {
    const reports: Record<string, StationReport> = {};
    const reportCounts: Record<string, number> = {};
    const now = Date.now();

    // First pass: count NON-EXPIRED reports per station
    snapshot.docs.forEach((doc: any) => {
      const data = doc.data() as FirebaseReportData;
      if (data.timestamp) {
        const reportTime = data.timestamp.seconds * 1000;
        const ageInMinutes = (now - reportTime) / 60000;

        // Only count reports that are NOT expired
        if (ageInMinutes <= REPORT_EXPIRY_MINUTES) {
          reportCounts[data.stationId] = (reportCounts[data.stationId] || 0) + 1;
        }
      }
    });

    // Second pass: get latest NON-EXPIRED report for each station
    snapshot.docs.forEach((doc: any) => {
      const data = doc.data() as FirebaseReportData;

      // Skip if no timestamp
      if (!data.timestamp) return;

      const reportTime = data.timestamp.seconds * 1000;
      const ageInMinutes = (now - reportTime) / 60000;

      // Skip expired reports
      if (ageInMinutes > REPORT_EXPIRY_MINUTES) return;

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
    setLastRefreshTime(new Date());

    // Force a re-render of markers
    setForceUpdate((prev) => prev + 1);
  }, []);

  // Setup Firebase listener
  const setupListener = useCallback(() => {
    // Clean up existing listener if any
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    const q = query(
      collection(db, "fuelReports"),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        processReports(snapshot);
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

    unsubscribeRef.current = unsubscribe;
    return unsubscribe;
  }, [processReports]);

  // Initial setup
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = setupListener();

    // Run cleanup on app start
    cleanupExpiredReports();

    // Clean up expired reports every hour
    const cleanupInterval = setInterval(cleanupExpiredReports, 60 * 60 * 1000);

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      clearInterval(cleanupInterval);
    };
  }, [setupListener, cleanupExpiredReports]);

  // Manual refresh function
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      // Clear marker references
      markersRef.current.clear();

      // Clean up expired reports first
      await cleanupExpiredReports();

      // Force listener to re-fetch
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }

      // Re-setup listener
      setupListener();

      // Also do a one-time direct fetch for immediate feedback
      const q = query(
        collection(db, "fuelReports"),
        orderBy("timestamp", "desc")
      );
      const snapshot = await getDocs(q);
      processReports(snapshot);

      // Force map to re-render markers by slightly adjusting region
      if (mapRef.current) {
        const camera = await mapRef.current.getCamera();
        mapRef.current.animateCamera(
          {
            ...camera,
            zoom: camera.zoom,
          },
          { duration: 100 }
        );
      }
    } catch (error) {
      console.error("Refresh error:", error);
      Alert.alert(
        "Refresh Failed",
        "Could not refresh data. Please try again."
      );
      setIsRefreshing(false);
    }
  }, [setupListener, processReports, cleanupExpiredReports]);

  // Memoized helper functions
  const getReportAgeMinutes = useCallback(
    (timestamp?: Timestamp): number | null => {
      if (!timestamp?.seconds) return null;
      const reportTime = timestamp.seconds * 1000;
      const now = Date.now();
      const ageInMinutes = (now - reportTime) / 60000;
      return Math.round(ageInMinutes * 10) / 10;
    },
    []
  );

  const getMarkerColor = useCallback(
    (stationId: string): string => {
      const report = stationStatus[stationId];
      if (!report) return COLORS.NO_REPORTS;

      if (report.petrol || report.diesel) {
        if (report.queueLength === "high") return "#e67e22";
        if (report.queueLength === "medium") return "#f1c40f";
        return COLORS.FUEL_AVAILABLE;
      }
      return COLORS.NO_FUEL;
    },
    [stationStatus, forceUpdate]
  );

  const getFuelIcon = useCallback(
    (stationId: string): string => {
      const report = stationStatus[stationId];
      if (!report) return "gas-station";

      if (report.petrol && !report.diesel) return "gas-station";
      if (!report.petrol && report.diesel) return "truck";
      if (report.petrol && report.diesel) return "gas-station";
      return "close-circle";
    },
    [stationStatus, forceUpdate]
  );

  const getFuelTypeIndicator = useCallback(
    (stationId: string): string => {
      const report = stationStatus[stationId];
      if (!report) return "⚪";
      if (report.petrol && report.diesel) return "⛽🚛";
      if (report.petrol) return "⛽";
      if (report.diesel) return "🚛";
      return "❌";
    },
    [stationStatus, forceUpdate]
  );

  const getQueueIcon = useCallback(
    (stationId: string): string => {
      const report = stationStatus[stationId];
      if (!report?.queueLength) return "";
      switch (report.queueLength) {
        case "low":
          return "🟢";
        case "medium":
          return "🟡";
        case "high":
          return "🔴";
        default:
          return "";
      }
    },
    [stationStatus, forceUpdate]
  );

  const getFuelSubtitle = useCallback(
    (stationId: string): string => {
      const report = stationStatus[stationId];
      if (!report) return "No reports";
      const fuelTypes = [];
      if (report.petrol) fuelTypes.push("⛽ Petrol");
      if (report.diesel) fuelTypes.push("🚛 Diesel");
      if (fuelTypes.length === 0) return "No fuel";
      return fuelTypes.join(" • ");
    },
    [stationStatus, forceUpdate]
  );

  const getQueueText = useCallback(
    (stationId: string): string => {
      const report = stationStatus[stationId];
      if (!report?.queueLength) return "";
      const queueMap = {
        low: "🟢 Low queue",
        medium: "🟡 Medium queue",
        high: "🔴 Long queue",
      };
      return queueMap[report.queueLength];
    },
    [stationStatus, forceUpdate]
  );

  const getFreshnessLabel = useCallback(
    (stationId: string): string => {
      const report = stationStatus[stationId];
      if (!report?.timestamp) return "No reports";
      const age = getReportAgeMinutes(report.timestamp);
      if (age === null) return "Unknown";
      if (age < FRESH_REPORT_THRESHOLD) return "🟢 Just reported";
      if (age < 30) return `🟡 ${age} min ago`;
      if (age < REPORT_EXPIRY_MINUTES) return `🟠 ${age} min ago (old)`;
      return "🔴 Report expired";
    },
    [stationStatus, getReportAgeMinutes, forceUpdate]
  );

  const hasBothFuels = useCallback(
    (stationId: string): boolean => {
      const report = stationStatus[stationId];
      return (report?.petrol && report?.diesel) || false;
    },
    [stationStatus, forceUpdate]
  );

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
            { text: "Settings", onPress: () => Location.openSettings() },
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

  // Memoized markers
  const markers = useMemo(() => {
    console.log("Rendering markers, active stations:", Object.keys(stationStatus).length);

    return stations.map((station) => {
      const report = stationStatus[station.id];
      const fuelIndicator = getFuelTypeIndicator(station.id);
      const queueIcon = getQueueIcon(station.id);
      const isSelected = selectedStation === station.id;
      const markerColor = getMarkerColor(station.id);
      const fuelIcon = getFuelIcon(station.id);
      const fuelSubtitle = getFuelSubtitle(station.id);
      const queueText = getQueueText(station.id);
      const freshnessLabel = getFreshnessLabel(station.id);
      const reportCount = report?.reportCount;
      const hasBoth = hasBothFuels(station.id);

      return (
        <Marker
          key={`${station.id}-${forceUpdate}`}
          coordinate={{
            latitude: station.latitude,
            longitude: station.longitude,
          }}
          onPress={() => handleMarkerPress(station)}
          tracksViewChanges={true}
          ref={(ref) => {
            if (ref) {
              markersRef.current.set(station.id, ref);
            }
          }}
        >
          <View
            style={[
              styles.markerContainer,
              isSelected && styles.selectedMarker,
            ]}
          >
            <View style={styles.markerBubble}>
              <MaterialCommunityIcons
                name={fuelIcon}
                size={24}
                color={markerColor}
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
              {/* Both fuels indicator */}
              {hasBoth && (
                <View style={styles.bothIndicator}>
                  <Text style={styles.bothIndicatorText}>⛽🚛</Text>
                </View>
              )}
            </View>
            <View style={styles.markerLabel}>
              <Text style={styles.markerText} numberOfLines={1}>
                {station.name}
              </Text>
              <Text style={styles.markerSubText} numberOfLines={1}>
                {fuelSubtitle}
              </Text>
              {report?.queueLength && (
                <Text style={styles.queueText} numberOfLines={1}>
                  {queueText}
                </Text>
              )}
              <Text style={styles.freshnessText} numberOfLines={1}>
                {freshnessLabel}
              </Text>
              {reportCount && reportCount > 0 && (
                <Text style={styles.reportCountText}>
                  📊 {reportCount} {reportCount === 1 ? "report" : "reports"}
                </Text>
              )}
            </View>
          </View>
        </Marker>
      );
    });
  }, [
    stationStatus,
    selectedStation,
    forceUpdate,
    getFuelTypeIndicator,
    getQueueIcon,
    getFuelIcon,
    getMarkerColor,
    getFuelSubtitle,
    getQueueText,
    getFreshnessLabel,
    hasBothFuels,
    handleMarkerPress,
  ]);

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
        mapType={mapType}
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

      {/* Top Buttons Container */}
      <View style={styles.topButtonsContainer}>
        {/* Refresh Button */}
        <Pressable
          style={({ pressed }) => [
            styles.refreshButton,
            isRefreshing && styles.refreshingButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleRefresh}
          disabled={isRefreshing}
          android_ripple={{ color: "rgba(255,255,255,0.3)" }}
        >
          <MaterialCommunityIcons
            name={isRefreshing ? "loading" : "refresh"}
            size={20}
            color="white"
          />
          <Text style={styles.refreshButtonText}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Text>
        </Pressable>

        {/* Map Type Toggle Button */}
        <Pressable
          style={({ pressed }) => [
            styles.mapTypeButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => setShowMapTypeSelector(!showMapTypeSelector)}
          android_ripple={{ color: "rgba(255,255,255,0.3)" }}
        >
          <MaterialCommunityIcons
            name={
              mapType === 'standard' ? 'map' :
              mapType === 'satellite' ? 'satellite' : 'satellite-variant'
            }
            size={20}
            color="white"
          />
        </Pressable>

        {/* Legend Toggle */}
        <Pressable
          style={({ pressed }) => [
            styles.legendToggle,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => setShowLegend(!showLegend)}
        >
          <MaterialCommunityIcons
            name={showLegend ? "eye" : "eye-off"}
            size={20}
            color="white"
          />
        </Pressable>
      </View>

      {/* Last Refresh & Cleanup Info */}
      <View style={styles.infoContainer}>
        <View style={styles.infoItem}>
          <MaterialCommunityIcons name="clock-outline" size={12} color="#666" />
          <Text style={styles.infoText}>
            Updated: {lastRefreshTime.toLocaleTimeString()}
          </Text>
        </View>
        {lastCleanupTime && (
          <View style={styles.infoItem}>
            <MaterialCommunityIcons name="delete" size={12} color="#666" />
            <Text style={styles.infoText}>
              Cleaned: {lastCleanupTime.toLocaleTimeString()}
            </Text>
          </View>
        )}
      </View>

      {/* Map Type Selector Dropdown */}
      {showMapTypeSelector && (
        <View style={styles.mapTypeSelector}>
          <Pressable
            style={({ pressed }) => [
              styles.mapTypeOption,
              mapType === 'standard' && styles.mapTypeOptionActive,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => changeMapType('standard')}
          >
            <MaterialCommunityIcons name="map" size={20} color={mapType === 'standard' ? "#2ecc71" : "#666"} />
            <Text style={[styles.mapTypeOptionText, mapType === 'standard' && styles.mapTypeOptionTextActive]}>
              Standard
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.mapTypeOption,
              mapType === 'satellite' && styles.mapTypeOptionActive,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => changeMapType('satellite')}
          >
            <MaterialCommunityIcons name="satellite" size={20} color={mapType === 'satellite' ? "#2ecc71" : "#666"} />
            <Text style={[styles.mapTypeOptionText, mapType === 'satellite' && styles.mapTypeOptionTextActive]}>
              Satellite
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.mapTypeOption,
              mapType === 'hybrid' && styles.mapTypeOptionActive,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => changeMapType('hybrid')}
          >
            <MaterialCommunityIcons name="satellite-variant" size={20} color={mapType === 'hybrid' ? "#2ecc71" : "#666"} />
            <Text style={[styles.mapTypeOptionText, mapType === 'hybrid' && styles.mapTypeOptionTextActive]}>
              Hybrid
            </Text>
          </Pressable>
        </View>
      )}

      {/* Legend */}
      {showLegend && (
        <View style={styles.legendContainer}>
          <Text style={styles.legendTitle}>📍 Legend</Text>

          <View style={styles.legendItem}>
            <MaterialCommunityIcons
              name="gas-station"
              size={16}
              color={COLORS.NO_REPORTS}
            />
            <Text style={styles.legendText}> No reports</Text>
          </View>

          <View style={styles.legendItem}>
            <View style={styles.legendFuelRow}>
              <Text style={styles.legendFuelText}>⛽</Text>
              <Text style={styles.legendText}> Petrol</Text>
            </View>
          </View>

          <View style={styles.legendItem}>
            <View style={styles.legendFuelRow}>
              <Text style={styles.legendFuelText}>🚛</Text>
              <Text style={styles.legendText}> Diesel</Text>
            </View>
          </View>

          <View style={styles.legendDivider} />

          <Text style={styles.legendSubTitle}>Queue Length:</Text>

          <View style={styles.legendItem}>
            <Text style={styles.legendQueueText}>🟢</Text>
            <Text style={styles.legendText}> Low (&lt;5 min)</Text>
          </View>

          <View style={styles.legendItem}>
            <Text style={styles.legendQueueText}>🟡</Text>
            <Text style={styles.legendText}> Medium (5-15 min)</Text>
          </View>

          <View style={styles.legendItem}>
            <Text style={styles.legendQueueText}>🔴</Text>
            <Text style={styles.legendText}> High (&gt;15 min)</Text>
          </View>

          <View style={styles.legendDivider} />

          <Text style={styles.legendNote}>
            Reports expire after {REPORT_EXPIRY_MINUTES} minutes
          </Text>
          <Text style={styles.legendNote}>• Active reports shown only</Text>
          <Text style={styles.legendNote}>• Old reports auto-deleted</Text>
        </View>
      )}

      {/* Bottom Buttons */}
      <View style={styles.bottomButtonsContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.locationButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={goToMyLocation}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={20} color="white" />
          <Text style={styles.locationText}> My Location</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.testButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={goToAddis}
        >
          <MaterialCommunityIcons name="map-marker" size={20} color="white" />
          <Text style={styles.locationText}> Addis Ababa</Text>
        </Pressable>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          📊 {Object.keys(stationStatus).length} active{" "}
          {Object.keys(stationStatus).length === 1 ? "station" : "stations"} with
          reports
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
  topButtonsContainer: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    zIndex: 1000,
    pointerEvents: "box-none",
  },
  refreshButton: {
    backgroundColor: COLORS.FUEL_AVAILABLE,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    elevation: 10,
    zIndex: 1000,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    minWidth: 110,
  },
  refreshingButton: {
    backgroundColor: "#f39c12",
  },
  refreshButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  },
  mapTypeButton: {
    backgroundColor: "#3498db",
    padding: 10,
    borderRadius: 25,
    elevation: 10,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    minWidth: 44,
    alignItems: "center",
  },
  legendToggle: {
    backgroundColor: "#3498db",
    padding: 10,
    borderRadius: 25,
    elevation: 10,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    minWidth: 44,
    alignItems: "center",
  },
  infoContainer: {
    position: "absolute",
    top: 105,
    right: 15,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    zIndex: 900,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 2,
  },
  infoText: {
    fontSize: 9,
    color: "#666",
    marginLeft: 4,
  },
  mapTypeSelector: {
    position: "absolute",
    top: 110,
    right: 20,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 12,
    padding: 8,
    elevation: 10,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    minWidth: 140,
  },
  mapTypeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 2,
  },
  mapTypeOptionActive: {
    backgroundColor: "#e8f5e9",
  },
  mapTypeOptionText: {
    fontSize: 14,
    color: "#666",
    marginLeft: 10,
  },
  mapTypeOptionTextActive: {
    color: "#2ecc71",
    fontWeight: "600",
  },
  bottomButtonsContainer: {
    position: "absolute",
    bottom: 40,
    right: 20,
    alignItems: "flex-end",
    zIndex: 1000,
    pointerEvents: "box-none",
  },
  locationButton: {
    backgroundColor: COLORS.FUEL_AVAILABLE,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 25,
    elevation: 10,
    zIndex: 1000,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    minWidth: 130,
  },
  testButton: {
    backgroundColor: "#3498db",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 25,
    elevation: 10,
    zIndex: 1000,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    minWidth: 130,
  },
  buttonPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  locationText: {
    color: "white",
    fontWeight: "600",
    marginLeft: 6,
    fontSize: 13,
  },
  legendContainer: {
    position: "absolute",
    top: 150,
    left: 15,
    backgroundColor: COLORS.BACKGROUND_LIGHT,
    padding: 12,
    borderRadius: 10,
    elevation: 8,
    zIndex: 900,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    maxWidth: 200,
  },
  legendTitle: {
    fontWeight: "bold",
    marginBottom: 8,
    fontSize: 13,
  },
  legendSubTitle: {
    fontWeight: "600",
    marginTop: 6,
    marginBottom: 4,
    fontSize: 11,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 3,
  },
  legendFuelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendFuelText: {
    fontSize: 13,
  },
  legendQueueText: {
    fontSize: 14,
    marginRight: 4,
  },
  legendText: {
    fontSize: 11,
    color: "#333",
    marginLeft: 6,
  },
  legendDivider: {
    height: 1,
    backgroundColor: "#ddd",
    marginVertical: 6,
  },
  legendNote: {
    fontSize: 9,
    color: "#666",
    fontStyle: "italic",
    marginTop: 3,
  },
  statsContainer: {
    position: "absolute",
    top: 145,
    alignSelf: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    elevation: 8,
    zIndex: 900,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  statsText: {
    color: "white",
    fontSize: 11,
    fontWeight: "500",
  },
});