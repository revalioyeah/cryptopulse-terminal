import { rolldown } from 'rolldown';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const outFile = path.join(os.tmpdir(), 'cryptopulse-cloud-scanner.mjs');

const bundle = await rolldown({
  input: path.resolve('scripts/cloud-scanner.ts'),
  platform: 'node',
  external: [/^node:/],
});

await bundle.write({
  file: outFile,
  format: 'esm',
});

await bundle.close();

await import(pathToFileURL(outFile).href);
