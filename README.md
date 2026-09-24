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
  raum/page.tsx     Prüfseite: die gebackene Halle unter einer Orbit-Kamera
  globals.css       Design-Tokens (Farben, Typo, Easing) + Base-Layer
  fonts.ts          Font-Setup, umschaltbar auf lizenzierte Dateien
blender/
  01..08_*.py       Bauen, möblieren, texturieren, beleuchten, Exponate, backen, exportieren
  export_layout.mjs lib/roomLayout.ts -> blender/room_layout.py
  textures/         Gescannte Oberflächen, Poly Haven, CC0
components/
  hero/             Split-Hero: Typografie links, extrudierte Wortmarke rechts
  sections/         Manifest, Leistungen (gepinnt), Cases (+ WebGL-Plate), Ablauf, Studio/Kontakt
  walkable/         Begehbarer 3D-Raum (Pointer Lock, WASD) + Lazy-Mount
  ui/               Header, Logo, Preloader, Lenis-Provider
lib/
  site.ts           Single Source of Truth: Marke, Säulen, Cases
  roomLayout.ts     Single Source of Truth: die Maße der Halle
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

## Oberflächen

Wand, Decke, Obergaden und Sturz waren lange reine Farbwerte ohne Map. Für sich
genommen in Ordnung, neben einem texturierten Boden falsch: der Verlauf des
Wandfluters lag auf nichts, und die untexturierten Flächen lasen sich als ein
anderer Render als die texturierten davor. Jetzt tragen alle vier denselben
Putz (Grey Plaster, Poly Haven, CC0) in vier Werten.

**Tönungen werden gerechnet, nicht geraten.** Die Palette sagt, wie eine Fläche
aussehen soll; die Map bringt ihre eigene Helligkeit mit; und das
Laufzeitmaterial kann nur multiplizieren. `tint_for()` misst den linearen
Mittelwert der Diffuse einmal und teilt die Zielfarbe dadurch. Das von Hand zu
lösen ist der Grund, warum der Boden beim ersten Umgraden fünfmal zu dunkel war.

**Jeder `scanned()`-Aufruf muss durch `tint_for()`.** Ohne ihn wird die Map mit
der Zielfarbe multipliziert statt darauf graduiert, und das Ergebnis ist um den
Texturmittelwert zu dunkel. Bank und Pflanzkübel gingen als einzige roh hinein:
das Nussbaumfurnier bekam `×0,254 / 0,195 / 0,138` statt `×1,0 / 1,0 / 0,87`,
landete bei rund vier Prozent Helligkeit und verlor dabei seine Maserung — eine
Holzbank, die wie grauer Beton aussah.

**Der Anflugtunnel beginnt, wo die Wand endet.** Er begann dort, wo sie
anfängt, und lag damit über die vollen 0,5 m Wanddicke mit seinen beiden
Seitenflächen exakt in der Ebene der Portalleibung und mit seiner Decke exakt
in der Ebene der Sturzunterseite. Zwei deckungsgleiche Flächen in derselben
Tiefe kann kein Z-Buffer ordnen: die Eingangskante flimmerte auf ganzer Höhe,
und nur diese eine, weil es die einzige Öffnung mit etwas dahinter ist. Der
Boden bleibt ungerückt — waagrecht kann er mit einer Leibung nicht kollidieren,
und die Bodenplatte der Halle endet an der Innenkante, sodass ein Verschieben
einen halben Meter Loch an der Schwelle hinterließe.

**Emissive Fugen dürfen die Öffnung nicht verlassen.** Die Leuchtplatte hinter
jedem Wandblock ragt um eine halbe Fugenbreite über ihre Zelle hinaus, damit sie
die Fuge von beiden Seiten füllt. Am Rand der Öffnung steckte sie dadurch drei
Millimeter tief im Pfeiler, im Sturz und unter der Bodenplatte — zwei Körper im
selben Raum, was ein Z-Buffer nicht auflösen kann. Die Portalleibung flackerte
auf ganzer Höhe. Die Platte wird jetzt auf die Öffnung geklemmt.

## Spiegelungen

Der polierte Boden spiegelte lange eine von Hand gebaute Environment-Map: ein
Leuchtband dort, wo die Voute läuft, eine Fläche dort, wo die Bilder hängen.
Als Annäherung an das Licht brauchbar, als Annäherung an den Raum nicht — der
Boden spiegelte einen weichen Verlauf, wo eine Arkade stehen sollte, und die
Bildplatten, die das Hellste im Gebäude sind und der ganze Grund für einen
polierten Boden, kamen darin überhaupt nicht vor.

