import { useCallback, useEffect, useState } from "react";
import { Station, stations } from "../data/stations";
import { calculateDistance } from "../utils/helpers";
import { StationReport } from "./useFuelReports";

export interface NearbyStation {
  station: Station;
  distance: number;
  fuelStatus: StationReport | undefined;
}

export function useNearbyStations(
  userLocation: { latitude: number; longitude: number } | null,
  stationStatus: Record<string, StationReport>,
) {
  const [nearbyStations, setNearbyStations] = useState<NearbyStation[]>([]);

  const findNearbyStations = useCallback(() => {
    if (!userLocation) {
      setNearbyStations([]);
      return;
    }

    const sorted = stations.map((station) => {
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        station.latitude,
        station.longitude,
      );
      return {
        station,
        distance,
        fuelStatus: stationStatus[station.id],
      };
    });

    sorted.sort((a, b) => a.distance - b.distance);
    setNearbyStations(sorted.slice(0, 5));
  }, [stationStatus, userLocation]);

  useEffect(() => {
    if (!userLocation) return;
    findNearbyStations();
  }, [userLocation, stationStatus, findNearbyStations]);

  return {
    nearbyStations,
    findNearbyStations,
  };
}
