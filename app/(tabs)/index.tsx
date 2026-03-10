import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { stations } from "../../data/stations";
import { router } from "expo-router";

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
    title={station.name}
    description="Fuel station"
    onPress={() =>
      router.push({
        pathname: "/station/[id]",
        params: {
          id: station.id,
          name: station.name,
        },
      })
    }
  />
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
});