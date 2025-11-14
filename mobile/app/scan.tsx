import { useState, useCallback } from "react";
import { Alert, StyleSheet, View, Text, Button } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "@react-navigation/native"; // expo-router usa React Navigation

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setScanned(false);
      return () => setScanned(true); // desactiva cuando sales
    }, [])
  );

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text>Necesitamos acceso a la cámara</Text>
        <Button title="Conceder permiso" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "code128"] }}
        onBarcodeScanned={
          scanned
            ? undefined
            : ({ data, type }) => {
                setScanned(true);
                Alert.alert("Código detectado", `Tipo: ${type}\nDato: ${data}`, [
                  { text: "OK", onPress: () => setScanned(false) }
                ]);
              }
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
});