`RoomProbe` fotografiert stattdessen den Raum sich selbst: ein Cube-Render aus
dem Mittelschiff, durch `PMREMGenerator` geschickt, damit jede Rauheit den
passenden Unschärfegrad bekommt, und als `envMap` an die gebackenen Materialien
gehängt. Kostet sechs Frames einmalig und danach nichts — die Halle bewegt sich
nicht.

Das Ergebnis liegt bewusst auf den Materialien und nicht auf `scene.environment`.
Dort bleibt die gebaute Aufhellung stehen: die Bänke stecken in der Sonde, sie
damit zu beleuchten wäre zirkulär, und Podest und Türen brauchen ein Ambiente,
das nicht davon abhängt, wo die Sonde zufällig stand.

Nebenbefund beim Umbau: der Boden war vorher gar nicht vom Bake getragen. Fast
seine gesamte Erscheinung kam aus der Spiegelung jener erfundenen Flächen, und
als die wegfiel, ging er aus. Seine Tönung ist deshalb neu gesetzt — auf das,
was dunkler polierter Stein wirklich ist.

## Case-Plates

`public/cases/*.jpg` hält Screenshots der Live-Seiten (1440x900). `CaseCanvas`
erzeugt Texturen erst beim ersten Hover eines Cases — eine Liste mit dreißig
Projekten kostet damit so viel wie die Handvoll, die jemand tatsächlich
anfährt. Jede Kachel startet auf der prozeduralen Platte aus
`lib/caseTexture.ts` und tauscht sie gegen das echte Bild, sobald es dekodiert ist — fehlt oder bricht
eine Datei, bleibt der markenkonforme Platzhalter stehen statt eines schwarzen
Rechtecks. Neue Referenz: Bild ablegen, Pfad in `lib/site.ts` eintragen.

## Walkable Room

Der Raum ist eine Basilika, keine Box: niedrige Seitenschiffe, in denen die
Bilder hängen und aus der Nähe betrachtet werden, eine Arkade aus Säulen, und
darüber ein hohes Mittelschiff. Die Säulen stehen in den Lücken *zwischen* den
Jochen, damit jedes Bild in einer eigenen Arkadenöffnung zentriert steht und
vom Mittelschiff aus sichtbar bleibt.

**Die Laufrichtung kommt aus dem Gierwinkel, nie aus der Blickrichtung.**
`getWorldDirection()` flach zu legen und zu normalisieren hat genau dort eine
Singularität, wo man in einer Galerie hinsieht: nach oben. Nahe der Senkrechten
ist der waagerechte Anteil fast null, das Normalisieren verstärkt den
numerischen Rest zu einer Richtung, und beim Überschreiten des Scheitels kippt
das Vorzeichen. Wer vorwärts ging und dabei einem Planeten nachsah, lief
plötzlich rückwärts. Der Gierwinkel hat keinen solchen Punkt: die
PointerLockControls halten die Kamera in `YXZ`, ein Auslesen des Quaternions in
derselben Reihenfolge liefert die Richtung direkt, und die Neigung kommt gar
nicht erst daran.

**Hindernisse dürfen sich nicht überlappen.** Podest und Pult hatten je einen
Kreis, 1,14 m und 0,82 m, mit 1,12 m Mittenabstand — eine Überlappung von 84
Zentimetern. Wer in diese Linse geriet, wurde pro Frame aus dem einen in den
anderen geschoben, und der zweite Stoß konnte ihn um das erste Hindernis herum
auf die Gegenseite tragen. Von innen liest sich das wie ein Sprung nach hinten.
Ein Exponat ist jetzt eine Kapsel: eine Strecke vom Podest zum Pult mit einem
Radius. Eine Distanz, ein Stoß, keine Linse.

**Rund, nicht eckig.** Eine Arkade ist historisch eine Säulenreihe, und für
eine Kunsthalle gewinnt der Schaft aus einem zweiten Grund: die streifenden
Bodenfluter waschen einen Zylinder als einen durchgehenden Verlauf und einen
Kasten als vier flache Facetten. Dazu verschwindet ein Problem statt sich zu
verschieben — ein Kasten mit weltbezogener Texturprojektion spiegelt das Muster
an jeder senkrechten Kante, und das war aus der Nähe das mit Abstand
auffälligste am ganzen Raum. Eine Säule hat keine Kante.

Die Schwellung ist Entasis: gut ein Drittel der Höhe hinauf ist der Schaft drei
Millimeter dicker als am Fuß. Als Maß unsichtbar, als Silhouette
unverwechselbar — ein Schaft, der stur von unten nach oben verjüngt, sieht
eingeschnürt aus.

