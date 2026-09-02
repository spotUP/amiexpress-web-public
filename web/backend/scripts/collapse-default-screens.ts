#!/usr/bin/env tsx
/**
 * Give the seeded board template its shared node screen directory.
 *
 * Run by the Dockerfile against `/app/default-data` after the `Node<n>`
 * directories are copied in, so a fresh install comes up with one copy of
 * each node screen instead of forty-one. See services/seed-node-screens.ts
 * for why this is AmiExpress's own mechanism (ACP.e:2666-2673) and not an
 * invention of this port.
 *
 * Prints what it did: the build log is the only place anyone will ever see
 * this step, and "0 screens shared" needs to be visible when a rename breaks
 * it rather than discovered by a sysop editing forty-one files.
 */

import { collapseSeedNodeScreens } from '../src/services/seed-node-screens';

const templateDir = process.argv[2];

if (!templateDir) {
  console.error('usage: collapse-default-screens.ts <template-dir>');
  process.exit(2);
}

const report = collapseSeedNodeScreens(templateDir);

console.log(`[Seed] Shared node screens in ${templateDir}:`);
for (const { name, copies } of report.shared) {
  console.log(`[Seed]   ${name} - one copy, read by ${copies} nodes`);
}
console.log(`[Seed] ${report.shared.length} screens shared, ${report.pointed.length} nodes pointed at Screens/Node/`);
if (report.iconsCreated.length > 0) {
  console.log(`[Seed] Node icons created so they could declare SCREENS: ${report.iconsCreated.join(', ')}`);
}
if (report.kept.length > 0) {
  console.log(`[Seed] ${report.kept.length} screens kept per node - those nodes differ:`);
  for (const rel of report.kept) console.log(`[Seed]   ${rel}`);
}
