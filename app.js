import { firebaseConfig } from './config.js';
import * as L from './logic.js';
import { CARPETAS, USOS } from './archivos.js';
import { abrirVisor } from './visor.js';

const $app = document.getElementById('app');
const $aviso = document.getElementById('aviso');

// ---------- Utilidades ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ }
  },
};

const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Reloj ----------
// En modo prueba se puede simular la hora: ?ahora=2026-11-11T19:45 (hora argentina)

const modoPrueba = !firebaseConfig.apiKey;
let desfase = 0;
const paramAhora = new URLSearchParams(location.search).get('ahora');
if (modoPrueba && paramAhora) {
  const t = Date.parse(paramAhora + '-03:00');
  if (!Number.isNaN(t)) desfase = t - Date.now();
}
const ahora = () => Date.now() + desfase;

// Entrar con #ajustes al final del link habilita la pestaña Ajustes en ese celular.
if (location.hash === '#ajustes') {
  ls.set('tracker-admin', '1');
  history.replaceState(null, '', location.pathname + location.search);
}

// ---------- Estado ----------

const S = {
  personas: null,
  cfg: null,
  error: null,
  yo: ls.get('tracker-yo'),
  eligiendo: false,
  marcando: null,          // id de otra persona que se está marcando desde la Planilla
  vista: 'hoy',
  semana: { hoy: null, planilla: null, qt: null },
  ranking: 'general',
  admin: ls.get('tracker-admin') === '1',
  confirmar: null,
  borradorQT: {},          // lo que se está escribiendo en "QT de la semana" sin guardar
  borradorNuevos: '',
  carpeta: null,           // carpeta abierta en Archivos
  props: null,
  propsError: null,
  propUso: 'todos',        // filtro por obra o actividad
  propEstado: 'todos',     // todos | faltan | listos
  propEnc: 'todos',        // filtro por encargado: todos | sin | id de persona
  propForm: null,          // { id, nombre, cantidad, nota, usos: [] } mientras se agrega o edita
};

let store;

const persona = (id) => (id && S.personas ? S.personas.find((p) => p.id === id) : null) || null;
const activos = () => (S.personas || []).filter((p) => p.activo).sort(porNombre);

// ---------- Avisos y errores ----------

let avisoTimer;
function avisar(texto, tipo = 'info') {
  $aviso.textContent = texto;
  $aviso.className = `aviso visible ${tipo}`;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { $aviso.className = 'aviso'; }, 4500);
}

function explicar(e) {
  const c = String(e?.code || '');
  if (c.includes('admin-restricted-operation') || c.includes('operation-not-allowed'))
    return 'Falta activar el acceso "Anónimo" en Firebase (Authentication → Sign-in method).';
  if (c.includes('permission-denied'))
    return 'Firebase rechazó el acceso. Revisá que las reglas de Firestore estén publicadas.';
  if (c.includes('unavailable') || c.includes('network'))
    return 'Sin conexión. Probá de nuevo cuando vuelva internet.';
  return 'Algo falló: ' + (e?.message || e);
}

function ejecutar(promesa, ok) {
  Promise.resolve(promesa)
    .then(() => { if (ok) avisar(ok); })
    .catch((e) => avisar(explicar(e), 'error'));
}

let confTimer;
function confirmarDosVeces(clave, accion) {
  clearTimeout(confTimer);
  if (S.confirmar === clave) {
    S.confirmar = null;
    accion();
  } else {
    S.confirmar = clave;
    confTimer = setTimeout(() => { S.confirmar = null; render(); }, 4000);
  }
  render();
}

// ---------- Render ----------

let renderPendiente = false;

function render() {
  // No re-dibujar mientras alguien escribe: se hace cuando suelta el campo.
  const act = document.activeElement;
  if (act && $app.contains(act) && act.matches('input, textarea, select')) {
    renderPendiente = true;
    return;
  }
  renderPendiente = false;
  $app.innerHTML = pagina();
}

function pagina() {
  if (S.error) {
    return encabezado(null) + `<main class="contenido"><section class="card"><h2>No se pudo cargar</h2>
      <p>${esc(S.error)}</p><button class="btn" data-accion="recargar">Recargar</button></section></main>`;
  }
  if (!S.personas || !S.cfg) return encabezado(null) + '<p class="cargando">Cargando…</p>';

  const yo = persona(S.yo);
  const sinIdentidad = !yo || !yo.activo || S.eligiendo;

  let cuerpo;
  if (S.vista === 'ajustes' && S.admin) cuerpo = vistaAjustes();
  else if (activos().length === 0) cuerpo = vistaVacia();
  else if (sinIdentidad) cuerpo = vistaElegir(yo);
  else if (S.vista === 'ranking') cuerpo = vistaRanking();
  else if (S.vista === 'planilla') cuerpo = vistaPlanilla();
  else if (S.vista === 'archivos') cuerpo = vistaArchivos();
  else if (S.vista === 'props') cuerpo = vistaProps();
  else cuerpo = vistaHoy();

  const conTabs = !sinIdentidad || S.admin;
  return encabezado(sinIdentidad ? null : yo) + bannerPrueba()
    + `<main class="contenido">${cuerpo}<footer class="pie">Lucas 4:18-19</footer></main>`
    + (conTabs ? tabs() : '');
}