Lichte Maße: Seitenschiff 5,0 × 4,4 m (1,14 : 1, intim), Mittelschiff
14,2 × 8,0 m (1,78 : 1, eine Halle). Die Fassung davor war ein einzelnes
26-m-Volumen mit 6,4 m Decke, und das liest sich als Sporthalle: vier Meter
Breite auf jeden Meter Höhe, dazu zwanzig Meter leerer Boden zwischen zwei
Bilderreihen, die nichts miteinander zu tun haben.

Gebaut wird die Halle nicht mehr im Browser. Sie entsteht in Blender und kommt
als gebackenes glTF an — siehe den nächsten Abschnitt. Das gilt auch für die
Möblierung: Bänke, Mülleimer, Pflanzkübel und Absperrungen sind modellierte
Objekte mit Fasen, gescanntem Nussbaum und Gussbeton, und sie werfen ihre
Schatten gebacken auf den Marmor.

Im Frontend bleibt nur, was sich bewegt oder Inhalt ist: Tor und Anflugtunnel,
die Kontakttür, das Podest mit der rotierenden Wortmarke, die Gründer-Panels,
die Gehäuse der Bildleuchten und die Case-Platten selbst.

**Die Halle hat eine feste Länge.** `ROW_COUNT` in `lib/roomLayout.ts` steht auf
3; daraus folgen 40,5 m Tiefe, vier Joche und acht Hängeplätze, von denen sechs
belegt sind. Früher wuchs der Raum mit `CASES.length`. Das war richtig, solange
er zur Laufzeit erzeugt wurde, und ist falsch, seit sein Licht gebacken ist:
eine Lightmap gilt nur für die Wände, gegen die sie gebacken wurde. Über acht
Cases hinaus heißt deshalb: Zahl erhöhen und die Pipeline neu laufen lassen. Ein
bewusster Schritt, kein Nebeneffekt beim Editieren einer Inhaltsdatei.

Bewegung und Kollision: Grenzen der Halle, die acht Pfeiler der Arkade und ein
Zylinder um das Podest. Weiterhin analytisch statt gesweepter Geometrie — das
ist die richtige Größe Lösung für eine Halle, deren Hindernisse acht Kästen an
bekannten Stellen sind.

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

Wichtig für spätere Änderungen an der Geometrie: **die Wickelrichtung der
Faces entscheidet.** Ein Renderer dreht rückseitige Flächen beim Shading um,
eine invertiert gewickelte Wand sieht im Viewport also völlig korrekt aus. Ein
Bake tut das nicht: er hat keinen Sehstrahl, gegen den er drehen könnte, und
nimmt die geometrische Normale als Sampling-Hemisphäre. Ein Boden, dessen
Normale nach unten in die eigene Platte zeigt, wird schwarz gebacken — und
zwar lautlos, mit fehlerfreiem Albedo-Bake daneben.

## Die Halle kommt aus Blender

`blender/01_shell.py` bis `08_export.py` bauen, texturieren, beleuchten, backen
und exportieren die Halle. **Die Skripte sind die Quelle, nicht die `.blend`.**
Die Datei liegt nicht im Repo und lässt sich jederzeit aus dem Nichts neu
erzeugen; Binärgeschiebe in einem Repo dieser Größe ist die Bequemlichkeit
nicht wert.

| Skript | Aufgabe |
| --- | --- |
| `01_shell.py` | Blockout: Boden, Wände, Seitenschiffdecken, Arkade, Obergaden, Voutenleiste, Schattenfugen, Toröffnung, ein Empty je Hängeplatz |
| `02_furniture.py` | Sechs Bänke, drei Mülleimer, zehn Pflanzkübel, acht Absperrungen. Alles gefast, Pflanzen mit Dicke statt Alpha-Karten |
| `03_materials.py` | 15 Materialien. Marmor, Nussbaum und Beton aus Scans (Poly Haven, CC0), prozedurale Aderung als Fallback, falls die Texturen fehlen |
| `make_neutral_marble.py` | Einmalig, nicht Teil der Kette: gradiert den Marmor-Scan neutral und hell |
| `04_lighting.py` | 43 Leuchten: acht Wandfluter, 18 Voutensegmente, zehn Pfeilerfluter, fünf Deckenstrahler, zwei Markenakzente |
| `05_exhibits.py` | Das Stirnjoch: die Hidden Wall mit sechs fahrenden Blöcken, zwei Podeste mit schwebenden Skulpturen und Lesetafeln, drei eigene Leuchten, zwei Animationsclips |
| `06_unwrap.py` | Fügt drei Backmeshes: `Hall`, `Fittings` und `Arcade`. UV0 Weltmaß-Würfelprojektion (1 m = 1 UV-Einheit), UV1 gepackter Lightmap-Atlas |
| `07_bake.py` | Cycles, 512 Samples, nur Direkt + Indirekt ohne Farbe. Danach Firefly-Filter. Die Arkade backt zusätzlich ihr eigenes Albedo |
| `08_export.py` | Draco-komprimiertes glTF, WebP-Texturen und `room.json` nach `public/room/` |

