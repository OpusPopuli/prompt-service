/**
 * Seed script for AI prompt templates.
 *
 * Upserts all prompt templates and creates initial version history entries.
 * Safe to run multiple times — uses name as unique key.
 *
 * Usage:
 *   pnpm db:seed
 */

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
      'Generate a claim-tagged biography for a legislator, drawing on authoritative source data plus high-confidence training knowledge',
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
  (a) the fact adds material civic value (office held, legislation, public
      record of activity, professional background),
  (b) you have high confidence the fact is accurate, and
  (c) the fact does not conflict with source data.

Do not use training knowledge for:
  - Current committee assignments, chairmanships, or leadership positions
    (these change each session and your training data is stale)
  - Specific bill numbers or bill status
  - Current term dates or election results after your training cutoff
  - Dollar figures for budgets overseen
  - Personal details (family, residence, pets) not in source data
  - Any fact about a representative you do not clearly recognize

If you do not clearly recognize the representative, use only source data.
Uncertainty is not a reason to guess; it is a reason to omit.

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
STRUCTURE — FIVE PARAGRAPHS IN ORDER
═══════════════════════════════════════════════════════════════

Omit any paragraph for which information is insufficient.

1. IDENTITY & MANDATE — name, party-city, chamber, district, geography,
   election history, term end.
2. POWER & RESPONSIBILITIES — chairmanships, memberships, external
   appointments, caucus leadership. [SOURCE DATA ONLY — do not supplement
   from training knowledge; committee rosters change each session.]
3. PRIORITIES & RECORD — focus areas, bills by number and short title,
   caucus memberships, policy-related recognitions.
4. BACKGROUND & QUALIFICATIONS — prior profession, tenure, degrees,
   institutions, credentials, languages.
5. CIVIC & COMMUNITY ROOTS — prior offices with dates, community roles,
   founding roles. Closing sentence of residence/family context only if in
   source data.

Target 250-400 words. No paragraph over 100 words. Use surname after first
full-name introduction. Present tense for current roles, past tense for
prior roles.

═══════════════════════════════════════════════════════════════
SELF-CHECK BEFORE OUTPUT
═══════════════════════════════════════════════════════════════

  □ Every sentence is either from source data or from high-confidence
    training knowledge.
  □ No current committee/bill facts are drawn from training knowledge.
  □ No forbidden words appear.
  □ No causal or motivational language.
  □ No characterizations of the person.

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return a single JSON object, and nothing else:

{
  "bio": "Five paragraphs separated by \\n\\n",
  "wordCount": <integer>,
  "claims": [
    {
      "sentence": "Verbatim sentence from the bio.",
      "origin": "source" | "training",
      "sourceField": "dot.path.in.source_data or null",
      "confidence": "high" | "medium"
    }
  ]
}

Every sentence in the bio must appear as one entry in claims. No markdown
fences. No commentary outside the JSON.`,
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