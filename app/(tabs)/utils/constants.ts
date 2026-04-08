import { Platform } from 'react-native';

export const REPORT_EXPIRY_MINUTES = 90;
export const FRESH_REPORT_THRESHOLD = 5;
export const DEFAULT_ZOOM_LEVEL = 0.05;

export const ADDIS_ABABA_COORDS = {
  latitude: 9.03,
  longitude: 38.74,
};

export const COLORS = {
  NO_REPORTS: "#94a3b8",
  FUEL_AVAILABLE: "#2ecc71",
  NO_FUEL: "#e74c3c",
  QUEUE_LOW: "#27ae60",
  QUEUE_MEDIUM: "#f39c12",
  QUEUE_HIGH: "#e74c3c",
  BACKGROUND_WHITE: "white",
  BACKGROUND_DARK: "rgba(0, 0, 0, 0.7)",
  BACKGROUND_LIGHT: "rgba(255, 255, 255, 0.95)",
  REFRESH_BUTTON: "#f39c12",
  REFRESH_BUTTON_ACTIVE: "#e67e22",
} as const;

export const NAVIGATION_APPS = {
  apple: {
    name: 'Apple Maps',
    icon: 'apple',
    scheme: 'maps://',
    url: (lat: number, lng: number, name: string) => 
      `maps://?q=${lat},${lng}&name=${encodeURIComponent(name)}`,
    available: Platform.OS === 'ios',
  },
  google: {
    name: 'Google Maps',
    icon: 'google-maps',
    scheme: 'comgooglemaps://',
    url: (lat: number, lng: number, name: string) =>
      `comgooglemaps://?q=${lat},${lng}&center=${lat},${lng}&zoom=14`,
    webUrl: (lat: number, lng: number, name: string) =>
      `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    available: true,
  },
  waze: {
    name: 'Waze',
    icon: 'waze',
    scheme: 'waze://',
    url: (lat: number, lng: number, name: string) =>
      `waze://?ll=${lat},${lng}&navigate=yes`,
    webUrl: (lat: number, lng: number, name: string) =>
      `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    available: true,
  },
};