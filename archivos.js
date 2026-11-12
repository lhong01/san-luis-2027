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
    id: 'puerta',
    nombre: 'PUERTA - Obra de Teatro',
    archivos: [
      { nombre: 'Guion Puerta 1', tipo: 'imagen', ruta: 'archivos/puerta/guion-puerta-1.jpeg' },
      { nombre: 'Guion Puerta 2', tipo: 'imagen', ruta: 'archivos/puerta/guion-puerta-2.jpeg' },
    ],
  },
];

// Obras y actividades del viaje: sirven de filtro en la sección "Props".
export const USOS = [
  'Silla', 'Carga pesada', 'Puerta', 'Cadena de pecado',
  'Alabanza y danza', 'Globos y pintura de caras', 'Juegos', 'Libro de colores', 'Cuatro Leyes',
  'Sonido', 'General',
];
