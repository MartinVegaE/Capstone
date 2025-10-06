// frontend/src/App.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductsList from "./pages/ProductsList";

const qc = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <ProductsList />
    </QueryClientProvider>
  );
}
