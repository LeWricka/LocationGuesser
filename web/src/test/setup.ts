import '@testing-library/jest-dom'

// jsdom (a fecha de esta versión) no implementa `Blob.prototype.arrayBuffer`/
// `.text()` — ver jsdom#2555 — pero SÍ implementa `FileReader`. Los pickers de
// foto (#642) leen `file.arrayBuffer()` YA al seleccionar (para copiar los
// bytes antes de que Android pueda revocar el `File` original), así que sin
// este polyfill CUALQUIER test que dispare una selección de fichero (incluida
// la subida real vía `userEvent.upload`) revienta con "arrayBuffer is not a
// function" en jsdom, aunque el navegador real sí lo soporte de sobra.
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error ?? new Error('FileReader no pudo leer el Blob'))
      reader.readAsArrayBuffer(this)
    })
  }
}
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error ?? new Error('FileReader no pudo leer el Blob'))
      reader.readAsText(this)
    })
  }
}
