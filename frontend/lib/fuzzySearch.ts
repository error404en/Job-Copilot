/**
 * JobCopilot Intelligent Typo-Tolerant Fuzzy Search Engine
 * Handles spelling errors, phonetic variations, transposition of letters,
 * engineering acronym expansions, and multi-field weighted scoring.
 */

// Common tech domain typos and alias normalizations
const TYPO_MAP: Record<string, string> = {
  // Programming languages & frameworks
  'pythn': 'python',
  'pyton': 'python',
  'pyhton': 'python',
  'pthon': 'python',
  'javascrip': 'javascript',
  'jvscript': 'javascript',
  'js': 'javascript',
  'typscript': 'typescript',
  'ts': 'typescript',
  'tpescript': 'typescript',
  'raect': 'react',
  'reac': 'react',
  'reakt': 'react',
  'nextjs': 'next.js',
  'nxtjs': 'next.js',
  'fastapi': 'fastapi',
  'fastpai': 'fastapi',
  'golan': 'golang',
  'dockr': 'docker',
  'docke': 'docker',
  'kubernets': 'kubernetes',
  'k8s': 'kubernetes',
  'kubernete': 'kubernetes',
  'postgre': 'postgresql',
  'postgres': 'postgresql',
  'posgres': 'postgresql',
  'sql': 'sql',

  // Job titles & roles
  'enginer': 'engineer',
  'enginee': 'engineer',
  'engg': 'engineer',
  'engr': 'engineer',
  'enginr': 'engineer',
  'enigneer': 'engineer',
  'bakcend': 'backend',
  'backnd': 'backend',
  'backen': 'backend',
  'frntend': 'frontend',
  'fontend': 'frontend',
  'frontnd': 'frontend',
  'deveoper': 'developer',
  'devloper': 'developer',
  'devlopr': 'developer',
  'developper': 'developer',
  'dev': 'developer',
  'internshio': 'intern',
  'intrn': 'intern',
  'intren': 'intern',
  'anlyst': 'analyst',
  'analyzt': 'analyst',
  'scintist': 'scientist',
  'sientist': 'scientist',
  'associat': 'associate',
  'assciate': 'associate',
  'managr': 'manager',
  'manger': 'manager',
  'fresher': 'fresher',
  'freshers': 'fresher',
  'frsher': 'fresher',

  // Acronyms
  'sde': 'software development engineer',
  'swe': 'software engineer',
  'ml': 'machine learning',
  'ai': 'artificial intelligence',
  'ds': 'data science',
  'genai': 'generative ai',
  'llm': 'large language model',
  'qa': 'quality assurance',
  'sre': 'site reliability engineer',

  // Locations (India & Global)
  'bengalore': 'bengaluru',
  'bangalore': 'bengaluru',
  'banglore': 'bengaluru',
  'bnglr': 'bengaluru',
  'blr': 'bengaluru',
  'mumbi': 'mumbai',
  'bombay': 'mumbai',
  'hyderabd': 'hyderabad',
  'hyd': 'hyderabad',
  'delh': 'delhi',
  'noid': 'noida',
  'gurgaon': 'gurugram',
  'gurugrm': 'gurugram',
  'ggn': 'gurugram',
  'pune': 'pune',
  'channai': 'chennai',
  'madras': 'chennai',
  'remot': 'remote',
  'remte': 'remote',
  'hybird': 'hybrid',

  // Companies
  'barclay': 'barclays',
  'barclayss': 'barclays',
  'goldmn': 'goldman',
  'goldman sachs': 'goldman sachs',
  'gs': 'goldman sachs',
  'moleculst': 'moleculyst',
  'moleculyzt': 'moleculyst',
  'hackerank': 'hackerrank',
  'hckrrank': 'hackerrank',
  'musigma': 'mu sigma',
  'zomto': 'zomato',
  'blnkit': 'blinkit',
  'rubric': 'rubrik',
  'qualcom': 'qualcomm',
  'atlassn': 'atlassian',
  'amzn': 'amazon',
  'msft': 'microsoft',
  'goog': 'google',
  'jpmorgn': 'jpmorgan',
  'jpmc': 'jpmorgan chase',
}

/**
 * Standard Levenshtein Distance for typo detection
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculates a match score between a search token and target text (0 to 1).
 * Supports exact substring, word boundary, prefix, typo distance, and acronyms.
 */
