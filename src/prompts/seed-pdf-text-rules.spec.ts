import { prompts } from '../../prisma/seed';

/**
 * `pdf-text-rules` moved here from opuspopuli's `PdfExtractHandler`
 * (opuspopuli#1414). The move must not change one byte of what the model is
 * sent, so this spec keeps the handler's inline builder, VERBATIM, as the
 * legacy reference, and renders the seeded templates the way
 * `@opuspopuli/prompt-client`'s `composePdfTextRules` does:
 *
 *   - fields template `pdf-text-rules-fields-<dataType>`, falling back to
 *     `pdf-text-rules-fields-default`, with `DATA_TYPE` interpolated into it
 *   - `HINTS_SECTION` = "## Hints\n" + "- hint" lines + "\n\n", or "" with none
 *   - one regex pass over `{{UPPER_SNAKE}}` placeholders (no re-expansion)
 *
 * If either side changes, the matching side here must change with it, and
 * the diff is the review: a deliberate prompt revision bumps `version`.
 */

interface LegacySource {
  contentGoal: string;
  dataType: string;
  hints?: string[];
}

// ---- legacy reference: copied from pdf-extract.handler.ts at 64e91e1f ----
/**
 * Build the AI prompt for text extraction rule generation.
 */
function legacyPrompt(source: LegacySource, text: string): string {
  const hintsSection = source.hints?.length
    ? '## Hints\n' + source.hints.map((h) => '- ' + h).join('\n') + '\n\n'
    : '';

  return `You are a data extraction specialist. Analyze the following PDF text content and produce JSON extraction rules.

## Goal
${source.contentGoal}

## Data type
${source.dataType}

${hintsSection}## Instructions
Produce a JSON object with these fields:
- "itemDelimiter": A regex pattern that separates individual items/records in the text
- "fieldMappings": An array of field extraction rules, each with:
  - "fieldName": The domain model field name (e.g., "title", "scheduledAt", "externalId", "location")
  - "pattern": A regex pattern with capture groups to extract the value from each item block
  - "captureGroup": Which capture group contains the value (default: 1)
  - "required": Whether this field must be present (true/false)
  - "defaultValue": Optional default if pattern doesn't match
- "dataSectionStart": Optional regex to find where the actual data begins (skip headers/preamble)
- "dataSectionEnd": Optional regex to find where the data ends
- "skipLines": Number of lines to skip from the top
- "analysisNotes": Brief notes about the text structure

Required fields for "${source.dataType}":
${legacyRequiredFields(source.dataType)}

Respond with ONLY valid JSON, no markdown fences or explanation.

## PDF Text Content
${text}`;
}

/**
 * Get required fields for a data type.
 */
function legacyRequiredFields(dataType: string): string {
  switch (dataType) {
    case 'meetings':
      return "- externalId (unique identifier)\n- title (committee/meeting name)\n- scheduledAt (date and time)\n- body (e.g., 'Senate', 'Assembly')\n- location (room/address, optional)";
    case 'propositions':
      return '- externalId (bill/measure ID)\n- title\n- status (optional)';
    case 'representatives':
      return '- externalId\n- name\n- chamber\n- district\n- party';
    default:
      return '- externalId\n- relevant fields for ' + dataType;
  }
}
// ---- end legacy reference ----

const byName = (name: string) => prompts.find((p) => p.name === name);

const interpolate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, name: string) =>
    name in vars ? vars[name] : match,
  );

function composed(source: LegacySource, text: string): string {
  const main = byName('pdf-text-rules');
  const fields =
    byName(`pdf-text-rules-fields-${source.dataType}`) ??
    byName('pdf-text-rules-fields-default');
  if (!main || !fields) throw new Error('pdf-text-rules templates not seeded');
  const hintsSection = source.hints?.length
    ? '## Hints\n' + source.hints.map((h) => '- ' + h).join('\n') + '\n\n'
    : '';
  return interpolate(main.templateText, {
    CONTENT_GOAL: source.contentGoal,
    DATA_TYPE: source.dataType,
    HINTS_SECTION: hintsSection,
    REQUIRED_FIELDS: interpolate(fields.templateText, {
      DATA_TYPE: source.dataType,
    }),
    TEXT: text,
  });
}

const TEXT = [
  'MONDAY, OCTOBER 26, 2026',
  'COMMITTEE ON APPROPRIATIONS  10 a.m.  Room 2100',
  // A PDF that happens to contain placeholder syntax must stay literal.
  'Agenda item {{HINTS_SECTION}} as printed',
].join('\n');

describe('pdf-text-rules is byte-identical to the inline builder it replaces (opuspopuli#1414)', () => {
  const cases: [string, LegacySource][] = [
    [
      'meetings',
      { contentGoal: 'Extract committee hearings', dataType: 'meetings' },
    ],
    [
      'propositions',
      { contentGoal: 'Extract measures', dataType: 'propositions' },
    ],
    [
      'representatives',
      { contentGoal: 'Extract members', dataType: 'representatives' },
    ],
    [
      'an unlisted type (default fields)',
      { contentGoal: 'Extract filings', dataType: 'lobbying' },
    ],
    [
      'meetings with hints',
      {
        contentGoal: 'Extract committee hearings',
        dataType: 'meetings',
        hints: ['Each day starts with a weekday heading', 'Times are Pacific'],
      },
    ],
  ];

  it.each(cases)('%s', (_label, source) => {
    expect(composed(source, TEXT)).toBe(legacyPrompt(source, TEXT));
  });

  it('declares exactly the variables its text uses', () => {
    for (const p of prompts.filter((t) =>
      t.name.startsWith('pdf-text-rules'),
    )) {
      const used = [
        ...new Set(
          [...p.templateText.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map(
            (m) => m[1],
          ),
        ),
      ].sort();
      expect({ name: p.name, variables: [...p.variables].sort() }).toEqual({
        name: p.name,
        variables: used,
      });
    }
  });
});
