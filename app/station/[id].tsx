import { View, Text, StyleSheet, Alert, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase"; // correct path
import { useState } from "react";

export default function StationScreen() {
  const params = useLocalSearchParams();

  // State to track report count and last report time
  const [reportCount, setReportCount] = useState(0);
  const [lastReport, setLastReport] = useState("No reports yet");

  // Report fuel function
  const reportFuel = async (petrol: boolean, diesel: boolean) => {
    try {
      await addDoc(collection(db, "fuelReports"), {
        stationId: params.id,
        stationName: params.name,
        petrol,
        diesel,
        timestamp: serverTimestamp(),
      });

      Alert.alert("Success", `Report submitted for ${params.name}`);
    } catch (error) {
      console.error("Error adding document: ", error);
      Alert.alert("Error", "Failed to report fuel.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{params.name}</Text>
      <Text style={styles.info}>Station ID: {params.id}</Text>
      <Text style={styles.info}>Reports for this station: {reportCount}</Text>
      <Text style={styles.info}>Last report: {lastReport}</Text>

      <View style={styles.reportContainer}>
        <Text style={styles.reportTitle}>Report Fuel Status</Text>

        <Pressable
          style={({ pressed }) => [
            styles.reportButton,
            { backgroundColor: pressed ? "#27ae60" : "#2ecc71" },
          ]}
          onPress={() => reportFuel(true, false)}
        >
          <Text style={styles.reportText}>⛽ Petrol Available</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.reportButton,
            { backgroundColor: pressed ? "#27ae60" : "#2ecc71" },
          ]}
          onPress={() => reportFuel(false, true)}
        >
          <Text style={styles.reportText}>🚛 Diesel Available</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.reportButton,
            { backgroundColor: pressed ? "#27ae60" : "#2ecc71" },
          ]}
          onPress={() => reportFuel(true, true)}
        >
          <Text style={styles.reportText}>⛽🚛 Both Available</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.reportButton,
            styles.noFuel,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => reportFuel(false, false)}
        >
          <Text style={styles.reportText}>❌ No Fuel</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: "#f5f6fa",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
    color: "#2d3436",
  },
  info: {
    fontSize: 16,
    marginBottom: 5,
    color: "#636e72",
  },
  reportContainer: {
    marginTop: 30,
    width: "100%",
    alignItems: "center",
  },
  reportTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 15,
    textAlign: "center",
    color: "#2d3436",
  },
  reportButton: {
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 12,
    marginBottom: 12,
    width: "70%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  reportText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  noFuel: {
    backgroundColor: "#e74c3c",
  },
});