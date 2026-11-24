// Visor a pantalla completa para PDF, imágenes, audio, video y la lectura del QT.
// Vive fuera de #app para que los re-dibujados de la página no lo cierren.

import { leerPasaje } from './biblia.js?v=8';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
const $visor = document.getElementById('visor');
let cargaPdfjs = null;
let observador = null;
let turno = 0;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pdfjs() {
  if (!cargaPdfjs) {
    cargaPdfjs = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = `${PDFJS}/pdf.min.js`;
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
        ok(window.pdfjsLib);
      };
      s.onerror = () => { cargaPdfjs = null; mal(new Error('No se pudo cargar el lector')); };
      document.head.appendChild(s);
    });
  }
  return cargaPdfjs;
}

export function cerrarVisor() {
  turno++;
  observador?.disconnect();
  observador = null;
  $visor._partes = null;
  $visor.hidden = true;
  $visor.innerHTML = '';
  document.body.classList.remove('con-visor');
}

export function abrirVisor(archivo) {
  cerrarVisor();
  const mio = turno;
  const url = encodeURI(archivo.ruta);
  $visor.innerHTML = `<header class="visor-top">
      <button class="visor-cerrar" data-visor="cerrar" aria-label="Volver">‹ Volver</button>
      <span class="visor-titulo">${esc(archivo.nombre)}</span>
      <a class="visor-bajar" href="${url}" download target="_blank" rel="noopener">Descargar</a>
    </header><div class="visor-cuerpo" tabindex="0"></div>`;
  $visor.hidden = false;
  document.body.classList.add('con-visor');
  const $cuerpo = $visor.querySelector('.visor-cuerpo');

  if (archivo.tipo === 'imagen') {
    $cuerpo.innerHTML = `<a href="${url}" target="_blank" rel="noopener"><img class="visor-img" src="${url}" alt="${esc(archivo.nombre)}"></a>
      <p class="visor-nota">Tocá la imagen para abrirla sola y poder agrandarla.</p>`;
  } else if (archivo.tipo === 'audio') {
    $cuerpo.innerHTML = `<audio class="visor-audio" controls src="${url}"></audio>`;
  } else if (archivo.tipo === 'video') {
    $cuerpo.innerHTML = `<video class="visor-video" controls playsinline src="${url}"></video>`;
  } else if (archivo.tipo === 'pdf') {
    mostrarPdf(url, $cuerpo, mio);
  }
}

// Lectura del QT en NVI: muestra la página del pasaje de YouVersion dentro de la app.
// Si el pasaje cruza capítulos, se elige cada parte con los botones de arriba.
export function abrirLectura(texto) {
  const ref = leerPasaje(texto);
  if (!ref) return false;
  cerrarVisor();
  const [primera] = ref.partes;
  $visor.innerHTML = `<header class="visor-top">
      <button class="visor-cerrar" data-visor="cerrar" aria-label="Volver">‹ Volver</button>
      <span class="visor-titulo">${esc(ref.texto)} <small class="sigla">NVI</small></span>
      <a class="visor-bajar" data-visor="afuera" href="${primera.url}" target="_blank" rel="noopener">YouVersion ↗</a>
    </header>
    ${ref.partes.length > 1 ? `<nav class="lectura-partes" aria-label="Partes del pasaje">${ref.partes.map((p, i) =>
      `<button data-visor="parte" data-i="${i}" aria-pressed="${i === 0}">${esc(p.etiqueta)}${p.nota ? ` <small>${esc(p.nota)}</small>` : ''}</button>`).join('')}</nav>` : ''}
    <div class="lectura">
      <p class="lectura-cargando">Cargando el pasaje…<small>Si no aparece, abrilo con YouVersion ↗</small></p>
      <iframe title="${esc(ref.texto)} (NVI)" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe>
    </div>`;
  $visor.hidden = false;
  document.body.classList.add('con-visor');
  $visor._partes = ref.partes;
  mostrarParte(0);
  return true;
}

function mostrarParte(i) {
  const p = $visor._partes?.[i];
  const $marco = $visor.querySelector('.lectura iframe');
  if (!p || !$marco) return;
  $visor.querySelectorAll('[data-visor="parte"]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.i) === i)));
  $visor.querySelector('[data-visor="afuera"]').href = p.url;
  $marco.classList.remove('lista');
  $marco.onload = () => $marco.classList.add('lista');
  $marco.src = p.url;
}

async function mostrarPdf(url, $cuerpo, mio) {
  $cuerpo.innerHTML = '<p class="visor-nota">Cargando…</p>';
  try {
    const lib = await pdfjs();
    const pdf = await lib.getDocument(url).promise;
    if (mio !== turno) return;
    const primera = await pdf.getPage(1);
    const base = primera.getViewport({ scale: 1 });
    const proporcion = base.height / base.width;
    $cuerpo.innerHTML = `<p class="visor-nota">${pdf.numPages} páginas</p>`;
    const hojas = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const hoja = document.createElement('div');
      hoja.className = 'visor-hoja';
      hoja.dataset.n = n;
      hoja.style.aspectRatio = `1 / ${proporcion}`;
      hoja.innerHTML = `<span>${n}</span>`;
      $cuerpo.appendChild(hoja);
      hojas.push(hoja);
    }
    // Cada página se dibuja recién cuando está por entrar en pantalla.
    observador = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting || e.target.dataset.lista) continue;
        e.target.dataset.lista = '1';
        dibujar(pdf, e.target, mio);
      }
    }, { root: $cuerpo, rootMargin: '600px 0px' });
    hojas.forEach((h) => observador.observe(h));
  } catch (e) {
    if (mio !== turno) return;
    $cuerpo.innerHTML = `<p class="visor-nota">No se pudo abrir el PDF acá. Probá con el botón Descargar.</p>`;
  }
}

async function dibujar(pdf, hoja, mio) {
  try {
    const pagina = await pdf.getPage(Number(hoja.dataset.n));
    if (mio !== turno) return;
    const ancho = hoja.clientWidth;
    const escala = (ancho / pagina.getViewport({ scale: 1 }).width) * Math.min(window.devicePixelRatio || 1, 2);
    const vp = pagina.getViewport({ scale: escala });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    if (mio !== turno) return;
    hoja.innerHTML = '';
    hoja.style.aspectRatio = '';
    hoja.appendChild(canvas);
  } catch { delete hoja.dataset.lista; }
}

$visor.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-visor="cerrar"]')) cerrarVisor();
  const $parte = ev.target.closest('[data-visor="parte"]');
  if ($parte) mostrarParte(Number($parte.dataset.i));
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !$visor.hidden) cerrarVisor();
});
