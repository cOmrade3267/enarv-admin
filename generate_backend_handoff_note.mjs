import fs from 'fs/promises';

function parseTsvLine(line) {
  const cols = line.split('\t');
  return {
    method: cols[0] || '',
    path: cols[1] || '',
    status: cols[2] || '',
    pathParams: cols[3] || '{}',
    queryParams: cols[4] || '{}',
    bodySent: cols[5] || 'null',
    backendMessage: cols[6] || '',
    classification: cols[7] || '',
    why: cols[8] || '',
  };
}

function key(row) {
  return `- \`${row.method} ${row.path}\` -> ${row.status} | ${row.backendMessage}`;
}

async function main() {
  const raw = await fs.readFile('api_backend_actionable_issues.tsv', 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length <= 1) {
    throw new Error('No actionable rows found in api_backend_actionable_issues.tsv');
  }

  const rows = lines.slice(1).map(parseTsvLine);
  const routeMissing = rows.filter((r) => r.classification === 'Route not implemented');
  const validation = rows.filter((r) => r.classification === 'Validation/input issue');
  const permission = rows.filter((r) => r.classification === 'Auth/permission issue');
  const server = rows.filter(
    (r) => r.classification === 'Backend internal/server issue' || r.classification === 'Client timeout/network',
  );
  const other = rows.filter(
    (r) =>
      !['Route not implemented', 'Validation/input issue', 'Auth/permission issue', 'Backend internal/server issue', 'Client timeout/network'].includes(
        r.classification,
      ),
  );

  const doc = [
    '# Backend API Handoff Note',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Total actionable issues: ${rows.length}`,
    '',
    '## Route Missing',
    `Count: ${routeMissing.length}`,
    ...routeMissing.map(key),
    '',
    '## Validation Schema Mismatch',
    `Count: ${validation.length}`,
    ...validation.map(key),
    '',
    '## Permission Issue',
    `Count: ${permission.length}`,
    ...permission.map(key),
    '',
    '## Internal Server Error / Timeout',
    `Count: ${server.length}`,
    ...server.map(key),
    '',
    '## Other',
    `Count: ${other.length}`,
    ...other.map(key),
    '',
    '## Notes',
    '- Source file: `api_backend_actionable_issues.tsv`',
    '- All entries include params/body in source TSV for deeper debugging.',
    '',
  ].join('\n');

  await fs.writeFile('backend_handoff_note.md', doc);
  console.log('Generated backend_handoff_note.md');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