export function matchTokenAgainstText(token: string, targetText: string): number {
  if (!token || !targetText) return 0
  const cleanTarget = targetText.toLowerCase()
  const cleanToken = token.toLowerCase().trim()

  // 1. Exact substring match
  if (cleanTarget.includes(cleanToken)) {
    // If it's a word boundary match, give higher weight
    const regex = new RegExp(`\\b${escapeRegExp(cleanToken)}`, 'i')
    return regex.test(cleanTarget) ? 1.0 : 0.85
  }

  // 2. Check known typo map
  const normalized = TYPO_MAP[cleanToken]
  if (normalized && cleanTarget.includes(normalized)) {
    return 0.95
  }

  // 3. Word-by-word fuzzy comparison with Levenshtein distance
  const targetWords = cleanTarget.split(/[\s,.\-_/()]+/).filter(w => w.length >= 2)
  const tokenLen = cleanToken.length

  let maxWordScore = 0

  for (const word of targetWords) {
    // If token is prefix of word (e.g. "pyth" in "python")
    if (word.startsWith(cleanToken) && tokenLen >= 3) {
      return 0.88
    }

    // Levenshtein threshold based on word length
    const maxAllowedDist = tokenLen <= 4 ? 1 : tokenLen <= 8 ? 2 : 3
    const dist = levenshteinDistance(cleanToken, word)

    if (dist <= maxAllowedDist) {
      const similarity = 1 - (dist / Math.max(tokenLen, word.length))
      if (similarity > maxWordScore) {
        maxWordScore = similarity
      }
    }
  }

  return maxWordScore >= 0.65 ? maxWordScore * 0.8 : 0
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface FuzzySearchResult<T> {
  item: T
  score: number
  matchedFields: string[]
}

/**
 * Filters and ranks any collection of items against a search query with typo tolerance.
 * @param items The items to filter (e.g. jobs, companies)
 * @param query The user's search string (e.g. "pythn bakcend enginer")
 * @param getFields Function that returns searchable text fields for an item
 * @param minScore Minimum score threshold to consider a match (0 to 1, default 0.45)
 */
export function intelligentFuzzySearch<T>(
  items: T[],
  query: string,
  getFields: (item: T) => { [fieldName: string]: string | string[] | undefined | null },
  minScore = 0.4
): { results: T[]; correctedQuery?: string } {
  const cleanQ = query.trim().toLowerCase()
  if (!cleanQ) return { results: items }

  // Extract individual tokens from user query
  const tokens = cleanQ.split(/\s+/).filter(Boolean)

  // Check if any token had a known typo correction
  const correctedTokens = tokens.map(t => TYPO_MAP[t] || t)
  const didCorrect = correctedTokens.some((t, i) => t !== tokens[i])
  const correctedQuery = didCorrect ? correctedTokens.join(' ') : undefined

  const scoredItems: { item: T; totalScore: number }[] = []

  for (const item of items) {
    const fields = getFields(item)
    let itemScore = 0
    let allTokensMatched = true

    // Every token in the query must match at least one field on the item
    for (const token of tokens) {
      let bestTokenScore = 0

      for (const fieldName in fields) {
        const rawValue = fields[fieldName]
        if (!rawValue) continue

        const valString = Array.isArray(rawValue) ? rawValue.join(' ') : String(rawValue)
        const score = matchTokenAgainstText(token, valString)

        // Give extra weight to title and company matches
        let weight = 1.0
        if (fieldName === 'role_title' || fieldName === 'name') weight = 1.4
        else if (fieldName === 'company') weight = 1.3
        else if (fieldName === 'required_skills' || fieldName === 'industry') weight = 1.1

        const weighted = score * weight
        if (weighted > bestTokenScore) {
          bestTokenScore = weighted
        }
      }

      if (bestTokenScore < minScore) {
        allTokensMatched = false
        break
      }

      itemScore += bestTokenScore
    }

    if (allTokensMatched && itemScore > 0) {
      scoredItems.push({ item, totalScore: itemScore })
    }
  }

  // Sort by highest score first
  scoredItems.sort((a, b) => b.totalScore - a.totalScore)

  return {
    results: scoredItems.map(si => si.item),
    correctedQuery
  }
}
