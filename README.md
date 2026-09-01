# Magnaris — Portfolio

Technology & Design Studio für Web, interaktive 3D-Erlebnisse, SaaS-Produkte
und die Systeme dahinter.

## Stack

| Layer | Wahl | Grund |
| --- | --- | --- |
| Framework | Next.js 15 (App Router, React 19) | Server Components, statische Auslieferung der Textebene |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) | Brand-Tokens leben in `app/globals.css`, keine JS-Config |
| 3D | React Three Fiber 9 + drei 10 + three 0.180 | Deklaratives Realtime-Rendering im React-Baum |
| Post | @react-three/postprocessing | Bloom nur auf den emissiven Shards, Vignette |
| Motion | Motion (ehemals Framer Motion) 12 | Scroll-Progress, Masken-Reveals, Layout-Transitions |
| Scroll | Lenis | Smooth Scroll mit Stop/Start-API für Overlays |
| Timeline | GSAP 3 | Reserviert für weitere gepinnte Sequenzen |

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # Production-Build
npm run typecheck  # tsc --noEmit
```

## Struktur

```
app/
  layout.tsx        Root-Layout, Metadata, Fonts, Preloader, SmoothScroll, Header
  page.tsx          Dramaturgie der Startseite (Akt I–VI)
  globals.css       Design-Tokens (Farben, Typo, Easing) + Base-Layer
  fonts.ts          Font-Setup, umschaltbar auf lizenzierte Dateien
components/
  hero/             Split-Hero: Typografie links, extrudierte Wortmarke rechts
  sections/         Manifest, Leistungen (gepinnt), Cases (+ WebGL-Plate), Ablauf, Studio/Kontakt
  walkable/         Begehbarer 3D-Raum (Pointer Lock, WASD) + Lazy-Mount
  ui/               Header, Logo, Preloader, Lenis-Provider
lib/
  site.ts           Single Source of Truth: Marke, Säulen, Cases
  logo.ts           Wortmarken-Geometrie für SVG *und* 3D
  motion.ts         Gemeinsame Varianten und Easing-Kurven
  caseTexture.ts    Prozeduraler Fallback, falls ein Capture fehlt
```

## Design-Tokens

Alle Farben stehen exakt einmal in `app/globals.css` und werden von Tailwind
zu Utilities gemacht (`bg-ink`, `text-teal`, `border-line`, …):

| Token | HEX | Einsatz |
| --- | --- | --- |
| `ink` | `#111723` | Haupt-Hintergrund |
| `teal` | `#0F8E91` | Haupt-Akzent |
| `violet` | `#6F63C7` | Sekundär-Akzent, Gradients |
| `steel` | `#8D98A6` | Muted Text |
| `frost` | `#F3F6F8` | Primärer Text auf dunklem Grund |

Die WebGL-Seite spiegelt dieselben Werte in `BRAND_COLORS`
(`components/hero/HeroScene.tsx`) — nur diese eine Konstante anfassen.

## Wortmarke: eine Quelle, zwei Renderer

`lib/logo.ts` hält die Polygone der gelieferten SVG-Marke. `components/ui/Logo.tsx`
zeichnet sie als SVG (Header, Preloader, Footer, Leistungen), `HeroScene`
extrudiert exakt dieselben Punktlisten zu 3D-Geometrie. Eine Koordinate ändern
heißt: beide Darstellungen ändern sich mit.

Die Ink-Flächen sind gebürstetes Dunkelmetall mit Hairline-Kanten, die Shards
sind emissiv und die einzigen Flächen über der Bloom-Schwelle. Für ein
gesculptetes Modell reicht es, den Body von `MagnarisMark` durch ein
`useGLTF("/models/magnaris-mark.glb")` zu ersetzen — die Gruppentransformationen
bleiben.

## Typografie

Inter Display, Go Mono und Gillius sind nicht über Google Fonts verfügbar.
`app/fonts.ts` läuft deshalb mit metrisch nahen Fallbacks, damit ein frischer
Checkout ohne lizenzierte Binaries baut. Sobald die Dateien in `/fonts`
liegen, den auskommentierten `localFont`-Block aktivieren — die CSS-Variablen
(`--font-inter-display`, `--font-go-mono`, `--font-gillius`) bleiben gleich.

## Performance-Regeln

- Nur zwei WebGL-Kontexte auf der Startseite: Hero und Case-Plate. Der Raum
  ist ein dritter, wird aber erst beim Klick geladen (`WalkableRoomMount`).
- Der Hero-Canvas pausiert per IntersectionObserver, sobald er aus dem
  Viewport scrollt (`frameloop="demand"`).
- Die Case-Plate hängt an Refs, nicht an State — Mausbewegung löst kein
  React-Rendering aus.
- `prefers-reduced-motion` schaltet Preloader, Lenis, Rotationen und die
  Case-Plate ab; die Seite bleibt vollständig bedienbar.
- Build-Stand: First Load JS der Startseite 157 kB, der 3D-Stack lädt danach.

## Case-Plates

`public/cases/*.jpg` hält Screenshots der Live-Seiten (1440x900). `CaseCanvas`
erzeugt Texturen erst beim ersten Hover eines Cases — eine Liste mit dreißig
Projekten kostet damit so viel wie die Handvoll, die jemand tatsächlich
anfährt. Jede Kachel startet auf der prozeduralen Platte aus
`lib/caseTexture.ts` und tauscht sie gegen das echte Bild, sobald es dekodiert ist — fehlt oder bricht
eine Datei, bleibt der markenkonforme Platzhalter stehen statt eines schwarzen
Rechtecks. Neue Referenz: Bild ablegen, Pfad in `lib/site.ts` eintragen.

