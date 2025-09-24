import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View, Text, TextInput, Button, Alert, ActivityIndicator, ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../src/api";

type Producto = {
  id: number;
  sku: string;
  nombre: string;
  stock: number;
  marca?: string | null;
  categoria?: string | null;
  ubicacion?: string | null;
  codigoBarras?: string | null;
};

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pid = Number(id);
  const qc = useQueryClient();
  const apiUrl = (process.env.EXPO_PUBLIC_API_URL as string) || "(no .env)";

  const q = useQuery({
    queryKey: ["producto", pid, apiUrl],
    queryFn: async (): Promise<Producto> => (await api.get<Producto>(`/productos/${pid}`)).data,
  });

  const [form, setForm] = useState<Partial<Producto>>({});
  useEffect(() => { if (q.data) setForm(q.data); }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        sku: String(form.sku ?? "").trim(),
        nombre: String(form.nombre ?? "").trim(),
        marca: form.marca?.trim() || null,
        categoria: form.categoria?.trim() || null,
        ubicacion: form.ubicacion?.trim() || null,
        codigoBarras: form.codigoBarras?.trim() || null,
        stock: Number(form.stock ?? 0),
      };
      const { data } = await api.put(`/productos/${pid}`, payload);
      return data as Producto;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["producto", pid, apiUrl] }),
        qc.invalidateQueries({ queryKey: ["productos", apiUrl] }),
      ]);
      router.back();
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.response?.data?.error ?? err.message ?? "No se pudo guardar");
    },
  });

  if (q.isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Producto" }} />
        <View style={{ flex: 1, padding: 16 }}><ActivityIndicator /></View>
      </>
    );
  }
  if (q.error || !q.data) {
    return (
      <>
        <Stack.Screen options={{ title: "Producto" }} />
        <View style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: "crimson" }}>No se pudo cargar el producto</Text>
        </View>
      </>
    );
  }

  const onChange = (k: keyof Producto, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <>
      <Stack.Screen options={{ title: `Prod #${pid}` }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text>API: {apiUrl}</Text>

        <Text>SKU</Text>
        <TextInput value={form.sku ?? ""} onChangeText={(t)=>onChange("sku", t)}
          style={{ borderWidth:1, borderRadius:8, padding:10 }} autoCapitalize="none" />

        <Text>Nombre</Text>
        <TextInput value={form.nombre ?? ""} onChangeText={(t)=>onChange("nombre", t)}
          style={{ borderWidth:1, borderRadius:8, padding:10 }} />

        <Text>Marca</Text>
        <TextInput value={form.marca ?? ""} onChangeText={(t)=>onChange("marca", t)}
          style={{ borderWidth:1, borderRadius:8, padding:10 }} />

        <Text>Categoría</Text>
        <TextInput value={form.categoria ?? ""} onChangeText={(t)=>onChange("categoria", t)}
          style={{ borderWidth:1, borderRadius:8, padding:10 }} />

        <Text>Ubicación</Text>
        <TextInput value={form.ubicacion ?? ""} onChangeText={(t)=>onChange("ubicacion", t)}
          style={{ borderWidth:1, borderRadius:8, padding:10 }} />

        <Text>Código de barras</Text>
        <TextInput value={form.codigoBarras ?? ""} onChangeText={(t)=>onChange("codigoBarras", t)}
          style={{ borderWidth:1, borderRadius:8, padding:10 }} autoCapitalize="none" />

        <Text>Stock</Text>
        <TextInput
          value={String(form.stock ?? 0)}
          onChangeText={(t)=>onChange("stock", String(t).replace(/[^\d]/g, ""))}
          keyboardType="numeric"
          style={{ borderWidth:1, borderRadius:8, padding:10 }}
        />

        <Button
          title={save.isPending ? "Guardando..." : "Guardar"}
          onPress={()=> save.mutate()}
          disabled={save.isPending}
        />
      </ScrollView>
    </>
  );
}
