// app/_layout.tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Tabs Group */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* Station Detail Screen */}
      <Stack.Screen
        name="station/[id]"
        options={{
          headerShown: true,
          title: "Station Details",
          headerBackTitle: "Back",
        }}
      />
    </Stack>
  );
}