## Walkable Room

Der Raum ist als Galerie gebaut, nicht als Box: polierter Boden
(`MeshReflectorMaterial`), Wandsockel-Schattenfuge, Pilaster im Raster,
Voutenlicht unter der Decke, eine Reihe Deckenleuchten für gleichmäßige
Aufhellung. Die fünf Cases hängen als echte Captures gerahmt an den Längswänden,
jeweils mit eigener Leuchte und DOM-Bildunterschrift; in der Mitte steht die
extrudierte Wortmarke auf einem Podest.

**Der Raum skaliert mit der Case-Liste.** `ROOM.depth` wird aus `CASES.length`
berechnet: zwei Cases pro Joch, ein Joch alle `ROW_SPACING` Meter, plus Vorzone
an beiden Enden. Daraus leiten sich Pilaster (`PILASTER_Z`), Bänke, Deckenlicht,
Schienenabhängungen, Teppichlänge und die Absperrungen ab. Ein sechstes oder
sechzehntes Projekt in `lib/site.ts` verlängert die Halle — keine Koordinate in
`WalkableRoom.tsx` muss angefasst werden.

Absperrungen stehen vor jedem Bild; dieselbe Linie erzwingt `ROOM.wallClearance`
in der Bewegung, damit man nicht ins Bild laufen kann.

Linksklick öffnet den aufs Fadenkreuz genommenen Case in einem neuen Tab. Unter
Pointer Lock steht der DOM-Cursor still, deshalb kommt das Ziel aus einem
Strahl durch die Bildmitte (`GazePicker`), nicht aus dem Klick-Target.

Beschriftungen sind durchgehend Canvas-Texturen, kein DOM. `<Html>` lässt sich
nicht tiefentesten — die Wandtexte leuchteten vom Eingangstunnel aus durch die
Wände — und ein DOM-Knoten pro Case skaliert nicht. `occlude="blending"` ist
keine Lösung: es zeichnet eine sichtbare schwarze Karte und schmiert in der
Bodenspiegelung.

Eingang: Die Nahwand ist um eine Toröffnung herum gebaut, dahinter liegt ein
kurzer Anflugtunnel. Nach dem Sperren des Mauszeigers öffnen sich die beiden
Torflügel, die Kamera fliegt in 2.8 s in die Halle (`INTRO`), das Tor schließt
hinter ihr und bleibt zu. Torflügel und Flug teilen sich dafür einen Ref
(`introProgress`). Umsehen geht während des Anflugs bereits.

Kontakt: In der Stirnwand zwischen den beiden Gründer-Panels sitzt eine
Schiebetür, die ab 7 m Abstand automatisch aufgeht. Dahinter das beleuchtete
Schild „Kontakt / Projekt starten"; ein Linksklick darauf verlässt den Raum und
scrollt zur Kontaktsektion. Klickbar ist sie nur, solange sie offen steht — die
Tür meldet sich dafür selbst als `aim-target` an und wieder ab.

Stirnwand hinten: je ein Gründer-Panel. `MEMBERS[0]` aus `lib/site.ts` hängt
beim Betreten **rechts**, `MEMBERS[1]` links — Reihenfolge im Array tauschen
tauscht die Seiten. Ein Foto unter `public/team/<slug>.jpg` (3:4) ersetzt den
gezeichneten Platzhalter; fehlt es, bleibt das Panel trotzdem fertig (und der
Browser loggt einen 404 für die fehlende Datei).

Wichtig für spätere Änderungen: **jede Fläche ist eine eigene einseitige Plane.**
Die erste Fassung hatte eine invertierte Box *und* separate Boden- und
Deckenflächen an derselben Stelle — zwei koplanare Faces in identischer Tiefe
sind genau das, was einen Raum flackern lässt.

## Deployment

Die Seite hat keine Serverseite: keine Route Handler, keine Server Actions,
alle Routen sind vorgerendert. Deshalb `output: "export"` — `npm run build`
schreibt ein statisches `out/`, das jeder Filehoster ausliefern kann.

GitHub Pages passiert automatisch: `.github/workflows/deploy.yml` baut bei
jedem Push auf `main` und veröffentlicht `out/`. Einmalig muss in den
Repository-Einstellungen unter *Pages* als Source **GitHub Actions** gewählt
sein.

Ein GitHub-Projektsite liegt unter `/<repo>/`, nicht auf der Root. Der
Workflow setzt dafür `NEXT_PUBLIC_BASE_PATH`; Next präfixt damit seine
eigenen URLs, und alles, was als String an `new Audio()` oder einen
Texture-Loader geht, läuft über `asset()` aus `lib/assetPath.ts`. Lokal ist
die Variable leer, die Pfade bleiben also unverändert.

Für ein Deployment auf eigener Domain (Vercel, Netlify, statischer Server) die
Variable einfach weglassen.

## Offene Punkte
- Walkable Room: GLTF-Environment statt gebauter Geometrie, echte Kollision
  (three-mesh-bvh oder Rapier), Video-Texturen auf den Exponaten,
  optional WebXR über `@react-three/xr`.
- Kontaktformular oder Terminbuchung hinter „Projekt starten“.
