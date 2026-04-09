# Changelog

Alle wichtigen Änderungen an diesem Projekt werden hier dokumentiert.
Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/)
und dieses Projekt verwendet [Semantische Versionierung](https://semver.org/lang/de/).

## [Unreleased]

### Hinzugefügt
- Wartungs-Grundgerüst für den Fork mit `AGENTS.md`, `.editorconfig` und überarbeiteter Projekt-Hygiene.
- Reproduzierbarer Vendor-Patch unter `patches/` für `fluent-ffmpeg`, damit lokale Installationen mit aktueller `ffmpeg`-Ausgabe wieder korrekt arbeiten.

### Geändert
- README auf Wartungs-Fork-Status und lokale Entwicklungsnutzung ausgerichtet.
- Projekt-Metadaten auf einen eigenständigen Wartungs-Fork ohne veraltete Upstream-Repository-Links vorbereitet.
- `.gitignore` auf einen sauberen lokalen Entwicklungsstand für Node.js, VSCodium und Projektartefakte vereinheitlicht.
- `package.json` um `patch-package`-basierten `postinstall`-Schritt erweitert, damit lokale Abhängigkeitsfixes automatisch wieder angewendet werden.
- Paketverwaltung im Fork auf `npm` als verbindliche Basis festgelegt.

### Behoben
- Erster konkreter Kompatibilitätsbruch mit `ffmpeg 8` behoben: die alte Format-Erkennung von `fluent-ffmpeg` erkennt den `null`-Muxer jetzt wieder korrekt, wodurch Crop-Detection und weitere Analysepfade nicht mehr direkt abbrechen.

## [0.5.0]

### Bestehend
- Übernommener Upstream-Stand vor Beginn der Fork-Wartung.
