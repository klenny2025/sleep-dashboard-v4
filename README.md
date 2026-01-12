# Sleep Dashboard (Cloudflare Pages + Workers + D1)

Este proyecto tiene 2 partes:

1) `worker/` = API (Cloudflare Workers) + base de datos D1 (SQLite)
2) `dashboard/` = Página web estática (Cloudflare Pages) que consume la API

## 1) Archivos y para qué sirve cada uno

### API (Worker)
- `worker/src/index.js`  
  Código del backend (endpoints `/api/*`), validación y ranking.

- `worker/schema.sql`  
  Script SQL para crear las tablas en D1:
  - `workers`
  - `workers_sleep_entries`
  - `holidays`

- `worker/wrangler.toml`  
  Configuración de despliegue del Worker. Aquí debes pegar tu `database_id` (D1).

### Dashboard (Pages)
- `dashboard/index.html`  
  Página principal. Aquí debes configurar `window.__API_BASE__` con tu URL del Worker.

- `dashboard/app.js`  
  Lógica del dashboard (fetch a la API, tablas, KPI, gráfico).

- `dashboard/styles.css`  
  Estilos.

## 2) Requisitos en tu PC (Windows 11)
- Node.js LTS
- Git
- (Recomendado) Visual Studio Code
- Wrangler (se instala con npm)

## 3) Despliegue paso a paso (rápido)

### A) Preparar la API (Workers + D1)
1. Abre PowerShell en la carpeta `worker/`:
   `cd <ruta>\sleep-dashboard\worker`

2. Instala Wrangler (si no lo tienes):
   `npm i -g wrangler`

3. Login:
   `wrangler login`

4. Crear base D1:
   `wrangler d1 create sleep_db`

5. Copia el `database_id` que te muestra y pégalo en `worker/wrangler.toml` en:
   `database_id = "REEMPLAZA_CON_TU_DATABASE_ID"`

6. Ejecutar el SQL:
   `wrangler d1 execute sleep_db --file=.\schema.sql --remote`

7. Publicar Worker:
   `wrangler deploy`

8. Crear el secret API_KEY:
   `wrangler secret put API_KEY`

   Pega una clave larga (por ejemplo 32+ caracteres).

### B) Conectar el dashboard
1. Edita `dashboard/index.html` y cambia:
   `window.__API_BASE__ = "https://TU-WORKER.tu-subdominio.workers.dev";`

   Pega la URL real de tu Worker (sale en `wrangler deploy`).

### C) Publicar el dashboard con Cloudflare Pages + GitHub
1. Sube esta carpeta a un repo GitHub (todo el proyecto).
2. En Cloudflare Dashboard -> Workers & Pages -> Create application -> Pages.
3. Conecta tu repo.
4. Config:
   - Build command: `exit 0`
   - Build output directory: `dashboard`
5. Deploy.

## 4) Pruebas manuales (PowerShell)

Reemplaza TU-WORKER y TU_API_KEY:

```powershell
$api = "https://TU-WORKER.workers.dev"
$headers = @{ "Content-Type"="application/json"; "X-API-KEY"="TU_API_KEY" }
$body = @{ worker_name="Juan Perez"; date="2026-01-11"; sleep_h=7; sleep_m=30; source="manual" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$api/api/entries" -Headers $headers -Body $body
Invoke-RestMethod -Method Get -Uri "$api/api/ranking?month=2026-01"
Invoke-RestMethod -Method Get -Uri "$api/api/entries?month=2026-01"
Invoke-RestMethod -Method Get -Uri "$api/api/today?date=2026-01-11"
```

## 5) Notas
- El POST está protegido por `X-API-KEY`.
- La UI solo usa GET (sin exponer secretos).
- Consolidación por día: toma el registro de mayor duración; empate -> más reciente.

