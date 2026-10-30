# TensorFlow.js WASM 4.22.0

Archivos oficiales de `@tensorflow/tfjs-backend-wasm@4.22.0/dist`, servidos en el
mismo origen para no añadir un CDN al arranque. Licencia Apache 2.0 adjunta.
El adaptador fija un hilo; no exige cabeceras de aislamiento. La distribución
requiere resolver los nombres de las tres variantes aunque sólo cargue una.

Al actualizar la dependencia, actualizar juntos estos binarios, su ruta versionada
y `gaze-backend.ts`, y ejecutar la prueba de contrato con el modelo real.

SHA-256:

```text
77ebb28a6d34f371dbbf2086b7f2de8994acd8ea5a3cf1fa24d2c26c840cac7b tfjs-backend-wasm-simd.wasm
c052228d4bef185c27bbe59a9e029570c78bbb9f08b3cb46b597851650373de2 tfjs-backend-wasm-threaded-simd.wasm
70a5d516060464e5269f01c74bac1772d6b8ab6cb612acf16b5cdaf61f78d892 tfjs-backend-wasm.wasm
```
