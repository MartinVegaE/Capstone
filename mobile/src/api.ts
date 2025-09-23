import axios from "axios";
import Constants from "expo-constants";

function resolveDevBaseURL() {
  const hostUri =
    (Constants as any).expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.hostUri ||
    "";
  const host = hostUri.split(":")[0]; // p.ej. "192.168.1.97"
  return host ? `http://${host}:4000` : "http://10.0.2.2:4000"; // fallback emulador
}

const baseURL = process.env.EXPO_PUBLIC_API_URL || resolveDevBaseURL();

export const api = axios.create({
  baseURL,
  timeout: 10000,
});
