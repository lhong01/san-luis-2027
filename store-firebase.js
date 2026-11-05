// Datos en Firebase Firestore. Todos ven los cambios de todos en vivo.
//
// Estructura:
//   config/general   { inicio, horaLimite, aperturaFichaje, ensayos: [fechas], pasajes: { fecha: "Oseas 6:1-11" } }
//   personas/{id}    { nombre, activo, desde, oracion: { fecha: true }, qt: { fecha: true }, llegadas: { fecha: Timestamp } }
//
// La hora de llegada la pone el servidor (serverTimestamp), no el reloj del celular.

import { CONFIG_DEFAULT } from './logic.js';

const V = '10.14.1';
const URL = (m) => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}.js`;

export async function crearStoreFirebase(config) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(URL('app')), import(URL('auth')), import(URL('firestore')),
  ]);

  const app = initializeApp(config);
  // Acceso anónimo: nadie ve un login, pero solo esta página puede escribir.
  await A.signInAnonymously(A.getAuth(app));

  let db;
  try {
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch {
    db = F.getFirestore(app);
  }

  const cfgRef = F.doc(db, 'config', 'general');
  const personasCol = F.collection(db, 'personas');
  const ref = (id) => F.doc(db, 'personas', id);

  // Primera vez: crear la configuración por defecto (solo si el servidor confirma que no existe).
  try {
    const snap = await F.getDocFromServer(cfgRef);
    if (!snap.exists()) await F.setDoc(cfgRef, CONFIG_DEFAULT);
  } catch { /* sin conexión: se usa la copia local */ }

  return {
    modo: 'firebase',

    onPersonas(cb, onError) {
      return F.onSnapshot(personasCol,
        (snap) => cb(snap.docs.map((d) => normalizar(d.id, d.data({ serverTimestamps: 'estimate' })))),
        onError);
    },

    onConfig(cb, onError) {
      return F.onSnapshot(cfgRef,
        (snap) => cb({ ...CONFIG_DEFAULT, ...(snap.exists() ? snap.data() : {}) }),
        onError);
    },

    marcar(id, tipo, fecha, valor) {
      return F.updateDoc(ref(id), new F.FieldPath(tipo, fecha), valor ? true : F.deleteField());
    },

    fichar(id, fecha) {
      return F.updateDoc(ref(id), new F.FieldPath('llegadas', fecha), F.serverTimestamp());
    },

    deshacerFichaje(id, fecha) {
      return F.updateDoc(ref(id), new F.FieldPath('llegadas', fecha), F.deleteField());
    },

    agregarPersonas(nombres, desde) {
      return Promise.all(nombres.map((nombre) =>
        F.addDoc(personasCol, { nombre, activo: true, desde, oracion: {}, qt: {}, llegadas: {} })));
    },

    actualizarPersona(id, cambios) {
      return F.updateDoc(ref(id), cambios);
    },

    actualizarConfig(cambios) {
      return F.setDoc(cfgRef, cambios, { merge: true });
    },

    guardarPasajes(mapa) {
      const pasajes = {};
      for (const [f, texto] of Object.entries(mapa)) pasajes[f] = texto ? texto : F.deleteField();
      return F.setDoc(cfgRef, { pasajes }, { merge: true });
    },
  };
}

function normalizar(id, d) {
  const llegadas = {};
  for (const [f, v] of Object.entries(d.llegadas || {})) {
    if (v && typeof v.toMillis === 'function') llegadas[f] = v.toMillis();
  }
  return {
    id,
    nombre: d.nombre || '(sin nombre)',
    activo: d.activo !== false,
    desde: d.desde || null,
    oracion: d.oracion || {},
    qt: d.qt || {},
    llegadas,
  };
}
