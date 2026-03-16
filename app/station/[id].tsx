import { View, Text, StyleSheet, Alert, Pressable, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, Timestamp, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { useState, useEffect } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface Report {
  id: string;
  petrol: boolean;
  diesel: boolean;
  queueLength?: 'low' | 'medium' | 'high';
  timestamp: Timestamp;
}

export default function StationScreen() {
  const params = useLocalSearchParams();
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQueue, setSelectedQueue] = useState<'low' | 'medium' | 'high' | null>(null);
  const [indexError, setIndexError] = useState(false);

  // Fetch reports for this station in real-time
  useEffect(() => {
    let unsubscribe: () => void;

    const setupListener = async () => {
      try {
        // First try with ordered query
        const q = query(
          collection(db, "fuelReports"),
          where("stationId", "==", params.id),
          orderBy("timestamp", "desc")
        );

        unsubscribe = onSnapshot(q, (snapshot) => {
          const fetchedReports: Report[] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Report[];
          
          setReports(fetchedReports);
          setIsLoading(false);
          setIndexError(false);
        }, async (error) => {
          // Check if it's an index error
          if (error.code === 'failed-precondition' || error.message.includes('index')) {
            console.log("Index missing, falling back to client-side sorting");
            setIndexError(true);
            
            // Fallback: get all reports for this station and sort client-side
            try {
              const fallbackQuery = query(
                collection(db, "fuelReports"),
                where("stationId", "==", params.id) // Fixed: removed extra quote
              );
              
              const snapshot = await getDocs(fallbackQuery);
              const fetchedReports: Report[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
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
                const updatedReports: Report[] = snapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data()
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
              Alert.alert("Error", "Failed to load reports. Please try again.");
            }
          } else {
            console.error("Error fetching reports:", error);
            Alert.alert("Error", "Failed to load reports");
          }
          setIsLoading(false);
        });
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

  // Calculate statistics
  const statistics = {
    totalReports: reports.length,
    lastReport: reports.length > 0 ? reports[0] : null,
    
    petrolAvailable: reports.filter(r => r.petrol).length,
    dieselAvailable: reports.filter(r => r.diesel).length,
    bothAvailable: reports.filter(r => r.petrol && r.diesel).length,
    noFuel: reports.filter(r => !r.petrol && !r.diesel).length,
    
    queueLengths: {
      low: reports.filter(r => r.queueLength === 'low').length,
      medium: reports.filter(r => r.queueLength === 'medium').length,
      high: reports.filter(r => r.queueLength === 'high').length,
    }
  };

  // Get current status (latest report)
  const currentStatus = reports[0];
  
  const getQueueColor = (queue?: 'low' | 'medium' | 'high') => {
    switch(queue) {
      case 'low': return '#27ae60';
      case 'medium': return '#f39c12';
      case 'high': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  const getQueueIcon = (queue?: 'low' | 'medium' | 'high') => {
    switch(queue) {
      case 'low': return '🟢';
      case 'medium': return '🟡';
      case 'high': return '🔴';
      default: return '⚪';
    }
  };

  const formatTime = (timestamp?: Timestamp) => {
    if (!timestamp) return 'Never';
    
    const date = timestamp.toDate();
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hours ago`;
    return date.toLocaleDateString();
  };

  const reportFuel = async (petrol: boolean, diesel: boolean) => {
    if (!selectedQueue) {
      Alert.alert("Queue Length", "Please select the queue length before reporting");
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
      {/* Index Warning Banner - Only show if index is missing */}
      {indexError && (
        <View style={styles.warningBanner}>
          <MaterialCommunityIcons name="alert" size={24} color="#f39c12" />
          <Text style={styles.warningText}>
            For better performance, please create the required database index.
          </Text>
          <Pressable 
            style={styles.warningButton}
            onPress={() => {
              const indexUrl = "https://console.firebase.google.com/v1/r/project/addisfuel-bc703/firestore/indexes?create_composite=ClNwcm9qZWN0cy9hZGRpc2Z1ZWwtYmM3MDMvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL2Z1ZWxSZXBvcnRzL2luZGV4ZXMvXxABGg0KCXN0YXRpb25JZBABGg0KCXRpbWVzdGFtcBACGgwKCF9fbmFtZV9fEAI";
              Alert.alert(
                "Create Index",
                "Would you like to open the Firebase Console to create the index?",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Open Console", onPress: () => Linking.openURL(indexUrl) }
                ]
              );
            }}
          >
            <Text style={styles.warningButtonText}>Fix</Text>
          </Pressable>
        </View>
      )}

      {/* PRIORITY 1: Station Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{params.name}</Text>
        <Text style={styles.stationId}>ID: {params.id}</Text>
      </View>

      {/* PRIORITY 2: Current Status Card - Most Important */}
      <View style={styles.currentStatusCard}>
        <Text style={styles.sectionTitle}>🔄 CURRENT STATUS</Text>
        
        {currentStatus ? (
          <>
            {/* Fuel Availability */}
            <View style={styles.fuelStatusRow}>
              <View style={[styles.fuelBadge, currentStatus.petrol ? styles.available : styles.unavailable]}>
                <MaterialCommunityIcons 
                  name="gas-station" 
                  size={20} 
                  color="white" 
                  style={styles.fuelBadgeIcon}
                />
                <Text style={styles.fuelBadgeText}>Petrol</Text>
              </View>
              <View style={[styles.fuelBadge, currentStatus.diesel ? styles.available : styles.unavailable]}>
                <MaterialCommunityIcons 
                  name="truck" 
                  size={20} 
                  color="white" 
                  style={styles.fuelBadgeIcon}
                />
                <Text style={styles.fuelBadgeText}>Diesel</Text>
              </View>
            </View>

            {/* Queue Status */}
            {currentStatus.queueLength && (
              <View style={styles.queueStatusContainer}>
                <Text style={styles.queueStatusLabel}>Queue Length:</Text>
                <View style={[styles.queueStatusIndicator, { backgroundColor: getQueueColor(currentStatus.queueLength) }]}>
                  <Text style={styles.queueStatusIcon}>{getQueueIcon(currentStatus.queueLength)}</Text>
                  <Text style={styles.queueStatusText}>
                    {currentStatus.queueLength.toUpperCase()}
                  </Text>
                </View>
              </View>
            )}

            {/* Report Time */}
            <View style={styles.reportTimeContainer}>
              <MaterialCommunityIcons name="clock-outline" size={14} color="#7f8c8d" />
              <Text style={styles.lastReportTime}>
                Last report: {formatTime(currentStatus.timestamp)}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.noReportsContainer}>
            <MaterialCommunityIcons name="alert-circle-outline" size={40} color="#95a5a6" />
            <Text style={styles.noReportsText}>No reports yet for this station</Text>
            <Text style={styles.noReportsSubText}>Be the first to report!</Text>
          </View>
        )}
      </View>

      {/* PRIORITY 3: Report Availability - Action Section */}
      <View style={styles.reportSection}>
        <Text style={styles.sectionTitle}>📝 REPORT FUEL STATUS</Text>
        
        {/* Queue Selection - Required before reporting */}
        <View style={styles.queueSelectionContainer}>
          <Text style={styles.subSectionTitle}>Step 1: Select Queue Length</Text>
          <View style={styles.queueOptions}>
            <Pressable
              style={[styles.queueOption, selectedQueue === 'low' && styles.selectedQueue]}
              onPress={() => setSelectedQueue('low')}
            >
              <Text style={styles.queueOptionIcon}>🟢</Text>
              <Text style={styles.queueOptionText}>Low</Text>
              <Text style={styles.queueOptionDesc}>(&lt; 5 min)</Text>
            </Pressable>

            <Pressable
              style={[styles.queueOption, selectedQueue === 'medium' && styles.selectedQueue]}
              onPress={() => setSelectedQueue('medium')}
            >
              <Text style={styles.queueOptionIcon}>🟡</Text>
              <Text style={styles.queueOptionText}>Medium</Text>
              <Text style={styles.queueOptionDesc}>(5-15 min)</Text>
            </Pressable>

            <Pressable
              style={[styles.queueOption, selectedQueue === 'high' && styles.selectedQueue]}
              onPress={() => setSelectedQueue('high')}
            >
              <Text style={styles.queueOptionIcon}>🔴</Text>
              <Text style={styles.queueOptionText}>High</Text>
              <Text style={styles.queueOptionDesc}>(&gt; 15 min)</Text>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.subSectionTitle, { marginTop: 10 }]}>Step 2: Report Fuel Availability</Text>
        
        <View style={styles.reportButtonsContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.reportButton,
              styles.petrolButton,
              { opacity: pressed ? 0.8 : 1 },
              !selectedQueue && styles.reportButtonDisabled
            ]}
            onPress={() => reportFuel(true, false)}
            disabled={!selectedQueue}
          >
            <MaterialCommunityIcons name="gas-station" size={24} color="white" />
            <Text style={styles.reportButtonText}>Petrol Only</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.reportButton,
              styles.dieselButton,
              { opacity: pressed ? 0.8 : 1 },
              !selectedQueue && styles.reportButtonDisabled
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
              !selectedQueue && styles.reportButtonDisabled
            ]}
            onPress={() => reportFuel(true, true)}
            disabled={!selectedQueue}
          >
            <View style={styles.bothIconsContainer}>
              <MaterialCommunityIcons name="gas-station" size={20} color="white" />
              <MaterialCommunityIcons name="truck" size={20} color="white" />
            </View>
            <Text style={styles.reportButtonText}>Both Available</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.reportButton,
              styles.noFuelButton,
              { opacity: pressed ? 0.8 : 1 },
              !selectedQueue && styles.reportButtonDisabled
            ]}
            onPress={() => reportFuel(false, false)}
            disabled={!selectedQueue}
          >
            <MaterialCommunityIcons name="close-circle" size={24} color="white" />
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

      {/* PRIORITY 4: Statistics */}
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
              <View style={[styles.queueSegment, { 
                flex: statistics.queueLengths.low || 0.1,
                backgroundColor: '#27ae60' 
              }]} />
              <View style={[styles.queueSegment, { 
                flex: statistics.queueLengths.medium || 0.1,
                backgroundColor: '#f39c12' 
              }]} />
              <View style={[styles.queueSegment, { 
                flex: statistics.queueLengths.high || 0.1,
                backgroundColor: '#e74c3c' 
              }]} />
            </View>
            
            <View style={styles.queueLegend}>
              <Text style={styles.queueLegendItem}>🟢 Low: {statistics.queueLengths.low}</Text>
              <Text style={styles.queueLegendItem}>🟡 Med: {statistics.queueLengths.medium}</Text>
              <Text style={styles.queueLegendItem}>🔴 High: {statistics.queueLengths.high}</Text>
            </View>
          </View>
        </View>
      )}

      {/* PRIORITY 5: Recent Reports - Bottom */}
      {reports.length > 0 && (
        <View style={styles.recentReports}>
          <Text style={styles.sectionTitle}>📋 RECENT REPORTS</Text>
          
          {reports.slice(0, 10).map((report, index) => (
            <View key={report.id} style={styles.reportItem}>
              <View style={styles.reportItemLeft}>
                <Text style={styles.reportItemNumber}>#{reports.length - index}</Text>
                <View style={styles.reportItemFuels}>
                  {report.petrol && <MaterialCommunityIcons name="gas-station" size={16} color="#27ae60" />}
                  {report.diesel && <MaterialCommunityIcons name="truck" size={16} color="#27ae60" />}
                  {!report.petrol && !report.diesel && (
                    <MaterialCommunityIcons name="close-circle" size={16} color="#e74c3c" />
                  )}
                </View>
                {report.queueLength && (
                  <Text style={styles.reportQueue}>
                    {getQueueIcon(report.queueLength)}
                  </Text>
                )}
              </View>
              <Text style={styles.reportTime}>{formatTime(report.timestamp)}</Text>
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
  warningButton: {
    backgroundColor: "#856404",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  warningButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#2d3436",
    marginBottom: 4,
  },
  stationId: {
    fontSize: 14,
    color: "#7f8c8d",
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
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 16,
    color: "#2d3436",
    letterSpacing: 0.5,
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
    marginBottom: 16,
  },
  fuelBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    borderWidth: 2,
    minWidth: 120,
    justifyContent: "center",
  },
  fuelBadgeIcon: {
    marginRight: 8,
  },
  available: {
    backgroundColor: "#2ecc71",
    borderColor: "#27ae60",
  },
  unavailable: {
    backgroundColor: "#e74c3c",
    borderColor: "#c0392b",
  },
  fuelBadgeText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  queueStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  queueStatusLabel: {
    fontSize: 16,
    color: "#34495e",
    marginRight: 10,
  },
  queueStatusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 25,
  },
  queueStatusIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  queueStatusText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
  reportTimeContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  lastReportTime: {
    color: "#7f8c8d",
    fontSize: 12,
    marginLeft: 4,
  },
  noReportsContainer: {
    alignItems: "center",
    padding: 20,
  },
  noReportsText: {
    fontSize: 16,
    color: "#34495e",
    marginTop: 10,
    fontWeight: "500",
  },
  noReportsSubText: {
    fontSize: 14,
    color: "#7f8c8d",
    marginTop: 4,
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
  },
  queueOption: {
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f8f9fa",
    flex: 1,
    marginHorizontal: 4,
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
  },
  statItem: {
    width: "48%",
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#2c3e50",
  },
  statLabel: {
    fontSize: 11,
    color: "#7f8c8d",
    textAlign: "center",
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f2f6",
  },
  reportItemLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  reportItemNumber: {
    width: 35,
    fontSize: 12,
    color: "#7f8c8d",
  },
  reportItemFuels: {
    flexDirection: "row",
    marginRight: 8,
    gap: 4,
  },
  reportQueue: {
    fontSize: 14,
  },
  reportTime: {
    fontSize: 12,
    color: "#95a5a6",
  },
});