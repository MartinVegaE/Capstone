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

// Backend base URL (usa EXPO_PUBLIC_API_URL si está definido)
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://127.0.0.1:4000");

// ---- Tipos ----
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

// =======================================
// App con 2 pestañas: Consulta / Ingreso
// =======================================
export default function App() {
  const [tab, setTab] = useState<"consulta" | "ingreso">("consulta");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={s.top}>
        <Text style={s.title}>Bodega móvil</Text>
        <Text style={s.subtitle}>
          Backend: <Text style={s.mono}>{BASE_URL}</Text>
        </Text>

        <View style={s.tabs}>
          <TouchableOpacity
            style={[s.tabBtn, tab === "consulta" && s.tabBtnActive]}
            onPress={() => setTab("consulta")}
          >
            <Text style={[s.tabTx, tab === "consulta" && s.tabTxActive]}>
              Consulta
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === "ingreso" && s.tabBtnActive]}
            onPress={() => setTab("ingreso")}
          >
            <Text style={[s.tabTx, tab === "ingreso" && s.tabTxActive]}>
              Ingreso
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {tab === "consulta" ? <Consulta /> : <Ingreso />}
    </SafeAreaView>
  );
}

// =====================
// Pestaña: CONSULTA
// =====================
function Consulta() {
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
        url = `${BASE_URL}/productos/by-sku/${encodeURIComponent(sku.trim())}`;
      } else if (code.trim()) {
        url = `${BASE_URL}/productos/by-codigo/${encodeURIComponent(
          code.trim()
        )}`;
      } else {
        setErr("Ingresa SKU o código de barras.");
        return;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const data = (await res.json()) as Producto;
      setP(data);
    } catch (e: any) {
      const msg = e?.message || "No encontrado";
      setErr(msg);
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.wrap}>
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
        style={s.btn}
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
          {p.codigoBarras ? <Row k="Cód. barras" v={p.codigoBarras} /> : null}
        </View>
      )}
    </ScrollView>
  );
}

// =====================
// Pestaña: INGRESO
// =====================
function Ingreso() {
  const [sku, setSku] = useState("");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [loading, setLoading] = useState(false);

  async function guardar() {
    try {
      setLoading(true);

      // 1) Resolver productoId si sólo viene SKU
      let pid = Number(productoId);
      if (!pid && sku.trim()) {
        const res = await fetch(
          `${BASE_URL}/productos/by-sku/${encodeURIComponent(sku.trim())}`
        );
        if (!res.ok) throw new Error("SKU no encontrado");
        const data = (await res.json()) as Producto;
        pid = data.id;
      }
      if (!pid) throw new Error("Debes indicar SKU o Id de producto.");

      // 2) Sanitizar numéricos
      const qty = Math.max(1, Math.floor(Number(cantidad) || 0));
      const price = Math.max(0, Number(costo) || 0);

      // 3) POST /ingresos
      const r = await fetch(`${BASE_URL}/ingresos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productoId: pid, cantidad: qty, costoUnitario: price }],
        }),
      });

      if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);

      Alert.alert("OK", "Ingreso registrado");
      setSku("");
      setProductoId("");
      setCantidad("");
      setCosto("");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "No se pudo guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Field label="SKU (o usar ID)">
        <TextInput
          style={s.input}
          value={sku}
          onChangeText={setSku}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="SKU-..."
        />
      </Field>

      <Field label="Producto ID (opcional si pones SKU)">
        <TextInput
          style={s.input}
          value={productoId}
          onChangeText={setProductoId}
          keyboardType="number-pad"
          placeholder="123"
        />
      </Field>

      <Field label="Cantidad">
        <TextInput
          style={s.input}
          value={cantidad}
          onChangeText={setCantidad}
          keyboardType="number-pad"
          placeholder="10"
        />
      </Field>

      <Field label="Costo unitario (CLP)">
        <TextInput
          style={s.input}
          value={costo}
          onChangeText={setCosto}
          keyboardType="decimal-pad"
          placeholder="1990"
        />
      </Field>

      <TouchableOpacity
        style={[s.btn, loading && { opacity: 0.7 }]}
        onPress={guardar}
        disabled={loading}
      >
        <Text style={s.btnTx}>{loading ? "Guardando..." : "Guardar ingreso"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---- componentes chicos ----
function Field({ label, children }: { label: string; children: React.ReactNode }) {
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

// ---- estilos ----
const s = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#6b7280", marginTop: 2 },
  mono: { fontFamily: Platform.select({ ios: "Courier", default: "monospace" }) },
  tabs: { flexDirection: "row", marginTop: 12, gap: 8 },
  tabBtn: { flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 999, paddingVertical: 10, alignItems: "center" },
  tabBtnActive: { backgroundColor: "#111827", borderColor: "#111827" },
  tabTx: { fontWeight: "600", color: "#111827" },
  tabTxActive: { color: "#fff" },

  wrap: { padding: 16, gap: 12 },
  label: { fontSize: 13, color: "#374151", fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  btn: { backgroundColor: "#111827", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 8 },
  btnTx: { color: "#fff", fontSize: 16, fontWeight: "600" },

  err: { color: "#b91c1c", marginTop: 10 },
  card: { marginTop: 12, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, gap: 4, backgroundColor: "#fff" },
  h3: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  k: { color: "#6b7280" },
  v: { fontWeight: "600" },
});
