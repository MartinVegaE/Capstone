import { Stack, router } from "expo-router";
import { useState } from "react";
import { View, Text, TextInput, Button, Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../src/api";

export default function NewProductScreen() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    sku: "", nombre: "", stock: "0",
    marca: "", categoria: "", ubicacion: "", codigoBarras: ""
  });
  const [msg, setMsg] = useState("");

  const crear = useMutation({
    mutationFn: async () => {
      const payload = {
        sku: form.sku.trim(),
        nombre: form.nombre.trim(),
        stock: Number(form.stock) || 0,
        marca: form.marca || undefined,
        categoria: form.categoria || undefined,
        ubicacion: form.ubicacion || undefined,
        codigoBarras: form.codigoBarras || undefined,
      };
      const { data } = await api.post("/productos", payload);
      return data;
    },
    onSuccess: async () => {
      setMsg("✅ Producto creado");
      await qc.invalidateQueries({ queryKey: ["productos"] });
      router.back();
    },
    onError: (err: any) => {
      setMsg("❌ " + (err?.response?.data?.error ?? err.message));
      Alert.alert("Error", msg || "No se pudo crear");
    }
  });

  const onChange = (k: keyof typeof form, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  return (
    <View style={{ flex: 1, padding: 16, gap: 10 }}>
      <Stack.Screen options={{ title: "Nuevo producto" }} />

      <TextInput placeholder="SKU *" value={form.sku}
        onChangeText={(t)=>onChange("sku", t)} autoCapitalize="none"
        style={{ borderWidth:1, borderRadius:8, padding:10 }} />

      <TextInput placeholder="Nombre *" value={form.nombre}
        onChangeText={(t)=>onChange("nombre", t)}
        style={{ borderWidth:1, borderRadius:8, padding:10 }} />

      <TextInput placeholder="Marca" value={form.marca}
        onChangeText={(t)=>onChange("marca", t)}
        style={{ borderWidth:1, borderRadius:8, padding:10 }} />

      <TextInput placeholder="Categoría" value={form.categoria}
        onChangeText={(t)=>onChange("categoria", t)}
        style={{ borderWidth:1, borderRadius:8, padding:10 }} />

      <TextInput placeholder="Ubicación" value={form.ubicacion}
        onChangeText={(t)=>onChange("ubicacion", t)}
        style={{ borderWidth:1, borderRadius:8, padding:10 }} />

      <TextInput placeholder="Código de barras" value={form.codigoBarras}
        onChangeText={(t)=>onChange("codigoBarras", t)} autoCapitalize="none"
        style={{ borderWidth:1, borderRadius:8, padding:10 }} />

      <TextInput placeholder="Stock" value={form.stock}
        onChangeText={(t)=>onChange("stock", t.replace(/[^\d]/g, ""))}
        keyboardType="numeric"
        style={{ borderWidth:1, borderRadius:8, padding:10 }} />

      <Button
        title={crear.isPending ? "Creando..." : "Crear"}
        onPress={()=>{
          if(!form.sku.trim() || !form.nombre.trim()){
            Alert.alert("Faltan datos", "SKU y Nombre son obligatorios");
            return;
          }
          setMsg("");
          crear.mutate();
        }}
        disabled={crear.isPending}
      />

      {msg ? <Text>{msg}</Text> : null}
    </View>
  );
}
