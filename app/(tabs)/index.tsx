import { StyleSheet, View, Text } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { stations } from "../../data/stations";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 9.03,
          longitude: 38.74,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
      >
        {stations.map((station) => (
          <Marker
            key={station.id}
            coordinate={{
              latitude: station.latitude,
              longitude: station.longitude,
            }}
            onPress={() =>
              router.push({
                pathname: "/station/[id]",
                params: {
                  id: station.id,
                  name: station.name,
                },
              })
            }
          >
            {/* Fixed marker implementation */}
            <View style={styles.markerContainer}>
              <View style={styles.markerBubble}>
                <MaterialCommunityIcons
                  name="gas-station"
                  size={24}
                  color="#2ecc71"
                />
              </View>
              <View style={styles.markerLabel}>
                <Text style={styles.markerText}>{station.name}</Text>
              </View>
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    alignItems: "center",
    width: 60,
  },
  markerBubble: {
    backgroundColor: "white",
    padding: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  markerLabel: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  markerText: {
    fontSize: 10,
    fontWeight: "600",
    color: "white",
    textAlign: "center",
  },
});