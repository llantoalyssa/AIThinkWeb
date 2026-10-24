export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((t) => t.replace(/^-+|-+$/g, ""))
      .filter((t) => t.length >= 2 && /[a-z]/.test(t))
  );
}
const STOP_WORDS = new Set([

  "a", "an", "the", "this", "that", "these", "those", "another", "any",
  "each", "every", "few", "many", "much", "some", "such", "no", "both",
  "all", "other", "several",

  "of", "in", "on", "at", "to", "for", "with", "by", "from", "about",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "among", "against", "under", "over", "within", "without",
  "across", "along", "around", "behind", "beyond", "despite", "toward",
  "upon", "via",

  "and", "or", "but", "nor", "so", "yet", "because", "although",
  "though", "while", "whereas", "unless", "until", "whether",

  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
  "us", "them", "my", "your", "his", "its", "our", "their", "mine",
  "yours", "ours", "theirs", "who", "whom", "whose", "which", "what",
  "this", "that",

  "is", "are", "was", "were", "be", "been", "being", "am", "do",
  "does", "did", "have", "has", "had", "having", "can", "could",
  "will", "would", "shall", "should", "may", "might", "must", "ought",
  "need", "dare", "get", "got", "gets", "make", "makes", "made",
  "use", "uses", "used", "using", "based", "basedon", "provide",
  "provides", "provided", "provide", "include", "includes", "included",
  "help", "helps", "helping", "show", "shows", "shown", "find", "finds",
  "found", "study", "studies", "paper", "papers", "research", "system",
  "systems", "approach", "approaches", "method", "methods", "aims",
  "purpose", "goal", "goals",

  "not", "no", "only", "just", "also", "too", "very", "more", "most",
  "less", "least", "as", "than", "then", "now", "here", "there",
  "when", "where", "why", "how", "again", "once", "often", "always",
  "never", "usually", "rather", "other", "others", "such", "per",
  "etc", "eg", "ie", "vs", "versus", "via",
]);

export function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase());
}
function isConsonant(word: string, i: number): boolean {
  const ch = word[i];
  if (ch === "a" || ch === "e" || ch === "i" || ch === "o" || ch === "u") {
    return false;
  }
  if (ch === "y") {
    return i === 0 ? true : !isConsonant(word, i - 1);
  }
  return true;
}

function measure(word: string): number {
  let n = 0;
  let i = 0;
  const len = word.length;
  while (i < len) {
    if (i > 0 && isConsonant(word, i - 1) && !isConsonant(word, i)) {

      n++;
      i++;
      while (i < len && !isConsonant(word, i)) i++;
    } else {
      i++;
    }
  }
  return n;
}

function hasVowel(word: string): boolean {
  for (let i = 0; i < word.length; i++) {
    if (!isConsonant(word, i)) return true;
  }
  return false;
}

function endsDoubleConsonant(word: string): boolean {
  const len = word.length;
  if (len < 2) return false;
  const a = word[len - 2];
  const b = word[len - 1];
  return isConsonant(word, len - 2) && isConsonant(word, len - 1) && a === b;
}

function endsCVC(word: string): boolean {
  const len = word.length;
  if (len < 3) return false;
  const c = word[len - 3];
  const v = word[len - 2];
  const c2 = word[len - 1];
  return (
    isConsonant(word, len - 3) &&
    !isConsonant(word, len - 2) &&
    isConsonant(word, len - 1) &&
    c2 !== "w" &&
    c2 !== "x" &&
    c2 !== "y"
  );
}

function replaceSuffix(word: string, suffix: string, replacement: string): string | null {
  if (word.endsWith(suffix)) {
    return word.slice(0, word.length - suffix.length) + replacement;
  }
  return null;
}

