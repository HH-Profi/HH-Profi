# 🤾 Handball Trainer — Proxmox LXC Setup

## Schritt 1 — LXC Container erstellen

Empfohlen: Ubuntu 22.04/24.04, 1 CPU, 512 MB RAM, 4 GB Disk und DHCP oder feste IP.

## Schritt 2 — Dateien kopieren

```bash
scp -r handball-trainer/ root@<LXC-IP>:/root/
```

## Schritt 3 — Installer ausführen

```bash
cd /root/handball-trainer
bash install.sh
```

Das Skript installiert Node.js 20 LTS, installiert die npm-Pakete, kopiert die App nach `/opt/handball` und richtet `handball.service` ein.

## Schritt 4 — Im Browser öffnen

```text
http://<LXC-IP>:3000
```


## Leistungsdaten

Im Spielerprofil kannst du pro Spieler einzelne Leistungsdaten erfassen:

- Datum
- Spiel/Gegner
- gelaufene Strecke in km
- Zeit in Minuten
- Tore pro Spiel
- optionale Notiz

Diese Werte werden in der SQLite-Tabelle `player_performance` gespeichert und in den Statistiken für Laufleistung und Tore ausgewertet.


## CSV-Import

Du kannst Daten direkt in der Weboberfläche per CSV importieren. Excel-Dateien bitte vorher in Excel oder LibreOffice als CSV speichern.

### Spieler importieren

Pflichtfeld ist `name`. Unterstützte Spalten:

```csv
name,number,position,birthdate,contact,status,notes
Max Mustermann,7,Rückraum Mitte,2001-04-12,max@example.com,fit,Linkshänder
```

### Übungen importieren

Pflichtfeld ist `name`. Unterstützte Spalten:

```csv
name,category,description,players_count,duration,material
Stoßen und Kreuzen,Taktik,Ablaufbeschreibung,6-10,20,Bälle|Hütchen
```

### Trainings importieren

Pflichtfeld ist `date`. Spieler und Übungen kannst du per Nummer, Name oder ID referenzieren; mehrere Werte trennst du mit `|`.

```csv
title,date,time,notes,present,absent,exercises
Dienstagstraining,2026-06-02,18:00,Schwerpunkt Angriff,7|Max Mustermann,12,Stoßen und Kreuzen
```

## Verwaltung

```bash
systemctl status handball
systemctl restart handball
journalctl -u handball -f
```

## Daten / Backup

Alle Daten liegen in:

```text
/opt/handball/data/handball.db
/opt/handball/data/uploads/
```

Für ein Backup reicht es, den Ordner `/opt/handball/data/` zu sichern.
