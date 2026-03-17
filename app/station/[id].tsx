import {
  View,
  Text,
  StyleSheet,
  Alert,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  Animated,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  getDocs,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useState, useEffect, useRef } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface Report {
  id: string;
  petrol: boolean;
  diesel: boolean;
  queueLength?: "low" | "medium" | "high";
  timestamp: Timestamp;
}

export default function StationDetailScreen() {
  const params = useLocalSearchParams();
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQueue, setSelectedQueue] = useState<
    "low" | "medium" | "high" | null
  >(null);
  const [indexError, setIndexError] = useState(false);

  // Animation values
  const petrolPulseAnim = useRef(new Animated.Value(1)).current;
  const dieselPulseAnim = useRef(new Animated.Value(1)).current;

  // Fetch reports for this station in real-time
  useEffect(() => {
    let unsubscribe: () => void;

    const setupListener = async () => {
      try {
        // First try with ordered query
        const q = query(
          collection(db, "fuelReports"),
          where("stationId", "==", params.id),
          orderBy("timestamp", "desc"),
        );

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const fetchedReports: Report[] = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as Report[];

            setReports(fetchedReports);
            setIsLoading(false);
            setIndexError(false);
          },
          async (error) => {
            // Check if it's an index error
            if (
              error.code === "failed-precondition" ||
              error.message.includes("index")
            ) {
              console.log("Index missing, falling back to client-side sorting");
              setIndexError(true);

              // Fallback: get all reports for this station and sort client-side
              try {
                const fallbackQuery = query(
                  collection(db, "fuelReports"),
                  where("stationId", "==", params.id),
                );

                const snapshot = await getDocs(fallbackQuery);
                const fetchedReports: Report[] = snapshot.docs.map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                })) as Report[];

                // Sort client-side by timestamp
                fetchedReports.sort((a, b) => {
                  if (!a.timestamp) return 1;
                  if (!b.timestamp) return -1;
                  return b.timestamp.seconds - a.timestamp.seconds;
                });

                setReports(fetchedReports);

                // Set up a listener without orderBy for real-time updates
                unsubscribe = onSnapshot(fallbackQuery, (snapshot) => {
                  const updatedReports: Report[] = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                  })) as Report[];

                  // Sort client-side
                  updatedReports.sort((a, b) => {
                    if (!a.timestamp) return 1;
                    if (!b.timestamp) return -1;
                    return b.timestamp.seconds - a.timestamp.seconds;
                  });

                  setReports(updatedReports);
                });
              } catch (fallbackError) {
                console.error("Fallback query also failed:", fallbackError);
                Alert.alert(
                  "Error",
                  "Failed to load reports. Please try again.",
                );
              }
            } else {
              console.error("Error fetching reports:", error);
              Alert.alert("Error", "Failed to load reports");
            }
            setIsLoading(false);
          },
        );
      } catch (error) {
        console.error("Error setting up listener:", error);
        setIsLoading(false);
      }
    };

    setupListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [params.id]);

  // Start animations when current status changes
  useEffect(() => {
    if (currentStatus) {
      // Animate petrol if available
      if (currentStatus.petrol) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(petrolPulseAnim, {
              toValue: 1.1,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(petrolPulseAnim, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
        ).start();
      } else {
        petrolPulseAnim.setValue(1);
      }

      // Animate diesel if available
      if (currentStatus.diesel) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(dieselPulseAnim, {
              toValue: 1.1,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(dieselPulseAnim, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
        ).start();
      } else {
        dieselPulseAnim.setValue(1);
      }
    }
  }, [reports[0]]); // Run when latest report changes

  // Calculate statistics
  const statistics = {
    totalReports: reports.length,
    lastReport: reports.length > 0 ? reports[0] : null,

    petrolAvailable: reports.filter((r) => r.petrol).length,
    dieselAvailable: reports.filter((r) => r.diesel).length,
    bothAvailable: reports.filter((r) => r.petrol && r.diesel).length,
    noFuel: reports.filter((r) => !r.petrol && !r.diesel).length,

    queueLengths: {
      low: reports.filter((r) => r.queueLength === "low").length,
      medium: reports.filter((r) => r.queueLength === "medium").length,
      high: reports.filter((r) => r.queueLength === "high").length,
    },
  };

  // Get current status (latest report)
  const currentStatus = reports[0];

  const getQueueColor = (queue?: "low" | "medium" | "high") => {
    switch (queue) {
      case "low":
        return "#27ae60";
      case "medium":
        return "#f39c12";
      case "high":
        return "#e74c3c";
      default:
        return "#95a5a6";
    }
  };

  const getQueueIcon = (queue?: "low" | "medium" | "high") => {
    switch (queue) {
      case "low":
        return "🟢";
      case "medium":
        return "🟡";
      case "high":
        return "🔴";
      default:
        return "⚪";
    }
  };

  const getQueueText = (queue?: "low" | "medium" | "high") => {
    switch (queue) {
      case "low":
        return "Low Queue";
      case "medium":
        return "Medium Queue";
      case "high":
        return "Long Queue";
      default:
        return "Unknown";
    }
  };

  const formatTime = (timestamp?: Timestamp) => {
    if (!timestamp) return "Never";

    const date = timestamp.toDate();
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hours ago`;
    return date.toLocaleDateString();
  };

  const reportFuel = async (petrol: boolean, diesel: boolean) => {
    if (!selectedQueue) {
      Alert.alert(
        "Queue Length",
        "Please select the queue length before reporting",
      );
      return;
    }

    try {
      await addDoc(collection(db, "fuelReports"), {
        stationId: params.id,
        stationName: params.name,
        petrol,
        diesel,
        queueLength: selectedQueue,
        timestamp: serverTimestamp(),
      });

      Alert.alert("Success", `Report submitted for ${params.name}`);
      setSelectedQueue(null); // Reset queue selection
    } catch (error) {
      console.error("Error adding document: ", error);
      Alert.alert("Error", "Failed to report fuel.");
    }
  };

  const navigateBack = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2ecc71" />
        <Text style={styles.loadingText}>Loading reports...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <Pressable onPress={navigateBack} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#2d3436" />
        </Pressable>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{params.name}</Text>
          <Text style={styles.stationId}>ID: {params.id}</Text>
        </View>
      </View>

      {/* Index Warning Banner */}
      {indexError && (
        <View style={styles.warningBanner}>
          <MaterialCommunityIcons name="alert" size={24} color="#f39c12" />
          <Text style={styles.warningText}>
            For better performance, please create the required database index.
          </Text>
        </View>
      )}

      {/* Current Status Card - Enhanced */}
      <View style={styles.currentStatusCard}>
        <Text style={styles.sectionTitle}>🔄 CURRENT STATUS</Text>

        {currentStatus ? (
          <>
            {/* Fuel Availability with Animation */}
            <Text style={styles.statusSubTitle}>Fuel Availability:</Text>
            <View style={styles.fuelStatusRow}>
              {/* Petrol Indicator */}
              <Animated.View
                style={[
                  styles.fuelCard,
                  currentStatus.petrol
                    ? styles.fuelAvailable
                    : styles.fuelUnavailable,
                  {
                    transform: [
                      { scale: currentStatus.petrol ? petrolPulseAnim : 1 },
                    ],
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="gas-station"
                  size={32}
                  color="white"
                />
                <Text style={styles.fuelCardText}>Petrol</Text>
                {currentStatus.petrol && (
                  <View style={styles.availableBadge}>
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={16}
                      color="white"
                    />
                    <Text style={styles.availableBadgeText}>Available</Text>
                  </View>
                )}
                {!currentStatus.petrol && (
                  <View style={styles.unavailableBadge}>
                    <MaterialCommunityIcons
                      name="close-circle"
                      size={16}
                      color="white"
                    />
                    <Text style={styles.availableBadgeText}>Unavailable</Text>
                  </View>
                )}
              </Animated.View>

              {/* Diesel Indicator */}
              <Animated.View
                style={[
                  styles.fuelCard,
                  currentStatus.diesel
                    ? styles.fuelAvailable
                    : styles.fuelUnavailable,
                  {
                    transform: [
                      { scale: currentStatus.diesel ? dieselPulseAnim : 1 },
                    ],
                  },
                ]}
              >
                <MaterialCommunityIcons name="truck" size={32} color="white" />
                <Text style={styles.fuelCardText}>Diesel</Text>
                {currentStatus.diesel && (
                  <View style={styles.availableBadge}>
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={16}
                      color="white"
                    />
                    <Text style={styles.availableBadgeText}>Available</Text>
                  </View>
                )}
                {!currentStatus.diesel && (
                  <View style={styles.unavailableBadge}>
                    <MaterialCommunityIcons
                      name="close-circle"
                      size={16}
                      color="white"
                    />
                    <Text style={styles.availableBadgeText}>Unavailable</Text>
                  </View>
                )}
              </Animated.View>
            </View>

            {/* Both Available Special Indicator */}
            {currentStatus.petrol && currentStatus.diesel && (
              <View style={styles.bothAvailableContainer}>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={20}
                  color="#2ecc71"
                />
                <Text style={styles.bothAvailableText}>
                  Both Petrol and Diesel Available!
                </Text>
              </View>
            )}

            {/* Queue Status with Enhanced Display */}
            {currentStatus.queueLength && (
              <View style={styles.queueStatusContainer}>
                <Text style={styles.statusSubTitle}>Queue Status:</Text>
                <View
                  style={[
                    styles.queueCard,
                    {
                      backgroundColor: getQueueColor(currentStatus.queueLength),
                    },
                  ]}
                >
                  <Text style={styles.queueIcon}>
                    {getQueueIcon(currentStatus.queueLength)}
                  </Text>
                  <View style={styles.queueInfo}>
                    <Text style={styles.queueTitle}>
                      {getQueueText(currentStatus.queueLength)}
                    </Text>
                    <Text style={styles.queueDescription}>
                      {currentStatus.queueLength === "low" &&
                        "Less than 5 minutes wait"}
                      {currentStatus.queueLength === "medium" &&
                        "5-15 minutes wait"}
                      {currentStatus.queueLength === "high" &&
                        "More than 15 minutes wait"}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Report Time */}
            <View style={styles.reportTimeContainer}>
              <MaterialCommunityIcons
                name="clock-outline"
                size={14}
                color="#7f8c8d"
              />
              <Text style={styles.lastReportTime}>
                Last report: {formatTime(currentStatus.timestamp)}
              </Text>
            </View>

            {/* Report Count Badge */}
            {statistics.totalReports > 0 && (
              <View style={styles.reportCountBadge}>
                <MaterialCommunityIcons
                  name="clipboard-text"
                  size={14}
                  color="#7f8c8d"
                />
                <Text style={styles.reportCountText}>
                  {statistics.totalReports} total reports •{" "}
                  {statistics.bothAvailable} both, {statistics.petrolAvailable}{" "}
                  petrol, {statistics.dieselAvailable} diesel
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.noReportsContainer}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={50}
              color="#95a5a6"
            />
            <Text style={styles.noReportsText}>
              No reports yet for this station
            </Text>
            <Text style={styles.noReportsSubText}>
              Be the first to report fuel availability!
            </Text>
          </View>
        )}
      </View>

      {/* Report Section */}
      <View style={styles.reportSection}>
        <Text style={styles.sectionTitle}>📝 REPORT FUEL STATUS</Text>

        {/* Queue Selection */}
        <View style={styles.queueSelectionContainer}>
          <Text style={styles.subSectionTitle}>
            Step 1: Select Queue Length
          </Text>
          <View style={styles.queueOptions}>
            <Pressable
              style={[
                styles.queueOption,
                selectedQueue === "low" && styles.selectedQueue,
              ]}
              onPress={() => setSelectedQueue("low")}
            >
              <Text style={styles.queueOptionIcon}>🟢</Text>
              <Text style={styles.queueOptionText}>Low</Text>
              <Text style={styles.queueOptionDesc}>(&lt; 5 min)</Text>
            </Pressable>

            <Pressable
              style={[
                styles.queueOption,
                selectedQueue === "medium" && styles.selectedQueue,
              ]}
              onPress={() => setSelectedQueue("medium")}
            >
              <Text style={styles.queueOptionIcon}>🟡</Text>
              <Text style={styles.queueOptionText}>Medium</Text>
              <Text style={styles.queueOptionDesc}>(5-15 min)</Text>
            </Pressable>

            <Pressable
              style={[
                styles.queueOption,
                selectedQueue === "high" && styles.selectedQueue,
              ]}
              onPress={() => setSelectedQueue("high")}
            >
              <Text style={styles.queueOptionIcon}>🔴</Text>
              <Text style={styles.queueOptionText}>High</Text>
              <Text style={styles.queueOptionDesc}>(&gt; 15 min)</Text>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.subSectionTitle, { marginTop: 10 }]}>
          Step 2: Report Fuel Availability
        </Text>

        <View style={styles.reportButtonsContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.reportButton,
              styles.petrolButton,
              { opacity: pressed ? 0.8 : 1 },
              !selectedQueue && styles.reportButtonDisabled,
            ]}
            onPress={() => reportFuel(true, false)}
            disabled={!selectedQueue}
          >
            <MaterialCommunityIcons
              name="gas-station"
              size={24}
              color="white"
            />
            <Text style={styles.reportButtonText}>Petrol Only</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.reportButton,
              styles.dieselButton,
              { opacity: pressed ? 0.8 : 1 },
              !selectedQueue && styles.reportButtonDisabled,
            ]}
            onPress={() => reportFuel(false, true)}
            disabled={!selectedQueue}
          >
            <MaterialCommunityIcons name="truck" size={24} color="white" />
            <Text style={styles.reportButtonText}>Diesel Only</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.reportButton,
              styles.bothButton,
              { opacity: pressed ? 0.8 : 1 },
              !selectedQueue && styles.reportButtonDisabled,
            ]}
            onPress={() => reportFuel(true, true)}
            disabled={!selectedQueue}
          >
            <View style={styles.bothIconsContainer}>
              <MaterialCommunityIcons
                name="gas-station"
                size={20}
                color="white"
              />
              <MaterialCommunityIcons name="truck" size={20} color="white" />
            </View>
            <Text style={styles.reportButtonText}>Both Available</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.reportButton,
              styles.noFuelButton,
              { opacity: pressed ? 0.8 : 1 },
              !selectedQueue && styles.reportButtonDisabled,
            ]}
            onPress={() => reportFuel(false, false)}
            disabled={!selectedQueue}
          >
            <MaterialCommunityIcons
              name="close-circle"
              size={24}
              color="white"
            />
            <Text style={styles.reportButtonText}>No Fuel</Text>
          </Pressable>
        </View>

        {!selectedQueue && (
          <View style={styles.hintContainer}>
            <MaterialCommunityIcons name="arrow-up" size={20} color="#f39c12" />
            <Text style={styles.hintText}>Select queue length first</Text>
          </View>
        )}
      </View>

      {/* Statistics */}
      {reports.length > 0 && (
        <View style={styles.statsCard}>
          <Text style={styles.sectionTitle}>📊 STATISTICS</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statistics.totalReports}</Text>
              <Text style={styles.statLabel}>Total Reports</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statistics.petrolAvailable}</Text>
              <Text style={styles.statLabel}>Petrol Reports</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statistics.dieselAvailable}</Text>
              <Text style={styles.statLabel}>Diesel Reports</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statistics.bothAvailable}</Text>
              <Text style={styles.statLabel}>Both Available</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statistics.noFuel}</Text>
              <Text style={styles.statLabel}>No Fuel</Text>
            </View>
          </View>

          {/* Queue Distribution */}
          <View style={styles.queueStats}>
            <Text style={styles.subSectionTitle}>Queue Distribution:</Text>

            <View style={styles.queueBar}>
              <View
                style={[
                  styles.queueSegment,
                  {
                    flex: statistics.queueLengths.low || 0.1,
                    backgroundColor: "#27ae60",
                  },
                ]}
              />
              <View
                style={[
                  styles.queueSegment,
                  {
                    flex: statistics.queueLengths.medium || 0.1,
                    backgroundColor: "#f39c12",
                  },
                ]}
              />
              <View
                style={[
                  styles.queueSegment,
                  {
                    flex: statistics.queueLengths.high || 0.1,
                    backgroundColor: "#e74c3c",
                  },
                ]}
              />
            </View>

            <View style={styles.queueLegend}>
              <Text style={styles.queueLegendItem}>
                🟢 Low: {statistics.queueLengths.low}
              </Text>
              <Text style={styles.queueLegendItem}>
                🟡 Med: {statistics.queueLengths.medium}
              </Text>
              <Text style={styles.queueLegendItem}>
                🔴 High: {statistics.queueLengths.high}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Recent Reports */}
      {reports.length > 0 && (
        <View style={styles.recentReports}>
          <Text style={styles.sectionTitle}>📋 RECENT REPORTS</Text>

          {reports.slice(0, 10).map((report, index) => (
            <View key={report.id} style={styles.reportItem}>
              <View style={styles.reportItemLeft}>
                <Text style={styles.reportItemNumber}>
                  #{reports.length - index}
                </Text>
                <View style={styles.reportItemFuels}>
                  {report.petrol && (
                    <View style={styles.reportFuelBadge}>
                      <MaterialCommunityIcons
                        name="gas-station"
                        size={14}
                        color="#27ae60"
                      />
                      <Text style={styles.reportFuelText}>P</Text>
                    </View>
                  )}
                  {report.diesel && (
                    <View style={styles.reportFuelBadge}>
                      <MaterialCommunityIcons
                        name="truck"
                        size={14}
                        color="#27ae60"
                      />
                      <Text style={styles.reportFuelText}>D</Text>
                    </View>
                  )}
                  {!report.petrol && !report.diesel && (
                    <View
                      style={[styles.reportFuelBadge, styles.reportNoFuelBadge]}
                    >
                      <MaterialCommunityIcons
                        name="close-circle"
                        size={14}
                        color="#e74c3c"
                      />
                      <Text
                        style={[styles.reportFuelText, styles.reportNoFuelText]}
                      >
                        No Fuel
                      </Text>
                    </View>
                  )}
                </View>
                {report.queueLength && (
                  <View
                    style={[
                      styles.reportQueueBadge,
                      { backgroundColor: getQueueColor(report.queueLength) },
                    ]}
                  >
                    <Text style={styles.reportQueueText}>
                      {getQueueIcon(report.queueLength)}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.reportTime}>
                {formatTime(report.timestamp)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    backgroundColor: "#f5f6fa",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f6fa",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2d3436",
    marginBottom: 4,
  },
  stationId: {
    fontSize: 14,
    color: "#7f8c8d",
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff3cd",
    borderWidth: 1,
    borderColor: "#ffeeba",
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  warningText: {
    flex: 1,
    color: "#856404",
    fontSize: 12,
    marginLeft: 8,
  },
  currentStatusCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    color: "#2d3436",
    letterSpacing: 0.5,
  },
  statusSubTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: "#34495e",
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
    color: "#34495e",
  },
  fuelStatusRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
    gap: 12,
  },
  fuelCard: {
    flex: 1,
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    position: "relative",
    minHeight: 120,
    justifyContent: "center",
  },
  fuelAvailable: {
    backgroundColor: "#2ecc71",
    shadowColor: "#2ecc71",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fuelUnavailable: {
    backgroundColor: "#e74c3c",
    opacity: 0.7,
  },
  fuelCardText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
  },
  availableBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.3)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  unavailableBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  availableBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "600",
    marginLeft: 4,
  },
  bothAvailableContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e8f5e9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  bothAvailableText: {
    color: "#2ecc71",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  queueStatusContainer: {
    marginBottom: 16,
  },
  queueCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  queueIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  queueInfo: {
    flex: 1,
  },
  queueTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
  queueDescription: {
    color: "white",
    fontSize: 12,
    opacity: 0.9,
    marginTop: 4,
  },
  reportTimeContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  lastReportTime: {
    color: "#7f8c8d",
    fontSize: 12,
    marginLeft: 4,
  },
  reportCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8f9fa",
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  reportCountText: {
    color: "#7f8c8d",
    fontSize: 11,
    marginLeft: 4,
  },
  noReportsContainer: {
    alignItems: "center",
    padding: 30,
  },
  noReportsText: {
    fontSize: 18,
    color: "#34495e",
    marginTop: 16,
    fontWeight: "600",
  },
  noReportsSubText: {
    fontSize: 14,
    color: "#7f8c8d",
    marginTop: 8,
  },
  reportSection: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  queueSelectionContainer: {
    marginBottom: 16,
  },
  queueOptions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  queueOption: {
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f8f9fa",
    flex: 1,
  },
  selectedQueue: {
    backgroundColor: "#e8f5e9",
    borderWidth: 2,
    borderColor: "#2ecc71",
  },
  queueOptionIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  queueOptionText: {
    fontWeight: "600",
    color: "#2c3e50",
    fontSize: 12,
  },
  queueOptionDesc: {
    fontSize: 9,
    color: "#7f8c8d",
  },
  reportButtonsContainer: {
    gap: 10,
  },
  reportButton: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  reportButtonDisabled: {
    opacity: 0.5,
  },
  petrolButton: {
    backgroundColor: "#3498db",
  },
  dieselButton: {
    backgroundColor: "#e67e22",
  },
  bothButton: {
    backgroundColor: "#9b59b6",
  },
  noFuelButton: {
    backgroundColor: "#e74c3c",
  },
  reportButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  bothIconsContainer: {
    flexDirection: "row",
    marginRight: 4,
    gap: 4,
  },
  hintContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  hintText: {
    color: "#f39c12",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 4,
  },
  statsCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 8,
  },
  statItem: {
    width: "48%",
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2c3e50",
  },
  statLabel: {
    fontSize: 11,
    color: "#7f8c8d",
    textAlign: "center",
    marginTop: 4,
  },
  queueStats: {
    marginTop: 8,
  },
  queueBar: {
    flexDirection: "row",
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
  },
  queueSegment: {
    height: "100%",
  },
  queueLegend: {
    flexDirection: "row",
    justifyContent: "space-around",
    flexWrap: "wrap",
    gap: 8,
  },
  queueLegendItem: {
    fontSize: 12,
    color: "#34495e",
  },
  recentReports: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  reportItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f2f6",
  },
  reportItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  reportItemNumber: {
    width: 40,
    fontSize: 12,
    color: "#7f8c8d",
  },
  reportItemFuels: {
    flexDirection: "row",
    marginRight: 8,
    gap: 4,
    flex: 1,
  },
  reportFuelBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8f5e9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  reportNoFuelBadge: {
    backgroundColor: "#fdeaea",
  },
  reportFuelText: {
    fontSize: 10,
    color: "#27ae60",
    fontWeight: "600",
    marginLeft: 2,
  },
  reportNoFuelText: {
    color: "#e74c3c",
  },
  reportQueueBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 4,
  },
  reportQueueText: {
    fontSize: 12,
  },
  reportTime: {
    fontSize: 11,
    color: "#95a5a6",
  },
});