**Warum drei Backmeshes.** Die Halle sind 7100 m² auf 108 Faces, die Möblierung
91 m² auf zehntausend, die Arkade 132 m². In einem Atlas zahlt die Texeldichte
der Halle für die einer Bank: kleine Objekte bringen fast keine Fläche mit und
enorm viele Inseln, und jede Insel kostet Rand. Getrennt bekommt jedes, was es
braucht — **17 px/m** für das Gebäude, **44 px/m** für die Möbel, **134 px/m**
für die Arkade, vor der man am nächsten steht.

Beim Backen ist jeweils das andere Mesh sichtbar. Deshalb werfen die Bänke ihre
Schatten auf den Marmor und bekommen im Gegenzug dessen Bounce ab.

**Die Arkade backt außerdem ihre eigene Farbe.** Ihr Marmor ist prozedural, und
eine Prozedur kann glTF nicht transportieren — der Albedo-Pass ist der einzige
Weg, die Aderung überhaupt in den Browser zu bekommen. Der schöne Nebeneffekt:
weil jede Säule einzeln abgewickelt ist, kommt sie ohne Kachelung, ohne
Wiederholung und ohne Naht an, und jede Säule ist anders geadert, weil jede an
einer anderen Stelle desselben 3D-Rauschfeldes steht. Genau das tut echter
Marmor auch.

**Fireflies.** Ein Bake bekommt keinen Denoiser — `scene.cycles.use_denoising`
ist eine Render-Einstellung, `BakeSettings` hat kein Gegenstück. Ein einzelnes
unglückliches Indirect-Sample überlebt also dauerhaft als weißer Punkt. Die
weißen Säulen haben die Helligkeit der ganzen Halle angehoben und die Punkte
mitgebracht. `sample_clamp_indirect` allein reicht nicht: die dunklen Decken
werden fast nur von dem beleuchtet, was die Säulen zurückwerfen, und dort ist
die Schätzung relativ verrauscht, egal wie hart absolut geklemmt wird. Deshalb
läuft nach jedem Bake ein Ausreißerfilter über den Atlas — ein Texel, das
heller ist als das 2,5-fache des Medians seiner acht Nachbarn, bekommt diesen
Median. Ein Verlauf hat keine Ausreißer und bleibt unangetastet.

Der Reihe nach, aus Blender heraus:

```python
for name in ("01_shell", "02_furniture", "03_materials", "04_lighting",
             "05_exhibits", "06_unwrap", "07_bake", "08_export"):
    exec(open(fr"<repo>\blender\{name}.py").read())
```

### Das Stirnjoch: was sich bewegt und was gebacken wird

Am Ende der Halle steht das Einzige im Raum, das der Browser selbst bewegt.
`05_exhibits.py` baut in zwei Kollektionen, und die Trennung ist der ganze
Entwurf:

- **`40_Exhibits`** steht still. Podeste und Pulte wandern in 06_unwrap ins
  Fittings-Backmesh und bekommen dieselbe Lightmap wie die Bänke. Genau das
  gibt einem Podest seinen Kontaktschatten statt eines Schwebeeffekts.
- **`45_Runtime`** wird vom Browser gefahren: sechs Wandblöcke, elf
  Skulpturenteile, zwei Tafeln. Nie gebacken — eine Lightmap ist die Aufnahme
  eines Augenblicks, und nichts davon hält still.

Beide sind beim Backen sichtbar, also wirft die geschlossene Wand ihren
Schatten und das Cyan läuft auf den Boden. Sie sind nur keine Backziele.

**Zwei Blockwände, ein Bauteil.** Die Halle hat zwei Öffnungen und beide
bekommen dieselbe Antwort: `build_block_wall()` baut sie einmal und wird
zweimal gerufen. Am hinteren Ende ist es der Ausgang, am Portal die Wand, durch
die der Besucher beim Anflug hereinkommt. Unterschiedlich ist nur, was sie
antreibt — Nähe dort, Flugfortschritt hier — und wohin die dekorierte Seite
zeigt: am Portal nach außen, denn dort kommt der Besucher an. Jeder Block trägt
darum **zwei** Gesichter mit Fugenlicht; ohne das zweite sah man von der
jeweils anderen Seite auf die flache Rückseite des Kerns.

