// Carpetas y archivos de la sección "Archivos".
// Para sumar algo: copiar el archivo dentro de archivos/<carpeta>/ y agregar una línea acá.
// tipo: 'pdf' | 'imagen' | 'audio' | 'video' | 'link'

export const CARPETAS = [
  {
    id: 'musica',
    nombre: 'MÚSICA',
    archivos: [
      { nombre: 'Cancionero · Compilado FULL', tipo: 'pdf', ruta: 'archivos/musica/cancionero-compilado-full.pdf', detalle: '31 páginas' },
    ],
  },
  {
    id: 'silla',
    nombre: 'SILLA - Obra de Teatro',
    archivos: [
      { nombre: 'Video Silla · San Luis 2026', tipo: 'video', ruta: 'archivos/silla/silla-san-luis-2026.mp4', detalle: '6:28 min · 73 MB, mejor con wifi' },
    ],
  },
  {
    id: 'puerta',
    nombre: 'PUERTA - Obra de Teatro',
    archivos: [
      { nombre: 'Guion Puerta 1', tipo: 'imagen', ruta: 'archivos/puerta/guion-puerta-1.jpeg' },
      { nombre: 'Guion Puerta 2', tipo: 'imagen', ruta: 'archivos/puerta/guion-puerta-2.jpeg' },
      { nombre: 'Video Puerta · ensayo 2026', tipo: 'link', ruta: 'https://www.youtube.com/watch?v=NSM_WO2PK3M', detalle: 'YouTube · ensayo del 4/12/2025' },
    ],
  },
];

// Obras y actividades del viaje: sirven de filtro en la sección "Props".
export const USOS = [
  'Silla', 'Carga pesada', 'Puerta', 'Cadena de pecado',
  'Alabanza y danza', 'Globos y pintura de caras', 'Juegos', 'Libro de colores', 'Cuatro Leyes',
  'Sonido', 'General',
];
