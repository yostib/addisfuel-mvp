import { Timestamp } from "firebase/firestore";

// Pure calculation functions (no hooks, no dependencies on other functions)
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export const getTravelTime = (distanceKm: number): string => {
  const avgSpeed = 40;
  const timeHours = distanceKm / avgSpeed;
  const timeMinutes = Math.round(timeHours * 60);
  if (timeMinutes < 1) return '<1 min';
  if (timeMinutes < 60) return `${timeMinutes} min`;
  const hours = Math.floor(timeMinutes / 60);
  const mins = timeMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

export const getReportAgeMinutes = (timestamp?: Timestamp): number | null => {
  if (!timestamp?.seconds) return null;
  const reportTime = timestamp.seconds * 1000;
  const now = Date.now();
  const ageInMinutes = (now - reportTime) / 60000;
  return Math.round(ageInMinutes * 10) / 10;
};

// Fuel display helpers (pure functions)
export const getFuelIcon = (petrol: boolean, diesel: boolean): string => {
  if (petrol && !diesel) return "gas-station";
  if (!petrol && diesel) return "truck";
  if (petrol && diesel) return "gas-station";
  return "close-circle";
};

export const getFuelTypeIndicator = (petrol: boolean, diesel: boolean): string => {
  if (petrol && diesel) return "⛽🚛";
  if (petrol) return "⛽";
  if (diesel) return "🚛";
  return "❌";
};

export const getQueueIcon = (queueLength?: "low" | "medium" | "high"): string => {
  if (!queueLength) return "";
  switch (queueLength) {
    case "low": return "🟢";
    case "medium": return "🟡";
    case "high": return "🔴";
    default: return "";
  }
};

export const getFuelSubtitle = (petrol: boolean, diesel: boolean): string => {
  const fuelTypes = [];
  if (petrol) fuelTypes.push("⛽ Petrol");
  if (diesel) fuelTypes.push("🚛 Diesel");
  if (fuelTypes.length === 0) return "No fuel";
  return fuelTypes.join(" • ");
};

export const getQueueText = (queueLength?: "low" | "medium" | "high"): string => {
  if (!queueLength) return "";
  const queueMap = {
    low: "🟢 Low queue",
    medium: "🟡 Medium queue",
    high: "🔴 Long queue",
  };
  return queueMap[queueLength];
};

export const getFreshnessLabel = (age: number | null): string => {
  if (age === null) return "Unknown";
  if (age < 5) return "🟢 Just reported";
  if (age < 30) return `🟡 ${age} min ago`;
  if (age < 90) return `🟠 ${age} min ago (old)`;
  return "🔴 Report expired";
};

export const hasBothFuels = (petrol: boolean, diesel: boolean): boolean => {
  return petrol && diesel;
};