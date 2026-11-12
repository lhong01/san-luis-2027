// Visor a pantalla completa para PDF, imágenes, audio y video.
// Vive fuera de #app para que los re-dibujados de la página no lo cierren.

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
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !$visor.hidden) cerrarVisor();
});
