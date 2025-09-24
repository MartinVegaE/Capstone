import { Stack, Link } from "expo-router";
import { View, Text, FlatList, ActivityIndicator, Switch, Pressable } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import SearchInput from "../src/components/SearchInput";
import { api } from "../src/api";

type Producto = { id: number; name: string; sku: string; stock: number };
type ListResp = { items: Producto[]; page: number; pageSize: number; total: number };

export default function Home() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [soloBajoStock, setSoloBajoStock] = useState(false);

  const query = useQuery({
    queryKey: ["productos", q, soloBajoStock],
    queryFn: async (): Promise<ListResp> => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (soloBajoStock) params.set("soloBajoStock", "true");
      params.set("page", "1");
      params.set("pageSize", "50");
      const { data } = await api.get<ListResp>(`/productos?${params.toString()}`);
      return data;
    },
  });

  const adjustStock = useMutation({
    mutationFn: async ({ id, newStock }: { id: number; newStock: number }) => {
      await api.patch(`/productos/${id}/stock`, { set: Math.max(0, newStock) });
      return { id, newStock: Math.max(0, newStock) };
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["productos", q, soloBajoStock] });
      const prev = qc.getQueryData<ListResp>(["productos", q, soloBajoStock]);
      if (prev) {
        qc.setQueryData<ListResp>(["productos", q, soloBajoStock], {
          ...prev,
          items: prev.items.map((p) => (p.id === vars.id ? { ...p, stock: vars.newStock } : p)),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["productos", q, soloBajoStock], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["productos", q, soloBajoStock] });
    },
  });

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: "Inventario",
          headerRight: () => <Link href="/new" style={{ color: "#007aff", fontWeight: "600" }}>Nuevo</Link>,
        }}
      />
      <View style={{ padding: 12, gap: 8 }}>
        <SearchInput onChange={setQ} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text>Bajo stock</Text>
          <Switch value={soloBajoStock} onValueChange={setSoloBajoStock} />
        </View>
      </View>

      {query.isLoading && <ActivityIndicator style={{ marginTop: 12 }} />}
      {query.isError && <Text style={{ padding: 12 }}>Error al cargar</Text>}

      {query.data && (
        <FlatList
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          data={query.data.items}
          keyExtractor={(item) => String(item.id)}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <View
              style={{
                borderWidth: 1,
                borderColor: "#eee",
                borderRadius: 12,
                padding: 12,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Link href={`/product/${item.id}`} asChild>
                <Pressable style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "bold" }}>{item.name}</Text>
                  <Text style={{ color: "#666" }}>SKU: {item.sku}</Text>
                  <Text>Stock: {item.stock}</Text>
                </Pressable>
              </Link>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable onPress={() => adjustStock.mutate({ id: item.id, newStock: item.stock - 1 })}>
                  <Text style={{ fontSize: 24 }}>−</Text>
                </Pressable>
                <Pressable onPress={() => adjustStock.mutate({ id: item.id, newStock: item.stock + 1 })}>
                  <Text style={{ fontSize: 24 }}>＋</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
