import { useEffect, useState } from "react";
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
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Link } from "expo-router";

/* ========== Config ========== */
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://127.0.0.1:4000");

/* ========== Tipos ========== */
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

/* ========== Helpers ========== */
function normalizeBarcode(v: string) {
  const basic = (v ?? "").trim().replace(/\s+/g, "").replace(/[\r\n]+/g, "");
  // @ts-ignore
  return basic.normalize ? basic.normalize("NFKC") : basic;
}

async function fetchJSON<T = any>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

async function fetchFirstOk<T = any>(urls: string[]): Promise<T> {
  let lastErr = "";
  for (const u of urls) {
    try {
      const data = await fetchJSON<T>(u);
      return data;
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (!/HTTP 404/.test(msg)) lastErr = msg;
      continue;
    }
  }
  throw new Error(lastErr || "No encontrado");
}

/* ========== Pantalla principal ========== */
export default function Index() {
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
            <Text style={[s.tabTx, tab === "consulta" && s.tabTxActive]}>Consulta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === "ingreso" && s.tabBtnActive]}
            onPress={() => setTab("ingreso")}
          >
            <Text style={[s.tabTx, tab === "ingreso" && s.tabTxActive]}>Ingreso</Text>
          </TouchableOpacity>
        </View>

        {/* Botón para ir al listado */}
        <View style={{ marginTop: 8 }}>
          <Link href="/productos" asChild>
            <TouchableOpacity
              style={[s.btnOutline, { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 10 }]}
            >
              <Text style={s.btnOutlineTx}>📦 Ver listado de productos</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>

      {tab === "consulta" ? <Consulta /> : <Ingreso />}
    </SafeAreaView>
  );
}

