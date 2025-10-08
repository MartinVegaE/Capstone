import { useState } from "react";
import {
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Lee de EXPO_PUBLIC_API_URL si existe, si no usa un fallback sensato por plataforma
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (Platform.OS === "android"
    ? "http://10.0.2.2:4000"
    : "http://127.0.0.1:4000");

type Producto = {
  id: number;
  sku: string;
  nombre?: string;
  name?: string;
  stock: number;
  ppp?: number | string | null;
  ubicacion?: string | null;
  codigoBarras?: string | null;
};

export default function App() {
  const [sku, setSku] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [p, setP] = useState<Producto | null>(null);
  const [err, setErr] = useState("");

  async function buscar() {
    try {
      setLoading(true);
      setErr("");
      setP(null);

      let url = "";
      if (sku.trim()) {
        url = `${BASE_URL}/productos/by-sku/${encodeURIComponent(
          sku.trim()
        )}`;
      } else if (code.trim()) {
        url = `${BASE_URL}/productos/by-codigo/${encodeURIComponent(
          code.trim()
        )}`;
      } else {
        setErr("Ingresa SKU o código de barras.");
        return;
      }

      const res = await fetch(url);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Producto;
      setP(data);
    } catch (e: any) {
      setErr(e?.message || "No encontrado");
      Alert.alert("Error", e?.message || "No encontrado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={s.wrap}>
        <Text style={s.title}>Consulta de producto</Text>
        <Text style={s.subtitle}>
          Backend: <Text style={s.mono}>{BASE_URL}</Text>
        </Text>

        <Field label="SKU">
          <TextInput
            style={s.input}
            value={sku}
            onChangeText={setSku}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Ej: SKU-TEST-001"
          />
        </Field>

        <Text style={{ textAlign: "center", color: "#6b7280" }}>o</Text>

        <Field label="Código de barras">
          <TextInput
            style={s.input}
            value={code}
            onChangeText={setCode}
            placeholder="Escanéalo o escríbelo"
          />
        </Field>

        <TouchableOpacity
          style={[s.btn, loading && { opacity: 0.7 }]}
          onPress={buscar}
          disabled={loading}
        >
          <Text style={s.btnTx}>{loading ? "Buscando..." : "Buscar"}</Text>
        </TouchableOpacity>

        {err ? <Text style={s.err}>{err}</Text> : null}

        {p && (
          <View style={s.card}>
            <Text style={s.h3}>{p.nombre ?? p.name ?? "—"}</Text>
            <Row k="SKU" v={p.sku} />
            <Row k="Stock" v={String(p.stock)} />
            <Row
              k="PPP"
              v={`$${Number.parseFloat(String(p.ppp ?? 0)).toFixed(2)}`}
            />
            {p.ubicacion ? <Row k="Ubicación" v={p.ubicacion} /> : null}
            {p.codigoBarras ? (
              <Row k="Cód. barras" v={p.codigoBarras} />
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
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
  wrap: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#6b7280", marginBottom: 6 },
  mono: { fontFamily: Platform.select({ ios: "Courier", default: "monospace" }) },
  label: { fontSize: 13, color: "#374151", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  btn: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  btnTx: { color: "#fff", fontSize: 16, fontWeight: "600" },
  err: { color: "#b91c1c", marginTop: 10 },
  card: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    gap: 4,
    backgroundColor: "#fff",
  },
  h3: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  k: { color: "#6b7280" },
  v: { fontWeight: "600" },
});
