/**
 * Seed script for AI prompt templates.
 *
 * Upserts all prompt templates and creates initial version history entries.
 * Safe to run multiple times — uses name as unique key.
 *
 * Usage:
 *   pnpm db:seed
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

interface PromptSeed {
  name: string;
  category: 'structural_analysis' | 'document_analysis' | 'rag';
  description: string;
  templateText: string;
  variables: string[];
}

const prompts: PromptSeed[] = [
  // ============================================
  // STRUCTURAL ANALYSIS (scraping pipeline)
  // ============================================
  {
    name: 'structural-analysis',
    category: 'structural_analysis',
    description: 'Base structural analysis template for web scraping',
    variables: [
      'DATA_TYPE',
      'CONTENT_GOAL',
      'HINTS_SECTION',
      'SCHEMA_DESCRIPTION',
      'HTML',
    ],
    templateText: `You are a web scraping expert. Analyze the following HTML and produce extraction rules as JSON.

## Task
Given the HTML from a web page, derive CSS selectors and extraction rules to extract {{DATA_TYPE}} data.

## Content Goal
{{CONTENT_GOAL}}

{{HINTS_SECTION}}

## Target Schema
The extracted data must conform to this structure:
{{SCHEMA_DESCRIPTION}}

## Required Output Format
Respond with ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "containerSelector": "CSS selector for the element containing all items",
  "itemSelector": "CSS selector for each individual item (relative to container)",
  "fieldMappings": [
    {
      "fieldName": "the target field name (use dot notation for nested: 'contactInfo.email')",
      "selector": "CSS selector relative to the item (or container if scope is 'container')",
      "extractionMethod": "text|attribute|html|regex|structured",
      "attribute": "only if extractionMethod is 'attribute'",
      "regexPattern": "only if extractionMethod is 'regex'",
      "regexGroup": 1,
      "transform": { "type": "transform_type", "params": {} },
      "required": true,
      "defaultValue": "fallback if empty",
      "scope": "item|container (default: item — use 'container' when the data is in a sibling/parent of items, not inside each item)",
      "children": { "childField": "CSS selector for child" }
    }
  ],
  "pagination": { "type": "none", "maxPages": 1 },
  "preprocessing": [],
  "analysisNotes": "Brief notes about the page structure"
}

## Rules
1. Use the MOST SPECIFIC CSS selectors available (prefer classes over tag names)
2. Field selectors are RELATIVE to each item element
3. Required fields MUST have selectors that match elements in the HTML
4. Use "regex" extractionMethod when text needs pattern extraction
5. Use transforms for date parsing, name formatting, URL resolution
6. If the page has multiple formats (e.g., table AND heading-based), choose the PRIMARY format
7. The containerSelector should match exactly ONE element
8. The itemSelector should match MULTIPLE elements within the container
9. Use "scope": "container" when a field's data lives OUTSIDE the item elements (e.g., a heading above the items that applies to all of them). The selector is then relative to the container, not the item.
10. Use "extractionMethod": "structured" with a "children" object when a field is an ARRAY of nested objects (e.g., multiple offices per representative, multiple committees per member). The "selector" matches each repeating child element inside the item, and "children" maps each sub-field name to its CSS selector relative to the repeating element. Example:
    {
      "fieldName": "contactInfo.offices",
      "selector": ".member__office",
      "extractionMethod": "structured",
      "children": {
        "name": ".office-title",
        "address": ".address",
        "phone": ".phone"
      },
      "required": false
    }
    Child selectors support:
    - Standard CSS selectors (e.g., "h3", ".class")
    - "|attr:attrName" suffix to extract an attribute (e.g., "a|attr:href")
    - "_text" special value: grabs the full text content of the repeating element
    - "_regex:PATTERN" special value: extracts via regex from element text (e.g., "_regex:Phone:\\s*([\\d()\\s-]+)")

## HTML to Analyze
\`\`\`html
{{HTML}}
\`\`\``,
  },

  {
    name: 'structural-schema-propositions',
    category: 'structural_analysis',
    description: 'Schema description for proposition/ballot measure data',
    variables: [],
    templateText: `Each proposition/ballot measure has:
- externalId (required): Unique measure identifier (e.g., "ACA-13", "SB-42", "PROP-36")
- title (required): Measure title or description
- summary (optional): Longer summary or full description text
- status (optional): Current status (default: "pending")
- electionDate (optional): Date of the election (use date_parse transform)
- sourceUrl (optional): URL to source document or PDF`,
  },

  {
    name: 'structural-schema-meetings',
    category: 'structural_analysis',
    description: 'Schema description for meeting/hearing data',
    variables: [],
    templateText: `Each meeting/hearing has:
- externalId (required): Unique meeting identifier
- title (required): Committee name or meeting title
- body (optional): Legislative body (e.g., "Assembly", "Senate")
- scheduledAt (required): Date and time of the meeting (use date_parse transform)
- location (optional): Physical location
- agendaUrl (optional): URL to the meeting agenda`,
  },

  {
    name: 'structural-schema-representatives',
    category: 'structural_analysis',
    description: 'Schema description for representative/legislator data',
    variables: [],
    templateText: `Each representative/legislator has:
- externalId (required): Unique identifier (e.g., "ca-assembly-30")
- name (required): Full name of the representative (use name_format transform if "Last, First")
- chamber (optional): Legislative chamber (e.g., "Assembly", "Senate")
- district (required): District identifier (e.g., "District 30")
- party (required): Political party (Democratic, Republican, Independent)
- photoUrl (optional): URL to profile photo (attribute extraction on img src)
- contactInfo.website (optional): Profile page URL (attribute extraction on anchor href)`,
  },

  {
    name: 'structural-schema-default',
    category: 'structural_analysis',
    description: 'Default schema description for unknown data types',
    variables: [],
    templateText: `Extract all relevant structured data fields from each item.`,
  },

  // ============================================
  // DOCUMENT ANALYSIS (documents service)
  // ============================================
  {
    name: 'document-analysis-base-instructions',
    category: 'document_analysis',
    description:
      'Shared base instructions appended to all document analysis prompts',
    variables: [],
    templateText: `Respond with valid JSON only. No markdown, no explanations.`,
  },

  {
    name: 'document-analysis-generic',
    category: 'document_analysis',
    description: 'Generic document analysis prompt',
    variables: ['TEXT'],
    templateText: `Analyze this document and extract key information.

DOCUMENT:
{{TEXT}}

Respond with JSON:
{
  "summary": "2-3 sentence summary",
  "keyPoints": ["Key point 1", "Key point 2"],
  "entities": ["Person/org/place mentioned"]
}`,
  },

  {
    name: 'document-analysis-petition',
    category: 'document_analysis',
    description: 'Petition document analysis prompt',
    variables: ['TEXT'],
    templateText: `You are a nonpartisan civic analyst. Analyze this petition.

PETITION:
{{TEXT}}

Respond with JSON:
{
  "summary": "2-3 sentence summary",
  "keyPoints": ["Key point 1", "Key point 2"],
  "entities": ["Sponsors, officials, organizations mentioned"],
  "actualEffect": "What this would actually do if passed",
  "potentialConcerns": ["Concern 1", "Concern 2"],
  "beneficiaries": ["Who benefits"],
  "potentiallyHarmed": ["Who might be negatively affected"],
  "relatedMeasures": ["Related ballot measures or 'None identified'"]
}`,
  },

  {
    name: 'document-analysis-representative-bio',
    category: 'document_analysis',
    description:
      'Generate a claim-tagged biography for a legislator with durable biographical facts (education, pre-politics career, community roles, widely-reported personal). Omits committee/bill details — those have a separate summary.',
    variables: ['TEXT'],
    templateText: `You are a civic data writer for Opus Populi. You generate biographies of
elected representatives using authoritative source data supplemented by
your general knowledge. Your output must be verifiable and neutral, with
every claim explicitly tagged by its origin.

<source_data>
{{TEXT}}
</source_data>

═══════════════════════════════════════════════════════════════
KNOWLEDGE TIERS
═══════════════════════════════════════════════════════════════

You may draw on two knowledge sources, in strict priority order:

TIER 1 — SOURCE DATA (authoritative)
The structured data provided in <source_data>. This is ground truth. If
source data contradicts your training knowledge, source data wins. Always.

TIER 2 — TRAINING KNOWLEDGE (supplementary)
Facts you know from training that are not in the source data. Use only
when:
  (a) the fact is DURABLE — it was true at the time of your training and
      is unlikely to have changed since (education, pre-politics career,
      community and nonprofit roles, founding dates, degrees and
      credentials, personal details widely reported in public profiles),
  (b) you have high confidence the fact is accurate, and
  (c) the fact does not conflict with source data.

Prefer training knowledge for:
  - Educational background (degrees, institutions, years if known)
  - Career before elected office (profession, employer, years, roles)
  - Community/nonprofit service, founding or board roles
  - Widely-reported personal details (spouse, residence city, children)
    that appear in public profiles — not speculative details
  - Long-held public positions or well-documented personal history
  - Prior elected offices with dates
  - Election history for THIS seat: first year elected to the current
    chamber, total years served in the current seat. Derive duration
    as (current year − first election year) if both are known.
  - Current term end date / next scheduled reelection. Treat these as
    "as of your training cutoff" — if the representative has been
    reelected since, the date still falls at an expected 2- or 4-year
    cadence and is usually correct; but flag any election-date claim
    with sourceHint like "as of training cutoff — verify current term".

Do NOT use training knowledge for (these age badly or are handled
elsewhere):
  - Current committee assignments, chairmanships, or leadership positions
    (covered by the separate committee-summary; also rosters change each
    session)
  - Specific bill numbers, bill status, or votes
  - Vote counts or campaign-finance figures
  - Dollar figures for budgets overseen
  - Recent statements, media appearances, or news-cycle events
  - Any fact about a representative you do not clearly recognize

If you do not clearly recognize the representative, use only source data.
Uncertainty is not a reason to guess; it is a reason to omit.

═══════════════════════════════════════════════════════════════
JURISDICTION MATCHING — MANDATORY
═══════════════════════════════════════════════════════════════

The Jurisdiction field in source_data identifies the SPECIFIC chamber
in a SPECIFIC state (e.g., "California State Assembly"). Before using
ANY training-knowledge fact:

1. Verify your recalled facts are about the SAME person serving in the
   SAME jurisdiction given in source_data. A same-named person in a
   different state is NOT the same person.
2. If you cannot confidently match Name + Jurisdiction + District to
   a specific real individual, drop all training-knowledge facts for
   that rep. Produce a minimal source-only bio instead.
3. Never substitute the source_data's state/chamber with a different
   one. The bio must never refer to a state or chamber not in the
   Jurisdiction field.

A short, accurate source-only bio is strictly better than a longer bio
padded with facts about the wrong person.

═══════════════════════════════════════════════════════════════
FACTUALITY RULES — NON-NEGOTIABLE
═══════════════════════════════════════════════════════════════

RULE 1: NO INFERENCE OR CHARACTERIZATION
Restate facts. Do not characterize, summarize, or interpret them.
  - "teacher for 20 years" → do not write "veteran educator"
  - "chairs Health Subcommittee" → do not write "healthcare expert"
  - three environmental bills listed → do not write "environmental leader"
  - "Democrat" → do not write "progressive" or "moderate"
  - "first Democrat since 1947" → do not write "historic victory"

RULE 2: NO EVALUATIVE LANGUAGE
Forbidden regardless of context:
  - Achievement: tireless, dedicated, devoted, passionate, committed,
    fierce, strong, effective, accomplished, distinguished, respected, proven
  - Advocacy: champion, fighter, advocate, defender, warrior, voice, ally
  - Direction: progressive, conservative, moderate, liberal, right-wing,
    left-wing, radical, mainstream (exception: official caucus/party names)
  - Quality: notable, significant, important, key, leading, prominent,
    renowned, acclaimed, celebrated
  - Emotional: proud, honored, humbled
  - Editorial transitions: notably, importantly, of note, it is worth noting,
    it should be mentioned, remarkably

Use neutral verbs: represents, chairs, serves, introduced, voted, graduated,
worked, holds, was elected, was appointed, co-founded.

RULE 3: NO MOTIVATION ATTRIBUTION
Report actions, not reasons.
  - Forbidden: "Motivated by her teaching background, she..."
  - Allowed: "After teaching for 20 years, she was elected..."

RULE 4: MISSING DATA
If neither source data nor reliable training knowledge supports a claim,
omit the corresponding sentence. Do not guess. Do not pad.

RULE 5: CONFLICTS
Source data always wins over training knowledge. If your training data says
something different than source data, use source data and discard the
training fact silently.

RULE 6: NO QUOTATION
Do not quote source material. Proper nouns, official titles, bill numbers,
and organization names are used directly and are not quotations.

═══════════════════════════════════════════════════════════════
STRUCTURE — FOUR PARAGRAPHS IN ORDER
═══════════════════════════════════════════════════════════════

Omit any paragraph for which information is insufficient. Do NOT include
committee assignments, bill numbers, or current legislative activity —
those are rendered separately on the page and will duplicate the bio.

1. IDENTITY & MANDATE — name, party affiliation, jurisdiction (state +
   chamber exactly as given), district, geography. Include election
   tenure when known: year first elected to this seat, total years
   served, current term end or next scheduled reelection.
2. BACKGROUND & QUALIFICATIONS — degrees, institutions, languages,
   professional credentials. Pre-politics profession, employer(s), and
   years of experience. Draw freely from training knowledge for
   well-known figures.
3. CIVIC & COMMUNITY ROOTS — prior elected offices with dates, community
   service and nonprofit roles, founding or board positions, volunteer
   work, civic recognition.
4. PERSONAL CONTEXT — residence city, family (spouse, children) if
   widely reported in public profiles, languages spoken, notable personal
   history (military service, immigration story, etc.) — only if
   documented in source data or widely-reported public profiles.

Target 180-320 words. No paragraph over 90 words. Use surname after first
full-name introduction. Present tense for current roles, past tense for
prior roles.

═══════════════════════════════════════════════════════════════
SELF-CHECK BEFORE OUTPUT
═══════════════════════════════════════════════════════════════

  □ The bio refers ONLY to the jurisdiction in source_data (never a
    different state or chamber).
  □ Every training-knowledge fact was verified against Name +
    Jurisdiction + District; no facts about wrong-state namesakes.
  □ Every sentence is either from source data or from high-confidence
    training knowledge.
  □ No committee assignments, bill numbers, or current legislative
    activity appear in the bio (those render separately).
  □ No forbidden words appear.
  □ No causal or motivational language.
  □ No characterizations of the person.
  □ Every training-origin claim carries a sourceHint describing what
    kind of source the fact is drawn from.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return a single JSON object, and nothing else:

{
  "bio": "Four paragraphs separated by \\n\\n",
  "wordCount": <integer>,
  "claims": [
    {
      "sentence": "Verbatim sentence from the bio.",
      "origin": "source" | "training",
      "sourceField": "dot.path.in.source_data or null",
      "sourceHint": "short phrase describing the training source, e.g. 'official legislative bio', 'widely-reported press coverage', 'university alumni directory', or null for source-origin claims",
      "confidence": "high" | "medium"
    }
  ]
}

Every sentence in the bio must appear as one entry in claims. sourceHint
is REQUIRED for every claim with origin="training" and should be a short
phrase (under 60 chars) indicating the kind of source the fact came from
— this is a hint to readers about where to verify, not a URL and not a
direct citation. For origin="source" claims, set sourceHint to null (the
sourceField value already points to the authoritative location). Do not
invent URLs or citations. No markdown fences. No commentary outside the
JSON.`,
  },

  {
    name: 'document-analysis-representative-committees-summary',
    category: 'document_analysis',
    description:
      'Generate a one-to-two-sentence neutral summary of a legislator\'s committee assignments, strictly describing policy areas (never characterizing interests or priorities)',
    variables: ['TEXT'],
    templateText: `You are a civic data writer for Opus Populi. You write a neutral,
factual preamble describing the policy areas a legislator's committee
assignments touch — NOT what they care about, stand for, or prioritize.

<source_data>
{{TEXT}}
</source_data>

═══════════════════════════════════════════════════════════════
KNOWLEDGE SOURCE
═══════════════════════════════════════════════════════════════

Use ONLY the committee assignments listed in <source_data>. Do not
reference bills, voting record, party, background, or anything outside
the literal committee names given.

═══════════════════════════════════════════════════════════════
FACTUALITY RULES — NON-NEGOTIABLE
═══════════════════════════════════════════════════════════════

RULE 1: NO CHARACTERIZATION OF THE PERSON
Describe policy areas the ASSIGNMENTS touch. Never infer interest,
expertise, priorities, focus, or what the person "cares about".

  - Allowed: "Addis's assignments span budget, health, and disability
    policy, including chairing the Select Committee on Serving
    Students with Disabilities."
  - Forbidden: "Addis focuses on education and healthcare."
  - Forbidden: "Addis is a leader on disability issues."

RULE 2: NO EVALUATIVE OR AGENTIC LANGUAGE
Forbidden regardless of context: champion, advocate, focus, priority,
leader, expert, voice, passionate, effective, dedicated, tireless,
committed, strong, key, prominent, notable.

Also forbidden: progressive, conservative, moderate, liberal (exception:
if appearing as part of an official committee/caucus name in the data).

RULE 3: GROUND IN LITERAL COMMITTEE NAMES
Policy-area labels must be derivable from the committee names listed.
Group related committees (e.g., "Health" + "Reproductive Health" +
"Mental Health" → "health policy"). Do not invent areas.

RULE 4: MENTION CHAIRMANSHIPS
If the data includes one or more "chair" roles, name at least one
chairmanship explicitly (the full committee name).

RULE 5: BRIEF
One to two sentences. Maximum 60 words. Present tense. Use surname
(derived from the Name field in source_data); never "the
representative" or "they".

═══════════════════════════════════════════════════════════════
SELF-CHECK BEFORE OUTPUT
═══════════════════════════════════════════════════════════════

  □ Summary describes ASSIGNMENTS, not the person.
  □ No forbidden words appear.
  □ No inference about what the person cares about or prioritizes.
  □ Chairmanship named if any chair role is in the data.
  □ Policy areas derive from literal committee names.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return a single JSON object, and nothing else:

{
  "summary": "One to two sentences as specified above."
}

No markdown fences. No commentary outside the JSON.`,
  },

  {
    name: 'document-analysis-legislative-committee-description',
    category: 'document_analysis',
    description:
      "Generate a 2-3 sentence neutral, voter-friendly description of what a state legislative committee does, given its chamber and name. Output JSON: { description: string }.",
    variables: ['TEXT'],
    templateText: `You are a civic data writer for Opus Populi. You write a neutral,
factual description of what a state legislative committee does, aimed at
a voter who has never heard of the committee before.

<source_data>
{{TEXT}}
</source_data>

═══════════════════════════════════════════════════════════════
KNOWLEDGE SOURCE
═══════════════════════════════════════════════════════════════

You may rely on widely-known general knowledge about U.S. state
legislative committee functions and standard policy domains as they
are commonly understood (e.g., "Health" committees consider public
health policy and bills affecting healthcare delivery).

Do NOT speculate about the specific membership, current bills, recent
hearings, partisan composition, or political dynamics. Stick to the
generic, durable function the committee's name implies.

═══════════════════════════════════════════════════════════════
FACTUALITY RULES — NON-NEGOTIABLE
═══════════════════════════════════════════════════════════════

RULE 1: DESCRIBE THE COMMITTEE'S FUNCTION, NOT ITS POLITICS
Explain what kinds of bills the committee considers and what policy
area it covers. Do not characterize parties, agendas, controversies,
or whose interests it serves.

  - Allowed: "The Assembly Health Committee considers legislation
    affecting public health policy, healthcare delivery, and the
    licensure of health professionals in California."
  - Forbidden: "The committee, controlled by Democrats, advances
    progressive healthcare priorities."
  - Forbidden: "Critics argue the committee favors industry interests."

RULE 2: NO EVALUATIVE OR AGENTIC LANGUAGE
Forbidden regardless of context: champion, advocate, focus, priority,
leader, voice, passionate, effective, dedicated, tireless, committed,
strong, key, prominent, notable, controversial, powerful, influential.

Also forbidden: progressive, conservative, moderate, liberal.

RULE 3: BE BRIEF AND PLAIN
2 to 3 sentences. Maximum 70 words. Present tense. Plain language a
voter without legal or government background can follow. Avoid
parliamentary jargon ("germane," "referral," "lay over") unless the
committee's name itself uses such a term.

RULE 4: ANCHOR IN THE COMMITTEE NAME
The description must be derivable from the committee's literal name +
its chamber. If the name is highly generic (e.g., "Rules"), describe
the standard procedural function. If you genuinely cannot infer a
meaningful description from the name alone, return:

  { "description": null }

Do NOT make up specific bills, members, or activities to fill space.

═══════════════════════════════════════════════════════════════
SELF-CHECK BEFORE OUTPUT
═══════════════════════════════════════════════════════════════

  □ Describes the committee's FUNCTION, not its politics.
  □ No forbidden words appear.
  □ 2-3 sentences, ≤ 70 words, present tense, plain language.
  □ Description derives from the literal committee name + chamber.
  □ No invented members, bills, or hearings.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return a single JSON object, and nothing else:

{
  "description": "Two to three sentences as specified above, or null if the name is too generic to describe meaningfully."
}

No markdown fences. No commentary outside the JSON.`,
  },

  {
    name: 'document-analysis-proposition',
    category: 'document_analysis',
    description: 'Ballot proposition analysis prompt',
    variables: ['TEXT'],
    templateText: `You are a nonpartisan civic analyst. Analyze this ballot proposition.

PROPOSITION:
{{TEXT}}

Respond with JSON:
{
  "summary": "2-3 sentence summary of what this proposition does",
  "keyPoints": ["Key provision 1", "Key provision 2"],
  "entities": ["Sponsors, officials, organizations mentioned"],
  "actualEffect": "What this would actually change if passed",
  "potentialConcerns": ["Potential concern 1", "Potential concern 2"],
  "beneficiaries": ["Groups that would benefit"],
  "potentiallyHarmed": ["Groups that might be negatively affected"],
  "relatedMeasures": ["Related or conflicting measures"]
}`,
  },

  {
    name: 'document-analysis-proposition-analysis',
    category: 'document_analysis',
    description:
      'Structured civic analysis of a ballot proposition: plain-language summary, key provisions, fiscal impact, yes/no outcomes, existing-vs-proposed comparison, AI-segmented section anchors into the source text, and per-claim attribution with char-offset citations. Populates the Opus Populi proposition detail page layers 1/2/4.',
    variables: ['TEXT'],
    templateText: `You are a nonpartisan civic analyst for Opus Populi. You read the full
text of a ballot proposition and produce a structured analysis that helps
an ordinary voter understand what the measure does — in plain language,
without advocacy.

The <source_data> block is structured as:
  ExternalId: <measure id>
  Title: <measure title>

  FullText:
  <the verbatim measure text>

<source_data>
{{TEXT}}
</source_data>

═══════════════════════════════════════════════════════════════
KNOWLEDGE SOURCE — SOURCE TEXT ONLY
═══════════════════════════════════════════════════════════════

Every claim in your output must be supported by the FullText above. Do
NOT draw on news coverage, campaign-finance data, editorials, or your
training knowledge about how similar measures played out elsewhere. If
the FullText does not answer a question, leave the corresponding field
empty (""). An empty field is strictly better than a guess.

Exception: for "existingVsProposed.current" you MAY describe the current
state of the law when the measure itself recites what it is changing
(e.g., "Existing law requires X" preambles). If the measure does not
describe current law explicitly, leave current as "".

═══════════════════════════════════════════════════════════════
NEUTRALITY RULES — NON-NEGOTIABLE
═══════════════════════════════════════════════════════════════

RULE 1: NO ADVOCACY VOCABULARY
Forbidden regardless of context:
  - fair, unfair, reasonable, unreasonable
  - common-sense, sensible, prudent
  - burdensome, onerous, excessive, draconian
  - protect, safeguard, defend, threaten, attack
  - modernize, streamline, strengthen, weaken, gut
  - loophole, giveaway, handout
  - progressive, conservative, liberal, moderate (except in official
    party/caucus names)

Use neutral verbs: requires, prohibits, authorizes, creates, eliminates,
amends, allocates, establishes, increases, decreases, sets.

RULE 2: NO FRAMING THE VOTER'S CHOICE
Describe outcomes, not whether outcomes are good.
  - Forbidden: "A yes vote would wisely address…"
  - Forbidden: "A no vote would unfortunately leave in place…"
  - Allowed: "A yes vote would raise the tax from X to Y."

RULE 3: QUANTIFY WHEN THE SOURCE DOES
When the measure states specific numbers, dates, percentages, or dollar
figures, include them. Don't vague out concrete provisions into generic
language.

RULE 4: CITE EVERY DERIVED CLAIM
Every string you put in analysisSummary, keyProvisions, fiscalImpact,
yesOutcome, noOutcome, existingVsProposed.current, or
existingVsProposed.proposed MUST be traceable to a specific passage in
FullText. Emit a corresponding entry in analysisClaims with
\`sourceStart\`/\`sourceEnd\` pointing to the passage (character offsets
into the raw FullText, with \`sourceStart\` inclusive and \`sourceEnd\`
exclusive). If you cannot cite a passage, omit the claim.

═══════════════════════════════════════════════════════════════
SECTIONING (TABLE OF CONTENTS)
═══════════════════════════════════════════════════════════════

Divide the FullText into 2–8 meaningful sections using the measure's
own headings where they exist (e.g., "SECTION 1. Findings", "SEC. 2.",
"Legislative Counsel's Digest"). If there are no headings, infer
coherent sections by topic (findings/definitions, operative provisions,
appropriations, severability, etc.). Each section entry provides:
  - heading: short (≤ 60 chars) section label. **MUST be a verbatim
    substring of FullText** when the measure has its own headings —
    the consumer locates the section by string-matching the heading
    against FullText. If you invent a synthetic heading (no headings in
    source), it should still be evocative enough for the reader.
  - startOffset: inclusive char offset into FullText where the section
    begins. Best-effort — the consumer corrects offsets by heading match.
  - endOffset: exclusive char offset where the section ends.

Coverage rules — STRICT:
  1. Sections must NOT overlap.
  2. Sections must collectively cover the ENTIRE FullText with no gaps.
     The first section starts at offset 0. The last section ends at
     offset = length(FullText).
  3. Consecutive sections share a boundary: endOffset[i] MUST equal
     startOffset[i+1]. Off-by-one gaps drop characters from the rendered
     output.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return a single JSON object, and nothing else. No markdown fences. No
commentary outside the JSON. Every field below is required; use "" or
[] for fields the source does not support:

{
  "analysisSummary": "Two to three plain-language sentences (60-120 words). First sentence: what the measure does. Second sentence: the practical effect on voters / state operations. Optional third sentence: who is most affected or what changes from current practice. Neutral, non-advocacy.",
  "keyProvisions": [
    "This would raise the state gas tax by 3 cents per gallon.",
    "Proceeds are dedicated to public transit and road maintenance.",
    "The measure takes effect January 1 following passage."
  ],
  "fiscalImpact": "Estimated $X million per year in new revenue; costs $Y one-time for implementation. Exact figures from the text or \"\" if the measure does not quantify.",
  "yesOutcome": "A yes vote means [concrete change]: e.g., 'the state's minimum wage rises to $18/hour by 2030'.",
  "noOutcome": "A no vote means [status quo]: e.g., 'the current $16/hour minimum wage remains in effect'.",
  "existingVsProposed": {
    "current": "Describe the current state of the law if the measure recites it; otherwise \"\".",
    "proposed": "Describe what the measure changes current law to."
  },
  "analysisSections": [
    { "heading": "Findings and Declarations", "startOffset": 0, "endOffset": 1240 },
    { "heading": "Operative Provisions",      "startOffset": 1240, "endOffset": 5400 }
  ],
  "analysisClaims": [
    {
      "claim": "Raises the state gas tax by 3 cents per gallon.",
      "field": "keyProvisions",
      "sourceStart": 1432,
      "sourceEnd": 1587,
      "confidence": "high"
    }
  ]
}

Field values for "field" must be one of:
  "summary" | "keyProvisions" | "fiscalImpact" | "yesOutcome" |
  "noOutcome" | "existingCurrent" | "existingProposed"

Confidence values: "high" | "medium" | "low".

Self-check before output:
  □ Every required key is present.
  □ No forbidden words.
  □ Every non-empty analysis string has at least one backing entry in
    analysisClaims.
  □ Section offsets cover the FullText and do not overlap.
  □ Offsets are into the raw FullText only (not including the
    "ExternalId:"/"Title:" prefix lines above the FullText: block).`,
  },

  {
    name: 'document-analysis-contract',
    category: 'document_analysis',
    description: 'Contract document analysis prompt',
    variables: ['TEXT'],
    templateText: `Analyze this contract document.

CONTRACT:
{{TEXT}}

Respond with JSON:
{
  "summary": "Brief summary of the contract purpose",
  "keyPoints": ["Key term 1", "Key term 2"],
  "entities": ["Parties and stakeholders mentioned"],
  "parties": ["Party 1 name", "Party 2 name"],
  "obligations": ["Key obligation 1", "Key obligation 2"],
  "risks": ["Potential risk 1", "Potential risk 2"],
  "effectiveDate": "Contract effective date or 'Not specified'",
  "terminationClause": "Summary of termination terms or 'Not specified'"
}`,
  },

  {
    name: 'document-analysis-form',
    category: 'document_analysis',
    description: 'Form document analysis prompt',
    variables: ['TEXT'],
    templateText: `Analyze this form document.

FORM:
{{TEXT}}

Respond with JSON:
{
  "summary": "What this form is for",
  "keyPoints": ["Important instruction 1", "Important instruction 2"],
  "entities": ["Issuing organization, departments mentioned"],
  "requiredFields": ["Required field 1", "Required field 2"],
  "purpose": "The purpose of this form",
  "submissionDeadline": "Any deadline mentioned or 'Not specified'"
}`,
  },

  // ============================================
  // RAG (knowledge service)
  // ============================================
  {
    name: 'rag',
    category: 'rag',
    description: 'RAG answer generation prompt',
    variables: ['CONTEXT', 'QUERY'],
    templateText: `You are a helpful assistant that answers questions based only on the provided context.

Instructions:
- Answer the question using ONLY information from the context below
- Be concise and direct - avoid unnecessary repetition
- If listing items, list each item exactly once
- If the context doesn't contain enough information, say so
- Do not make up information not present in the context

Context:
{{CONTEXT}}

Question: {{QUERY}}

Answer:`,
  },
];

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function upsertVaultSecret(name: string, key: string, description: string) {
  try {
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM vault.decrypted_secrets WHERE name = ${name}
    `;
    if (existing.length === 0) {
      await prisma.$queryRaw`
        SELECT vault.create_secret(${key}, ${name}, ${description})
      `;
      console.log(`  ✓ Vault: ${name}`);
    } else {
      console.log(`  - Vault: ${name} (already exists)`);
    }
  } catch (error) {
    console.warn(`  ⚠ Vault: ${name} failed (${error})`);
  }
}

function parseRegionEntry(entry: string): { region: string; key: string } {
  const colonIdx = entry.indexOf(':');
  if (colonIdx === -1) return { region: 'unknown', key: entry };
  return { region: entry.slice(0, colonIdx), key: entry.slice(colonIdx + 1) };
}

async function seedVaultKeys() {
  console.log('\nSeeding Vault keys...');

  const apiKeys = process.env.API_KEYS ?? '';
  const regionEntries = apiKeys.split(',').map((e) => e.trim()).filter(Boolean);

  for (const entry of regionEntries) {
    const { region, key } = parseRegionEntry(entry);
    await upsertVaultSecret(`region_key_${region}`, key, `Region API key for ${region}`);
  }

  const adminKeys = process.env.ADMIN_API_KEYS ?? '';
  const adminEntries = adminKeys.split(',').map((k) => k.trim()).filter(Boolean);

  for (let i = 0; i < adminEntries.length; i++) {
    await upsertVaultSecret(`admin_key_${i + 1}`, adminEntries[i], `Admin API key ${i + 1}`);
  }
}

async function main() {
  console.log('Seeding prompt templates...');

  for (const { name, ...data } of prompts) {
    const template = await prisma.promptTemplate.upsert({
      where: { name },
      update: data,
      create: { name, ...data },
    });

    // Create version history entry if one doesn't exist for this version
    const existingHistory = await prisma.promptVersionHistory.findFirst({
      where: { templateId: template.id, version: template.version },
    });

    if (!existingHistory) {
      await prisma.promptVersionHistory.create({
        data: {
          templateId: template.id,
          version: template.version,
          templateText: template.templateText,
          templateHash: hash(template.templateText),
          changeNote: 'Initial seed',
        },
      });
    }

    console.log(`  ✓ ${name} (v${template.version})`);
  }

  console.log(`\nSeeded ${prompts.length} prompt templates.`);

  await seedVaultKeys();
}

main()
  .catch((e) => {
    console.error('Failed to seed prompts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });