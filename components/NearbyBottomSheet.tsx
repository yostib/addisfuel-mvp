import { Pressable, Text, View } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../styles/home";
import { Station } from "../data/stations";
import { NearbyStation } from "../hooks/useNearbyStations";
import { RefObject } from "react";

interface NearbyBottomSheetProps {
  showNearby: boolean;
  userLocation: { latitude: number; longitude: number } | null;
  nearbyStations: NearbyStation[];
  isTestMode: boolean;
  bottomSheetRef: RefObject<BottomSheet>;
  onClose: () => void;
  onSelectStation: (station: Station) => void;
  onNavigate: (station: Station) => void;
  getTravelTime: (distance: number) => string;
}

export default function NearbyBottomSheet({
  showNearby,
  userLocation,
  nearbyStations,
  isTestMode,
  bottomSheetRef,
  onClose,
  onSelectStation,
  onNavigate,
  getTravelTime,
}: NearbyBottomSheetProps) {
  return (
    <BottomSheet
      ref={bottomSheetRef}
      snapPoints={["35%"]}
      index={showNearby ? 0 : -1}
      enablePanDownToClose={true}
      onClose={onClose}
    >
      <BottomSheetView style={styles.bottomSheetContent}>
        <View style={styles.bottomSheetHeader}>
          <Text style={styles.bottomSheetTitle}>Nearby Stations</Text>
          <Pressable onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color="#333" />
          </Pressable>
        </View>

        {isTestMode && (
          <Text style={styles.nearbyStationSubtitle}>
            Test mode: location and report refresh data are simulated.
          </Text>
        )}

        {nearbyStations.map(({ station, distance, fuelStatus }) => (
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
              {fuelStatus?.petrol || fuelStatus?.diesel
                ? [
                    fuelStatus?.petrol ? "Petrol" : "",
                    fuelStatus?.diesel ? "Diesel" : "",
                  ]
                    .filter(Boolean)
                    .join(" • ")
                : "No recent fuel report"}
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
        ))}

        {!userLocation && (
          <Text style={styles.nearbyStationSubtitle}>
            Enable location to see nearby station distances.
          </Text>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}
