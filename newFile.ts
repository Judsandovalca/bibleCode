import * as fs from "fs";
import * as pdfParse from "pdf-parse";

/**
 * Normaliza el texto eliminando acentos, puntuación y convirtiendo a mayúsculas
 */
function limpiarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // elimina acentos
    .replace(/[0-9\s.,;:!?¡¿()\[\]{}"'-]/g, "") // elimina números y puntuación
    .toUpperCase(); // convierte todo a MAYÚSCULAS
}

/**
 * Convierte un texto lineal en una matriz 2D para facilitar la búsqueda en diferentes direcciones
 */
function textoAMatriz(texto: string, anchoFijo: number): string[][] {
  const matriz: string[][] = [];
  let i = 0;

  while (i < texto.length) {
    const fila: string[] = [];
    for (let j = 0; j < anchoFijo && i < texto.length; j++, i++) {
      fila.push(texto[i]);
    }
    matriz.push(fila);
  }

  return matriz;
}

/**
 * Verifica si una posición está dentro de los límites de la matriz
 */
function posicionValida(x: number, y: number, matriz: string[][]): boolean {
  return y >= 0 && y < matriz.length && x >= 0 && x < matriz[y].length;
}

/**
 * Extrae el párrafo oculto usando la misma distancia de ELS
 */
function extraerParrafoOculto(
  matriz: string[][],
  posicionInicial: { x: number; y: number },
  direccion: { dx: number; dy: number },
  distancia: number,
  longitudMax: number = 200
): string {
  let parrafo = "";
  let caracteresAntes = Math.floor(longitudMax / 2);
  let caracteresDespues = longitudMax - caracteresAntes;

  // Extraer caracteres ANTES de la posición inicial (en sentido inverso)
  let currentX = posicionInicial.x - direccion.dx * distancia;
  let currentY = posicionInicial.y - direccion.dy * distancia;
  let caracteresAntesExtraidos = [];

  for (let i = 0; i < caracteresAntes; i++) {
    if (!posicionValida(currentX, currentY, matriz)) break;

    caracteresAntesExtraidos.unshift(matriz[currentY][currentX]); // Añadimos al principio
    currentX -= direccion.dx * distancia;
    currentY -= direccion.dy * distancia;
  }

  // Añadir caracteres antes
  parrafo += caracteresAntesExtraidos.join("");

  // Añadir la posición inicial
  parrafo += matriz[posicionInicial.y][posicionInicial.x];

  // Extraer caracteres DESPUÉS de la posición inicial
  currentX = posicionInicial.x + direccion.dx * distancia;
  currentY = posicionInicial.y + direccion.dy * distancia;

  for (let i = 0; i < caracteresDespues; i++) {
    if (!posicionValida(currentX, currentY, matriz)) break;

    parrafo += matriz[currentY][currentX];
    currentX += direccion.dx * distancia;
    currentY += direccion.dy * distancia;
  }

  return parrafo;
}

/**
 * Extrae el contexto textual alrededor de una secuencia ELS
 */
function extraerContexto(
  matriz: string[][],
  posiciones: { x: number; y: number }[],
  textoOriginal: string
): string {
  // Obtenemos las posiciones originales en el texto plano
  const posicionesEnTexto = posiciones.map(
    (pos) => pos.y * matriz[0].length + pos.x
  );

  // Tomamos el contexto de 20 caracteres antes y después de cada letra
  let contexto = "";
  const contextSize = 20;

  // Extraemos el contexto textual del texto original (sin limpiar)
  for (const pos of posicionesEnTexto) {
    const inicio = Math.max(0, pos - contextSize);
    const fin = Math.min(textoOriginal.length - 1, pos + contextSize);
    const fragmento = textoOriginal.substring(inicio, fin);

    // Añadimos el fragmento con un separador
    contexto += `[...${fragmento}...] `;
  }

  return contexto;
}

/**
 * Busca secuencias de letras equidistantes (ELS) según el concepto del "Código de la Biblia"
 */
function buscarELSFrases(
  textoOriginal: string,
  frases: string[],
  distanciaMinima: number = 1,
  distanciaMaxima: number = 100
): string[] {
  // Verificar que el texto no esté vacío
  if (!textoOriginal || textoOriginal.trim().length === 0) {
    return ["ERROR: El texto está vacío"];
  }

  console.log(`Texto original tiene ${textoOriginal.length} caracteres`);

  // Limpiar y preparar el texto - convertir a una secuencia lineal sin espacios ni puntuación
  const texto = limpiarTexto(textoOriginal);
  console.log(`Texto limpio tiene ${texto.length} caracteres`);

  // Determinar un ancho razonable para la matriz
  const anchoMatriz = Math.ceil(Math.sqrt(texto.length));
  console.log(`Creando matriz con ancho: ${anchoMatriz}`);

  // Convertir el texto en una matriz 2D
  const matriz = textoAMatriz(texto, anchoMatriz);
  console.log(`Matriz creada con dimensiones: ${matriz.length}x${anchoMatriz}`);

  // Direcciones de búsqueda (horizontal, vertical, diagonal)
  const direcciones = [
    { dx: 1, dy: 0, nombre: "horizontal →" }, // Izquierda a derecha
    { dx: -1, dy: 0, nombre: "horizontal ←" }, // Derecha a izquierda
    { dx: 0, dy: 1, nombre: "vertical ↓" }, // Arriba a abajo
    { dx: 0, dy: -1, nombre: "vertical ↑" }, // Abajo a arriba
    { dx: 1, dy: 1, nombre: "diagonal ↘" }, // Diagonal descendente derecha
    { dx: -1, dy: 1, nombre: "diagonal ↙" }, // Diagonal descendente izquierda
    { dx: 1, dy: -1, nombre: "diagonal ↗" }, // Diagonal ascendente derecha
    { dx: -1, dy: -1, nombre: "diagonal ↖" }, // Diagonal ascendente izquierda
  ];

  const resultados: string[] = [];
  const encontrados: { [key: string]: boolean } = {}; // Para evitar duplicados

  // Iterar sobre cada frase a buscar
  for (const frase of frases) {
    const fraseLimpia = limpiarTexto(frase);
    console.log(`Buscando frase: "${frase}" (limpia: "${fraseLimpia}")`);

    if (fraseLimpia.length === 0) continue;

    // Para cada posición inicial en la matriz
    for (let y = 0; y < matriz.length; y++) {
      for (let x = 0; x < matriz[y].length; x++) {
        // Solo considerar la primera letra de la frase
        if (matriz[y][x] !== fraseLimpia[0]) continue;

        // Para cada distancia posible
        for (
          let distancia = distanciaMinima;
          distancia <= distanciaMaxima;
          distancia++
        ) {
          // Para cada dirección
          for (const dir of direcciones) {
            // Evitar la distancia 1 en dirección horizontal (→), ya que sería texto normal
            if (distancia === 1 && dir.dx === 1 && dir.dy === 0) continue;

            let encontrado = true;
            const posiciones: { x: number; y: number; letra: string }[] = [];

            // Verificar si podemos formar la frase con letras equidistantes
            for (let i = 0; i < fraseLimpia.length; i++) {
              const newX = x + i * distancia * dir.dx;
              const newY = y + i * distancia * dir.dy;

              if (
                !posicionValida(newX, newY, matriz) ||
                matriz[newY][newX] !== fraseLimpia[i]
              ) {
                encontrado = false;
                break;
              }

              posiciones.push({
                x: newX,
                y: newY,
                letra: matriz[newY][newX],
              });
            }

            if (encontrado) {
              // Crear una clave única para esta coincidencia
              const clave = `${frase}-${x}-${y}-${distancia}-${dir.dx}-${dir.dy}`;

              if (!encontrados[clave]) {
                encontrados[clave] = true;

                // Verificar si la coincidencia es un ELS genuino y no texto plano
                let esGenuinoELS = true;

                // Un ELS genuino debe tener al menos una letra entre cada par de letras consecutivas
                // cuando seguimos la secuencia en la matriz
                if (distancia === 1) {
                  // Leer todo el texto contiguo para verificar si la frase aparece literalmente
                  let textoContiguo = "";
                  const maxLen = fraseLimpia.length * 3; // Verificar un poco más allá de la longitud de la frase

                  for (let i = 0; i < maxLen; i++) {
                    const checkX = x + i * dir.dx;
                    const checkY = y + i * dir.dy;
                    if (posicionValida(checkX, checkY, matriz)) {
                      textoContiguo += matriz[checkY][checkX];
                    }
                  }

                  // Si la frase aparece como texto continuo, no es un verdadero ELS
                  if (textoContiguo.includes(fraseLimpia)) {
                    esGenuinoELS = false;
                  }
                }

                // Solo procesar coincidencias genuinas de ELS
                if (esGenuinoELS) {
                  // Obtener la posición original en el texto
                  const posicionOriginal = y * anchoMatriz + x;

                  // Mostrar letras equidistantes en línea
                  let letrasEnLinea = "";
                  for (const pos of posiciones) {
                    letrasEnLinea += pos.letra;
                  }

                  // Extraer párrafo oculto usando la misma distancia
                  const parrafoOculto = extraerParrafoOculto(
                    matriz,
                    { x, y },
                    dir,
                    distancia,
                    200
                  );

                  // Calcular la distancia en texto original (puede diferir de la matriz)
                  const distanciaReal =
                    posiciones[1].y * anchoMatriz +
                    posiciones[1].x -
                    (posiciones[0].y * anchoMatriz + posiciones[0].x);

                  // Resaltar la palabra encontrada en el párrafo oculto
                  const parrafoConResaltado =
                    parrafoOculto.substring(
                      0,
                      100 - Math.floor(fraseLimpia.length / 2)
                    ) +
                    "[" +
                    letrasEnLinea +
                    "]" +
                    parrafoOculto.substring(
                      100 + Math.ceil(fraseLimpia.length / 2)
                    );

                  // Crear el mensaje de resultado detallado
                  const resultado =
                    `=== CÓDIGO BÍBLICO ENCONTRADO ===\n` +
                    `Mensaje: "${frase}"\n` +
                    `Distancia entre letras: ${distancia} (${Math.abs(
                      distanciaReal
                    )} caracteres en texto original)\n` +
                    `Posición inicial: Carácter ${posicionOriginal} del texto\n` +
                    `Dirección: ${dir.nombre}\n\n` +
                    `PÁRRAFO OCULTO CON DISTANCIA ${distancia}:\n${parrafoConResaltado}\n\n` +
                    `PALABRA ENCONTRADA EN EL PÁRRAFO: [${letrasEnLinea}]\n\n`;
                  resultados.push(resultado);

                  console.log(
                    `¡Código bíblico encontrado para "${frase}" - Secuencia: ${letrasEnLinea}, distancia ${distancia}!`
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  return resultados;
}

/**
 * Función principal para procesar un PDF y buscar frases
 */
export async function procesarPDF(
  rutaPDF: string,
  frases: string[],
  distanciaMinima: number = 1,
  distanciaMaxima: number = 100
) {
  try {
    console.log(`Cargando archivo PDF desde: ${rutaPDF}`);

    // Verificar si el archivo existe
    if (!fs.existsSync(rutaPDF)) {
      console.error(`ERROR: El archivo ${rutaPDF} no existe`);
      return [`ERROR: El archivo ${rutaPDF} no existe`];
    }

    const buffer = fs.readFileSync(rutaPDF);
    console.log(
      `Archivo PDF cargado correctamente. Tamaño: ${buffer.length} bytes`
    );

    // Extraer texto del PDF
    const data = await pdfParse(buffer);
    console.log(
      `Texto extraído exitosamente. Longitud: ${data.text.length} caracteres`
    );
    console.log(`Muestra del texto: ${data.text.slice(0, 200)}...`);

    // Si el texto está vacío, notificar
    if (!data.text || data.text.trim().length === 0) {
      console.error("ERROR: No se pudo extraer texto del PDF");
      return ["ERROR: No se pudo extraer texto del PDF"];
    }

    // Buscar las frases en el texto
    const resultados = buscarELSFrases(
      data.text,
      frases,
      distanciaMinima,
      distanciaMaxima
    );

    // Mostrar resultados
    if (resultados.length === 0) {
      const mensaje = `No se encontraron coincidencias para las frases: ${frases.join(
        ", "
      )}`;
      console.log(mensaje);
      return [mensaje];
    } else {
      console.log(`Se encontraron ${resultados.length} coincidencias`);
      return resultados;
    }
  } catch (error) {
    console.error("Error al procesar el PDF:", error);
    return [`ERROR: ${error}`];
  }
}

// Configuración y ejecución
async function ejecutarBusqueda() {
  const frasesABuscar = [
    "TRUMP", // Versión más corta para mayor probabilidad
    "DONALD", // Solo nombre
    "JOHN", // Solo segundo nombre
    "JESUS", // Palabra que debería estar en la Biblia
    "ISRAEL", // País bíblico
    "PROFECIA", // Término relacionado
    "APOCALIPSIS", // Término bíblico
    "PAZ", // Palabra corta para mayor probabilidad
    "FIN", // Palabra corta para mayor probabilidad
    "2025", // Año actual
  ];

  const archivoPDF = "./biblia.pdf";

  console.log("Iniciando búsqueda de códigos ocultos...");
  const resultados = await procesarPDF(
    archivoPDF,
    frasesABuscar,
    2, // Distancia mínima (2 para evitar texto normal)
    100 // Distancia máxima aumentada para mayor probabilidad
  );

  console.log("\n=== CÓDIGOS BÍBLICOS ENCONTRADOS ===\n");

  if (resultados.length === 0) {
    console.log(
      "No se encontraron códigos ocultos con los parámetros especificados."
    );
    console.log("Sugerencias:");
    console.log("1. Intenta con palabras más cortas (3-4 letras)");
    console.log("2. Aumenta la distancia máxima");
    console.log(
      "3. Asegúrate de que el PDF contenga texto extraíble correctamente"
    );
  } else {
    resultados.forEach((res, i) => {
      console.log(`\n--- Hallazgo ${i + 1} ---\n`);
      console.log(res);
    });
    console.log(`\nTotal de hallazgos: ${resultados.length}`);
  }
}

// Ejecutar el programa
ejecutarBusqueda().catch((err) => {
  console.error("Error en la ejecución:", err);
});