function encabezado(yo) {
  const boton = yo
    ? `<button class="yo-btn" data-accion="cambiar-yo" aria-label="Cambiar de persona">${esc(yo.nombre)} <span aria-hidden="true">▾</span></button>`
    : '';
  return `<header class="top"><div class="marca"><span class="t1">Esperanza en San Luis</span>
    <span class="t2">2027 · Oración · QT · Llegada</span></div>${boton}</header>`;
}

function bannerPrueba() {
  if (!modoPrueba) return '';
  return `<div class="banner-prueba"><span><b>Modo prueba.</b> Datos ficticios, guardados solo en este dispositivo.</span>
    <button class="link" data-accion="reiniciar-demo">Reiniciar</button></div>`;
}

const ICONOS = {
  hoy: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  ranking: '<path d="M6 20v-8M12 20V4M18 20v-12"/>',
  planilla: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  archivos: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  props: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
  ajustes: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};

function tabs() {
  const lista = [['hoy', 'Hoy'], ['ranking', 'Ranking'], ['planilla', 'Planilla'], ['archivos', 'Archivos'], ['props', 'Props']];
  if (S.admin) lista.push(['ajustes', 'Ajustes']);
  return `<nav class="tabs" aria-label="Secciones">${lista.map(([v, txt]) => `
    <button data-accion="vista" data-v="${v}" class="${S.vista === v ? 'activa' : ''}" ${S.vista === v ? 'aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[v]}</svg>
      <span>${txt}</span></button>`).join('')}</nav>`;
}

// ---------- Vista: elegir persona ----------

function vistaElegir(previo) {
  return `<section class="elegir"><h1>¿Quién sos?</h1>
    <p class="muted">Elegí tu nombre. Este celular lo va a recordar.</p>
    <div class="nombres">${activos().map((p) =>
      `<button class="nombre-btn" data-accion="elegir" data-id="${p.id}">${esc(p.nombre)}</button>`).join('')}</div>
    ${previo && previo.activo && S.eligiendo ? '<button class="link" data-accion="cancelar-elegir">Cancelar</button>' : ''}
  </section>`;
}

function vistaVacia() {
  return `<section class="card"><h2>Todavía no hay participantes</h2>
    <p class="muted">${S.admin ? 'Cargalos en la pestaña Ajustes.' : 'Pronto van a estar cargados.'}</p></section>`;
}

// ---------- Vista: Hoy ----------

function vistaHoy() {
  const cfg = S.cfg;
  const ms = ahora();
  const hoy = L.fechaART(ms);
  const p = persona(S.marcando) || persona(S.yo);
  const desde = L.inicioDe(p, cfg);
  const r = L.resumen(p, cfg, ms);
  const partes = [];

  if (S.marcando && S.marcando !== S.yo) {
    partes.push(`<div class="banner-marcando"><span>Estás marcando a <b>${esc(p.nombre)}</b></span>
      <button data-accion="volver-a-mi">Volver a mí</button></div>`);
  }

  const hayEnsayoHoy = hoy >= desde && cfg.ensayos.includes(hoy);
  if (hoy < desde) {
    partes.push(`<section class="card destacada"><p class="eyebrow">Arranca pronto</p>
      <h2>${capital(L.fechaLarga(desde))}</h2>
      <p>Desde ese día se cuentan la oración, el QT y la llegada a los ensayos.</p></section>`);
  } else {
    partes.push(cardHoy(p, hoy, r));
    if (hayEnsayoHoy) partes.push(cardFichaje(p, hoy, ms));
  }
  if (!hayEnsayoHoy) {
    const prox = [...cfg.ensayos].sort().find((f) => f > hoy);
    if (prox) partes.push(`<p class="proximo">Próximo ensayo: <b>${L.fechaLarga(prox)}</b> · 19:00 cena · ${cfg.horaLimite} práctica</p>`);
  }
  partes.push(cardSemana(p, hoy, desde));
  return partes.join('');
}

function cardHoy(p, hoy, r) {
  const pasaje = S.cfg.pasajes?.[hoy];
  return `<section class="card">
    <p class="eyebrow">Hoy</p>
    <h2>${capital(L.fechaLarga(hoy))}</h2>
    ${pasaje ? `<p class="pasaje"><span>QT de hoy</span>${esc(pasaje)}</p>` : ''}
    <div class="habitos">
      ${botonHabito(p, 'oracion', hoy, '🙏', 'Oré 10 minutos')}
      ${botonHabito(p, 'qt', hoy, '📖', 'Hice el QT')}
    </div>
    <p class="rachas"><span>🔥 Oración: <b>${plural(r.oracion.racha, 'día', 'días')}</b></span>
      <span>🔥 QT: <b>${plural(r.qt.racha, 'día', 'días')}</b></span></p>
  </section>`;
}

function botonHabito(p, tipo, f, ico, texto) {
  const on = !!p[tipo]?.[f];
  return `<button class="habito${on ? ' on' : ''}" data-accion="marcar" data-id="${p.id}" data-tipo="${tipo}" data-fecha="${f}" aria-pressed="${on}">
    <span class="ico" aria-hidden="true">${ico}</span><span class="txt">${texto}</span>
    <span class="tilde" aria-hidden="true">${on ? '✓' : ''}</span></button>`;
}

function cardFichaje(p, hoy, ms) {
  const cfg = S.cfg;
  const e = L.estadoEnsayo(p, hoy, cfg, ms);
  let cuerpo;
  if (e.estado === 'a_tiempo' || e.estado === 'tarde') {
    const conf = S.confirmar === `deshacer:${p.id}:${hoy}`;
    cuerpo = `<div class="fichado ${e.estado}"><span class="hora">${e.hora}</span>
        <span>${e.estado === 'a_tiempo' ? 'Llegada a tiempo ✓' : 'Llegada tarde'}</span></div>
      <button class="link peligro" data-accion="deshacer-fichaje" data-id="${p.id}" data-fecha="${hoy}">
        ${conf ? '¿Seguro? Tocá de nuevo para borrar el fichaje' : 'Deshacer'}</button>`;
  } else if (L.horaART(ms) < cfg.aperturaFichaje) {
    cuerpo = `<p class="muted">Podés fichar desde las ${cfg.aperturaFichaje}.</p>`;
  } else {
    const tarde = e.estado === 'sin_fichar';
    cuerpo = `<button class="fichar${tarde ? ' tarde' : ''}" data-accion="fichar" data-id="${p.id}" data-fecha="${hoy}">Fichar llegada</button>
      <p class="muted">${tarde ? `Ya pasaron las ${cfg.horaLimite}: cuenta como tarde.` : `Hasta las ${cfg.horaLimite} cuenta como a tiempo.`}</p>`;
  }
  return `<section class="card fichaje"><p class="eyebrow">Ensayo de hoy</p>
    <h2>19:00 cena · ${cfg.horaLimite} práctica</h2>${cuerpo}</section>`;
}

function cardSemana(p, hoy, desde) {
  const tope = hoy < desde ? desde : hoy;
  const lunes = S.semana.hoy || L.lunesDe(tope);
  const dias = L.rango(lunes, L.sumarDias(lunes, 6));
  return `<section class="card">
    <div class="card-head"><h2>Semana</h2>${navSemana('hoy', lunes, L.lunesDe(desde), L.lunesDe(tope))}</div>
    <ul class="semana">${dias.map((f) => filaDia(p, f, hoy, desde)).join('')}</ul>
    <p class="nota">Si te olvidaste de marcar un día, lo podés marcar después.</p>
  </section>`;
}

function filaDia(p, f, hoy, desde) {
  const fuera = f < desde || f > hoy;
  const pasaje = S.cfg.pasajes?.[f];
  const ensayo = S.cfg.ensayos.includes(f) && f >= desde ? chipEnsayo(p, f, false) : '';
  return `<li class="dia${f === hoy ? ' es-hoy' : ''}${fuera ? ' fuera' : ''}">
    <div class="dia-fecha"><span>${L.nombreDia(f)}</span><b>${Number(f.slice(8))}</b></div>
    <div class="dia-info">${pasaje ? `<span class="dia-pasaje">${esc(pasaje)}</span>` : ''}${ensayo}</div>
    <div class="dia-marcas">${mini(p, 'oracion', f, '🙏', 'Oración', fuera)}${mini(p, 'qt', f, '📖', 'QT', fuera)}</div>
  </li>`;
}

function mini(p, tipo, f, ico, etiqueta, fuera) {
  const on = !!p[tipo]?.[f];
  return `<button class="mini${on ? ' on' : ''}" data-accion="marcar" data-id="${p.id}" data-tipo="${tipo}" data-fecha="${f}"
    aria-pressed="${on}" aria-label="${etiqueta} ${L.fechaCorta(f)}" ${fuera ? 'disabled' : ''}>${ico}</button>`;
}

function chipEnsayo(p, f, corto) {
  const e = L.estadoEnsayo(p, f, S.cfg, ahora());
  const textos = corto
    ? { a_tiempo: e.hora, tarde: e.hora, ausente: 'Aus.', sin_fichar: '—', pendiente: '·', futuro: '' }
    : { a_tiempo: `A tiempo · ${e.hora}`, tarde: `Tarde · ${e.hora}`, ausente: 'Ausente', sin_fichar: 'Sin fichar', pendiente: 'Ensayo', futuro: 'Ensayo' };
  return textos[e.estado] ? `<span class="chip ${e.estado}">${textos[e.estado]}</span>` : '';
}

function navSemana(clave, lunes, min, max) {
  const antes = min && lunes <= min;
  const despues = max && lunes >= max;
  return `<div class="nav-semana">
    <button data-accion="semana" data-clave="${clave}" data-a="${L.sumarDias(lunes, -7)}" ${antes ? 'disabled' : ''} aria-label="Semana anterior">‹</button>
    <span>${L.fechaCorta(lunes)} – ${L.fechaCorta(L.sumarDias(lunes, 6))}</span>
    <button data-accion="semana" data-clave="${clave}" data-a="${L.sumarDias(lunes, 7)}" ${despues ? 'disabled' : ''} aria-label="Semana siguiente">›</button>
  </div>`;
}

// ---------- Vista: Ranking ----------

function vistaRanking() {
  const cfg = S.cfg;
  const ms = ahora();
  const textos = {
    general: ['General', 'Promedio del % cumplido en oración, QT y llegada a tiempo. A cada uno se lo mide desde que se sumó.'],
    oracion: ['Oración', 'Días seguidos orando 10 minutos. El día de hoy no corta la racha hasta que termina.'],
    qt: ['QT', 'Días seguidos haciendo el QT. El día de hoy no corta la racha hasta que termina.'],
    puntualidad: ['Llegada', `Ensayos seguidos llegando hasta las ${cfg.horaLimite}.`],
  };
  const k = S.ranking;
  const filas = L.rankings(S.personas, cfg, ms)[k];
  const previo = L.fechaART(ms) < cfg.inicio
    ? `<p class="nota">El conteo arranca el ${L.fechaLarga(cfg.inicio)}.</p>` : '';
  return `<div class="segmentos" role="tablist">${Object.entries(textos).map(([clave, [t]]) =>
      `<button role="tab" data-accion="ranking" data-k="${clave}" aria-selected="${clave === k}">${t}</button>`).join('')}</div>
    <p class="explica">${textos[k][1]}</p>${previo}
    <ol class="ranking">${filas.map((f) => filaRanking(f, k)).join('')}</ol>`;
}

function filaRanking({ p, r, pos }, k) {
  let valor, detalle, cero;
  if (k === 'general') {
    valor = `<b>${pct(r.general)}</b>`;
    detalle = `🙏 ${pct(r.oracion.pct)} · 📖 ${pct(r.qt.pct)} · ⏰ ${pct(r.puntualidad.pct)}`;
    cero = !r.general;
  } else if (k === 'puntualidad') {
    const s = r.puntualidad;
    valor = `<b>🔥 ${s.racha}</b><small>${s.racha === 1 ? 'ensayo' : 'ensayos'}</small>`;
    detalle = `A tiempo ${s.aTiempo} · Tarde ${s.tarde} · Ausente ${s.ausente}`;
    cero = s.racha === 0;
  } else {
    const s = r[k];
    valor = `<b>🔥 ${s.racha}</b><small>${s.racha === 1 ? 'día' : 'días'}</small>`;
    detalle = `Mejor racha ${s.mejor} · ${pct(s.pct)} de los días`;
    cero = s.racha === 0;
  }
  const puesto = !cero && pos <= 3 ? ['🥇', '🥈', '🥉'][pos - 1] : pos;
  const soyYo = p.id === S.yo;
  return `<li class="${soyYo ? 'soy-yo' : ''}"><span class="pos">${puesto}</span>
    <span class="rk-quien"><span class="nom">${esc(p.nombre)}${soyYo ? ' <small>(vos)</small>' : ''}</span>
    <span class="det">${detalle}</span></span><span class="val">${valor}</span></li>`;
}

// ---------- Vista: Planilla ----------

function vistaPlanilla() {
  const cfg = S.cfg;
  const hoy = L.fechaART(ahora());
  const tope = hoy < cfg.inicio ? cfg.inicio : hoy;
  const lunes = S.semana.planilla || L.lunesDe(tope);
  const dias = L.rango(lunes, L.sumarDias(lunes, 6));
  const ensayos = dias.filter((f) => cfg.ensayos.includes(f));

  const filas = activos().map((p) => {
    const desde = L.inicioDe(p, cfg);
    const celdas = dias.map((f) => {
      if (f < desde || f > hoy) return '<td class="fuera"></td>';
      const o = !!p.oracion[f];
      const q = !!p.qt[f];
      return `<td aria-label="Oración ${o ? 'sí' : 'no'}, QT ${q ? 'sí' : 'no'}">
        <span class="pt o${o ? ' on' : ''}"></span><span class="pt q${q ? ' on' : ''}"></span></td>`;
    }).join('');
    const ens = ensayos.length
      ? `<td class="ens">${ensayos.map((f) => (f < desde ? '' : chipEnsayo(p, f, true))).join(' ')}</td>` : '';
    return `<tr class="${p.id === S.yo ? 'soy-yo' : ''}"><th scope="row">
      <button class="link-nombre" data-accion="marcar-a" data-id="${p.id}">${esc(p.nombre)}</button></th>${celdas}${ens}</tr>`;
  }).join('');

  return `<section class="card">
    <div class="card-head"><h2>Planilla</h2>${navSemana('planilla', lunes, L.lunesDe(cfg.inicio), L.lunesDe(tope))}</div>
    <div class="leyenda"><span><span class="pt o on"></span> Oración</span><span><span class="pt q on"></span> QT</span>
      ${ensayos.length ? '<span>Ensayo: hora de llegada</span>' : ''}</div>
    <div class="tabla-wrap"><table class="planilla">
      <thead><tr><th scope="col"><span class="sr">Nombre</span></th>${dias.map((f) =>
        `<th scope="col" class="${f === hoy ? 'es-hoy' : ''}">${L.inicialDia(f)}<small>${Number(f.slice(8))}</small></th>`).join('')}
        ${ensayos.length ? '<th scope="col">Ensayo</th>' : ''}</tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    <p class="nota">Tocá un nombre para marcarle la oración, el QT o la llegada.</p>
  </section>`;
}

// ---------- Vista: Archivos ----------

const ICO_TIPO = { pdf: 'PDF', imagen: 'IMG', audio: 'MP3', video: 'VID', link: 'WEB' };

function vistaArchivos() {
  const carpeta = CARPETAS.find((c) => c.id === S.carpeta);
  if (!carpeta) {
    return `<h1 class="titulo-vista">Archivos</h1>
      <p class="explica">Material del viaje: canciones, guiones y todo lo que vayamos sumando.</p>
      <ul class="carpetas">${CARPETAS.map((c) => `<li><button data-accion="carpeta" data-id="${c.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${ICONOS.archivos}</svg>
        <span class="carpeta-nombre">${esc(c.nombre)}</span>
        <span class="carpeta-cant">${plural(c.archivos.length, 'archivo', 'archivos')}</span>
        <span aria-hidden="true">›</span></button></li>`).join('')}</ul>`;
  }
  return `<button class="link volver" data-accion="carpeta" data-id="">‹ Archivos</button>
    <h1 class="titulo-vista">${esc(carpeta.nombre)}</h1>
    <ul class="lista-archivos">${carpeta.archivos.map((a, i) => {
      const interior = `<span class="tipo tipo-${a.tipo}">${ICO_TIPO[a.tipo] || ''}</span>
        <span class="archivo-nombre">${esc(a.nombre)}${a.detalle ? `<small>${esc(a.detalle)}</small>` : ''}</span><span aria-hidden="true">›</span>`;
      return a.tipo === 'link'
        ? `<li><a href="${esc(a.ruta)}" target="_blank" rel="noopener">${interior}</a></li>`
        : `<li><button data-accion="abrir-archivo" data-c="${carpeta.id}" data-i="${i}">${interior}</button></li>`;
    }).join('') || '<li class="vacio">Todavía no hay archivos en esta carpeta.</li>'}</ul>`;
}

// ---------- Vista: Props ----------

function vistaProps() {
  if (S.propsError) {
    return `<h1 class="titulo-vista">Props</h1><section class="card"><h2>Todavía no está habilitado</h2>
      <p class="muted">${esc(S.propsError)}</p></section>`;
  }
  if (!S.props) return '<h1 class="titulo-vista">Props</h1><p class="cargando">Cargando…</p>';

  const todos = [...S.props].sort((a, b) => Number(a.listo) - Number(b.listo) || porNombre(a, b));
  const nombreDe = (id) => persona(id)?.nombre || '';
  const encargados = [...new Set(todos.map((p) => p.encargado).filter((id) => nombreDe(id)))]
    .sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es'));
  const haySin = todos.some((p) => !nombreDe(p.encargado));
  if (S.propEnc !== 'todos' && S.propEnc !== 'sin' && !encargados.includes(S.propEnc)) S.propEnc = 'todos';
  const deEnc = S.propEnc === 'todos' ? todos
    : todos.filter((p) => (S.propEnc === 'sin' ? !nombreDe(p.encargado) : p.encargado === S.propEnc));
  const deUso = S.propUso === 'todos' ? deEnc : deEnc.filter((p) => p.usos.includes(S.propUso));
  const visibles = deUso.filter((p) => S.propEstado === 'todos' || (S.propEstado === 'listos') === p.listo);
  const listos = deUso.filter((p) => p.listo).length;
  const cuenta = (u) => deEnc.filter((p) => p.usos.includes(u)).length;

  const chips = [['todos', 'Todo', deEnc.length], ...USOS.map((u) => [u, u, cuenta(u)])]
    .map(([v, t, n]) => `<button class="filtro${S.propUso === v ? ' on' : ''}" data-accion="prop-uso" data-v="${esc(v)}" aria-pressed="${S.propUso === v}">${esc(t)}${n ? ` <b>${n}</b>` : ''}</button>`).join('');
  const estados = [['todos', 'Todos'], ['faltan', 'Faltan'], ['listos', 'Listos']]
    .map(([v, t]) => `<button role="tab" data-accion="prop-estado" data-v="${v}" aria-selected="${S.propEstado === v}">${t}</button>`).join('');

  const filas = visibles.map((p) => `<li class="prop${p.listo ? ' listo' : ''}">
      <button class="prop-check" data-accion="prop-listo" data-id="${p.id}" aria-pressed="${p.listo}" aria-label="${p.listo ? 'Marcar que falta' : 'Marcar que ya lo tenemos'}: ${esc(p.nombre)}">${p.listo ? '✓' : ''}</button>
      <div class="prop-info"><span class="prop-nombre">${esc(p.nombre)}${p.cantidad ? ` <small>× ${esc(p.cantidad)}</small>` : ''}</span>
        <span class="prop-enc${nombreDe(p.encargado) ? '' : ' falta'}">${nombreDe(p.encargado) ? `Encargado: <b>${esc(nombreDe(p.encargado))}</b>` : 'Sin encargado'}</span>
        ${p.nota ? `<span class="prop-nota">${esc(p.nota)}</span>` : ''}
        <span class="prop-usos">${p.usos.map((u) => `<span class="chip">${esc(u)}</span>`).join('')}</span></div>
      <button class="prop-editar" data-accion="prop-editar" data-id="${p.id}" aria-label="Editar ${esc(p.nombre)}">Editar</button>
    </li>`).join('');

  return `<h1 class="titulo-vista">Props</h1>
    <p class="explica">Lo que hace falta para las obras y actividades. Tocá el círculo cuando ya lo tengamos.</p>
    ${S.propForm ? formProp() : '<button class="btn" data-accion="prop-nuevo">+ Agregar prop</button>'}
    <label class="filtro-enc">Encargado
      <select data-filtro-enc>
        <option value="todos"${S.propEnc === 'todos' ? ' selected' : ''}>Todos</option>
        ${encargados.map((id) => `<option value="${id}"${S.propEnc === id ? ' selected' : ''}>${esc(nombreDe(id))}</option>`).join('')}
        ${haySin ? `<option value="sin"${S.propEnc === 'sin' ? ' selected' : ''}>Sin encargado</option>` : ''}
      </select></label>
    <div class="filtros">${chips}</div>
    <div class="segmentos tres" role="tablist">${estados}</div>
    <p class="explica"><b>${listos} de ${deUso.length}</b> listos${S.propUso === 'todos' ? '' : ` para ${esc(S.propUso)}`}${S.propEnc === 'todos' ? '' : S.propEnc === 'sin' ? ' sin encargado' : ` a cargo de ${esc(nombreDe(S.propEnc))}`}.</p>
    <ul class="props">${filas || `<li class="vacio">${todos.length ? 'No hay props con este filtro.' : 'Todavía no hay props cargados. Agregá el primero.'}</li>`}</ul>`;
}

function formProp() {
  const f = S.propForm;
  const conf = S.confirmar === `prop:${f.id}`;
  return `<section class="card form-prop">
    <h2>${f.id ? 'Editar prop' : 'Nuevo prop'}</h2>
    <label>Nombre<input data-pf="nombre" value="${esc(f.nombre)}" placeholder="Ej: Silla de madera" maxlength="80" autocomplete="off"></label>
    <div class="dos"><label>Cantidad<input data-pf="cantidad" value="${esc(f.cantidad)}" placeholder="Ej: 2" maxlength="20" autocomplete="off"></label>
      <label>Nota<input data-pf="nota" value="${esc(f.nota)}" placeholder="Quién lo trae, dónde está…" maxlength="120" autocomplete="off"></label></div>
    <label>Encargado
      <select data-pf="encargado">
        <option value="">Elegí quién se encarga…</option>
        ${activos().map((p) => `<option value="${p.id}"${f.encargado === p.id ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}
        ${f.encargado && !activos().some((p) => p.id === f.encargado) && persona(f.encargado) ? `<option value="${f.encargado}" selected>${esc(persona(f.encargado).nombre)} (inactivo)</option>` : ''}
      </select></label>
    <p class="etiqueta">¿Dónde se usa?</p>
    <div class="filtros envuelve">${USOS.map((u) => `<button type="button" class="filtro${f.usos.includes(u) ? ' on' : ''}" data-accion="pf-uso" data-v="${esc(u)}" aria-pressed="${f.usos.includes(u)}">${esc(u)}</button>`).join('')}</div>
    <div class="fila"><button class="btn" data-accion="prop-guardar">Guardar</button>
      <button class="btn sec" data-accion="prop-cancelar">Cancelar</button>
      ${f.id ? `<button class="link peligro" data-accion="prop-borrar">${conf ? '¿Seguro? Tocá de nuevo' : 'Eliminar'}</button>` : ''}</div>
  </section>`;
}

// ---------- Vista: Ajustes (총무) ----------

function vistaAjustes() {
  const cfg = S.cfg;
  const hoy = L.fechaART(ahora());
  const todas = [...(S.personas || [])].sort(porNombre);
  const lunesQT = S.semana.qt || L.lunesDe(hoy);
  const diasQT = L.rango(lunesQT, L.sumarDias(lunesQT, 6));
  const valorQT = (f) => (f in S.borradorQT ? S.borradorQT[f] : cfg.pasajes?.[f] || '');

  return `<h1 class="titulo-vista">Ajustes</h1>
  <p class="explica">Para el 총무. Los cambios se ven al instante en todos los celulares.</p>

  <section class="card">
    <div class="card-head"><h2>QT de la semana</h2>${navSemana('qt', lunesQT, null, null)}</div>
    <form data-form="pasajes" class="form-qt">
      ${diasQT.map((f) => `<label class="fila-qt"><span>${L.nombreDia(f)} ${L.fechaCorta(f)}</span>
        <input name="${f}" value="${esc(valorQT(f))}" placeholder="Ej: Oseas 6:1-11" autocomplete="off"></label>`).join('')}
      <button type="submit" class="btn">Guardar QT</button>
    </form>
  </section>

  <section class="card">
    <h2>Participantes</h2>
    <p class="nota">Si alguien deja de participar, desmarcá "Activo": sale de los rankings sin perder su historial.
      "Desde" es el día en que empieza a contarle.</p>
    <ul class="adm-personas">${todas.map((p) => `<li class="${p.activo ? '' : 'inactivo'}">
      <input class="adm-nombre" data-campo="nombre" data-id="${p.id}" value="${esc(p.nombre)}" aria-label="Nombre">
      <label class="adm-desde">Desde <input type="date" data-campo="desde" data-id="${p.id}" value="${p.desde || cfg.inicio}"></label>
      <label class="adm-activo"><input type="checkbox" data-campo="activo" data-id="${p.id}" ${p.activo ? 'checked' : ''}> Activo</label>
    </li>`).join('')}</ul>
    <details class="agregar"><summary>Agregar participantes</summary><div class="agregar-cuerpo">
      <textarea id="nuevos" rows="4" placeholder="Un nombre por línea">${esc(S.borradorNuevos)}</textarea>
      <label class="fila">Empieza a contar desde <input type="date" id="nuevos-desde" value="${hoy < cfg.inicio ? cfg.inicio : hoy}"></label>
      <button class="btn" data-accion="agregar">Agregar</button>
    </div></details>
  </section>

  <section class="card">
    <h2>Ensayos</h2>
    <p class="nota">Si un miércoles no hay ensayo (por ejemplo el 23/12 o el 30/12), quitalo de la lista: así no cuenta para nadie.</p>
    <ul class="chips-ensayo">${[...cfg.ensayos].sort().map((f) => {
      const conf = S.confirmar === `ensayo:${f}`;
      return `<li class="${f < hoy ? 'pasado' : ''}"><span>${L.nombreDia(f)} ${L.fechaCorta(f)}</span>
        <button data-accion="quitar-ensayo" data-fecha="${f}" aria-label="Quitar ensayo del ${L.fechaCorta(f)}">${conf ? '¿Quitar?' : '×'}</button></li>`;
    }).join('')}</ul>
    <div class="fila"><input type="date" id="nuevo-ensayo" aria-label="Fecha de ensayo nuevo">
      <button class="btn sec" data-accion="agregar-ensayo">Agregar</button></div>
    <div class="grid-horas">
      <label>A tiempo hasta<input type="time" data-cfg="horaLimite" value="${cfg.horaLimite}"></label>
      <label>Se puede fichar desde<input type="time" data-cfg="aperturaFichaje" value="${cfg.aperturaFichaje}"></label>
      <label>Inicio del conteo<input type="date" data-cfg="inicio" value="${cfg.inicio}"></label>
    </div>
  </section>

  <button class="link" data-accion="salir-ajustes">Ocultar Ajustes en este celular</button>`;
}

// ---------- Acciones ----------

const acciones = {
  marcar(d) {
    const p = persona(d.id);
    if (!p) return;
    ejecutar(store.marcar(d.id, d.tipo, d.fecha, !p[d.tipo]?.[d.fecha]));
  },
  fichar(d) {
    if (d.fecha !== L.fechaART(ahora())) return; // solo el mismo día
    ejecutar(store.fichar(d.id, d.fecha));
  },
  'deshacer-fichaje'(d) {
    confirmarDosVeces(`deshacer:${d.id}:${d.fecha}`, () => ejecutar(store.deshacerFichaje(d.id, d.fecha)));
  },
  'cambiar-yo'() { S.eligiendo = true; S.marcando = null; S.vista = 'hoy'; render(); },
  'cancelar-elegir'() { S.eligiendo = false; render(); },
  elegir(d) {
    S.yo = d.id;
    ls.set('tracker-yo', d.id);
    S.eligiendo = false;
    S.marcando = null;
    S.semana.hoy = null;
    S.vista = 'hoy';
    render();
    window.scrollTo(0, 0);
  },
  vista(d) { S.vista = d.v; render(); window.scrollTo(0, 0); },
  'marcar-a'(d) {
    S.marcando = d.id === S.yo ? null : d.id;
    S.semana.hoy = S.semana.planilla;
    S.vista = 'hoy';
    render();
    window.scrollTo(0, 0);
  },
  'volver-a-mi'() { S.marcando = null; S.semana.hoy = null; render(); },
  semana(d) {
    if (d.clave === 'qt') S.borradorQT = {};
    S.semana[d.clave] = d.a;
    render();
  },
  ranking(d) { S.ranking = d.k; render(); },
  agregar() {
    const existentes = new Set(S.personas.map((p) => p.nombre.trim().toLowerCase()));
    const nombres = [...new Set(document.getElementById('nuevos').value.split('\n').map((s) => s.trim()).filter(Boolean))]
      .filter((nombre) => !existentes.has(nombre.toLowerCase()));
    const desde = document.getElementById('nuevos-desde').value || L.fechaART(ahora());
    if (!nombres.length) { avisar('No hay nombres nuevos para agregar.'); return; }
    S.borradorNuevos = '';
    ejecutar(store.agregarPersonas(nombres, desde), `Agregado${nombres.length > 1 ? 's' : ''}: ${nombres.join(', ')}`);
    render();
  },
  'quitar-ensayo'(d) {
    confirmarDosVeces(`ensayo:${d.fecha}`, () =>
      ejecutar(store.actualizarConfig({ ensayos: S.cfg.ensayos.filter((f) => f !== d.fecha) })));
  },
  'agregar-ensayo'() {
    const f = document.getElementById('nuevo-ensayo').value;
    if (!f || S.cfg.ensayos.includes(f)) return;
    ejecutar(store.actualizarConfig({ ensayos: [...S.cfg.ensayos, f].sort() }), `Ensayo agregado: ${L.fechaLarga(f)}`);
  },
  carpeta(d) { S.carpeta = d.id || null; render(); window.scrollTo(0, 0); },
  'abrir-archivo'(d) {
    const a = CARPETAS.find((c) => c.id === d.c)?.archivos[Number(d.i)];
    if (a) abrirVisor(a);
  },
  'prop-uso'(d) { S.propUso = d.v; render(); },
  'prop-estado'(d) { S.propEstado = d.v; render(); },
  'prop-listo'(d) {
    const p = S.props?.find((x) => x.id === d.id);
    if (p) ejecutar(store.actualizarProp(p.id, { listo: !p.listo }));
  },
  'prop-nuevo'() {
    S.propForm = { id: null, nombre: '', cantidad: '', nota: '', encargado: persona(S.propEnc) ? S.propEnc : '', usos: S.propUso === 'todos' ? [] : [S.propUso] };
    render();
  },
  'prop-editar'(d) {
    const p = S.props?.find((x) => x.id === d.id);
    if (!p) return;
    S.propForm = { id: p.id, nombre: p.nombre, cantidad: p.cantidad, nota: p.nota, encargado: p.encargado, usos: [...p.usos] };
    render();
    window.scrollTo(0, 0);
  },
  'pf-uso'(d) {
    const u = S.propForm.usos;
    S.propForm.usos = u.includes(d.v) ? u.filter((x) => x !== d.v) : [...u, d.v];
    document.activeElement?.blur();
    render();
  },
  'prop-guardar'() {
    const f = S.propForm;
    const datos = { nombre: f.nombre.trim(), cantidad: f.cantidad.trim(), nota: f.nota.trim(), encargado: f.encargado || '', usos: USOS.filter((u) => f.usos.includes(u)) };
    if (!datos.nombre) { avisar('Ponele un nombre al prop.', 'error'); return; }
    if (!datos.encargado) { avisar('Elegí un encargado.', 'error'); return; }
    document.activeElement?.blur();
    S.propForm = null;
    if (f.id) ejecutar(store.actualizarProp(f.id, datos), 'Prop actualizado.');
    else ejecutar(store.agregarProp({ ...datos, listo: false }), 'Prop agregado.');
    render();
  },
  'prop-cancelar'() { document.activeElement?.blur(); S.propForm = null; render(); },
  'prop-borrar'() {
    const id = S.propForm.id;
    document.activeElement?.blur();
    confirmarDosVeces(`prop:${id}`, () => { S.propForm = null; ejecutar(store.borrarProp(id), 'Prop eliminado.'); });
  },
  'salir-ajustes'() { ls.set('tracker-admin', null); S.admin = false; S.vista = 'hoy'; render(); },
  'reiniciar-demo'() { store.reiniciar?.(); },
  recargar() { location.reload(); },
};

$app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-accion]');
  if (!el || el.disabled || !$app.contains(el)) return;
  acciones[el.dataset.accion]?.(el.dataset);
});

$app.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.closest('form[data-form="pasajes"]') && el.name) S.borradorQT[el.name] = el.value;
  if (el.id === 'nuevos') S.borradorNuevos = el.value;
  if (el.dataset.pf && S.propForm) S.propForm[el.dataset.pf] = el.value;
});

$app.addEventListener('change', (ev) => {
  const el = ev.target;
  if ('filtroEnc' in el.dataset) { S.propEnc = el.value; el.blur(); render(); return; }
  if (el.dataset.pf && S.propForm) { S.propForm[el.dataset.pf] = el.value; return; }
  if (el.dataset.campo) {
    const campo = el.dataset.campo;
    const valor = el.type === 'checkbox' ? el.checked : el.value.trim();
    if (campo === 'nombre' && !valor) { avisar('El nombre no puede quedar vacío.', 'error'); el.blur(); render(); return; }
    if (campo === 'desde' && !valor) return;
    ejecutar(store.actualizarPersona(el.dataset.id, { [campo]: valor }));
  } else if (el.dataset.cfg && el.value) {
    ejecutar(store.actualizarConfig({ [el.dataset.cfg]: el.value }));
  }
});

$app.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const form = ev.target;
  if (form.dataset.form !== 'pasajes') return;
  const mapa = {};
  for (const input of form.querySelectorAll('input[name]')) mapa[input.name] = input.value.trim();
  S.borradorQT = {};
  document.activeElement?.blur();
  ejecutar(store.guardarPasajes(mapa), 'QT guardado.');
});

$app.addEventListener('focusout', () => {
  setTimeout(() => { if (renderPendiente) render(); }, 0);
});

// Re-dibujar cuando cambia el minuto (19:30, medianoche) o al volver a la pestaña.
let ultimoMinuto = '';
setInterval(() => {
  const m = L.fechaART(ahora()) + L.horaART(ahora());
  if (m !== ultimoMinuto) { ultimoMinuto = m; render(); }
}, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

// ---------- Inicio ----------

setTimeout(() => {
  if (!S.error && (!S.personas || !S.cfg)) {
    S.error = 'No se pudo conectar con la base de datos. Revisá la conexión y recargá la página.';
    render();
  }
}, 15000);

try {
  if (modoPrueba) {
    const { crearStoreLocal } = await import('./store-local.js');
    store = crearStoreLocal(ahora);
  } else {
    const { crearStoreFirebase } = await import('./store-firebase.js');
    store = await crearStoreFirebase(firebaseConfig);
  }
  const alFallar = (e) => { S.error = explicar(e); render(); };
  store.onPersonas((ps) => { S.personas = ps; render(); }, alFallar);
  store.onConfig((c) => { S.cfg = c; render(); }, alFallar);
  store.onProps((ps) => { S.props = ps; S.propsError = null; render(); }, (e) => {
    S.propsError = String(e?.code || '').includes('permission-denied')
      ? 'Falta publicar las reglas nuevas de Firestore para esta sección.' : explicar(e);
    render();
  });
} catch (e) {
  S.error = explicar(e);
  render();
}
