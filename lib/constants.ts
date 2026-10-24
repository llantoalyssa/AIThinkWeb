export const ALLOWED_EMAIL_DOMAIN = "@g.batstate-u.edu.ph";
export type UserRole =
  | "student"
  | "adviser"
  | "associate_dean"
  | "dean"
  | "department"
  | "vcrdes";

export const USER_ROLES: Record<UserRole, string> = {
  student: "Student",
  adviser: "Adviser Account",
  associate_dean: "Associate Dean Account",
  dean: "Dean Account",
  department: "Department Account",
  vcrdes: "VCRDES Account",
} as const;
export const SINGLE_ACTIVE_ROLES: UserRole[] = ["vcrdes", "dean", "associate_dean"];
export const HIGH_SIMILARITY_THRESHOLD = 25;
export const INTERNAL_WEIGHT = 0.5;
export const EXTERNAL_WEIGHT = 0.5;
export const RANK_WEIGHTS = [0.4, 0.25, 0.15, 0.12, 0.08];
export const NOISE_FLOOR = 20;
export const noiseReduce = (pct: number): number =>
  pct <= NOISE_FLOOR ? 0 : ((pct - NOISE_FLOOR) / (100 - NOISE_FLOOR)) * 100;
export function rankWeightsFor(count: number): number[] {
  const n = Math.min(count, RANK_WEIGHTS.length);
  const weights = RANK_WEIGHTS.slice(0, n);
  const sum = weights.reduce((a, b) => a + b, 0);
  return sum === 0 ? [] : weights.map((w) => w / sum);
}
export const ROLE_DASHBOARD_ROUTES: Record<UserRole, string> = {
  student: "/dashboard/student",
  adviser: "/dashboard/adviser",
  associate_dean: "/dashboard/associate-dean",
  dean: "/dashboard/dean",
  department: "/dashboard/department",
  vcrdes: "/dashboard/vcrdes",
} as const;
export function rolePath(role: UserRole): string {
  return ROLE_DASHBOARD_ROUTES[role] || `/dashboard/${role}`;
}
export function formatName(parts: {
  firstName?: string | null;
  middleInitial?: string | null;
  lastName?: string | null;
  suffix?: string | null;
}): string {
  const mi =
    parts.middleInitial && parts.middleInitial.trim()
      ? parts.middleInitial.trim().endsWith(".")
        ? parts.middleInitial.trim()
        : `${parts.middleInitial.trim()}.`
      : "";
  return [parts.firstName, mi, parts.lastName, parts.suffix]
    .filter(Boolean)
    .join(" ");
}
export const IT_FIELDS = [
  "Information Systems and Business Automation (IS)",
  "Software Engineering and Application Development",
  "Cyber Security and Network Infrastructure",
  "Artificial Intelligence and Machine Learning (AI/ML)",
  "Internet of Things (IoT) & Embedded Systems",
  "Data Science & Big Data Analytics",
  "Cloud Computing",
  "Mixed Reality & Gaming (AR/VR)",
  "Emerging Ledger Technologies (Blockchain)",
] as const;
export function normalizeFieldOfIt(value?: string | null): string {
  const v = (value || "").toLowerCase().trim();

  for (const f of IT_FIELDS) {
    if (f.toLowerCase() === v) return f;
  }
  const hit = (kws: string[]) => kws.some((k) => v.includes(k));
  if (hit(["information system", "business automation", "management information"])) return IT_FIELDS[0];
  if (hit(["software engineering", "software development", "application development"])) return IT_FIELDS[1];
  if (hit(["cyber security", "cybersecurity", "network infrastructure", "network security"])) return IT_FIELDS[2];
  if (hit(["artificial intelligence", "machine learning", "deep learning", "ai/ml", "ai-ml"])) return IT_FIELDS[3];
  if (hit(["internet of things", "iot", "embedded system"])) return IT_FIELDS[4];
  if (hit(["data science", "data analytics", "data analysis", "big data"])) return IT_FIELDS[5];
  if (hit(["cloud computing", "cloud"])) return IT_FIELDS[6];
  if (hit(["mixed reality", "gaming", "ar/vr", "ar-vr", "augmented reality", "virtual reality"])) return IT_FIELDS[7];
  if (hit(["blockchain", "ledger", "web3", "web 3"])) return IT_FIELDS[8];
  return "Unclassified";
}
export function coerceFieldOfIt(value?: string | null): string {
  const normalized = normalizeFieldOfIt(value);
  if (normalized !== "Unclassified") return normalized;

  const raw = (value || "").toLowerCase();
  let best: string = IT_FIELDS[0];
  let bestScore = 0;
  for (const f of IT_FIELDS) {
    let score = 0;
    for (const word of raw.split(/[^a-z0-9]+/)) {
      if (word.length >= 3 && f.toLowerCase().includes(word)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}