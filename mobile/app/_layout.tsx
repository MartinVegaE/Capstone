import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const qc = new QueryClient();

export default function Root() {
  return (
    <QueryClientProvider client={qc}>
      <Stack screenOptions={{ headerTitle: "Capstone (Móvil)" }} />
    </QueryClientProvider>
  );
}
