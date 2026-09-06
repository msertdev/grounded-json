import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const npmCli = process.env.npm_execpath;
if (!npmCli)
  throw new Error('Run this script through npm so npm_execpath is available.');

const tempRoot = await mkdtemp(join(tmpdir(), 'grounded-json-pack-'));
let tarballPath;

try {
  const packed = await runNpm(
    ['pack', '--workspace', 'grounded-json', '--json'],
    repositoryRoot,
  );
  const result = parseTrailingJsonArray(packed.stdout);
  if (!Array.isArray(result) || typeof result[0]?.filename !== 'string') {
    throw new Error('npm pack did not return a tarball filename.');
  }
  tarballPath = resolve(repositoryRoot, result[0].filename);
  if (
    !/^grounded-json-\d+\.\d+\.\d+(?:-[\w.-]+)?\.tgz$/u.test(
      basename(tarballPath),
    )
  ) {
    throw new Error(`Unexpected tarball name: ${basename(tarballPath)}`);
  }

  const packageDir = join(tempRoot, 'consumer');
  await mkdir(packageDir);
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify(
      {
        name: 'grounded-json-pack-smoke',
        private: true,
        type: 'module',
      },
      null,
      2,
    ),
  );
  await runNpm(
    ['install', tarballPath, '--ignore-scripts', '--no-audit', '--no-fund'],
    packageDir,
  );
  await writeFile(
    join(packageDir, 'check.mjs'),
    `
import { fromSelectors, verifyReceipt } from 'grounded-json';
const receipt = fromSelectors({
  html: '<main><h1>Packaged API</h1><data value="42"></data></main>',
  selectors: {
    '/name': { selector: 'h1' },
    '/answer': { selector: 'data', attribute: 'value', transforms: ['parse-number'] }
  },
  options: { embedSources: true }
});
if (receipt.coverage.ratio !== 1 || !verifyReceipt(receipt).ok) process.exit(2);
console.log('packaged import + replay: PASS');
`,
  );
  const imported = await execFileAsync(process.execPath, ['check.mjs'], {
    cwd: packageDir,
  });
  process.stdout.write(imported.stdout);

  const manifest = JSON.parse(
    await readFile(
      join(packageDir, 'node_modules', 'grounded-json', 'package.json'),
      'utf8',
    ),
  );
  if (manifest.name !== 'grounded-json' || manifest.version !== '0.1.0') {
    throw new Error(
      'Installed tarball manifest did not match the expected package.',
    );
  }

  if (manifest.bin?.['grounded-json'] !== 'dist/cli.js') {
    throw new Error('Installed package does not expose the expected CLI bin.');
  }
  const executable = join(
    packageDir,
    'node_modules',
    'grounded-json',
    'dist',
    'cli.js',
  );
  const demo = await execFileAsync(process.execPath, [executable, 'demo'], {
    cwd: packageDir,
  });
  if (!demo.stdout.includes('4/4 fields are source-backed')) {
    throw new Error('Packaged CLI demo did not return the expected result.');
  }
  process.stdout.write('packaged CLI: PASS\n');
} finally {
  const expectedPrefix = `${resolve(tmpdir())}${sep}grounded-json-pack-`;
  if (resolve(tempRoot).startsWith(expectedPrefix)) {
    await rm(tempRoot, { recursive: true, force: true });
  } else {
    process.stderr.write('Skipped cleanup of an unexpected temporary path.\n');
  }
  if (
    tarballPath &&
    resolve(tarballPath).startsWith(`${repositoryRoot}${sep}`) &&
    /^grounded-json-.*\.tgz$/u.test(basename(tarballPath))
  ) {
    await rm(tarballPath, { force: true });
  }
}

async function runNpm(args, cwd) {
  return execFileAsync(process.execPath, [npmCli, ...args], {
    cwd,
    env: { ...process.env, npm_config_update_notifier: 'false' },
    maxBuffer: 10 * 1024 * 1024,
  });
}

function parseTrailingJsonArray(output) {
  let offset = output.lastIndexOf('[');
  while (offset >= 0) {
    try {
      const parsed = JSON.parse(output.slice(offset).trim());
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Keep scanning backward through lifecycle output emitted before npm's JSON.
    }
    offset = output.lastIndexOf('[', offset - 1);
  }
  throw new Error('Could not find npm pack JSON in lifecycle output.');
}
