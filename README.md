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
