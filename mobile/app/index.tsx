import { Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../src/api";
import { View, Text, FlatList, ActivityIndicator, Button } from "react-native";

type Producto = { id: number; nombre: string; sku: string; stock: number };

export default function Home() {
  const apiUrl = (process.env.EXPO_PUBLIC_API_URL as string) || "(no .env)";
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["productos", apiUrl],
    queryFn: async (): Promise<Producto[]> => (await api.get<Producto[]>("/productos")).data,
  });

  const adjustStock = useMutation({
  // ✅ Ahora enviamos el stock final (absoluto), no el delta
  mutationFn: async ({ id, newStock }: { id: number; newStock: number }) => {
    await api.patch(`/productos/${id}`, { stock: Math.max(0, newStock) });
    return { id, newStock: Math.max(0, newStock) };
  },
  onMutate: async ({ id, newStock }) => {
    await qc.cancelQueries({ queryKey: ["productos", apiUrl] });
    const prev = qc.getQueryData<Producto[]>(["productos", apiUrl]);

    // ✅ Optimista: fijamos ese stock exacto
    qc.setQueryData<Producto[]>(["productos", apiUrl], (old) =>
      (old ?? []).map(p => p.id === id ? { ...p, stock: Math.max(0, newStock) } : p)
    );

    return { prev };
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) qc.setQueryData(["productos", apiUrl], ctx.prev); // rollback
  },
  onSettled: () => {
    qc.invalidateQueries({ queryKey: ["productos", apiUrl] });
  },
});

// ... dentro del renderItem:

  if (q.isLoading) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Stack.Screen options={{ title: "Productos" }} />
        <ActivityIndicator />
        <Text>API: {apiUrl}</Text>
      </View>
    );
  }

  if (q.error) {
    const err = q.error as any;
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Stack.Screen options={{ title: "Productos" }} />
        <Text style={{ color: "crimson", marginBottom: 8 }}>Error al cargar</Text>
        <Text>API: {apiUrl}</Text>
        <Text style={{ marginTop: 8 }}>Mensaje: {String(err?.message || err)}</Text>
        {err?.response?.status ? <Text>Status: {err.response.status}</Text> : null}
        {err?.response?.data ? <Text>Cuerpo: {JSON.stringify(err.response.data)}</Text> : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Stack.Screen options={{ title: "Productos" }} />
      <Text>API: {apiUrl}</Text>

      <FlatList
        data={q.data ?? []}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, marginBottom: 8 }}>
            <Text style={{ fontWeight: "600" }}>{item.nombre}</Text>
            <Text>SKU: {item.sku}</Text>
            <Text style={{ marginVertical: 6 }}>Stock: {item.stock}</Text>

            <View style={{ flexDirection: "row", gap: 8, justifyContent: "space-between" }}>
              <Button
                title="-"
                onPress={() => adjustStock.mutate({ id: item.id, newStock: (item.stock ?? 0) - 1 })}
                disabled={adjustStock.isPending}
              />
              <Button
                title="+"
                onPress={() => adjustStock.mutate({ id: item.id, newStock: (item.stock ?? 0) + 1 })}
                disabled={adjustStock.isPending}
              />
            </View>
          </View>
        )}
      />
    </View>
  );
}
