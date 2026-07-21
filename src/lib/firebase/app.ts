import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { firebaseConfig } from "./config";

// 앱 초기화는 1회만(HMR/여러 import로 인한 중복 initializeApp 방지).
export const firebaseApp: FirebaseApp =
  getApps()[0] ?? initializeApp(firebaseConfig);
