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

// Server Express (ricerca nei dizionari + firma degli upload Cloudinary).
// In locale lo stesso server serve anche il sito; online gira su Render.
const RENDER_API_URL = 'https://lis-phraser-api.onrender.com';
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
export const API_BASE = isLocal ? '' : RENDER_API_URL;