**Die Hidden Wall.** Sechs Blöcke füllen die Öffnung bündig mit der Rückwand,
getrennt von 6 mm Fugen mit Licht dahinter. Damit das als Wand durchgeht und
nicht als Tür, tragen die Blöcke denselben Putz in derselben Kachelung und
demselben Wert wie die Wand daneben (`Wall_Hidden` ist eine Kopie von
`Wall_Aisle`) — und die Wand wird **im Frontend** beleuchtet, nicht im Bake.
Ein gebackener Streifer erreicht die Blöcke nicht, weil die sich bewegen; er
landet auf ihnen als Umriss, und ein Umriss ist das Einzige, was eine
versteckte Wand nicht haben darf.

Die Mechanik fährt drei Züge: zurück aus dem Rahmen, seitlich, und wieder nach
vorn in die Dicke des Pfeilers. Der dritte ist unsichtbar und trotzdem der
wichtigste — ohne ihn parken die Blöcke im offenen Raum hinter der Wand, und
eine 5,2 m breite Öffnung reicht aus, sie von überall im Mittelschiff dort
stehen zu sehen.

**Die Animation nach WebGL.** Keyframes gehen in Actions, Actions auf benannte
NLA-Tracks, und `08_export.py` exportiert im Modus `NLA_TRACKS`. Der fasst
gleichnamige Tracks über alle Objekte hinweg zu *einem* glTF-Clip zusammen —
der einzige Weg, sechs Blöcke als eine Mechanik aus Blender zu bekommen. Zwei
Tracks, zwei Clips:

| Clip | Länge | Wie er gespielt wird |
| --- | --- | --- |
| `HiddenWall` | 3,5 s | Gar nicht. Die Zeit wird aus dem Abstand des Besuchers geschrieben, also läuft die Mechanik beim Weggehen rückwärts, im selben Tempo. |
| `PortalWall` | 3,5 s | Ebenso, nur aus dem Anflug: die Wand teilt sich, während der Besucher noch unterwegs ist, und schließt hinter ihm. |
| `Idle` | 20 s | Endlos. Erster Frame gleich letztem, deshalb hat die Wiederholung keine Naht. |

**Warum der Idle-Clip 20 s lang ist.** Jede Drehung darin muss eine *ganze*
Zahl von Umdrehungen sein, sonst springt der Loop an der Nahtstelle — ein
Planet, der bei 0,62 Umdrehungen angekommen ist, wird beim Wiederholen um die
fehlenden 137° zurückgerissen. Unterschiedliche Geschwindigkeiten kommen also
aus unterschiedlichen ganzen Umdrehungszahlen, und langsam wird etwas nur,
indem der Clip länger wird. `spin()` wirft, wenn jemand wieder einen Bruch
einträgt.

Ein Mixer für beide, in `BakedHall.tsx`. Zwei Mixer auf derselben Wurzel würden
jeder eigene Bindings auf dieselben Knoten halten.

Ändert sich ein Maß, dann in `lib/roomLayout.ts` und danach
`node blender/export_layout.mjs`. Das schreibt `blender/room_layout.py`, das
jedes Build-Skript importiert: die Halle, der begehbare Raum und die gebackene
Lightmap beschreiben dieselben Wände, weil die Zahl genau einmal existiert.

**Warum überhaupt backen.** Echte Architektur mit Seitenschiffen, Arkade und
Obergaden, dazu jeder Lichtbounce, Kontaktschatten in den Ecken und ein
Voutenlicht — das kann ein Browser pro Frame nicht bezahlen. Der Preis ist,
dass die Halle festliegt: eine Wand ändern heißt Blender öffnen und neu backen.
Genau den Handel sollte eine Galerie machen und ein Konfigurator nicht.

**Was der Export schreibt** (zusammen 2,40 MB):

```
public/room/
  arcade_albedo.webp      700 KB  der Marmor der Säulen, 1536, einmalig pro Säule
  arcade_lightmap.webp    297 KB
  fittings_lightmap.webp  283 KB
  hall_lightmap.webp      267 KB
  hall.glb                201 KB  drei Meshes, beide UV-Kanäle, Materialnamen, acht Anker
  stone_diffuse.webp      134 KB  Marmor, 1k
  concrete_normal.webp     98 KB  Beton, 512
  plaster_rough.webp       94 KB  Putz, 512
  concrete_diffuse.webp    85 KB
  plaster_diffuse.webp     73 KB
  stone_rough.webp         57 KB
  concrete_rough.webp      43 KB
  wood_rough.webp          42 KB  Nussbaum, 512
  plaster_normal.webp      32 KB
  stone_normal.webp        18 KB
  wood_diffuse.webp        16 KB
  wood_normal.webp         13 KB
  room.json                 6 KB  Palette, Kachelmaße, Anker, lightMapIntensity
```

