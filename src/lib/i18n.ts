export type Locale = "en" | "no" | "de" | "es";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "no", label: "NO" },
  { code: "de", label: "DE" },
  { code: "es", label: "ES" },
];

const dict = {
  // ─── Layout / Header / Footer ───
  brands: { en: "Brands", no: "Merker", de: "Marken", es: "Marcas" },
  footerTitle: {
    en: "ErrorLib — Industrial Fault Code Library",
    no: "ErrorLib — Industrielt feilkodebibliotek",
    de: "ErrorLib — Industrielle Fehlercodes Bibliothek",
    es: "ErrorLib — Biblioteca de códigos de falla industriales",
  },
  disclaimer: {
    en: "Disclaimer: ErrorLib is an independent technical reference tool. While we aim for accuracy, always verify with the manufacturer\u2019s official service manuals before performing maintenance on industrial equipment. ErrorLib is not affiliated with the brands listed.",
    no: "Ansvarsfraskrivelse: ErrorLib er et uavhengig teknisk referanseverktøy. Vi tilstreber nøyaktighet, men kontroller alltid med produsentens offisielle servicemanualer før vedlikehold på industrielt utstyr. ErrorLib er ikke tilknyttet merkene som er oppført.",
    de: "Haftungsausschluss: ErrorLib ist ein unabhängiges technisches Referenztool. Obwohl wir Genauigkeit anstreben, überprüfen Sie immer die offiziellen Servicehandbücher des Herstellers, bevor Sie Wartungsarbeiten an Industrieanlagen durchführen. ErrorLib ist nicht mit den aufgeführten Marken verbunden.",
    es: "Descargo de responsabilidad: ErrorLib es una herramienta de referencia técnica independiente. Aunque buscamos la precisión, verifique siempre con los manuales de servicio oficiales del fabricante antes de realizar mantenimiento en equipos industriales. ErrorLib no está afiliado con las marcas listadas.",
  },

  // ─── Homepage ───
  heroTitle: {
    en: "Industrial Fault Code Library",
    no: "Industrielt feilkodebibliotek",
    de: "Industrielle Fehlercodes-Bibliothek",
    es: "Biblioteca de códigos de falla industriales",
  },
  heroSubtitle: {
    en: "Stop searching through PDFs. Get instant diagnostics and step-by-step repair guides for industrial automation, robotics, and CNC machinery.",
    no: "Slutt å lete gjennom PDF-er. Få umiddelbar diagnostikk og trinnvise reparasjonsguider for industriell automasjon, robotikk og CNC-maskiner.",
    de: "Schluss mit dem Durchsuchen von PDFs. Sofortige Diagnosen und Schritt-für-Schritt-Reparaturanleitungen für industrielle Automatisierung, Robotik und CNC-Maschinen.",
    es: "Deja de buscar en PDFs. Obtén diagnósticos instantáneos y guías de reparación paso a paso para automatización industrial, robótica y maquinaria CNC.",
  },
  faultCodes: { en: "fault codes", no: "feilkoder", de: "Fehlercodes", es: "códigos de falla" },
  noBrandsYet: {
    en: "No brands indexed yet. Documentation is currently being reviewed.",
    no: "Ingen merker indeksert ennå. Dokumentasjon blir gjennomgått.",
    de: "Noch keine Marken indexiert. Die Dokumentation wird derzeit überprüft.",
    es: "Aún no se han indexado marcas. La documentación está siendo revisada.",
  },
  underDocumentation: {
    en: "Under Documentation",
    no: "Under dokumentasjon",
    de: "In Dokumentation",
    es: "En documentación",
  },
  underDocSubtitle: {
    en: "Our technicians are currently indexing documentation for the following manufacturers / models.",
    no: "Våre teknikere indekserer for tiden dokumentasjon for følgende produsenter / modeller.",
    de: "Unsere Techniker indexieren derzeit die Dokumentation für die folgenden Hersteller / Modelle.",
    es: "Nuestros técnicos están indexando actualmente la documentación de los siguientes fabricantes / modelos.",
  },
  requests: { en: "requests", no: "forespørsler", de: "Anfragen", es: "solicitudes" },
  manual: { en: "manual", no: "manual", de: "Handbuch", es: "manual" },
  manuals: { en: "manuals", no: "manualer", de: "Handbücher", es: "manuales" },
  codes: { en: "codes", no: "koder", de: "Codes", es: "códigos" },

  // ─── Request Form ───
  missingManual: {
    en: "Missing a manual?",
    no: "Mangler du en manual?",
    de: "Fehlt ein Handbuch?",
    es: "¿Falta un manual?",
  },
  requestSubtitle: {
    en: "Submit a request and our team will prioritize adding it to our technical library.",
    no: "Send inn en forespørsel, og teamet vårt vil prioritere å legge den til i vårt tekniske bibliotek.",
    de: "Senden Sie eine Anfrage und unser Team wird das Hinzufügen zu unserer technischen Bibliothek priorisieren.",
    es: "Envíe una solicitud y nuestro equipo priorizará agregarla a nuestra biblioteca técnica.",
  },
  brandPlaceholder: { en: "Brand (e.g. Mitsubishi)", no: "Merke (f.eks. Mitsubishi)", de: "Marke (z.B. Mitsubishi)", es: "Marca (ej. Mitsubishi)" },
  modelPlaceholder: { en: "Model (optional)", no: "Modell (valgfritt)", de: "Modell (optional)", es: "Modelo (opcional)" },
  emailPlaceholder: {
    en: "Your email (optional \u2014 get notified when it's ready)",
    no: "Din e-post (valgfritt \u2014 bli varslet når den er klar)",
    de: "Ihre E-Mail (optional \u2014 Benachrichtigung erhalten)",
    es: "Su email (opcional \u2014 reciba notificación cuando esté listo)",
  },
  requestBtn: { en: "Request", no: "Send", de: "Anfragen", es: "Solicitar" },
  sending: { en: "Sending...", no: "Sender...", de: "Senden...", es: "Enviando..." },
  thankVoted: { en: "Thanks! This request now has", no: "Takk! Denne forespørselen har nå", de: "Danke! Diese Anfrage hat jetzt", es: "¡Gracias! Esta solicitud ahora tiene" },
  votes: { en: "votes", no: "stemmer", de: "Stimmen", es: "votos" },
  thankCreated: { en: "Thank you! We'll look into it.", no: "Takk! Vi skal se på det.", de: "Danke! Wir werden es prüfen.", es: "¡Gracias! Lo revisaremos." },
  popularRequests: {
    en: "Popular requests are prioritized by our team.",
    no: "Populære forespørsler blir prioritert av teamet vårt.",
    de: "Beliebte Anfragen werden von unserem Team priorisiert.",
    es: "Las solicitudes populares son priorizadas por nuestro equipo.",
  },
  submitAnother: { en: "Submit another request", no: "Send en ny forespørsel", de: "Weitere Anfrage senden", es: "Enviar otra solicitud" },
  somethingWrong: { en: "Something went wrong. Please try again.", no: "Noe gikk galt. Prøv igjen.", de: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.", es: "Algo salió mal. Por favor, inténtelo de nuevo." },

  // ─── Fault code detail page ───
  whatDoesMean: { en: "What does", no: "Hva betyr", de: "Was bedeutet", es: "¿Qué significa" },
  mean: { en: "mean?", no: "?", de: "?", es: "?" },
  repairSteps: {
    en: "Repair Steps",
    no: "Reparasjonssteg",
    de: "Reparaturschritte",
    es: "Pasos de reparación",
  },
  sourceManual: { en: "Source:", no: "Kilde:", de: "Quelle:", es: "Fuente:" },
  viewOfficialPDF: { en: "View Official PDF", no: "Åpne offisiell PDF", de: "Offizielles PDF öffnen", es: "Ver PDF oficial" },
  sourceUnderMaintenance: { en: "Source link under maintenance", no: "Kildelenke under vedlikehold", de: "Quelllink wird gewartet", es: "Enlace de fuente en mantenimiento" },
  browseAllCodes: {
    en: "Browse all codes in this manual",
    no: "Se alle koder i denne manualen",
    de: "Alle Codes in diesem Handbuch durchsuchen",
    es: "Ver todos los códigos en este manual",
  },
  searchMoreCodes: {
    en: "Search more codes in this manual",
    no: "Søk flere koder i denne manualen",
    de: "Mehr Codes in diesem Handbuch suchen",
    es: "Buscar más códigos en este manual",
  },
  commonCauses: {
    en: "Common Causes",
    no: "Vanlige årsaker",
    de: "Häufige Ursachen",
    es: "Causas comunes",
  },
  verifiedData: {
    en: "Verified technical data. Last updated:",
    no: "Verifisert teknisk data. Sist oppdatert:",
    de: "Verifizierte technische Daten. Zuletzt aktualisiert:",
    es: "Datos técnicos verificados. Última actualización:",
  },
  relatedFaults: {
    en: "Related Faults",
    no: "Relaterte feilkoder",
    de: "Verwandte Fehlercodes",
    es: "Fallas relacionadas",
  },
  translating: { en: "Translating...", no: "Oversetter...", de: "Übersetzen...", es: "Traduciendo..." },

  // ─── Brand page ───
  modelFamilies: { en: "model families", no: "modellfamilier", de: "Modellfamilien", es: "familias de modelos" },
  modelFamily: { en: "model family", no: "modellfamilie", de: "Modellfamilie", es: "familia de modelos" },
  noFaultCodesYet: {
    en: "No fault codes available yet. Check back soon.",
    no: "Ingen feilkoder tilgjengelig ennå. Kom tilbake snart.",
    de: "Noch keine Fehlercodes verfügbar. Schauen Sie bald wieder vorbei.",
    es: "Aún no hay códigos de falla disponibles. Vuelva pronto.",
  },
  noFaultCodesExtracted: {
    en: "No fault codes have been extracted for",
    no: "Ingen feilkoder har blitt hentet ut for",
    de: "Keine Fehlercodes wurden extrahiert für",
    es: "No se han extraído códigos de falla para",
  },
  docBeingIndexed: {
    en: "Documentation is currently being indexed.",
    no: "Dokumentasjon blir for tiden indeksert.",
    de: "Die Dokumentation wird derzeit indexiert.",
    es: "La documentación se está indexando actualmente.",
  },
  faultCode: { en: "fault code", no: "feilkode", de: "Fehlercode", es: "código de falla" },
  documented: { en: "documented", no: "dokumentert", de: "dokumentiert", es: "documentados" },
  noFaultCodesManual: {
    en: "No fault codes extracted yet for this manual.",
    no: "Ingen feilkoder hentet ut ennå for denne manualen.",
    de: "Noch keine Fehlercodes für dieses Handbuch extrahiert.",
    es: "Aún no se han extraído códigos de falla para este manual.",
  },
  andCounting: { en: "...and counting", no: "...og flere kommer", de: "...und es werden mehr", es: "...y sumando" },
  home: { en: "Home", no: "Hjem", de: "Startseite", es: "Inicio" },
  includes: { en: "Includes", no: "Inkluderer", de: "Beinhaltet", es: "Incluye" },
  viewCodes: { en: "View fault codes", no: "Se feilkoder", de: "Fehlercodes anzeigen", es: "Ver códigos de falla" },
  filterAll: { en: "All", no: "Alle", de: "Alle", es: "Todos" },

  // ─── Search ───
  searchPlaceholder: {
    en: "Search fault codes, brands...",
    no: "Søk feilkoder, merker...",
    de: "Fehlercodes, Marken suchen...",
    es: "Buscar códigos, marcas...",
  },
  searchHeroPlaceholder: {
    en: "Search by code, error name, or brand (e.g. E004, Overcurrent, ABB)",
    no: "Søk etter kode, feilnavn eller merke (f.eks. E004, Overcurrent, ABB)",
    de: "Suche nach Code, Fehlername oder Marke (z.B. E004, Overcurrent, ABB)",
    es: "Buscar por código, nombre de error o marca (ej. E004, Overcurrent, ABB)",
  },
  noResults: {
    en: "No results found",
    no: "Ingen resultater funnet",
    de: "Keine Ergebnisse gefunden",
    es: "No se encontraron resultados",
  },
  noResultsCta: {
    en: "Code not found? Request it here",
    no: "Fant du ikke koden? Send en forespørsel",
    de: "Code nicht gefunden? Hier anfragen",
    es: "¿Código no encontrado? Solicítalo aquí",
  },
} as const;

export type TranslationKey = keyof typeof dict;

export function t(key: TranslationKey, locale: Locale): string {
  return dict[key][locale] ?? dict[key].en;
}
