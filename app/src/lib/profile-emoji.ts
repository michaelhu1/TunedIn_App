// A flag for a hometown and an emoji for a major, worked out from what the person typed.
// Both fields are free text, so these are best guesses: when nothing matches, nothing is
// shown, which is always better than a wrong flag.

const US_STATES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut",
  DE: "delaware", FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan",
  MN: "minnesota", MS: "mississippi", MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire",
  NJ: "new jersey", NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio",
  OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota",
  TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington", WV: "west virginia",
  WI: "wisconsin", WY: "wyoming", DC: "district of columbia",
};
const US_STATE_NAMES = new Set(Object.values(US_STATES));

// Names people actually type that the standard country list spells differently.
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "US", us: "US", "u.s.": "US", "u.s.a.": "US", america: "US", "united states of america": "US",
  uk: "GB", "u.k.": "GB", england: "GB", scotland: "GB", wales: "GB", britain: "GB", "great britain": "GB",
  korea: "KR", "south korea": "KR", "republic of korea": "KR", prc: "CN", "mainland china": "CN", uae: "AE",
  russia: "RU", vietnam: "VN", turkey: "TR", "czech republic": "CZ", "hong kong": "HK", macau: "MO", taiwan: "TW",
  "puerto rico": "PR", holland: "NL", "ivory coast": "CI", "the bahamas": "BS", "the philippines": "PH",
};

// Cities and places people give without a country. US places first, then the cities NYU's
// international students most often come from.
const PLACES: Record<string, string> = {
  nyc: "US", "new york city": "US", manhattan: "US", brooklyn: "US", queens: "US", bronx: "US", "the bronx": "US",
  "staten island": "US", "long island": "US", "los angeles": "US", la: "US", "bay area": "US", "san francisco": "US",
  sf: "US", chicago: "US", boston: "US", miami: "US", houston: "US", dallas: "US", austin: "US", seattle: "US",
  atlanta: "US", philadelphia: "US", philly: "US", "washington dc": "US", "washington d.c.": "US", "san diego": "US",
  denver: "US", "jersey city": "US", "new jersey": "US", jersey: "US", socal: "US", norcal: "US",
  beijing: "CN", shanghai: "CN", shenzhen: "CN", guangzhou: "CN", chengdu: "CN", hangzhou: "CN", nanjing: "CN",
  wuhan: "CN", taipei: "TW", seoul: "KR", busan: "KR", tokyo: "JP", osaka: "JP", kyoto: "JP",
  mumbai: "IN", delhi: "IN", "new delhi": "IN", bangalore: "IN", bengaluru: "IN", hyderabad: "IN", chennai: "IN",
  kolkata: "IN", pune: "IN", london: "GB", manchester: "GB", paris: "FR", berlin: "DE", munich: "DE", madrid: "ES",
  barcelona: "ES", rome: "IT", milan: "IT", amsterdam: "NL", dublin: "IE", toronto: "CA", vancouver: "CA",
  montreal: "CA", "mexico city": "MX", cdmx: "MX", "são paulo": "BR", "sao paulo": "BR", "rio de janeiro": "BR",
  rio: "BR", "buenos aires": "AR", bogotá: "CO", bogota: "CO", lima: "PE", santiago: "CL", sydney: "AU",
  melbourne: "AU", auckland: "NZ", dubai: "AE", "abu dhabi": "AE", istanbul: "TR", "tel aviv": "IL", cairo: "EG",
  lagos: "NG", nairobi: "KE", accra: "GH", johannesburg: "ZA", "cape town": "ZA", bangkok: "TH", jakarta: "ID",
  manila: "PH", hanoi: "VN", "ho chi minh city": "VN", saigon: "VN", "kuala lumpur": "MY", karachi: "PK",
  lahore: "PK", dhaka: "BD", moscow: "RU", kyiv: "UA", warsaw: "PL", vienna: "AT", zurich: "CH", geneva: "CH",
  stockholm: "SE", oslo: "NO", copenhagen: "DK", lisbon: "PT", athens: "GR", tbilisi: "GE",
};

