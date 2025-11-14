import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

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
  descripcion?: string | null;
  imagen?: string | null;
  imagenUrl?: string | null;
  fotoUrl?: string | null;
  cover?: string | null;
};

function coverUrl(p: Producto): string | null {
  return p.cover || p.imagenUrl || p.imagen || p.fotoUrl || null;
}

export default function ProductoDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [p, setP] = useState<Producto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${BASE_URL}/productos/${id}`);
        const data = (await r.json()) as Producto;
        setP(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <Stack.Screen options={{ title: p?.nombre ?? p?.name ?? "Producto" }} />
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: "#6b7280" }}>Cargando…</Text>
        </View>
      ) : !p ? (
        <View style={s.center}>
          <Text style={{ color: "#6b7280" }}>No encontrado</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={s.coverWrap}>
            {coverUrl(p) ? (
              <Image source={{ uri: coverUrl(p)! }} style={s.cover} resizeMode="cover" />
            ) : (
              <View style={[s.cover, s.coverPlaceholder]}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>
                  {p.nombre?.[0] ?? p.name?.[0] ?? "P"}
                </Text>
              </View>
            )}
          </View>

          <Text style={s.h1}>{p.nombre ?? p.name ?? "—"}</Text>
          <Row k="SKU" v={p.sku} />
          {p.codigoBarras && <Row k="Código de barras" v={p.codigoBarras} />}
          <Row k="Stock" v={String(p.stock)} />
          {p.ppp != null && <Row k="PPP (CLP)" v={`$${Number(p.ppp).toFixed(2)}`} />}
          {p.ubicacion && <Row k="Ubicación" v={p.ubicacion} />}
          {p.descripcion && (
            <View style={s.block}>
              <Text style={s.blockTitle}>Descripción</Text>
              <Text style={s.blockText}>{p.descripcion}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.row}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverWrap: {
    height: 210,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f3f4f6",
  },
  cover: { width: "100%", height: "100%" },
  coverPlaceholder: { alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 22, fontWeight: "800", marginTop: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    paddingVertical: 10,
  },
  k: { color: "#6b7280" },
  v: { fontWeight: "700" },
  block: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
  },
  blockTitle: { fontWeight: "700", marginBottom: 6 },
  blockText: { color: "#111827" },
});
