import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: "center" }}>
      <Stack.Screen name="index" options={{ title: "Bodega móvil" }} />
      <Stack.Screen name="productos/index" options={{ title: "Productos" }} />
    </Stack>
  );
}
