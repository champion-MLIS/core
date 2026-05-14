/**
 * pco:forms — discover Champion's PCO forms.
 *
 * Lists every form in PCO People with its id, name, status, and submission
 * count. The signal classifier (src/intake/signal-classifier.ts) auto-detects
 * connect cards and prayer requests by name; if your form is named something
 * unusual, the IDs printed here are what you'd paste into .env to override.
 *
 * Usage:
 *   npm run pco:forms              # active forms only
 *   npm run pco:forms -- --all     # include archived/inactive
 *   npm run pco:forms -- --json    # JSON output
 */

import { loadEnv } from '../config/env.ts';
import { PcoClient, PcoError } from '../pco/client.ts';
import { listForms, type PcoForm } from '../pco/forms.ts';
import { classifyForm } from '../intake/signal-classifier.ts';

interface CliArgs {
  all: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let all = false;
  let json = false;
  for (const arg of argv) {
    if (arg === '--all') all = true;
    else if (arg === '--json') json = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return { all, json };
}

function printHelp(): void {
  console.log(`pco:forms — list PCO forms with submission counts and auto-classification

Usage:
  npm run pco:forms             # active forms
  npm run pco:forms -- --all    # include archived
  npm run pco:forms -- --json   # JSON to stdout

For each form the auto-classifier prints what trigger signal kind it would
generate (connect_card | prayer_request | none). Override in .env if wrong:
  PCO_CONNECT_CARD_FORM_IDS=12345,67890
  PCO_PRAYER_REQUEST_FORM_IDS=11111`);
}

interface FormRow {
  pco_id: string;
  name: string;
  active: boolean;
  archived: boolean;
  submission_count: number | null;
  classified_as: string;
  public_url: string | null;
}

function summarize(form: PcoForm): FormRow {
  const attrs = form.attributes;
  const name = typeof attrs.name === 'string' ? attrs.name : '(unnamed)';
  return {
    pco_id: form.id,
    name,
    active: attrs.active !== false,
    archived: Boolean(attrs.archived || attrs.archived_at),
    submission_count: typeof attrs.submission_count === 'number' ? attrs.submission_count : null,
    classified_as: classifyForm(form.id, name),
    public_url: typeof attrs.public_url === 'string' ? attrs.public_url : null,
  };
}

function printHumanReadable(rows: FormRow[]): void {
  if (rows.length === 0) {
    console.log('No forms found.');
    return;
  }
  console.log(`Found ${rows.length} form(s):\n`);
  for (const r of rows) {
    const submissions = r.submission_count ?? '?';
    const status = r.archived ? '[archived]' : r.active ? '' : '[inactive]';
    const tag = r.classified_as === 'none' ? '' : `  → ${r.classified_as}`;
    console.log(`  ${r.pco_id.padEnd(10)}  ${r.name}  ${status}${tag}`);
    console.log(`              submissions: ${submissions}`);
    if (r.public_url) console.log(`              public URL: ${r.public_url}`);
    console.log('');
  }
  console.log('To override auto-classification, add to .env:');
  console.log('  PCO_CONNECT_CARD_FORM_IDS=<comma-separated ids>');
  console.log('  PCO_PRAYER_REQUEST_FORM_IDS=<comma-separated ids>');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const client = new PcoClient({ appId: env.PCO_APP_ID, secret: env.PCO_SECRET });

  const { forms } = await listForms(client, {
    activeOnly: !args.all,
    perPage: 100,
  });

  const rows = forms.map(summarize);

  if (args.json) {
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
  } else {
    printHumanReadable(rows);
  }
}

main().catch((err: unknown) => {
  if (err instanceof PcoError) {
    console.error(`\nPCO request failed: ${err.message}`);
    if (err.status === 401) console.error('  → Check PCO_APP_ID and PCO_SECRET in .env.');
    if (err.status === 403)
      console.error('  → The PCO Personal Access Token does not have Forms access. Check token scopes.');
    if (err.body) {
      console.error('  → Body:', typeof err.body === 'string' ? err.body : JSON.stringify(err.body));
    }
  } else if (err instanceof Error) {
    console.error(`\n${err.message}`);
  } else {
    console.error('\nUnknown error:', err);
  }
  process.exit(1);
});
