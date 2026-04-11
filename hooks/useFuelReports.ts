import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    Timestamp,
} from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { db } from "../firebase";
import { REPORT_EXPIRY_MINUTES } from "../utils/constants";

export interface StationReport {
  petrol: boolean;
  diesel: boolean;
  queueLength?: "low" | "medium" | "high";
  timestamp?: Timestamp;
  reportCount?: number;
  lastReportTime?: Timestamp;
}

interface FirebaseReportData {
  stationId: string;
  petrol: boolean;
  diesel: boolean;
  queueLength?: "low" | "medium" | "high";
  timestamp: Timestamp;
}

export function useFuelReports() {
  const [stationStatus, setStationStatus] = useState<
    Record<string, StationReport>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [forceUpdate, setForceUpdate] = useState(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const cleanupExpiredReports = useCallback(async () => {
    try {
      const q = query(collection(db, "fuelReports"));
      const snapshot = await getDocs(q);
      const now = Date.now();
      let deletedCount = 0;

      for (const docSnapshot of snapshot.docs) {
        const data = docSnapshot.data() as FirebaseReportData;
        if (data.timestamp) {
          const reportTime = data.timestamp.seconds * 1000;
          const ageInMinutes = (now - reportTime) / 60000;
          if (ageInMinutes > REPORT_EXPIRY_MINUTES) {
            await deleteDoc(doc(db, "fuelReports", docSnapshot.id));
            deletedCount++;
          }
        }
      }

      if (deletedCount > 0) {
        console.log(`🗑️ Deleted ${deletedCount} expired reports`);
      }
    } catch (error) {
      console.error("Error cleaning up expired reports:", error);
    }
  }, []);

  const processReports = useCallback((snapshot: any) => {
    const reports: Record<string, StationReport> = {};
    const reportCounts: Record<string, number> = {};
    const now = Date.now();

    snapshot.docs.forEach((doc: any) => {
      const data = doc.data() as FirebaseReportData;
      if (data.timestamp) {
        const reportTime = data.timestamp.seconds * 1000;
        const ageInMinutes = (now - reportTime) / 60000;
        if (ageInMinutes <= REPORT_EXPIRY_MINUTES) {
          reportCounts[data.stationId] =
            (reportCounts[data.stationId] || 0) + 1;
        }
      }
    });

    snapshot.docs.forEach((doc: any) => {
      const data = doc.data() as FirebaseReportData;
      if (!data.timestamp) return;
      const reportTime = data.timestamp.seconds * 1000;
      const ageInMinutes = (now - reportTime) / 60000;
      if (ageInMinutes > REPORT_EXPIRY_MINUTES) return;

      const existing = reports[data.stationId];
      if (
        !existing ||
        (data.timestamp &&
          existing.timestamp &&
          data.timestamp.seconds > existing.timestamp.seconds)
      ) {
        reports[data.stationId] = {
          petrol: data.petrol,
          diesel: data.diesel,
          queueLength: data.queueLength,
          timestamp: data.timestamp,
          reportCount: reportCounts[data.stationId] || 0,
          lastReportTime: data.timestamp,
        };
      }
    });

    setStationStatus(reports);
    setIsLoading(false);
    setIsRefreshing(false);
    setLastRefreshTime(new Date());
    setForceUpdate((prev) => prev + 1);
  }, []);

  const setupListener = useCallback(() => {
    if (unsubscribeRef.current) unsubscribeRef.current();
    const q = query(
      collection(db, "fuelReports"),
      orderBy("timestamp", "desc"),
    );

    const unsubscribe = onSnapshot(q, processReports, (error) => {
      console.error("Firestore listener error:", error);
      Alert.alert("Connection Error", "Failed to fetch fuel reports.");
      setIsLoading(false);
      setIsRefreshing(false);
    });

    unsubscribeRef.current = unsubscribe;
    return unsubscribe;
  }, [processReports]);

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = setupListener();
    cleanupExpiredReports();
    const cleanupInterval = setInterval(cleanupExpiredReports, 60 * 60 * 1000);

    return () => {
      if (unsubscribe) unsubscribe();
      clearInterval(cleanupInterval);
    };
  }, [setupListener, cleanupExpiredReports]);

  const refreshFuelReports = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await cleanupExpiredReports();
      if (unsubscribeRef.current) unsubscribeRef.current();
      setupListener();
      const q = query(
        collection(db, "fuelReports"),
        orderBy("timestamp", "desc"),
      );
      const snapshot = await getDocs(q);
      processReports(snapshot);
    } catch (error) {
      console.error("Refresh error:", error);
      setIsRefreshing(false);
      throw error;
    }
  }, [cleanupExpiredReports, processReports, setupListener]);

  return {
    stationStatus,
    isLoading,
    isRefreshing,
    lastRefreshTime,
    forceUpdate,
    refreshFuelReports,
  };
}
