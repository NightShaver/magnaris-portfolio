export const BRAND = {
  name: "Magnaris",
  discipline: "WEB / 3D / SOFTWARE",
  claim: "RICHTUNG WIRD WIRKUNG.",
  claimSub: "Konzipiert. Gestaltet. Entwickelt.",
  positioning:
    "Ein Technology & Design Studio für Web, interaktive 3D-Erlebnisse, SaaS-Produkte und die Systeme dahinter.",
  principle:
    "Technische Präzision mit menschlicher Klarheit. Scharf in der Form. Ruhig in der Kommunikation.",
} as const;

export type Pillar = {
  index: string;
  key: "web" | "space" | "system" | "run";
  title: string;
  subtitle: string;
  body: string;
  capabilities: string[];
  accent: "teal" | "violet";
};

export const PILLARS: Pillar[] = [
  {
    index: "01",
    key: "web",
    title: "WEB",
    subtitle: "Brand / UX / Frontend",
    body: "Marken, die im Browser sofort verstanden werden. Von der Positionierung über das Designsystem bis zum performanten Frontend.",
    capabilities: [
      "Brand & Art Direction",
      "UX / UI Design",
      "Design Systems",
      "Next.js Frontend",
      "Core Web Vitals",
    ],
    accent: "teal",
  },
  {
    index: "02",
    key: "space",
    title: "SPACE",
    subtitle: "3D / Realtime / Motion",
    body: "Realtime-Grafik aus der Games-Industrie, im Web ausgeliefert. Begehbare Räume, Konfiguratoren, Produkt-Inszenierung mit 60 fps als Untergrenze.",
    capabilities: [
      "WebGL / WebGPU",
      "React Three Fiber",
      "Shader & VFX",
      "Asset-Pipeline (GLTF / Draco / KTX2)",
      "WebXR",
    ],
    accent: "violet",
  },
  {
    index: "03",
    key: "system",
    title: "SYSTEM",
    subtitle: "SaaS / Apps / APIs",
    body: "Produkte, die tragen. Datenmodell, API, Auth, Billing und Clients für Desktop, Mobile und alles dazwischen.",
    capabilities: [
      "SaaS-Architektur",
      "TypeScript / .NET",
      "REST & Realtime APIs",
      "Desktop- & Mobile-Apps",
      "Discord-Bots & Automation",
    ],
    accent: "teal",
  },
  {
    index: "04",
    key: "run",
    title: "RUN",
    subtitle: "Cloud / Hosting / Ops",
    body: "Der Teil, den niemand sieht und jeder merkt. Deployment, Monitoring, Backups und Wartung mit klaren Reaktionszeiten.",
    capabilities: [
      "CI / CD",
      "Edge & Container Hosting",
      "Monitoring & Alerting",
      "Backups & Recovery",
      "Wartung & SLAs",
    ],
    accent: "violet",
  },
];

export type CaseStudy = {
  index: string;
  client: string;
  title: string;
  year: string;
  url: string;
  disciplines: string[];
  /** Placeholder capture — replace with a real 1600x1000 still or loop. */
  image: string;
};

/**
 * Copy for the empty gallery slots in the walkable room. The hall is sized in
 * bays, so there are always a few walls left over once the published cases are
 * hung — they carry this instead of ending the room mid-sentence.
 */
export const UPCOMING = {
  status: "IN ARBEIT",
  headline: "COMING SOON",
  title: "Neues Projekt",
  note: "Bald an dieser Wand",
} as const;

export const CASES: CaseStudy[] = [
  {
    index: "01",
    client: "Carbo Boosting",
    title: "Performance-Brand mit Shop-Anbindung",
    year: "2025",
    url: "https://carbo-boosting.com/",
    disciplines: ["WEB", "SYSTEM"],
    image: "/cases/carbo-boosting.jpg",
  },
  {
    index: "02",
    client: "Schümmers",
    title: "Handwerk, digital inszeniert",
    year: "2025",
    url: "https://nightshaver.github.io/Schuemmers/",
    disciplines: ["WEB"],
    image: "/cases/schuemmers.jpg",
  },
  {
    index: "03",
    client: "Wiedemann",
    title: "Redesign einer Traditionsmarke",
    year: "2025",
    url: "https://sheepz-cmd.github.io/wiedemann-redesign-demo/",
    disciplines: ["WEB", "UX"],
    image: "/cases/wiedemann.jpg",
  },
  {
    index: "04",
    client: "Fahrradladen im Zimmerhof",
    title: "Lokaler Handel mit klarer Führung",
    year: "2024",
    url: "https://www.fahrradladen-im-zimmerhof.de/",
    disciplines: ["WEB", "RUN"],
    image: "/cases/zimmerhof.jpg",
  },
  {
    index: "05",
    client: "Eefelkank",
    title: "Regionale Marke, moderne Bühne",
    year: "2025",
    url: "https://nightshaver.github.io/Eefelkank-demo-seite/",
    disciplines: ["WEB", "SPACE"],
    image: "/cases/eefelkank.jpg",
  },
];

export type Member = {
  slug: string;
  /** Replace with the real first name once you want it on the wall. */
  name: string;
  role: string;
  detail: string;
  skills: string[];
  /** Optional portrait — drop a 3:4 JPG here and it replaces the placeholder. */
  photo: string;
  accent: "teal" | "violet";
};

/**
 * The two founders. Order matters in the walkable room: MEMBERS[0] hangs on
 * the right-hand half of the end wall as you walk in, MEMBERS[1] on the left.
 * Swap the entries to swap the sides.
 */
export const MEMBERS: Member[] = [
  {
    slug: "anwendungsentwicklung",
    name: "Anwendungsentwicklung",
    role: "Software & Systeme",
    detail:
      "Studierender Anwendungsentwickler. Architektur, SaaS, APIs, Betrieb.",
    skills: [
      "TypeScript / .NET",
      "SaaS-Architektur",
      "APIs, Auth & Billing",
      "Datenmodellierung",
      "Cloud, CI/CD & Betrieb",
      "Desktop-, Mobile- & Bot-Apps",
    ],
    photo: "/team/anwendungsentwicklung.jpg",
    accent: "teal",
  },
  {
    slug: "technical-art",
    name: "Technical Art",
    role: "Realtime & Look",
    detail: "6+ Jahre Gaming-Industrie. Realtime-3D, Shader, Pipelines, Motion.",
    skills: [
      "Realtime-3D (WebGL / WebGPU)",
      "Shader & VFX",
      "Asset-Pipelines (GLTF / Draco / KTX2)",
      "Blender & Substance",
      "Unreal / Unity",
      "Motion & Look-Development",
    ],
    photo: "/team/technical-art.jpg",
    accent: "violet",
  },
];
