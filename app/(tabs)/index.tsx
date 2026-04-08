import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  Animated,
  Easing,
  Platform,
} from "react-native";
import {
  calculateDistance,
  getTravelTime,
  getReportAgeMinutes,
  getFuelIcon,
  getFuelTypeIndicator,
  getQueueIcon,
  getFuelSubtitle,
  getQueueText,
  getFreshnessLabel,
  hasBothFuels,
} from './utils/helpers';
import { COLORS, ADDIS_ABABA_COORDS, REPORT_EXPIRY_MINUTES, FRESH_REPORT_THRESHOLD, DEFAULT_ZOOM_LEVEL, NAVIGATION_APPS } from './utils/constants';

import MapView, { Marker } from "react-native-maps";
import { stations, Station } from "../../data/stations";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import * as Location from "expo-location";
import * as Linking from "expo-linking";
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
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";

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
/*
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
  REFRESH_BUTTON: "#f39c12",
  REFRESH_BUTTON_ACTIVE: "#e67e22",
} as const;

// Navigation apps configuration
const NAVIGATION_APPS = {
  apple: {
    name: "Apple Maps",
    icon: "apple",
    scheme: "maps://",
    url: (lat: number, lng: number, name: string) =>
      `maps://?q=${lat},${lng}&name=${encodeURIComponent(name)}`,
    available: Platform.OS === "ios",
  },
  google: {
    name: "Google Maps",
    icon: "google-maps",
    scheme: "comgooglemaps://",
    url: (lat: number, lng: number, name: string) =>
      `comgooglemaps://?q=${lat},${lng}&center=${lat},${lng}&zoom=14`,
    webUrl: (lat: number, lng: number, name: string) =>
      `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    available: true,
  },
  waze: {
    name: "Waze",
    icon: "waze",
    scheme: "waze://",
    url: (lat: number, lng: number, name: string) =>
      `waze://?ll=${lat},${lng}&navigate=yes`,
    webUrl: (lat: number, lng: number, name: string) =>
      `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    available: true,
  },
};
*/

