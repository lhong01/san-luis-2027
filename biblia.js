// Interpreta pasajes escritos a mano ("Oseas 13:1-16", "Oseas 1:10-2:13", "2 Pedro 3:1-7")
// y arma el link para leerlos en NVI en bible.com (YouVersion).
// No guardamos el texto bíblico: la NVI tiene derechos de Biblica y solo se muestra desde YouVersion, que tiene licencia.

const VERSION = 128; // NVI en YouVersion
const SIGLA = 'NVI';

// [código USFM, nombre a mostrar, otras formas de escribirlo]
const LIBROS = [
  ['GEN', 'Génesis'], ['EXO', 'Éxodo'], ['LEV', 'Levítico'], ['NUM', 'Números'], ['DEU', 'Deuteronomio'],
  ['JOS', 'Josué'], ['JDG', 'Jueces'], ['RUT', 'Rut'], ['1SA', '1 Samuel'], ['2SA', '2 Samuel'],
  ['1KI', '1 Reyes'], ['2KI', '2 Reyes'], ['1CH', '1 Crónicas'], ['2CH', '2 Crónicas'], ['EZR', 'Esdras'],
  ['NEH', 'Nehemías'], ['EST', 'Ester'], ['JOB', 'Job'], ['PSA', 'Salmos', 'Salmo'], ['PRO', 'Proverbios'],
  ['ECC', 'Eclesiastés'], ['SNG', 'Cantares', 'Cantar de los Cantares', 'Cántico de los Cánticos'],
  ['ISA', 'Isaías'], ['JER', 'Jeremías'], ['LAM', 'Lamentaciones'], ['EZK', 'Ezequiel'], ['DAN', 'Daniel'],
  ['HOS', 'Oseas'], ['JOL', 'Joel'], ['AMO', 'Amós'], ['OBA', 'Abdías'], ['JON', 'Jonás'], ['MIC', 'Miqueas'],
  ['NAM', 'Nahúm'], ['HAB', 'Habacuc'], ['ZEP', 'Sofonías'], ['HAG', 'Hageo'], ['ZEC', 'Zacarías'],
  ['MAL', 'Malaquías'], ['MAT', 'Mateo'], ['MRK', 'Marcos'], ['LUK', 'Lucas'], ['JHN', 'Juan'],
  ['ACT', 'Hechos', 'Hechos de los Apóstoles'], ['ROM', 'Romanos'], ['1CO', '1 Corintios'], ['2CO', '2 Corintios'],
  ['GAL', 'Gálatas'], ['EPH', 'Efesios'], ['PHP', 'Filipenses'], ['COL', 'Colosenses'],
  ['1TH', '1 Tesalonicenses'], ['2TH', '2 Tesalonicenses'], ['1TI', '1 Timoteo'], ['2TI', '2 Timoteo'],
  ['TIT', 'Tito'], ['PHM', 'Filemón'], ['HEB', 'Hebreos'], ['JAS', 'Santiago'], ['1PE', '1 Pedro'],
  ['2PE', '2 Pedro'], ['1JN', '1 Juan'], ['2JN', '2 Juan'], ['3JN', '3 Juan'], ['JUD', 'Judas'],
  ['REV', 'Apocalipsis'],
];
const UN_CAPITULO = new Set(['OBA', 'PHM', '2JN', '3JN', 'JUD']);

const ORDINALES = { primera: 1, primero: 1, segunda: 2, segundo: 2, tercera: 3, tercero: 3, i: 1, ii: 2, iii: 3 };

function normalizar(s) {
  let t = String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[–—]/g, '-').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(\d)\s*(?:°|º|ra|ro|a|o)?\s+/, '$1 ');
  t = t.replace(/^(primera|primero|segunda|segundo|tercera|tercero|iii|ii|i)\s+/, (m, w) => `${ORDINALES[w]} `);
  return t;
}

const POR_NOMBRE = new Map();
for (const [codigo, nombre, ...otros] of LIBROS) {
  const libro = { codigo, nombre };
  for (const n of [nombre, ...otros]) POR_NOMBRE.set(normalizar(n), libro);
}

function buscarLibro(texto) {
  const t = normalizar(texto);
  if (POR_NOMBRE.has(t)) return POR_NOMBRE.get(t);
  if (t.length < 3) return null;
  // Abreviaturas sin ambigüedad: "Apoc", "Ose", "2 Ped".
  const candidatos = new Set();
  for (const [n, libro] of POR_NOMBRE) if (n.startsWith(t)) candidatos.add(libro);
  return candidatos.size === 1 ? [...candidatos][0] : null;
}

const url = (usfm) => `https://www.bible.com/es/bible/${VERSION}/${usfm}.${SIGLA}`;
const parte = (libro, etiqueta, usfm, nota = '') => ({ etiqueta: `${libro.nombre} ${etiqueta}`, nota, url: url(`${libro.codigo}.${usfm}`) });

// Una referencia sin punto y coma. Devuelve las partes a mostrar o null.
function partesDe(libro, resto) {
  const m = resto.match(/^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/);
  if (!m) return null;
  let [, c1, v1, x, y] = m.map((n) => (n === undefined ? undefined : Number(n)));

  // Libros de un solo capítulo: "Judas 3-4" son versículos.
  if (UN_CAPITULO.has(libro.codigo) && v1 === undefined && y === undefined) {
    v1 = c1 === 1 && x === undefined ? undefined : c1;
    c1 = 1;
  }
  if (!c1 || c1 > 150) return null;

  if (v1 === undefined && x === undefined) return [parte(libro, `${c1}`, `${c1}`)];
  if (v1 !== undefined && x === undefined) return [parte(libro, `${c1}:${v1}`, `${c1}.${v1}`)];
  if (v1 !== undefined && y === undefined) {
    if (x < v1) return null;
    return [parte(libro, `${c1}:${v1}-${x}`, `${c1}.${v1}-${x}`)];
  }
  // Rango de capítulos ("Oseas 13-14") o que cruza capítulos ("Oseas 1:10-2:13").
  const c2 = x;
  if (c2 < c1 || c2 - c1 > 10) return null;
  const lista = [];
  for (let c = c1; c <= c2; c++) {
    if (c === c1 && v1 && v1 > 1) lista.push(parte(libro, `${c}`, `${c}`, `desde el v. ${v1}`));
    else if (c === c2 && y !== undefined) lista.push(parte(libro, `${c}:1-${y}`, `${c}.1-${y}`));
    else lista.push(parte(libro, `${c}`, `${c}`));
  }
  return lista;
}

// "Oseas 13:1-16" → { texto, partes: [{ etiqueta, nota, url }] } · null si no se entiende.
export function leerPasaje(texto) {
  if (!texto || !String(texto).trim()) return null;
  const partes = [];
  let libro = null;
  for (const trozo of String(texto).split(';')) {
    const t = normalizar(trozo).replace(/\s*-\s*/g, '-').replace(/\s*:\s*/g, ':');
    if (!t) continue;
    const m = t.match(/^(?:(.*?[a-z].*?)\s*)?(\d[\d:-]*)$/);
    if (!m) return null;
    if (m[1]) libro = buscarLibro(m[1]);
    if (!libro) return null;
    const p = partesDe(libro, m[2]);
    if (!p) return null;
    partes.push(...p);
  }
  return partes.length ? { texto: String(texto).trim(), partes } : null;
}

// Para lo que no se entiende: búsqueda libre en Bible Gateway, que acepta casi cualquier formato.
export function urlBusqueda(texto) {
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(texto)}&version=${SIGLA}`;
}
