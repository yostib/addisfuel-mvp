import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Marker } from "react-native-maps";
import { Station } from "../data/stations";
import { StationReport } from "../hooks/useFuelReports";
import {
  getFuelIcon,
  getFuelTypeIndicator,
  getQueueIcon,
  getFuelSubtitle,
  getQueueText,
  getFreshnessLabel,
  hasBothFuels,
  getReportAgeMinutes,
} from "../utils/helpers";
import { COLORS } from "../utils/constants";

interface StationMarkerProps {
  station: Station;
  report?: StationReport;
  isSelected: boolean;
  forceUpdate: number;
  markerColor: string;
  onPress: () => void;
}

export default function StationMarker({
  station,
  report,
  isSelected,
  forceUpdate,
  markerColor,
  onPress,
}: StationMarkerProps) {
  const hasReport = !!report;
  const fuelIndicator = hasReport
    ? getFuelTypeIndicator(report.petrol || false, report.diesel || false)
    : "⚪";
  const queueIcon = getQueueIcon(report?.queueLength);
  const fuelIcon = hasReport
    ? getFuelIcon(report.petrol || false, report.diesel || false)
    : "gas-station";
  const fuelSubtitle = hasReport
    ? getFuelSubtitle(report.petrol || false, report.diesel || false)
    : "No reports";
  const queueText = getQueueText(report?.queueLength);
  const age = getReportAgeMinutes(report?.timestamp);
  const freshnessLabel = getFreshnessLabel(age);
  const reportCount = report?.reportCount;
  const hasBoth = hasReport
    ? hasBothFuels(report.petrol || false, report.diesel || false)
    : false;

  return (
    <Marker
      key={`${station.id}-${forceUpdate}`}
      coordinate={{ latitude: station.latitude, longitude: station.longitude }}
      onPress={onPress}
      tracksViewChanges={true}
    >
      <View
        style={[styles.markerContainer, isSelected && styles.selectedMarker]}
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
}

const styles = StyleSheet.create({
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
});
