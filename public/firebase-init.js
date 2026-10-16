import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBLUrbj1Lb6JIO3EIf2o9Cz2vO1u9iU1go',
  authDomain: 'lis-phraser.firebaseapp.com',
  projectId: 'lis-phraser',
  storageBucket: 'lis-phraser.firebasestorage.app',
  messagingSenderId: '88846281103',
  appId: '1:88846281103:web:e374fb2113020dc3b783fa',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

// URL del backend di scraping (Express). In sviluppo locale puo' restare
// vuoto (chiamate relative, stesso server). Dopo il deploy su Render/altro,
// sostituire con l'URL pubblico del servizio, es. 'https://lis-phraser-api.onrender.com'.
export const SCRAPER_API_BASE = '';

// I video registrati dal sito vengono caricati su Cloudinary (storage gratuito
// senza carta di credito, a differenza di Firebase Storage che ora richiede
// il piano Blaze). Compila questi due valori dopo aver creato un account
// gratuito su cloudinary.com e un upload preset "Unsigned".
export const CLOUDINARY_CLOUD_NAME = 'gvzo1phv';
export const CLOUDINARY_UPLOAD_PRESET = 'dzwtfmot';
