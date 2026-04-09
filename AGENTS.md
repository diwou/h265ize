# AGENTS.md

## Projektkontext

Dies ist ein gepflegter Wartungs-Fork von `h265ize`.
Ziel ist es, die bestehende CLI wieder zuverlässig mit aktuellen `ffmpeg`-Versionen lauffähig zu machen, ohne die gewohnte Bedienung unnötig zu verändern.

## Arbeitsprinzipien

- Bestehende CLI-Optionen und das Grundverhalten möglichst kompatibel halten.
- Änderungen bevorzugt klein, gezielt und gut nachvollziehbar umsetzen.
- Keine breit angelegte Umstrukturierung ohne klaren technischen Nutzen.
- Vor Änderungen an ffmpeg-Aufrufen immer prüfen, ob Eingabe- und Ausgabe-Stream-Indizes korrekt getrennt sind.
- Fehlertexte so verbessern, dass Laufzeitprobleme mit `ffmpeg` oder `ffprobe` schnell nachvollziehbar sind.

## Technische Leitplanken

- Primäres Laufzeitziel: aktuelles System-`ffmpeg`.
- Node-Versionen modern halten; Altlasten nur mit gutem Grund weitertragen.
- Neue Dateien und Änderungen standardmäßig in ASCII halten.
- Kommentare nur dort ergänzen, wo die ffmpeg-Logik sonst unnötig schwer lesbar wäre.

## Veröffentlichungsstrategie

- Das Projekt wird als gepflegter Fork weiterentwickelt und später in ein eigenes öffentliches Repository überführt.
- Für npm ist ein scoped Paket vorgesehen, zum Beispiel `@deinname/h265ize`.
- Der ursprüngliche unscoped Paketname `h265ize` wird nicht als verfügbar angenommen.
- Der CLI-Befehl soll nach Möglichkeit weiterhin `h265ize` bleiben, auch wenn der Paketname scoped veröffentlicht wird.
- Repository-, Homepage- und Issue-Links in `package.json` bleiben bis zur tatsächlichen Veröffentlichung neutral oder Platzhalter und werden erst mit dem finalen Ziel-Repository gesetzt.

## Verifikation

- Bei Änderungen am Encode-Pfad nach Möglichkeit einen echten Smoke-Test mit kleinem Video durchführen.
- Hilfsfunktionen für Stream-Metadaten, Sprachen und Titel nach Änderungen gezielt mitprüfen.
- Changelog bei nutzerrelevanten Änderungen aktualisieren.
