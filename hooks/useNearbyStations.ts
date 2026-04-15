import { useCallback, useEffect, useRef, useState } from "react";
import { Station, stations } from "../data/stations";
import { calculateDistance, getReportAgeMinutes } from "../utils/helpers";
import { StationReport } from "./useFuelReports";

export interface NearbyStation {
  station: Station;
  distance: number;
  fuelStatus: StationReport | undefined;
  timestamp: number; // When this nearby search was performed
  reportAgeMinutes: number | null;
}

const NEARBY_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useNearbyStations(
  userLocation: { latitude: number; longitude: number } | null,
  stationStatus: Record<string, StationReport>,
) {
  const [nearbyStations, setNearbyStations] = useState<NearbyStation[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastSearchRef = useRef<{
    location: typeof userLocation;
    timestamp: number;
  } | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const findNearbyStations = useCallback(
    (forceRefresh = false) => {
      if (!userLocation) {
        setNearbyStations([]);
        setIsRefreshing(false);
        return;
      }

      const now = Date.now();

      // Check if we have a recent search for this location (within 30 seconds)
      // Skip cache check if forceRefresh is true
      if (
        !forceRefresh &&
        lastSearchRef.current &&
        lastSearchRef.current.location &&
        lastSearchRef.current.location.latitude === userLocation.latitude &&
        lastSearchRef.current.location.longitude === userLocation.longitude &&
        now - lastSearchRef.current.timestamp < 30000
      ) {
        // Use cached results if recent
        return;
      }

      if (forceRefresh) {
        setIsRefreshing(true);
      }

      const sorted = stations
        .map((station) => {
          const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            station.latitude,
            station.longitude,
          );
          const fuelStatus = stationStatus[station.id];
          return {
            station,
            distance,
            fuelStatus,
            timestamp: now,
            reportAgeMinutes: getReportAgeMinutes(fuelStatus?.timestamp),
          };
        })
        .filter((item) => item.fuelStatus?.petrol || item.fuelStatus?.diesel);

      sorted.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        const ageA = a.reportAgeMinutes ?? Number.MAX_SAFE_INTEGER;
        const ageB = b.reportAgeMinutes ?? Number.MAX_SAFE_INTEGER;
        return ageA - ageB;
      });
      const topStations = sorted.slice(0, 5);

      // Replace entire list instead of appending
      setNearbyStations(topStations);
      lastSearchRef.current = { location: userLocation, timestamp: now };

      // If force refresh, show loading for at least 800ms
      if (forceRefresh) {
        if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = setTimeout(() => {
          setIsRefreshing(false);
        }, 800);
      }
    },
    [stationStatus, userLocation],
  );

  // Auto-update nearby stations when location changes
  useEffect(() => {
    if (!userLocation) {
      setNearbyStations([]);
      return;
    }

    // Always calculate nearby stations when userLocation is set
    // This ensures we have data even on first load
    findNearbyStations();
  }, [userLocation, findNearbyStations]);

  // Update nearby stations data when fuel status changes (from database)
  useEffect(() => {
    if (nearbyStations.length === 0 || !userLocation) return;

    // Recalculate entire list when stationStatus changes to capture new reports
    findNearbyStations();
  }, [stationStatus, userLocation, findNearbyStations]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);
  return {
    nearbyStations,
    findNearbyStations,
    isRefreshing,
  };
}