**Ein Stein, zwei Oberflächen.** Der gelieferte Cartago-Scan ist ein dunkler
Plattenboden mit terrakottafarbenen Reihen darin — daher die braunen Flecken,
die vorher auf dem Boden zu sehen waren. `make_neutral_marble.py` entsättigt
ihn einmalig fast bis auf seine eigene Luminanz und hebt den Wert von 0,096 auf
0,50 linear. Dieselbe Datei trägt danach beides: die Pfeiler mit einer fast
weißen Tönung als weißer Marmor, den Boden mit einer dunklen als polierter
Stein. Der Umweg ist nötig, weil das Laufzeitmaterial `color x map` rechnet und
eine Multiplikation nur abdunkeln kann.

Die Geometrie ist Draco-komprimiert: 1108 KB ohne, 163 KB mit. Der Decoder
liegt selbstgehostet in `public/draco/` (250 KB, einmal geladen und gecacht),
nicht auf Googles CDN — eine statisch ausgelieferte Seite hat nichts damit zu
tun, zum Dekomprimieren ihrer eigenen Möbel nach außen zu telefonieren.

Die Materialien stehen bewusst nicht als Shader in der glTF. Der Marmor läuft
über Mapping, Tint und Kontrast, bevor er die Base Color erreicht; glTF kann
das nicht ausdrücken und der Exporter lässt die Textur stillschweigend fallen,
sobald etwas dazwischen sitzt. Also trägt die Datei Geometrie, UVs und
Materialnamen, und `components/walkable/BakedHall.tsx` baut die echten
Materialien aus `room.json`. Nebeneffekt: die Laufzeit bekommt ein
`MeshStandardMaterial`, an das sich Lightmap und Environment hängen lassen.

**Zwei Dinge, die three.js wissen muss.** glTF hat keinen Lightmap-Slot, also
bekommt jede Textur `channel = 1` — ohne das sampelt three die
Würfelprojektion und der Raum wird von einem Schmier beleuchtet. Und der Bake
ist HDR, eine PNG ist es nicht: normalisiert auf das 99,5-Perzentil,
sRGB-kodiert, und `lightMapIntensity` aus `room.json` multipliziert das wieder
heraus — je Mesh ein eigener Faktor.

**Und eines, das die Gliederung wissen muss.** Alles, was eine Datei lädt, muss
innerhalb des `<Canvas>` unter einer `<Suspense>`-Grenze liegen. Eine
Komponente, die ohne Grenze suspendiert, reißt den Canvas mit: React hängt den
Teilbaum ab, R3F ruft beim Abräumen `forceContextLoss()`, und das
Canvas-Element bekommt nie einen zweiten Kontext. Das Ergebnis ist ein
schwarzer Bildschirm ohne eine einzige Zeile in der Konsole.

**Prüfen: `/raum`.** Der Raum unter einer Orbit-Kamera, mit sechs festen
Standpunkten, einem Umschalter zwischen leerer Halle und Möblierung, und den
Zahlen des Exports daneben. Der begehbare Raum liegt hinter
einem Pointer Lock, was für Besucher richtig und zum Betrachten eines Gebäudes
unbrauchbar ist: nicht auf dem Handy, nicht per Test-Screenshot, nicht an einem
festen Standpunkt zum Vergleich zweier Bakes. Nach jedem Neubacken hier
hineinschauen.

## Der Raum auf dem Handy

Der begehbare Raum war lange Desktop-only, und der Grund war kein
Leistungsproblem: die Pointer-Lock-API gibt es auf iOS Safari nicht, und auf
Android nur mit echter Maus. Ohne Mauszeigersperre kein Umsehen, ohne Umsehen
kein Gehen — ein Besucher mit Daumen-Stick und fester Blickrichtung steht in
einer vierzig Meter langen Halle und kommt nirgendwo an.

Was das Handy stattdessen bekommt, ist nicht eine schlechtere Version des
Gehens, sondern das, wofür das Gehen da war. Ein Galeriebesuch besteht daraus,
nacheinander vor einzelnen Dingen zu stehen. Also gibt es dreizehn Standpunkte
(`lib/tourStations.ts`), ein Tippen führt von einem zum nächsten, und ein Ziehen
sieht sich von dort um.

**Eine Station ist keine Kameraposition.** Eine Position stimmt nur für ein
Sichtfeld, und dieser Raum wird auf einem Bildschirm betrachtet, der eben noch
390 Punkte breit war und im nächsten Moment 844. Eine Station sagt deshalb, was
angesehen wird, wie breit das ist und von welcher Seite — den Abstand rechnet
der Spieler aus dem aktuellen Seitenverhältnis. Ein 5,14 m breites Bild füllt
damit hoch wie quer denselben Anteil des Bildes. Wo der Raum den nötigen Abstand
nicht hergibt — ein breites Bild im Hochformat, mit 5 m Seitenschiff dahinter —
sieht man weniger davon und bekommt den Hinweis, das Gerät zu drehen. Das ist
die ehrliche Auflösung: quer passt es, hoch nicht, und keine Rechnung ändert
daran etwas.

