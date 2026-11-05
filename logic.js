// Lógica pura del tracker: fechas en hora argentina, estados de llegada, rachas y porcentajes.
// No toca el DOM ni la base de datos, así se puede probar con Node.

export const TZ = 'America/Argentina/Buenos_Aires';

export const CONFIG_DEFAULT = {
  inicio: '2026-11-11',
  horaLimite: '19:30',
  aperturaFichaje: '18:00',
  ensayos: [
    '2026-11-11', '2026-11-18', '2026-11-25',
    '2026-12-02', '2026-12-09', '2026-12-16', '2026-12-23', '2026-12-30',
    '2027-01-06', '2027-01-13', '2027-01-20',
  ],
  pasajes: {},
};

// ---------- Fechas ----------

const fmtPartes = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function partes(ms) {
  const o = {};
  for (const p of fmtPartes.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}

/** "2026-11-11" en hora argentina */
export function fechaART(ms) {
  const p = partes(ms);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "19:24" en hora argentina */
export function horaART(ms) {
  const p = partes(ms);
  return `${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

const aUTC = (f) => Date.parse(f + 'T12:00:00Z');

export function sumarDias(f, n) {
  const d = new Date(aUTC(f));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado */
export function diaSemana(f) {
  return new Date(aUTC(f)).getUTCDay();
}

export function lunesDe(f) {
  return sumarDias(f, -((diaSemana(f) + 6) % 7));
}

export function rango(desde, hasta) {
  const out = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) out.push(f);
  return out;
}

const fmtLargo = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const fmtCorto = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'numeric' });
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const INICIALES = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export const fechaLarga = (f) => fmtLargo.format(new Date(aUTC(f)));
export const fechaCorta = (f) => fmtCorto.format(new Date(aUTC(f)));
export const nombreDia = (f) => DIAS[diaSemana(f)];
export const inicialDia = (f) => INICIALES[diaSemana(f)];

// ---------- Estadísticas ----------

/** Desde qué fecha se le cuenta a una persona: el lanzamiento o su fecha de ingreso, la que sea más tarde. */
export function inicioDe(p, cfg) {
  return p.desde && p.desde > cfg.inicio ? p.desde : cfg.inicio;
}

/**
 * Oración o QT. Hoy todavía no cuenta en contra: si no lo marcó, la racha
 * se mide hasta ayer y el día de hoy no entra en el porcentaje.
 */
export function statsHabito(marcas = {}, desde, hoy) {
  if (hoy < desde) return { racha: 0, mejor: 0, hechos: 0, dias: 0, pct: null };
  let hechos = 0, mejor = 0, corrida = 0;
  const dias = rango(desde, hoy);
  for (const f of dias) {
    if (marcas[f]) { hechos++; corrida++; if (corrida > mejor) mejor = corrida; }
    else corrida = 0;
  }
  let racha = 0;
  let f = marcas[hoy] ? hoy : sumarDias(hoy, -1);
  while (f >= desde && marcas[f]) { racha++; f = sumarDias(f, -1); }
  const total = dias.length - (marcas[hoy] ? 0 : 1);
  return { racha, mejor, hechos, dias: total, pct: total > 0 ? hechos / total : null };
}

/**
 * Estado de una persona en un ensayo:
 *  a_tiempo   fichó hasta la hora límite (inclusive, al minuto)
 *  tarde      fichó después de la hora límite
 *  sin_fichar es hoy, ya pasó la hora límite y no fichó (cuenta como tarde mientras tanto)
 *  pendiente  es hoy y todavía no es la hora límite
 *  ausente    el día pasó y no fichó
 *  futuro     todavía no llegó el día
 */
export function estadoEnsayo(p, fecha, cfg, ahoraMs) {
  const hoy = fechaART(ahoraMs);
  const ms = p.llegadas ? p.llegadas[fecha] : null;
  if (ms != null && fechaART(ms) === fecha) {
    const hora = horaART(ms);
    return { estado: hora <= cfg.horaLimite ? 'a_tiempo' : 'tarde', hora };
  }
  if (fecha < hoy) return { estado: 'ausente' };
  if (fecha > hoy) return { estado: 'futuro' };
  return { estado: horaART(ahoraMs) > cfg.horaLimite ? 'sin_fichar' : 'pendiente' };
}

export function statsPuntualidad(p, cfg, ahoraMs) {
  const hoy = fechaART(ahoraMs);
  const desde = inicioDe(p, cfg);
  const cerrados = [];
  for (const f of [...cfg.ensayos].sort()) {
    if (f < desde || f > hoy) continue;
    const { estado } = estadoEnsayo(p, f, cfg, ahoraMs);
    if (estado === 'pendiente' || estado === 'futuro') continue;
    cerrados.push(estado);
  }
  let aTiempo = 0, tarde = 0, ausente = 0, mejor = 0, corrida = 0;
  for (const e of cerrados) {
    if (e === 'a_tiempo') { aTiempo++; corrida++; if (corrida > mejor) mejor = corrida; }
    else { corrida = 0; if (e === 'ausente') ausente++; else tarde++; }
  }
  let racha = 0;
  for (let i = cerrados.length - 1; i >= 0 && cerrados[i] === 'a_tiempo'; i--) racha++;
  return { racha, mejor, aTiempo, tarde, ausente, total: cerrados.length, pct: cerrados.length ? aTiempo / cerrados.length : null };
}

export function resumen(p, cfg, ahoraMs) {
  const hoy = fechaART(ahoraMs);
  const desde = inicioDe(p, cfg);
  const oracion = statsHabito(p.oracion, desde, hoy);
  const qt = statsHabito(p.qt, desde, hoy);
  const puntualidad = statsPuntualidad(p, cfg, ahoraMs);
  const pcts = [oracion.pct, qt.pct, puntualidad.pct].filter((x) => x != null);
  const general = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  return { oracion, qt, puntualidad, general };
}

// ---------- Rankings ----------

const n = (x) => (x == null ? -1 : x);

/** Ordena y asigna posición; los empates en el valor principal comparten puesto. */
function rankear(filas, valor, desempate) {
  const orden = [...filas].sort((a, b) => valor(b) - valor(a) || desempate(a, b));
  let pos = 0, prev;
  return orden.map((fila, i) => {
    const v = valor(fila);
    if (i === 0 || v !== prev) pos = i + 1;
    prev = v;
    return { ...fila, pos };
  });
}

export function rankings(personas, cfg, ahoraMs) {
  const filas = personas
    .filter((p) => p.activo !== false)
    .map((p) => ({ p, r: resumen(p, cfg, ahoraMs) }));
  const porNombre = (a, b) => a.p.nombre.localeCompare(b.p.nombre, 'es');
  const habito = (k) => (a, b) =>
    n(b.r[k].pct) - n(a.r[k].pct) || b.r[k].mejor - a.r[k].mejor || porNombre(a, b);
  return {
    general: rankear(filas, (f) => Math.round(n(f.r.general) * 1000),
      (a, b) => (b.r.oracion.racha + b.r.qt.racha + b.r.puntualidad.racha)
        - (a.r.oracion.racha + a.r.qt.racha + a.r.puntualidad.racha) || porNombre(a, b)),
    oracion: rankear(filas, (f) => f.r.oracion.racha, habito('oracion')),
    qt: rankear(filas, (f) => f.r.qt.racha, habito('qt')),
    puntualidad: rankear(filas, (f) => f.r.puntualidad.racha, habito('puntualidad')),
  };
}
