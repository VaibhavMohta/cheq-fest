import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Emulators are opt-in only. Set VITE_USE_FIREBASE_EMULATORS=1 in .env.local
// when you want the local `pnpm dev` server to talk to the local emulator
// suite instead of the real cheq-fest-dev project. By default, both `pnpm dev`
// (mode=development) and a deployed dev build talk to the real dev project.
const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === '1';

// Demo config that's safe to use against emulators when no .env.local exists.
const demoConfig = {
  apiKey: 'demo-api-key',
  authDomain: 'demo.firebaseapp.com',
  projectId: 'cheq-fest-dev',
  storageBucket: 'cheq-fest-dev.appspot.com',
  messagingSenderId: '0',
  appId: 'demo-app-id',
};

export const firebaseApp: FirebaseApp = initializeApp(
  config.apiKey ? config : demoConfig,
);
export const auth: Auth = getAuth(firebaseApp);
export const db: Firestore = getFirestore(firebaseApp);
export const storage: FirebaseStorage = getStorage(firebaseApp);
export const functions: Functions = getFunctions(firebaseApp);

if (useEmulators && typeof window !== 'undefined') {
  // Guard against HMR re-running this twice.
  const w = window as unknown as { __cheqFestEmulatorsConnected?: boolean };
  if (!w.__cheqFestEmulatorsConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    w.__cheqFestEmulatorsConnected = true;
  }
}
