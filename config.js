// Configuración de Firebase (Consola de Firebase → Configuración del proyecto → Tus apps → app web).
// Estos valores son públicos por diseño: identifican el proyecto, no dan acceso por sí solos.
// Lo que protege los datos son las reglas de firestore.rules y el acceso anónimo.
//
// Si apiKey queda vacío, la página funciona en MODO PRUEBA:
// participantes ficticios y datos guardados solo en ese navegador.

export const firebaseConfig = {
  apiKey: 'AIzaSyB_JPMe4q0T9bSeaRLUhN7IOHPzUjD0wKw',
  authDomain: 'san-luis-2027.firebaseapp.com',
  projectId: 'san-luis-2027',
  storageBucket: 'san-luis-2027.firebasestorage.app',
  messagingSenderId: '939253922606',
  appId: '1:939253922606:web:57dc10e5a843d6613a58bf',
};