/* ========== Consulta (con escáner) ========== */
function Consulta() {
  const [sku, setSku] = useState("");
  const [code, setCode] = useState("");
  const [normalized, setNormalized] = useState(""); // debug del código normalizado
  const [loading, setLoading] = useState(false);
  const [p, setP] = useState<Producto | null>(null);
  const [err, setErr] = useState("");

  // cámara
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (showScanner) {
      setScanned(false);
      if (!permission?.granted) requestPermission();
    }
  }, [showScanner]);

  async function buscar(opts?: { byCode?: string }) {
    try {
      setLoading(true);
      setErr("");
      setP(null);

      // 1) por código de barras
      if (opts?.byCode || code.trim()) {
        const raw = opts?.byCode ?? code;
        const norm = normalizeBarcode(raw);
        setNormalized(norm);

        if (!norm) {
          setErr("Código vacío");
          return;
        }

        const urls = [
          `${BASE_URL}/productos/by-codigo/${encodeURIComponent(norm)}`,
          `${BASE_URL}/productos/by-codigo-barras/${encodeURIComponent(norm)}`,
          `${BASE_URL}/productos/by-codigobarras/${encodeURIComponent(norm)}`,
          `${BASE_URL}/productos/codigo/${encodeURIComponent(norm)}`,
          `${BASE_URL}/producto/by-codigo/${encodeURIComponent(norm)}`,
          `${BASE_URL}/producto/codigo/${encodeURIComponent(norm)}`,
          `${BASE_URL}/productos?codigoBarras=${encodeURIComponent(norm)}`, // fallback por query
        ];

        const data = await fetchFirstOk<Producto>(urls);
        setP(data);
        return;
      }

      // 2) por SKU
      if (sku.trim()) {
        const u = `${BASE_URL}/productos/by-sku/${encodeURIComponent(sku.trim().toUpperCase())}`;
        const data = await fetchJSON<Producto>(u);
        setP(data);
        return;
      }

      setErr("Ingresa SKU o código de barras.");
    } catch (e: any) {
      const msg = e?.message || "No encontrado";
      setErr(msg);
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  }

  function handleScanned(ev: { type: string; data: string }) {
    const raw = ev?.data ?? "";
    const cleaned = normalizeBarcode(raw);
    if (!cleaned) return;
    setScanned(true);
    setShowScanner(false);
    setCode(cleaned);
    setNormalized(cleaned);
    buscar({ byCode: cleaned });
  }

  return (
    <View style={{ flex: 1 }}>
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
            onChangeText={(t) => {
              setCode(t);
              setNormalized(normalizeBarcode(t));
            }}
            placeholder="Escanéalo o escríbelo"
          />
        </Field>

        {normalized ? (
          <Text style={{ color: "#6b7280", fontSize: 12 }}>
            Código normalizado:{" "}
            <Text style={{ fontFamily: Platform.select({ ios: "Courier", default: "monospace" }) }}>
              {normalized}
            </Text>
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={() => buscar()} disabled={loading}>
            <Text style={s.btnTx}>{loading ? "Buscando..." : "Buscar"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnOutline, { flex: 1 }]}
            onPress={() => setShowScanner(true)}
          >
            <Text style={s.btnOutlineTx}>📷 Escanear</Text>
          </TouchableOpacity>
        </View>

        {err ? <Text style={s.err}>{err}</Text> : null}

        {p && (
          <View style={s.card}>
            <Text style={s.h3}>{p.nombre ?? p.name ?? "—"}</Text>
            <Row k="SKU" v={p.sku} />
            <Row k="Stock" v={String(p.stock)} />
            <Row k="PPP" v={`$${Number.parseFloat(String(p.ppp ?? 0)).toFixed(2)}`} />
            {p.ubicacion ? <Row k="Ubicación" v={p.ubicacion} /> : null}
            {p.codigoBarras ? <Row k="Cód. barras" v={p.codigoBarras} /> : null}
          </View>
        )}
      </ScrollView>

      {/* Overlay del escáner */}
      {showScanner && (
        <View style={s.scanWrap}>
          {!permission && (
            <View style={s.center}>
              <ActivityIndicator />
              <Text style={{ color: "#fff", marginTop: 8 }}>Cargando permisos…</Text>
            </View>
          )}

          {permission && !permission.granted && (
            <View style={s.center}>
              <Text style={{ color: "#fff", textAlign: "center", marginBottom: 12 }}>
                No hay permiso para usar la cámara.
              </Text>
              <TouchableOpacity style={s.btn} onPress={requestPermission}>
                <Text style={s.btnTx}>Conceder permiso</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btn, { backgroundColor: "#6b7280", marginTop: 8 }]}
                onPress={() => setShowScanner(false)}
              >
                <Text style={s.btnTx}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          )}

          {permission?.granted && (
            <>
              <CameraView
                style={{ flex: 1 }}
                barcodeScannerSettings={{
                  barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128"],
                }}
                onBarcodeScanned={scanned ? undefined : handleScanned}
              />
              <View style={s.overlay}>
                <View style={s.frame} />
                <Text style={s.overlayTx}>Apunta al código de barras</Text>
                <TouchableOpacity
                  style={[s.btn, { marginTop: 12 }]}
                  onPress={() => {
                    setScanned(false);
                    setShowScanner(false);
                  }}
                >
                  <Text style={s.btnTx}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

/* ========== Ingreso ========== */
function Ingreso() {
  const [sku, setSku] = useState("");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [loading, setLoading] = useState(false);

  async function guardar() {
    try {
      setLoading(true);

      let pid = Number(productoId);
      if (!pid && sku.trim()) {
        const r = await fetch(`${BASE_URL}/productos/by-sku/${encodeURIComponent(sku.trim())}`);
        if (!r.ok) throw new Error("SKU no encontrado");
        const d = (await r.json()) as Producto;
        pid = d.id;
      }
      if (!pid) throw new Error("Debes indicar SKU o Id de producto.");

      const qty = Math.max(1, Math.floor(Number(cantidad) || 0));
      const price = Math.max(0, Number(costo) || 0);

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

/* ========== UI helpers ========== */
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

/* ========== Estilos ========== */
const s = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#6b7280", marginTop: 2 },
  mono: { fontFamily: Platform.select({ ios: "Courier", default: "monospace" }) },
  tabs: { flexDirection: "row", marginTop: 12, gap: 8 },
  tabBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabBtnActive: { backgroundColor: "#111827", borderColor: "#111827" },
  tabTx: { fontWeight: "600", color: "#111827" },
  tabTxActive: { color: "#fff" },

  wrap: { padding: 16, gap: 12 },
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

  btnOutline: {
    borderWidth: 1,
    borderColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  btnOutlineTx: { color: "#111827", fontSize: 16, fontWeight: "700" },

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

  // overlay del escáner
  scanWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000", zIndex: 20 },
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "flex-end", paddingBottom: 24,
  },
  frame: {
    position: "absolute", top: "25%", width: 260, height: 160,
    borderWidth: 3, borderColor: "#60a5fa", borderRadius: 12, backgroundColor: "rgba(0,0,0,0.05)",
  },
  overlayTx: { color: "#fff", marginTop: 8, fontWeight: "600" },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});
