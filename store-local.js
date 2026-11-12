// Modo prueba: mientras config.js no tenga los datos de Firebase, todo se guarda
// solo en este navegador, con participantes ficticios. Sirve para ver y probar la página.

import { CONFIG_DEFAULT, fechaART, rango, sumarDias } from './logic.js?v=6';

const KEY = 'tracker-sanluis-demo-v1';
const NOMBRES = ['Ana Prueba', 'Bruno Prueba', 'Carla Prueba', 'Diego Prueba', 'Eva Prueba', 'Franco Prueba'];

export function crearStoreLocal(ahora) {
  let data = leer() || semilla(ahora());
  const subsP = new Set();
  const subsC = new Set();
  const subsR = new Set();
  data.props = data.props || {};
  const listaProps = () => Object.entries(data.props).map(([id, p]) => ({ encargado: '', id, ...structuredClone(p) }));

  const lista = () => Object.entries(data.personas).map(([id, p]) => ({ id, ...structuredClone(p) }));
  const emitir = () => {
    const ps = lista();
    const cfg = structuredClone(data.config);
    subsP.forEach((cb) => cb(ps));
    subsC.forEach((cb) => cb(cfg));
    subsR.forEach((cb) => cb(listaProps()));
  };
  const guardar = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* sin almacenamiento */ }
    emitir();
  };

  // Otras pestañas del mismo navegador
  window.addEventListener('storage', (ev) => {
    if (ev.key === KEY && ev.newValue) { data = JSON.parse(ev.newValue); emitir(); }
  });

  return {
    modo: 'local',

    onPersonas(cb) { subsP.add(cb); queueMicrotask(() => cb(lista())); return () => subsP.delete(cb); },
    onConfig(cb) { subsC.add(cb); queueMicrotask(() => cb(structuredClone(data.config))); return () => subsC.delete(cb); },

    async marcar(id, tipo, fecha, valor) {
      const p = data.personas[id];
      p[tipo] = p[tipo] || {};
      if (valor) p[tipo][fecha] = true; else delete p[tipo][fecha];
      guardar();
    },

    async fichar(id, fecha) {
      const p = data.personas[id];
      p.llegadas = p.llegadas || {};
      p.llegadas[fecha] = ahora();
      guardar();
    },

    async deshacerFichaje(id, fecha) {
      delete data.personas[id].llegadas[fecha];
      guardar();
    },

    async agregarPersonas(nombres, desde) {
      for (const nombre of nombres) {
        data.personas['p' + Math.random().toString(36).slice(2, 9)] =
          { nombre, activo: true, desde, oracion: {}, qt: {}, llegadas: {} };
      }
      guardar();
    },

    async actualizarPersona(id, cambios) {
      Object.assign(data.personas[id], cambios);
      guardar();
    },

    async actualizarConfig(cambios) {
      Object.assign(data.config, cambios);
      guardar();
    },

    onProps(cb) { subsR.add(cb); queueMicrotask(() => cb(listaProps())); return () => subsR.delete(cb); },
    async agregarProp(datos) { data.props['r' + Math.random().toString(36).slice(2, 9)] = datos; guardar(); },
    async actualizarProp(id, cambios) { Object.assign(data.props[id], cambios); guardar(); },
    async borrarProp(id) { delete data.props[id]; guardar(); },

    async guardarPasajes(mapa) {
      data.config.pasajes = data.config.pasajes || {};
      for (const [f, texto] of Object.entries(mapa)) {
        if (texto) data.config.pasajes[f] = texto; else delete data.config.pasajes[f];
      }
      guardar();
    },

    reiniciar() {
      try { localStorage.removeItem(KEY); } catch { /* nada */ }
      data = semilla(ahora());
      guardar();
    },
  };
}

function leer() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Datos ficticios con algo de historia, para que los rankings no arranquen vacíos.
function semilla(ahoraMs) {
  const config = structuredClone(CONFIG_DEFAULT);
  const hoy = fechaART(ahoraMs);
  const hasta = hoy < config.inicio ? config.inicio : sumarDias(hoy, -1);
  const dias = rango(config.inicio, hasta);
  const personas = {};
  NOMBRES.forEach((nombre, i) => {
    const constancia = 0.95 - i * 0.12;
    const p = { nombre, activo: true, desde: config.inicio, oracion: {}, qt: {}, llegadas: {} };
    dias.forEach((f, j) => {
      if (azar(i, j, 1) < constancia) p.oracion[f] = true;
      if (azar(i, j, 2) < constancia - 0.05) p.qt[f] = true;
    });
    for (const f of config.ensayos) {
      if (f > hasta) continue;
      const r = azar(i, Number(f.replaceAll('-', '')) % 997, 3);
      if (r < constancia) {
        // entre 18:50 y 19:40; pasado 19:30 es tarde
        const minutos = Math.round((r / constancia) * 50) - 10;
        p.llegadas[f] = Date.parse(`${f}T19:00:00-03:00`) + minutos * 60000;
      }
    }
    personas['demo' + i] = p;
  });
  const props = {
    demo1: { nombre: 'Silla de madera', cantidad: '1', nota: '', encargado: 'demo0', usos: ['Silla'], listo: true },
    demo2: { nombre: 'Tela negra', cantidad: '3', nota: 'Se usa de fondo', encargado: 'demo1', usos: ['Puerta', 'Carga pesada'], listo: false },
    demo3: { nombre: 'Globos largos', cantidad: '200', nota: '', encargado: 'demo0', usos: ['Globos y pintura de caras'], listo: false },
  };
  return { config, personas, props };
}

function azar(a, b, c) {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
}
