import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cli = resolve(packageRoot, 'dist/cli.js');

describe('CLI', () => {
  it('runs the zero-setup demo', async () => {
    const { stdout } = await execFileAsync(process.execPath, [cli, 'demo'], {
      cwd: packageRoot,
    });
    expect(stdout).toContain('4/4 fields are source-backed');
    expect(stdout).toContain('Evidence supports where a value came from');
  });

  it('refuses network URLs', async () => {
    await expect(
      execFileAsync(process.execPath, [
        cli,
        'from-jsonld',
        'https://example.com',
      ]),
    ).rejects.toMatchObject({ code: 1 });
  });
});
