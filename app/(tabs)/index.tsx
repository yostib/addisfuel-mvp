import {
  ActivityIndicator,
  ActionSheetIOS,
  Alert,
  Animated,
  Platform,
  Text,
  View,
} from "react-native";
import MapView from "react-native-maps";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import * as Location from "expo-location";
import * as ExpoLinking from "expo-linking";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { stations, Station } from "../../data/stations";
import StationMarker from "../../components/StationMarker";
import MapHeaderControls from "../../components/MapHeaderControls";
import FabMenu from "../../components/FabMenu";
import NearbyBottomSheet from "../../components/NearbyBottomSheet";
import { useFuelReports } from "../../hooks/useFuelReports";
import { useNearbyStations } from "../../hooks/useNearbyStations";
import { styles } from "../../styles/home";
import {
  ADDIS_ABABA_COORDS,
  DEFAULT_ZOOM_LEVEL,
  NAVIGATION_APPS,
} from "../../utils/constants";
import { getMarkerColor, getTravelTime } from "../../utils/helpers";

export default function HomeScreen() {
  const [locationPermission, setLocationPermission] = useState<boolean | null>(
    null,
  );
  const [showLegend, setShowLegend] = useState(true);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [mapType, setMapType] = useState<"standard" | "satellite" | "hybrid">(
    "standard",
  );
  const [showMapTypeSelector, setShowMapTypeSelector] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [showNearby, setShowNearby] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const {
    stationStatus,
    isLoading,
    isRefreshing,
    lastRefreshTime,
    forceUpdate,
    refreshFuelReports,
  } = useFuelReports();

  const { nearbyStations, findNearbyStations } = useNearbyStations(
    userLocation,
    stationStatus,
  );

  const menuAnimation = useRef(new Animated.Value(0)).current;
  const fabAnimation = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<MapView | null>(null);
  const bottomSheetRef = useRef<any>(null);

  const toggleMenu = useCallback(() => {
    if (menuOpen) {
      Animated.parallel([
        Animated.timing(menuAnimation, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
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
        }),
        Animated.timing(fabAnimation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
    setMenuOpen((prev) => !prev);
  }, [fabAnimation, menuAnimation, menuOpen]);

  const checkAppInstalled = useCallback(
    async (scheme: string): Promise<boolean> => {
      try {
        return await ExpoLinking.canOpenURL(scheme);
      } catch {
        return false;
      }
    },
    [],
  );

  const getAvailableNavApps = useCallback(
    async (lat: number, lng: number, name: string) => {
      const available: { name: string; url: string }[] = [];

      for (const app of Object.values(NAVIGATION_APPS)) {
        if (!app.available) continue;

        const installed = await checkAppInstalled(app.scheme);
        if (installed) {
          available.push({ name: app.name, url: app.url(lat, lng, name) });
        } else if ("webUrl" in app && typeof app.webUrl === "function") {
          available.push({ name: app.name, url: app.webUrl(lat, lng, name) });
        }
      }

      return available;
    },
    [checkAppInstalled],
  );

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
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: `Navigate to ${station.name}`,
            options: [...apps.map((app) => app.name), "Cancel"],
            cancelButtonIndex: apps.length,
          },
          async (buttonIndex: number) => {
            if (buttonIndex < apps.length) {
              await ExpoLinking.openURL(apps[buttonIndex].url);
            }
          },
        );
        return;
      }

      Alert.alert(
        "Choose Navigation App",
        `Navigate to ${station.name}`,
        apps.map((app) => ({
          text: app.name,
          onPress: () => ExpoLinking.openURL(app.url),
        })),
      );
    },
    [getAvailableNavApps],
  );

  const handleRefresh = useCallback(async () => {
    try {
      await refreshFuelReports();
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
    }
  }, [refreshFuelReports]);

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
            { text: "Settings", onPress: () => ExpoLinking.openSettings() },
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
    setTimeout(findNearbyStations, 500);
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
  }, [findNearbyStations, userLocation]);

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

  const menuItems = [
    {
      icon: "map-marker-radius",
      label: "Nearby",
      action: handleNearbyPress,
      description: "Find stations with fuel",
    },
    {
      icon: "crosshairs-gps",
      label: "My Location",
      action: goToMyLocation,
      description: "Go to your current location",
    },
    {
      icon: "map-marker",
      label: "Test Addis",
      action: goToAddis,
      description: "Test mode (Addis Ababa)",
    },
  ];

  const markers = useMemo(
    () =>
      stations.map((station) => {
        const report = stationStatus[station.id];
        const markerColor = getMarkerColor(report);
        return (
          <StationMarker
            key={`${station.id}-${forceUpdate}`}
            station={station}
            report={report}
            isSelected={selectedStation === station.id}
            forceUpdate={forceUpdate}
            markerColor={markerColor}
            onPress={() => handleMarkerPress(station)}
          />
        );
      }),
    [forceUpdate, handleMarkerPress, selectedStation, stationStatus],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2ecc71" />
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
          loadingEnabled
          loadingIndicatorColor="#2ecc71"
          loadingBackgroundColor="rgba(255,255,255,0.9)"
        >
          {markers}
        </MapView>

        <MapHeaderControls
          mapType={mapType}
          showMapTypeSelector={showMapTypeSelector}
          onToggleMapTypeSelector={() =>
            setShowMapTypeSelector((prev) => !prev)
          }
          onChangeMapType={changeMapType}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          showLegend={showLegend}
          onToggleLegend={() => setShowLegend((prev) => !prev)}
        />

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

        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            📊 {Object.keys(stationStatus).length} active station
            {Object.keys(stationStatus).length === 1 ? "" : "s"}
          </Text>
        </View>

        <FabMenu
          menuItems={menuItems}
          menuAnimation={menuAnimation}
          fabAnimation={fabAnimation}
          toggleMenu={toggleMenu}
        />

        <NearbyBottomSheet
          showNearby={showNearby}
          userLocation={userLocation}
          nearbyStations={nearbyStations}
          isTestMode={isTestMode}
          bottomSheetRef={bottomSheetRef}
          onClose={() => setShowNearby(false)}
          onSelectStation={(station) => {
            setShowNearby(false);
            bottomSheetRef.current?.close();
            router.push({
              pathname: "/station/[id]",
              params: { id: station.id, name: station.name },
            });
          }}
          onNavigate={showNavigationOptions}
          getTravelTime={getTravelTime}
        />
      </View>
    </GestureHandlerRootView>
  );
}
