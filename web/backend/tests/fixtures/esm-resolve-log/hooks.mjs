// Module hooks: one line per ESM-loader resolve, `<specifier>\t<parentURL>`.
// A backend module that reaches here was loaded through `import()` - the
// off-thread loader round trip a headless runner on Node 20 can wait on forever.
import { appendFileSync } from 'node:fs';

let log;

export function initialize(data) {
  log = data && data.log;
}

export async function resolve(specifier, context, next) {
  if (log) appendFileSync(log, `${specifier}\t${context.parentURL ?? ""}\n`);
  return next(specifier, context);
}
