# Handball Trainingsplaner

## Starten

```bash
python3 server.py
```

Dann im Browser öffnen: `http://localhost:8080`

## Datenbank

- SQLite Datei: `training.db`
- API Endpunkte:
  - `GET /api/bootstrap`
  - `POST /api/players`
  - `POST /api/exercises`
  - `POST /api/sessions`
  - `POST /api/attendance`

  - `PUT /api/players/{id}`
  - `PUT /api/exercises/{id}`
  - `PUT /api/sessions/{id}`
  - `PUT /api/attendance/{id}`
  - `DELETE /api/players/{id}`
  - `DELETE /api/exercises/{id}`
  - `DELETE /api/sessions/{id}`
  - `DELETE /api/attendance/{id}`