**Die Wandstationen kommen aus den Ankern, nicht aus dem Layout.**
`lib/roomLayout` sagt, Slot 01 hängt links. Im geladenen glTF hängt er rechts:
`08_export.py` negiert die Tiefe, `BakedHall` dreht den Raum um eine halbe
Umdrehung zurück, und eine halbe Umdrehung um Y spiegelt x mit. Das Gebäude ist
symmetrisch, es fällt also nicht auf — welches Projekt an welcher Wand hängt,
ist es aber nicht. Eine aus dem Layout gebaute Station stand vor dem Nachbarcase
und nannte es beim falschen Namen.

**Ein Tap, zwei Bedeutungen.** Auf ein entferntes Bild getippt, geht die Tour
zur Station davor; noch einmal getippt, öffnet sie das Projekt. Das ist nicht
nur die bessere Interaktion — es ist die einzige, die funktioniert: ein neuer
Tab gilt nur so lange als vom Nutzer ausgelöst, wie der auslösende Tap noch auf
dem Stack liegt, und das schließt aus, die Entscheidung einen Render später zu
treffen.

### Die zwei Stufen

`lib/roomQuality.ts` hält beide Profile. Es ist derselbe Raum, dieselbe
Geometrie, derselbe Bake — nur wird auf `lite` weniger pro Fragment aufgelöst
und weniger im Speicher gehalten.

| | voll | lite |
|---|---|---|
| Texturen im GPU-Speicher | 72 MB | 19 MB |
| Download `public/room/` | 2,4 MB | 0,5 MB |
| Lichter im Shader | 7 | 2 |
| Texturgriffe je Fragment (gebacken) | 5 | 3 |
| Pixelverhältnis | bis 1,75 | bis 2 |
| Bilder je Sekunde | frei | 30, im Stand 5 |

Der Speicher ist der Punkt, an dem ein Handy nicht langsamer wird, sondern
aufgibt: eine Textur im GPU-Speicher ist unkomprimiertes RGBA plus Mip-Kette,
und iOS Safari wirft bei 72 MB plus WebGL-Kontext den Tab weg. Den kleineren
Satz schreibt `npm run room:lite` nach `public/room/lite/` — nach jedem Export
aus Blender neu laufen lassen, die Ausgabe ist eingecheckt.

**Lichter sind teuer, auch weit weg.** three.js kompiliert die Anzahl der
Lichter in der Szene in jeden Shader. Die sieben Laufzeitlichter — für die
Wandblöcke, die beiden Skulpturen und das Zeichen, also alles, was sich bewegt
und deshalb keine Lightmap hat — werden auf jedem Fragment jeder Wand des
Gebäudes ausgewertet, vierzig Meter vom nächsten entfernt. Auf `lite` sind es
zwei, und beide sind Spots mit kurzer Reichweite. Der erste Versuch war ein
einzelnes Directional-Licht: das hat keinen Abfall, und hell genug, um einen
Betonblock zu modellieren, hellt es auch jede gebackene Wand und den ganzen
Boden auf, der direkt hineinsieht. Die Halle war gleichmäßig ausgeleuchtet und
flach — genau das, wogegen die 512 Samples in Cycles gerechnet wurden.

**`material.envMapIntensity` gilt nicht für `scene.environment`.** Das war der
teuerste Fehler in diesem Umbau. `<Environment>` setzt `scene.environment`, und
three benutzt das für jedes Material ohne eigene `envMap` — skaliert aber über
`scene.environmentIntensity`, eine einzige globale Zahl, nicht über das Feld am
Material. Eine auf null gesetzte gebackene Wand nahm die volle Füllung trotzdem.
Auf der vollen Stufe fällt das nicht auf, weil die Reflexionsprobe jedem
Material eine eigene Map gibt; auf `lite` gibt es keine Probe, und die Folge war
die gesamte Halle: blass, gleichmäßig, der Bake-Verlauf darunter begraben.
`HallEnvironmentBinding` schaltet den Rückfallweg ab und verteilt die Map
namentlich — an alles ohne Lightmap, an nichts mit einer.

**Anisotrope Filterung ist auf einer Lightmap keine Detailfrage.** Sie stand
kurzzeitig auf 2 statt 8, mit dem Argument, das koste ja pro Abtastung. Boden
und Mittelschiffdecke sieht man über vierzig Meter streifend, die Hardware wählt
bei weniger Abtastungen eine höhere Mip-Stufe für denselben gestreckten
Fußabdruck — und eine höhere Mip-Stufe in einem Atlas ist ein Chart, gemittelt
mit seinen Nachbarn. Der dunkle Boden bezog seine Helligkeit aus dem, was neben
ihm gepackt lag.