export default function HomeScreen() {
  const [stationStatus, setStationStatus] = useState<
    Record<string, StationReport>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(
    null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [forceUpdate, setForceUpdate] = useState(0);
  const [lastCleanupTime, setLastCleanupTime] = useState<Date>(new Date());
  const [mapType, setMapType] = useState<"standard" | "satellite" | "hybrid">(
    "standard",
  );
  const [showMapTypeSelector, setShowMapTypeSelector] = useState(false);
  const [nearbyStations, setNearbyStations] = useState<
    Array<{
      station: Station;
      distance: number;
      fuelStatus: StationReport | undefined;
    }>
  >([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [showNearby, setShowNearby] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const menuAnimation = useRef(new Animated.Value(0)).current;
  const fabAnimation = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<MapView | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Animate FAB menu
  const toggleMenu = () => {
    if (menuOpen) {
      Animated.parallel([
        Animated.timing(menuAnimation, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        Animated.timing(fabAnimation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(menuAnimation, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
          easing: Easing.out(Easing.back(0.5)),
        }),
        Animated.timing(fabAnimation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
    setMenuOpen(!menuOpen);
  };

  
  
  

  // Get available navigation apps
  const getAvailableNavApps = useCallback(
    async (lat: number, lng: number, name: string) => {
      const available = [];
      for (const [key, app] of Object.entries(NAVIGATION_APPS)) {
        if (!app.available) continue;
        const isInstalled = await checkAppInstalled(app.scheme);
        if (isInstalled) {
          available.push({ ...app, key, url: app.url(lat, lng, name) });
        } else if (app.webUrl) {
          available.push({
            ...app,
            key,
            url: app.webUrl(lat, lng, name),
            isWeb: true,
          });
        }
      }
      return available;
    },
    [checkAppInstalled],
  );

  // Show navigation app selector
  const showNavigationOptions = useCallback(
    async (station: Station) => {
      const apps = await getAvailableNavApps(
        station.latitude,
        station.longitude,
        station.name,
      );
      if (apps.length === 0) {
        Alert.alert(
          "No Navigation Apps",
          "Please install a navigation app like Google Maps or Waze.",
        );
        return;
      }
      if (Platform.OS === "ios") {
        const { ActionSheetIOS } = require("react-native");
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: `Navigate to ${station.name}`,
            message: "Choose your navigation app:",
            options: [...apps.map((app) => app.name), "Cancel"],
            cancelButtonIndex: apps.length,
          },
          async (buttonIndex: number) => {
            if (buttonIndex < apps.length) {
              await Linking.openURL(apps[buttonIndex].url);
            }
          },
        );
      } else {
        const options = apps.map((app) => ({
          text: app.name,
          onPress: () => Linking.openURL(app.url),
        }));
        Alert.alert("Choose Navigation App", `Navigate to ${station.name}`, [
          ...options,
          { text: "Cancel", style: "cancel" },
        ]);
      }
    },
    [getAvailableNavApps],
  );

  // Find nearby stations
  const findNearbyStations = useCallback(() => {
    if (!userLocation) return;
    const stationsWithDistance = stations
      .map((station) => {
        const distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          station.latitude,
          station.longitude,
        );
        const fuelStatus = stationStatus[station.id];
        const hasFuel = fuelStatus && (fuelStatus.petrol || fuelStatus.diesel);
        const age = fuelStatus?.timestamp
          ? getReportAgeMinutes(fuelStatus.timestamp)
          : null;
        const isFresh = age !== null && age <= REPORT_EXPIRY_MINUTES;
        return { station, distance, fuelStatus, hasFuel: hasFuel && isFresh };
      })
      .filter((item) => item.hasFuel)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
    setNearbyStations(stationsWithDistance);
  }, [userLocation, stationStatus]);



  // Helper functions

  // Calculate distance between two coordinates
  /*
  const calculateDistance = useCallback(
    (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },
    [],
  );
  */
  

  // Get travel time
  /*
  
  const getTravelTime = useCallback((distanceKm: number): string => {
    const avgSpeed = 40;
    const timeHours = distanceKm / avgSpeed;
    const timeMinutes = Math.round(timeHours * 60);
    if (timeMinutes < 1) return "<1 min";
    if (timeMinutes < 60) return `${timeMinutes} min`;
    const hours = Math.floor(timeMinutes / 60);
    const mins = timeMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }, []);
  */

  // Check if an app is installed
  const checkAppInstalled = useCallback(
    async (scheme: string): Promise<boolean> => {
      try {
        return await Linking.canOpenURL(scheme);
      } catch {
        return false;
      }
    },
    [],
  );

  /*
  const getReportAgeMinutes = useCallback(
    (timestamp?: Timestamp): number | null => {
      if (!timestamp?.seconds) return null;
      const reportTime = timestamp.seconds * 1000;
      const now = Date.now();
      const ageInMinutes = (now - reportTime) / 60000;
      return Math.round(ageInMinutes * 10) / 10;
    },
    [],
  );
  */
  
  
  

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
    [stationStatus, forceUpdate],
  );
  /*
  const getFuelIcon = useCallback(
    (stationId: string): string => {
      const report = stationStatus[stationId];
      if (!report) return "gas-station";
      if (report.petrol && !report.diesel) return "gas-station";
      if (!report.petrol && report.diesel) return "truck";
      if (report.petrol && report.diesel) return "gas-station";
      return "close-circle";
    },
    [stationStatus, forceUpdate],
  );
  */
  /*
  const getFuelTypeIndicator = useCallback(
    (stationId: string): string => {
      const report = stationStatus[stationId];
      if (!report) return "⚪";
      if (report.petrol && report.diesel) return "⛽🚛";
      if (report.petrol) return "⛽";
      if (report.diesel) return "🚛";
      return "❌";
    },
    [stationStatus, forceUpdate],
  );
  */
  /*
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
    [stationStatus, forceUpdate],
  );
  */

  /*
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
    [stationStatus, forceUpdate],
  );
  */


  /*
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
    [stationStatus, forceUpdate],
  );
  */

/*
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
    [stationStatus, getReportAgeMinutes, forceUpdate],
  );
  */

  /*
  const hasBothFuels = useCallback(
    (stationId: string): boolean => {
      const report = stationStatus[stationId];
      return (report?.petrol && report?.diesel) || false;
    },
    [stationStatus, forceUpdate],
  );
  */

  // Cleanup expired reports
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

  // Process reports
  const processReports = useCallback((snapshot: any) => {
    const reports: Record<string, StationReport> = {};
    const reportCounts: Record<string, number> = {};
    const now = Date.now();

    snapshot.docs.forEach((doc: any) => {
      const data = doc.data() as FirebaseReportData;
      if (data.timestamp) {
        const reportTime = data.timestamp.seconds * 1000;
        const ageInMinutes = (now - reportTime) / 60000;
        if (ageInMinutes <= REPORT_EXPIRY_MINUTES) {
          reportCounts[data.stationId] =
            (reportCounts[data.stationId] || 0) + 1;
        }
      }
    });

    snapshot.docs.forEach((doc: any) => {
      const data = doc.data() as FirebaseReportData;
      if (!data.timestamp) return;
      const reportTime = data.timestamp.seconds * 1000;
      const ageInMinutes = (now - reportTime) / 60000;
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
    setForceUpdate((prev) => prev + 1);
  }, []);

  // Setup Firebase listener
  const setupListener = useCallback(() => {
    if (unsubscribeRef.current) unsubscribeRef.current();
    const q = query(
      collection(db, "fuelReports"),
      orderBy("timestamp", "desc"),
    );
    const unsubscribe = onSnapshot(q, processReports, (error) => {
      console.error("Firestore listener error:", error);
      Alert.alert("Connection Error", "Failed to fetch fuel reports.");
      setIsLoading(false);
      setIsRefreshing(false);
    });
    unsubscribeRef.current = unsubscribe;
    return unsubscribe;
  }, [processReports]);

  // Initial setup
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = setupListener();
    cleanupExpiredReports();
    const cleanupInterval = setInterval(cleanupExpiredReports, 60 * 60 * 1000);
    return () => {
      if (unsubscribe) unsubscribe();
      clearInterval(cleanupInterval);
    };
  }, [setupListener, cleanupExpiredReports]);

  // Update nearby stations
  useEffect(() => {
    if (userLocation && stationStatus) findNearbyStations();
  }, [stationStatus, userLocation, findNearbyStations]);

  // Refresh function
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      markersRef.current.clear();
      await cleanupExpiredReports();
      if (unsubscribeRef.current) unsubscribeRef.current();
      setupListener();
      const q = query(
        collection(db, "fuelReports"),
        orderBy("timestamp", "desc"),
      );
      const snapshot = await getDocs(q);
      processReports(snapshot);
      if (mapRef.current) {
        const camera = await mapRef.current.getCamera();
        mapRef.current.animateCamera(
          { ...camera, zoom: camera.zoom },
          { duration: 100 },
        );
      }
    } catch (error) {
      console.error("Refresh error:", error);
      Alert.alert("Refresh Failed", "Could not refresh data.");
      setIsRefreshing(false);
    }
  }, [setupListener, processReports, cleanupExpiredReports]);

  // Location functions
  const goToMyLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === "granted");
      if (status !== "granted") {
        Alert.alert(
          "Location Permission Required",
          "Please enable location services.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Settings", onPress: () => Location.openSettings() },
          ],
        );
        return;
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const userCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setUserLocation(userCoords);
      setIsTestMode(false);
      mapRef.current?.animateToRegion({
        ...userCoords,
        latitudeDelta: DEFAULT_ZOOM_LEVEL,
        longitudeDelta: DEFAULT_ZOOM_LEVEL,
      });
    } catch (error) {
      console.error("Error getting location:", error);
      Alert.alert("Location Error", "Could not get your location.");
    }
  }, []);

  const goToAddis = useCallback(() => {
    setUserLocation(ADDIS_ABABA_COORDS);
    setIsTestMode(true);
    mapRef.current?.animateToRegion({
      ...ADDIS_ABABA_COORDS,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    });
    Alert.alert("📍 Test Mode Active", "You're now viewing Addis Ababa.", [
      { text: "OK" },
    ]);
    setTimeout(() => findNearbyStations(), 500);
  }, [findNearbyStations]);

  const handleNearbyPress = useCallback(() => {
    if (!userLocation) {
      Alert.alert("Location Required", "Please set your location first.", [
        { text: "OK" },
      ]);
      return;
    }
    findNearbyStations();
    setShowNearby(true);
    bottomSheetRef.current?.expand();
  }, [userLocation, findNearbyStations]);

  const handleMarkerPress = useCallback((station: Station) => {
    setSelectedStation(station.id);
    router.push({
      pathname: "/station/[id]",
      params: { id: station.id, name: station.name },
    });
  }, []);

  const changeMapType = useCallback(
    (type: "standard" | "satellite" | "hybrid") => {
      setMapType(type);
      setShowMapTypeSelector(false);
    },
    [],
  );

  // Menu items
  const menuItems = [
    {
      icon: "map-marker-radius",
      label: "Nearby",
      color: "#9b59b6",
      action: handleNearbyPress,
      description: "Find stations with fuel",
    },
    {
      icon: "crosshairs-gps",
      label: "My Location",
      color: "#2ecc71",
      action: goToMyLocation,
      description: "Go to your current location",
    },
    {
      icon: "map-marker",
      label: "Test Addis",
      color: "#3498db",
      action: goToAddis,
      description: "Test mode (Addis Ababa)",
    },
  ];

  // Markers
  const markers = useMemo(() => {
    return stations.map((station) => {
      const report = stationStatus[station.id];
      const fuelIndicator = getFuelTypeIndicator(station.id);
      const queueIcon = getQueueIcon(station.id);
      const isSelected = selectedStation === station.id;
      const markerColor = getMarkerColor(station.id);
      const fuelIcon = getFuelIcon(report?.petrol || false, report?.diesel || false);
      const fuelSubtitle = getFuelSubtitle(station.id);
      const queueText = getQueueText(station.id);
      const age = getReportAgeMinutes(report?.timestamp);
      const freshnessLabel = getFreshnessLabel(age);
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
        >
          <View
            style={[
              styles.markerContainer,
              isSelected && styles.selectedMarker,
            ]}
          >
            <View style={styles.markerBubble}>
              <MaterialCommunityIcons
                name={fuelIcon as any}
                size={24}
                color={markerColor}
              />
              <View style={styles.fuelTypeBadge}>
                <Text style={styles.fuelTypeText}>{fuelIndicator}</Text>
              </View>
              {queueIcon && (
                <View style={styles.queueBadge}>
                  <Text style={styles.queueText}>{queueIcon}</Text>
                </View>
              )}
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
    <GestureHandlerRootView style={styles.container}>
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

        {/* Top Buttons */}
        <View style={styles.topButtonsContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.mapTypeToggle,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => setShowMapTypeSelector(!showMapTypeSelector)}
          >
            <MaterialCommunityIcons
              name={
                mapType === "standard"
                  ? "map"
                  : mapType === "satellite"
                    ? "satellite"
                    : "satellite-variant"
              }
              size={22}
              color="white"
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.refreshButton,
              isRefreshing && styles.refreshingButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleRefresh}
            disabled={isRefreshing}
          >
            <MaterialCommunityIcons
              name={isRefreshing ? "loading" : "refresh"}
              size={22}
              color="white"
            />
          </Pressable>
        </View>

        {/* Map Type Selector */}
        {showMapTypeSelector && (
          <View style={styles.mapTypeSelector}>
            <Pressable
              style={[
                styles.mapTypeOption,
                mapType === "standard" && styles.mapTypeOptionActive,
              ]}
              onPress={() => changeMapType("standard")}
            >
              <MaterialCommunityIcons
                name="map"
                size={20}
                color={mapType === "standard" ? "#2ecc71" : "#666"}
              />
              <Text
                style={[
                  styles.mapTypeOptionText,
                  mapType === "standard" && styles.mapTypeOptionTextActive,
                ]}
              >
                Standard
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.mapTypeOption,
                mapType === "satellite" && styles.mapTypeOptionActive,
              ]}
              onPress={() => changeMapType("satellite")}
            >
              <MaterialCommunityIcons
                name="satellite"
                size={20}
                color={mapType === "satellite" ? "#2ecc71" : "#666"}
              />
              <Text
                style={[
                  styles.mapTypeOptionText,
                  mapType === "satellite" && styles.mapTypeOptionTextActive,
                ]}
              >
                Satellite
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.mapTypeOption,
                mapType === "hybrid" && styles.mapTypeOptionActive,
              ]}
              onPress={() => changeMapType("hybrid")}
            >
              <MaterialCommunityIcons
                name="satellite-variant"
                size={20}
                color={mapType === "hybrid" ? "#2ecc71" : "#666"}
              />
              <Text
                style={[
                  styles.mapTypeOptionText,
                  mapType === "hybrid" && styles.mapTypeOptionTextActive,
                ]}
              >
                Hybrid
              </Text>
            </Pressable>
          </View>
        )}

        {/* Info Container */}
        <View style={styles.infoContainer}>
          <View style={styles.infoItem}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={10}
              color="#666"
            />
            <Text style={styles.infoText}>
              {lastRefreshTime.toLocaleTimeString()}
            </Text>
          </View>
          {isTestMode && (
            <View style={styles.infoItem}>
              <MaterialCommunityIcons name="flask" size={10} color="#f39c12" />
              <Text style={[styles.infoText, { color: "#f39c12" }]}>Test</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            📊 {Object.keys(stationStatus).length} active{" "}
            {Object.keys(stationStatus).length === 1 ? "station" : "stations"}
          </Text>
        </View>

        {/* Legend */}
        {showLegend && (
          <View style={styles.legendContainer}>
            <View style={styles.legendHeader}>
              <Text style={styles.legendTitle}>📍 Legend</Text>
              <Pressable
                onPress={() => setShowLegend(false)}
                style={styles.legendCloseButton}
              >
                <MaterialCommunityIcons name="close" size={16} color="#666" />
              </Pressable>
            </View>
            <View style={styles.legendItem}>
              <MaterialCommunityIcons
                name="gas-station"
                size={14}
                color={COLORS.NO_REPORTS}
              />
              <Text style={styles.legendText}> No reports</Text>
            </View>
            <View style={styles.legendItem}>
              <Text style={styles.legendFuelText}>⛽</Text>
              <Text style={styles.legendText}> Petrol</Text>
            </View>
            <View style={styles.legendItem}>
              <Text style={styles.legendFuelText}>🚛</Text>
              <Text style={styles.legendText}> Diesel</Text>
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
            <Text style={styles.legendNote}>Reports expire after 90 min</Text>
          </View>
        )}

        {!showLegend && (
          <Pressable
            style={styles.legendShowButton}
            onPress={() => setShowLegend(true)}
          >
            <MaterialCommunityIcons
              name="information-outline"
              size={20}
              color="white"
            />
            <Text style={styles.legendShowText}>Legend</Text>
          </Pressable>
        )}

        {/* FAB Menu */}
        <Animated.View
          style={[
            styles.fabMenu,
            {
              transform: [
                {
                  translateY: menuAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -20],
                  }),
                },
              ],
              opacity: menuAnimation,
            },
          ]}
        >
          {menuItems.map((item) => (
            <Animated.View
              key={item.label}
              style={[
                styles.menuItem,
                {
                  transform: [
                    {
                      translateX: menuAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [100, 0],
                      }),
                    },
                  ],
                  opacity: menuAnimation,
                },
              ]}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.menuButton,
                  { backgroundColor: item.color },
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => {
                  item.action();
                  toggleMenu();
                }}
              >
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={22}
                  color="white"
                />
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Text style={styles.menuDescription}>{item.description}</Text>
                </View>
              </Pressable>
            </Animated.View>
          ))}
        </Animated.View>

        {/* Main FAB Button */}
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.buttonPressed]}
          onPress={toggleMenu}
        >
          <Animated.View
            style={{
              transform: [
                {
                  rotate: fabAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", "45deg"],
                  }),
                },
              ],
            }}
          >
            <MaterialCommunityIcons name="plus" size={28} color="white" />
          </Animated.View>
        </Pressable>

        {/* Nearby Stations Bottom Sheet */}
        {showNearby && userLocation && (
          <BottomSheet
            ref={bottomSheetRef}
            snapPoints={["25%", "50%", "85%"]}
            enablePanDownToClose={true}
            onClose={() => setShowNearby(false)}
            backgroundStyle={{ backgroundColor: "white" }}
            handleIndicatorStyle={{ backgroundColor: "#2ecc71", width: 40 }}
          >
            <BottomSheetView style={styles.bottomSheetContent}>
              <View style={styles.bottomSheetHeader}>
                <MaterialCommunityIcons
                  name="gas-station"
                  size={24}
                  color="#2ecc71"
                />
                <Text style={styles.bottomSheetTitle}>
                  Nearby Stations {isTestMode ? "(Test Mode)" : ""}
                </Text>
                <Pressable onPress={() => bottomSheetRef.current?.close()}>
                  <MaterialCommunityIcons name="close" size={24} color="#666" />
                </Pressable>
              </View>
              {nearbyStations.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons
                    name="map-search"
                    size={48}
                    color="#95a5a6"
                  />
                  <Text style={styles.emptyStateText}>
                    No stations with fuel nearby
                  </Text>
                  <Text style={styles.emptyStateSubText}>
                    Try checking back later or report fuel availability!
                  </Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {nearbyStations.map((item, index) => (
                    <Pressable
                      key={item.station.id}
                      style={styles.stationCard}
                      onPress={() => {
                        bottomSheetRef.current?.close();
                        router.push({
                          pathname: "/station/[id]",
                          params: {
                            id: item.station.id,
                            name: item.station.name,
                          },
                        });
                      }}
                    >
                      <View style={styles.stationCardLeft}>
                        <Text style={styles.stationRank}>#{index + 1}</Text>
                        <View style={styles.stationInfo}>
                          <Text style={styles.stationName}>
                            {item.station.name}
                          </Text>
                          <View style={styles.stationDetails}>
                            <Text style={styles.stationDistance}>
                              📍 {item.distance.toFixed(1)} km
                            </Text>
                            <View style={styles.fuelIcons}>
                              {item.fuelStatus?.petrol && (
                                <MaterialCommunityIcons
                                  name="gas-station"
                                  size={16}
                                  color="#2ecc71"
                                />
                              )}
                              {item.fuelStatus?.diesel && (
                                <MaterialCommunityIcons
                                  name="truck"
                                  size={16}
                                  color="#2ecc71"
                                />
                              )}
                            </View>
                          </View>
                          {item.fuelStatus?.queueLength && (
                            <Text
                              style={[
                                styles.queueStatus,
                                item.fuelStatus.queueLength === "low" &&
                                  styles.queueLow,
                                item.fuelStatus.queueLength === "medium" &&
                                  styles.queueMedium,
                                item.fuelStatus.queueLength === "high" &&
                                  styles.queueHigh,
                              ]}
                            >
                              {item.fuelStatus.queueLength === "low" &&
                                "🟢 Low queue"}
                              {item.fuelStatus.queueLength === "medium" &&
                                "🟡 Medium queue"}
                              {item.fuelStatus.queueLength === "high" &&
                                "🔴 Long queue"}
                            </Text>
                          )}
                          <Pressable
                            style={({ pressed }) => [
                              styles.navigateButton,
                              pressed && styles.buttonPressed,
                            ]}
                            onPress={(e) => {
                              e.stopPropagation();
                              showNavigationOptions(item.station);
                            }}
                          >
                            <MaterialCommunityIcons
                              name="navigation"
                              size={16}
                              color="#2ecc71"
                            />
                            <Text style={styles.navigateButtonText}>
                              Navigate • {getTravelTime(item.distance)}
                            </Text>
                            <MaterialCommunityIcons
                              name="chevron-down"
                              size={14}
                              color="#2ecc71"
                            />
                          </Pressable>
                        </View>
                      </View>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={24}
                        color="#ccc"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </BottomSheetView>
          </BottomSheet>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.BACKGROUND_LIGHT,
  },
  loadingText: { marginTop: 10, fontSize: 16, color: "#666" },
  markerContainer: { alignItems: "center", width: 90 },
  selectedMarker: { transform: [{ scale: 1.1 }] },
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
  markerSubText: { fontSize: 9, color: "#ddd", textAlign: "center" },
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
  queueText: { fontSize: 9, color: "#f39c12", textAlign: "center" },
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
  fuelTypeText: { fontSize: 10, color: "white", fontWeight: "bold" },
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
  bothIndicatorText: { fontSize: 8, color: "white", fontWeight: "bold" },
  topButtonsContainer: {
    position: "absolute",
    top: 55,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  mapTypeToggle: {
    backgroundColor: "#3498db",
    padding: 10,
    borderRadius: 30,
    elevation: 10,
    width: 44,
    alignItems: "center",
  },
  refreshButton: {
    backgroundColor: COLORS.REFRESH_BUTTON,
    padding: 10,
    borderRadius: 30,
    elevation: 10,
    width: 44,
    alignItems: "center",
  },
  refreshingButton: { backgroundColor: COLORS.REFRESH_BUTTON_ACTIVE },
  mapTypeSelector: {
    position: "absolute",
    top: 115,
    right: 16,
    backgroundColor: COLORS.BACKGROUND_WHITE,
    borderRadius: 12,
    padding: 8,
    elevation: 10,
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
  mapTypeOptionActive: { backgroundColor: "#e8f5e9" },
  mapTypeOptionText: { fontSize: 14, color: "#666", marginLeft: 10 },
  mapTypeOptionTextActive: { color: "#2ecc71", fontWeight: "600" },
  infoContainer: {
    position: "absolute",
    top: 115,
    left: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: "row",
    gap: 12,
    zIndex: 900,
  },
  infoItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  infoText: { fontSize: 10, color: "#666" },
  statsContainer: {
    position: "absolute",
    bottom: 100,
    left: 16,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 900,
  },
  statsText: { color: "white", fontSize: 11, fontWeight: "500" },
  legendContainer: {
    position: "absolute",
    bottom: 100,
    right: 16,
    backgroundColor: COLORS.BACKGROUND_LIGHT,
    padding: 10,
    borderRadius: 10,
    elevation: 8,
    minWidth: 170,
    zIndex: 900,
  },
  legendHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  legendTitle: { fontWeight: "bold", fontSize: 12 },
  legendCloseButton: { padding: 4 },
  legendSubTitle: {
    fontWeight: "600",
    marginTop: 4,
    marginBottom: 2,
    fontSize: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center", marginVertical: 2 },
  legendFuelRow: { flexDirection: "row", alignItems: "center" },
  legendFuelText: { fontSize: 12 },
  legendQueueText: { fontSize: 12, marginRight: 4 },
  legendText: { fontSize: 10, color: "#333", marginLeft: 4 },
  legendDivider: { height: 1, backgroundColor: "#ddd", marginVertical: 4 },
  legendNote: { fontSize: 8, color: "#666", fontStyle: "italic", marginTop: 2 },
  legendShowButton: {
    position: "absolute",
    bottom: 100,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    zIndex: 900,
  },
  legendShowText: { color: "white", fontSize: 12, fontWeight: "500" },
  fab: {
    position: "absolute",
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2ecc71",
    justifyContent: "center",
    alignItems: "center",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    zIndex: 1100,
  },
  fabMenu: {
    position: "absolute",
    bottom: 100,
    right: 20,
    alignItems: "flex-end",
    zIndex: 1050,
  },
  menuItem: { marginBottom: 12 },
  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 30,
    elevation: 8,
    minWidth: 150,
  },
  menuTextContainer: { marginLeft: 10 },
  menuLabel: { color: "white", fontSize: 13, fontWeight: "600" },
  menuDescription: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 9,
    marginTop: 2,
  },
  buttonPressed: { transform: [{ scale: 0.95 }], opacity: 0.9 },
  bottomSheetContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "white",
  },
  bottomSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2d3436",
    flex: 1,
    marginLeft: 12,
  },
  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyStateText: {
    fontSize: 16,
    color: "#7f8c8d",
    marginTop: 12,
    fontWeight: "500",
  },
  emptyStateSubText: {
    fontSize: 14,
    color: "#95a5a6",
    marginTop: 8,
    textAlign: "center",
  },
  stationCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  stationCardLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  stationRank: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2ecc71",
    width: 40,
  },
  stationInfo: { flex: 1 },
  stationName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2d3436",
    marginBottom: 4,
  },
  stationDetails: { flexDirection: "row", alignItems: "center", gap: 12 },
  stationDistance: { fontSize: 12, color: "#7f8c8d" },
  fuelIcons: { flexDirection: "row", gap: 4 },
  queueStatus: { fontSize: 11, marginTop: 4 },
  queueLow: { color: "#27ae60" },
  queueMedium: { color: "#f39c12" },
  queueHigh: { color: "#e74c3c" },
  navigateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8f5e9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
    alignSelf: "flex-start",
    gap: 6,
  },
  navigateButtonText: { fontSize: 12, color: "#2ecc71", fontWeight: "600" },
});