let countryNames: Map<string, string> | null = null;
// Every country's English name, built once from the list that ships with the browser / Node.
function countries(): Map<string, string> {
  if (countryNames) return countryNames;
  countryNames = new Map();
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = names.of(code);
      if (name && name !== code && !/^Unknown/i.test(name)) countryNames.set(name.toLowerCase(), code);
    }
  }
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) countryNames.set(alias, code);
  return countryNames;
}

function flag(code: string): string {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// A place or country we know by name. "Georgia" alone is read as the US state: at NYU that
// is far more often right.
function namedCode(part: string): string | null {
  if (PLACES[part]) return PLACES[part];
  if (US_STATE_NAMES.has(part)) return "US";
  return countries().get(part) ?? null;
}

/** The flag for a hometown such as "Queens, NY", "Hong Kong" or "Lagos, Nigeria"; null if unsure. */
export function flagForHometown(hometown: string | null | undefined): string | null {
  if (!hometown) return null;
  const parts = hometown.split(/[,/]/).map((p) => p.trim()).filter(Boolean);
  // Names first, the last part (usually the state or country) before the city. Only when no
  // part is a known name does a two-letter code count as a US state: "Queens, NY" is the US,
  // but "Mumbai, IN" is India, not Indiana, because Mumbai is known.
  for (const raw of [...parts].reverse()) {
    const code = namedCode(raw.toLowerCase().replace(/\.$/, ""));
    if (code) return flag(code);
  }
  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^[A-Z]{2}$/.test(last) && US_STATES[last]) return flag("US");
  return null;
}

// First match wins, so the specific subjects sit above the general ones.
const MAJORS: [RegExp, string][] = [
  [/drama|theat(er|re)|acting/, "🎭"],
  [/music tech|recorded music|music business|audio|sound/, "🎧"],
  [/music|composition|vocal|jazz|piano/, "🎵"],
  [/film|cinema|television|\btv\b/, "🎬"],
  [/danc/, "💃"],
  [/photo/, "📷"],
  [/game/, "🎮"],
  [/interactive media|\bima\b|\bitp\b|design|\bux\b|\bui\b/, "🎨"],
  [/studio art|fine art|art history|\bart\b|painting/, "🎨"],
  [/computer|software|data sci|\bcs\b|informatics|cyber/, "💻"],
  [/electrical|mechanical|civil|aerospace|robot|engineer/, "⚙️"],
  [/nurs|pre-?med|medicine|health|dental|nutrition|physical therap/, "🩺"],
  [/math|statistic/, "📐"],
  [/physic|astro/, "🔭"],
  [/chem/, "🧪"],
  [/neuro|psych|cognitive/, "🧠"],
  [/bio|genetic/, "🧬"],
  [/environment|sustainab|earth|climate/, "🌱"],
  [/\becon/, "📈"],
  [/financ|account|business|\bstern\b|marketing|management/, "💼"],
  [/law|legal|pre-?law/, "⚖️"],
  [/politic|government|international relations|public policy/, "🏛️"],
  [/journal|media|communicat/, "📰"],
  [/creative writing|english|literature|writing|linguist|language|french|spanish|classics/, "📚"],
  [/histor/, "📜"],
  [/philosoph/, "🤔"],
  [/sociolog|anthropolog|social work|gender/, "🌍"],
  [/educat|teach/, "🍎"],
  [/architect|urban/, "🏙️"],
  [/hospitality|hotel|tourism|food/, "🍽️"],
  [/sport/, "🏟️"],
  [/fashion/, "🧵"],
  [/undecided|undeclared|liberal studies|gallatin|individualized/, "🧭"],
];

/** An emoji for a major such as "Computer Science" or "Music Technology"; null if nothing fits. */
export function emojiForMajor(major: string | null | undefined): string | null {
  if (!major) return null;
  const text = major.toLowerCase();
  return MAJORS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
