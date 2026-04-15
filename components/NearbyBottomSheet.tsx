import { MaterialCommunityIcons } from "@expo/vector-icons";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { RefObject } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Station } from "../data/stations";
import { NearbyStation } from "../hooks/useNearbyStations";
import { styles } from "../styles/home";
import { getFuelSubtitle, getReportAgeMinutes } from "../utils/helpers";

interface NearbyBottomSheetProps {
  showNearby: boolean;
  userLocation: { latitude: number; longitude: number } | null;
  nearbyStations: NearbyStation[];
  isTestMode: boolean;
  isRefreshing: boolean;
  bottomSheetRef: RefObject<BottomSheet>;
  onClose: () => void;
  onSelectStation: (station: Station) => void;
  onNavigate: (station: Station) => void;
  onRefreshNearby: () => void;
  getTravelTime: (distance: number) => string;
}

export default function NearbyBottomSheet({
  showNearby,
  userLocation,
  nearbyStations,
  isTestMode,
  isRefreshing,
  bottomSheetRef,
  onClose,
  onSelectStation,
  onNavigate,
  onRefreshNearby,
  getTravelTime,
}: NearbyBottomSheetProps) {
  const handleClose = () => {
    onClose();
    setTimeout(() => {
      bottomSheetRef.current?.close?.();
    }, 100);
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      snapPoints={["50%", "85%"]}
      index={showNearby ? 0 : -1}
      enablePanDownToClose={true}
      onClose={onClose}
    >
      <BottomSheetScrollView
        style={styles.bottomSheetContent}
        scrollEnabled={true}
      >
        <View style={styles.bottomSheetHeader}>
          <Text style={styles.bottomSheetTitle}>Nearby Stations</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={isRefreshing ? undefined : onRefreshNearby}
              style={[
                styles.headerRefreshButton,
                isRefreshing && { opacity: 0.6 },
              ]}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color="#2ecc71" />
              ) : (
                <MaterialCommunityIcons
                  name="refresh"
                  size={20}
                  color="#2ecc71"
                />
              )}
            </Pressable>
            <Pressable
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="close" size={24} color="#333" />
            </Pressable>
          </View>
        </View>

        {isTestMode && (
          <Text style={styles.nearbyStationSubtitle}>
            Test mode: location and report refresh data are simulated.
          </Text>
        )}

        {nearbyStations.length === 0 ? (
          <Text style={styles.nearbyStationSubtitle}>
            {userLocation
              ? "No nearby stations found in this area."
              : "Set your location to see nearby stations."}
          </Text>
        ) : (
          nearbyStations.map(({ station, distance, fuelStatus, timestamp }) => {
            const ageMinutes = Math.floor((Date.now() - timestamp) / 60000);
            const isStale = ageMinutes > 2;

            return (
              <Pressable
                key={station.id}
                style={styles.nearbyStationCard}
                onPress={() => onSelectStation(station)}
              >
                <Text style={styles.nearbyStationTitle}>{station.name}</Text>
                <Text style={styles.nearbyStationSubtitle}>
                  {getTravelTime(distance)} • {distance.toFixed(1)} km
                </Text>
                <Text style={styles.nearbyStationStatus}>
                  {getFuelSubtitle(
                    fuelStatus?.petrol || false,
                    fuelStatus?.diesel || false,
                  )}
                </Text>
                <Text style={styles.nearbyStationInfo}>
                  {fuelStatus?.reportCount != null
                    ? `${fuelStatus.reportCount} report${
                        fuelStatus.reportCount === 1 ? "" : "s"
                      }`
                    : "Recent report"}
                  {fuelStatus?.timestamp &&
                    ` • ${getReportAgeMinutes(fuelStatus.timestamp)} min ago`}
                </Text>
                <View style={styles.bottomActions}>
                  <Pressable
                    style={styles.bottomSheetButton}
                    onPress={() => onNavigate(station)}
                  >
                    <Text style={styles.bottomSheetButtonText}>Navigate</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          })
        )}

        {!userLocation && (
          <Text style={styles.nearbyStationSubtitle}>
            Enable location to see nearby station distances.
          </Text>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
