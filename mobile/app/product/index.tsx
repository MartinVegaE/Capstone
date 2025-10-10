import { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Link } from "expo-router";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://127.0.0.1:4000");

type Producto = {
  id: number;
  sku: string;
  nombre?: string | null;
  name?: string | null;
  stock: number;
  ppp?: number | string | null;
  ubicacion?: string | null;
  codigoBarras?: string | null;
  // posibles campos de imagen
  imagen?: string | null;
  imagenUrl?: string | null;
  fotoUrl?: string | null;
  cover?: string | null;
};

function coverUrl(p: Producto): string | null {
  return (
    p.cover ||
    p.imagenUrl ||
    p.imagen ||
    p.fotoUrl ||
    null
  );
}

export default function ProductosList() {
  const [items, setItems] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // ajusta a tu endpoint real, p. ej. /productos?limit=50
      const r = await fetch(`${BASE_URL}/productos`);
      const data = (await r.json()) as Producto[] | { items: Producto[] };
      const arr = Array.isArray(data) ? data : (data.items ?? []);
      setItems(arr);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const filtered = items.filter((p) => {
    if (!q.trim()) return true;
    const txt = `${p.nombre ?? p.name ?? ""} ${p.sku} ${p.codigoBarras ?? ""}`.toLowerCase();
    return txt.includes(q.trim().toLowerCase());
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={s.header}>
        <Text style={s.title}>Productos</Text>
        <TextInput
          style={s.search}
          value={q}
          onChangeText={setQ}
          placeholder="Buscar por nombre, SKU o código"
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: "#6b7280" }}>Cargando…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => String(p.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          renderItem={({ item: p }) => (
            <Link href={`/productos/${p.id}`} asChild>
              <TouchableOpacity activeOpacity={0.85} style={s.card}>
                <View style={s.thumbWrap}>
                  {coverUrl(p) ? (
                    <Image source={{ uri: coverUrl(p)! }} style={s.thumb} resizeMode="cover" />
                  ) : (
                    <View style={s.thumbPlaceholder}>
                      <Text style={s.thumbInitials}>
                        {(p.nombre ?? p.name ?? p.sku ?? "PR")[0] ?? "P"}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.name} numberOfLines={1}>
                    {p.nombre ?? p.name ?? "—"}
                  </Text>
                  <Text style={s.sku}>SKU: {p.sku}</Text>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 2 }}>
                    <Text style={s.meta}>Stock: {p.stock}</Text>
                    {p.ppp != null && (
                      <Text style={s.meta}>PPP: ${Number(p.ppp).toFixed(2)}</Text>
                    )}
                  </View>
                </View>
                <Text style={s.chev}>›</Text>
              </TouchableOpacity>
            </Link>
          )}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={{ color: "#6b7280" }}>Sin productos</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  search: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  thumbWrap: { width: 64, height: 64, borderRadius: 10, overflow: "hidden", backgroundColor: "#f3f4f6" },
  thumb: { width: "100%", height: "100%" },
  thumbPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  thumbInitials: { fontSize: 18, fontWeight: "700", color: "#111827" },
  name: { fontSize: 16, fontWeight: "700" },
  sku: { color: "#6b7280" },
  meta: { color: "#374151", fontWeight: "600" },
  chev: { fontSize: 28, lineHeight: 28, color: "#9ca3af", marginLeft: 6, marginRight: 2 },
});