**Das Pixelverhältnis ist hier höher als auf dem Desktop, nicht niedriger.**
Die erste Fassung deckelte auf 1,25, was auf einem 390-Punkte-Schirm 488 Pixel
Breite sind — eine Case-Aufnahme füllte davon etwa dreihundert und wurde vom
Display auf neunhundert hochgezogen. Die Screenshots sahen verpixelt aus, und
das ist bei einem Portfolio das Einzige, was sie nicht dürfen. Zwei kostet das
Zweieinhalbfache an Fragmenten, und der Raum kann sich das gerade wegen der
Tour leisten: gedeckelt auf 30 Bilder, und an einer Station — dort, wo ein Bild
tatsächlich gelesen wird — bewegt sich nichts und die Schleife fällt auf fünf.
Teuer sind die Frames während eines Ziehens, und die sieht sich niemand genau
an. Kantenglättung ist auf `lite` dafür aus: bei 2× auf einem Handyschirm
findet sie keine Kante mehr, die die Auflösung nicht schon erledigt hat.

**`advance(timestamp)` will Sekunden.** Bei `frameloop="never"` liest
react-three-fiber die Uhr nicht, sondern leitet das Frame-Delta aus dem
Argument ab: `delta = timestamp - clock.elapsedTime`. Mit `performance.now()`
gefüttert sieht es jeden Frame als sechzehn *Sekunden*. Alles im Raum, was sein
Delta klemmt, hat das weggesteckt; das Zeichen auf dem Sockel, das es nicht
tat, drehte sich siebzehnmal pro Sekunde, bis die Schleife auf ihre Ruherate
fiel und die Drehung zu Flimmern aliaste. Jede Integration klemmt jetzt, und
die Schleife übergibt Sekunden ab ihrem eigenen Nullpunkt — sonst ist der erste
Frame so lang, wie der Besucher bis zum Knopfdruck gebraucht hat.

**Der Anflug hängt an der Uhr, nicht an der Bildrate.** Geklemmte Deltas
aufzusummieren heißt, dass ein Gerät mit zehn Bildern pro Sekunde den Flug mit
einem Drittel der Echtzeit abspielt: aus drei Sekunden werden neun. Die
Bewegung zu klemmen ist richtig, eine Einstellung dadurch zu dehnen nicht.

**Messen geht nur auf dem Gerät.** `?fps=1` blendet im HUD Bildrate, Stufe und
Pixelverhältnis ein. Ein Testbrowser auf dem Desktop rendert die Halle in
Software und sagt über ein Handy nichts. Zwei weitere Schalter für die Prüfung:
`?controls=touch` erzwingt die Tour auf dem Desktop, `?quality=lite` die kleine
Stufe.

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
- Walkable Room: Video-Texturen auf den Exponaten, optional WebXR über
  `@react-three/xr`. Kollision gegen echte Geometrie (three-mesh-bvh oder
  Rapier) lohnt erst, wenn im Raum etwas steht, das kein achsenparalleler
  Kasten ist. Bänke und Kübel stehen bewusst außerhalb der Laufwege.
- Die Möblierung kommt gegenüber `lib/roomLayout.ts` in x gespiegelt an: die
  Achsenabbildung nach Blender vertauscht zwei Achsen und ist damit eine
  Spiegelung. Für symmetrische Sätze — Bänke, Kübel, Absperrungen — fällt das
  nicht auf; bei den Mülleimern beginnt die Links-rechts-Abwechslung auf der
  anderen Seite. Sauber wäre, `to_blender` das x negieren zu lassen, was aus
  der Spiegelung eine echte Drehung macht.
- Der Farbraum ist jetzt AgX, nicht mehr ACES Filmic. Blender gradiert unter
  AgX, und genau dagegen wurde jede Entscheidung in diesem Raum getroffen; mit
  ACES auszuliefern hieß, ein Bild freizugeben und ein anderes zu schicken.
- Eine Sonde für 40 m Halle ist ein Parallaxen-Kompromiss. Sie steht sechs
  Meter vom Podest entfernt im Mittelschiff; wer am Stirnende steht, sieht eine
  Spiegelung, die von der Mitte aus aufgenommen wurde. Mehrere Sonden mit
  Abstandsblendung wären der nächste Schritt, lohnen aber erst, wenn jemand die
  Halle danach beurteilt.
- Kontaktformular oder Terminbuchung hinter „Projekt starten“.
