import { Pressable, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../styles/home";
import { COLORS } from "../utils/constants";

interface MapHeaderControlsProps {
  mapType: "standard" | "satellite" | "hybrid";
  showMapTypeSelector: boolean;
  onToggleMapTypeSelector: () => void;
  onChangeMapType: (value: "standard" | "satellite" | "hybrid") => void;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  showLegend: boolean;
  onToggleLegend: () => void;
}

const MAP_TYPES: {
  label: string;
  value: "standard" | "satellite" | "hybrid";
}[] = [
  { label: "Map", value: "standard" },
  { label: "Satellite", value: "satellite" },
  { label: "Hybrid", value: "hybrid" },
];

const LEGEND_ITEMS = [
  {
    label: "Petrol & Diesel",
    icon: "gas-station",
    color: COLORS.FUEL_AVAILABLE,
  },
  { label: "Only Petrol", icon: "fuel", color: "#3498db" },
  { label: "Only Diesel", icon: "truck-delivery", color: COLORS.QUEUE_MEDIUM },
  {
    label: "No fuel update",
    icon: "gas-station-off",
    color: COLORS.NO_REPORTS,
  },
];

export default function MapHeaderControls({
  mapType,
  showMapTypeSelector,
  onToggleMapTypeSelector,
  onChangeMapType,
  isRefreshing,
  onRefresh,
  showLegend,
  onToggleLegend,
}: MapHeaderControlsProps) {
  return (
    <View style={styles.topButtonsContainer}>
      <Pressable
        style={[styles.coloredButton, { backgroundColor: COLORS.SECONDARY }]}
        onPress={onRefresh}
      >
        <MaterialCommunityIcons
          name={isRefreshing ? "refresh" : "refresh"}
          size={20}
          color={COLORS.WHITE}
        />
      </Pressable>

      <View style={styles.legendContainer}>
        <Pressable
          style={[styles.coloredButton, { backgroundColor: COLORS.PRIMARY }]}
          onPress={onToggleLegend}
        >
          <MaterialCommunityIcons
            name="information-outline"
            size={20}
            color={COLORS.WHITE}
          />
        </Pressable>
        {showLegend && (
          <View style={styles.legendDropdown}>
            <Text style={styles.legendDropdownTitle}>Legend</Text>
            {LEGEND_ITEMS.map((item) => (
              <View key={item.label} style={styles.legendDropdownItem}>
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={16}
                  color={item.color}
                />
                <Text style={styles.legendDropdownText}>{item.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.mapToggleContainer}>
        <Pressable
          style={[styles.coloredButton, { backgroundColor: COLORS.WARNING }]}
          onPress={onToggleMapTypeSelector}
        >
          <MaterialCommunityIcons name="map" size={20} color={COLORS.WHITE} />
        </Pressable>
        {showMapTypeSelector && (
          <View style={styles.mapTypeSelector}>
            {MAP_TYPES.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.mapTypeButton,
                  option.value === mapType && styles.mapTypeButtonActive,
                ]}
                onPress={() => onChangeMapType(option.value)}
              >
                <Text
                  style={[
                    styles.mapTypeButtonText,
                    option.value === mapType && styles.mapTypeButtonTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
