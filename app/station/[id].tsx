import { View, Text, StyleSheet, Button, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase"; // correct path
import { useState } from "react";

export default function StationScreen() {
  const params = useLocalSearchParams();

  
  // State to track report count and last report time
  const [reportCount, setReportCount] = useState(0);
  const [lastReport, setLastReport] = useState("No reports yet");

  // Single, correct function for reporting fuel
  const handleReportFuel = async () => {
  try {
    await addDoc(collection(db, "fuelReports"), {
      stationId: params.id,
      stationName: params.name,
      fuelAvailable: true,
      timestamp: serverTimestamp(),
    });
    Alert.alert("Success", `Fuel availability reported for ${params.name}`);
  } catch (error) {
    console.error("Error adding document: ", error);
    Alert.alert("Error", "Failed to report fuel. Try again.");
  }
};
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{params.name}</Text>
      <Text>Station ID: {params.id}</Text>
      <Text>Reports for this station: {reportCount}</Text>
      <Text>Last report: {lastReport}</Text>

      <View style={{ marginTop: 30, width: "80%" }}>
        <Button title="Report Fuel Availability" onPress={handleReportFuel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
  },
});