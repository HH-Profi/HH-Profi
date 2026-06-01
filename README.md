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
