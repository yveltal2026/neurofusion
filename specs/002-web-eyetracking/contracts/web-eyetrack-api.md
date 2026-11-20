# API Contracts: `/api/s/[token]/web-eyetrack/*`

## 1. `POST /api/s/[token]/web-eyetrack/session`

Inicializa o reanuda una sesión desde el snippet embebido (`live_snippet`) o desde el runner interno (`no_code_captures`).

- **Headers**: `Origin` validado contra `config.allowedOrigins` cuando `mode === 'live_snippet'`.
- **Request Body (JSON)**:
  ```json
  {
    "grant": "string (token temporal de sesión)",
    "viewport": { "width": 1440, "height": 900 },
    "deviceType": "desktop | mobile | tablet",
    "userAgent": "string"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "sessionId": "uuid",
    "studyName": "string",
    "steps": [
      { "id": "S1", "title": "...", "instruction": "...", "advanceOn": "manual", "urlPattern": null }
    ],
    "calibration": { "points": 9, "maxDurationSeconds": 180 }
  }
  ```

## 2. `POST /api/s/[token]/web-eyetrack/events`

Recibe lotes periódicos de calibración, eventos de pasos y muestras de mirada + scroll.

- **Headers**: `Origin` validado contra `config.allowedOrigins` en `live_snippet`.
- **Request Body (JSON)**:
  ```json
  {
    "sessionId": "uuid",
    "validation": { "passed": true, "meanErrorPx": 42.5, "fps": 18.2 },
    "stepEvents": [
      { "stepId": "S1", "startedAtMs": 0, "completedAtMs": 12400, "completed": true, "trigger": "manual" }
    ],
    "samples": [
      { "t": 120, "x": 0.48, "y": 0.31, "scrollX": 0, "scrollY": 240, "vw": 1440, "vh": 900, "docW": 1440, "docH": 3200, "stepId": "S1", "kind": "gaze" }
    ],
    "final": false
  }
  ```
- **Response `200 OK`**: `{ "ok": true, "acceptedSamples": 42, "completed": false }`

## 3. `GET /api/embed/web-eyetrack.js`

Sirve el script ligero autoejecutable (`application/javascript`, cacheable) que:
1. Lee `?nf_session=<grant>` o `sessionStorage`.
2. Inicializa la sesión vía `POST /api/s/[token]/web-eyetrack/session`.
3. Renderiza el widget flotante con las instrucciones paso a paso y dispara calibración/tracking + envío por lotes a `/events`.