export function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 2) return w;

  let stemmed = w;
  if (stemmed.endsWith("sses")) stemmed = stemmed.slice(0, -2);
  else if (stemmed.endsWith("ies")) stemmed = stemmed.slice(0, -2);
  else if (stemmed.endsWith("ss")) stemmed = stemmed;
  else if (stemmed.endsWith("s")) stemmed = stemmed.slice(0, -1);
  const step1bMap: [string, string][] = [
    ["eed", "ee"],
    ["ed", ""],
    ["ing", ""],
  ];
  for (const [suffix, repl] of step1bMap) {
    if (stemmed.endsWith(suffix)) {
      const root = stemmed.slice(0, stemmed.length - suffix.length);
      if (suffix === "eed" && measure(root) > 0) {
        stemmed = root + "ee";
      } else if (suffix !== "eed" && hasVowel(root)) {
        stemmed = root;

        if (stemmed.endsWith("at") || stemmed.endsWith("bl") || stemmed.endsWith("iz")) {
          stemmed += "e";
        } else if (endsDoubleConsonant(stemmed)) {
          stemmed = stemmed.slice(0, -1);
        } else if (measure(stemmed) === 1 && endsCVC(stemmed)) {
          stemmed += "e";
        }
      }
      break;
    }
  }
  if (stemmed.endsWith("y") && hasVowel(stemmed.slice(0, -1))) {
    stemmed = stemmed.slice(0, -1) + "i";
  }
  const step2Map: [string, string][] = [
    ["ational", "ate"], ["tional", "tion"], ["enci", "ence"], ["anci", "ance"],
    ["izer", "ize"], ["abli", "able"], ["alli", "al"], ["entli", "ent"],
    ["eli", "e"], ["ousli", "ous"], ["ization", "ize"], ["ation", "ate"],
    ["ator", "ate"], ["alism", "al"], ["iveness", "ive"], ["fulness", "ful"],
    ["ousness", "ous"], ["aliti", "al"], ["iviti", "ive"], ["biliti", "ble"],
  ];
  for (const [suffix, repl] of step2Map) {
    if (stemmed.endsWith(suffix)) {
      const root = stemmed.slice(0, stemmed.length - suffix.length);
      if (measure(root) > 0) stemmed = root + repl;
      break;
    }
  }
  const step3Map: [string, string][] = [
    ["icate", "ic"], ["ative", ""], ["alize", "al"], ["iciti", "ic"],
    ["ical", "ic"], ["ful", ""], ["ness", ""],
  ];
  for (const [suffix, repl] of step3Map) {
    if (stemmed.endsWith(suffix)) {
      const root = stemmed.slice(0, stemmed.length - suffix.length);
      if (measure(root) > 0) stemmed = root + repl;
      break;
    }
  }
  const step4Suffixes = [
    "al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement",
    "ment", "ent", "ion", "ou", "ism", "ate", "iti", "ous", "ive", "ize",
  ];
  for (const suffix of step4Suffixes) {
    if (stemmed.endsWith(suffix)) {
      const root = stemmed.slice(0, stemmed.length - suffix.length);
      if (measure(root) > 1) {
        if (suffix === "ion" && !(root.endsWith("s") || root.endsWith("t"))) {
          break;
        }
        stemmed = root;
      }
      break;
    }
  }
  if (stemmed.endsWith("e")) {
    const root = stemmed.slice(0, -1);
    const m = measure(root);
    if (m > 1 || (m === 1 && !endsCVC(root))) {
      stemmed = root;
    }
  }
  if (measure(stemmed) > 1 && endsDoubleConsonant(stemmed) && stemmed.endsWith("l")) {
    stemmed = stemmed.slice(0, -1);
  }

  return stemmed;
}
export function extractKeywords(
  text: string,
  maxKeywords: number = 6,
  minLength: number = 3,
): string[] {
  const seenStems = new Set<string>();
  const keywords: string[] = [];

  for (const token of tokenize(text)) {
    if (token.length < minLength) continue;
    if (isStopWord(token)) continue;
    const s = stem(token);
    if (s.length < minLength) continue;
    if (seenStems.has(s)) continue;
    seenStems.add(s);
    keywords.push(token);
    if (keywords.length >= maxKeywords) break;
  }

  return keywords;
}
export const DEFAULT_SEARCH_QUERY = "information technology research";