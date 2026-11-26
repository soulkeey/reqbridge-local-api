import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CORE_DIR = path.resolve(__dirname, '..', '..', 'src', 'core');

describe('Architecture Guards (src/core/)', () => {
  const coreFiles = fs
    .readdirSync(CORE_DIR)
    .filter((f) => f.endsWith('.ts'))
    .sort();

  it('contains all 14 pure TypeScript core modules', () => {
    assert.deepEqual(coreFiles, [
      'byok.ts',
      'ci-exporter.ts',
      'diff.ts',
      'license.ts',
      'parsers-bruno.ts',
      'parsers-curl.ts',
      'parsers-openapi.ts',
      'parsers-thunder-http.ts',
      'parsers.ts',
      'runner-reports.ts',
      'runner.ts',
      'transpiler-openapi.ts',
      'transpiler.ts',
      'types.ts',
    ]);
  });

  it('enforces <= 300 lines per file across all src/core/*.ts', () => {
    const violations: string[] = [];
    for (const file of coreFiles) {
      const content = fs.readFileSync(path.join(CORE_DIR, file), 'utf8');
      const lines = content.split(/\r?\n/);
      const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
      if (lineCount > 300) {
        violations.push(`${file}: ${lineCount} lines`);
      }
    }
    assert.deepEqual(violations, [], `Files exceeding 300 lines: ${violations.join(', ')}`);
  });

  it('enforces zero vscode imports or references in src/core/*.ts', () => {
    for (const file of coreFiles) {
      const content = fs.readFileSync(path.join(CORE_DIR, file), 'utf8');
      assert.equal(
        /\bvscode\b/i.test(content),
        false,
        `${file} must not reference vscode`
      );
    }
  });

  it('contains zero embedded AI or live payment secret keys in src/core/*.ts', () => {
    const forbiddenPatterns = [
      /AIza[0-9A-Za-z_-]{20,}/,
      /sk-(?:proj|live|ant)-[0-9A-Za-z_-]{10,}/,
      /creem_(?:live|test)_[0-9A-Za-z_-]{8,}/,
    ];
    for (const file of coreFiles) {
      const content = fs.readFileSync(path.join(CORE_DIR, file), 'utf8');
      for (const pat of forbiddenPatterns) {
        assert.equal(pat.test(content), false, `${file} matched forbidden key pattern ${pat}`);
      }
    }
  });

  it('enforces <= 300 lines per file across all src/vscode/*.ts', () => {
    const vscodeDir = path.resolve(__dirname, '..', '..', 'src', 'vscode');
    const files = fs.readdirSync(vscodeDir).filter((f) => f.endsWith('.ts')).sort();
    assert.ok(files.length >= 4, 'Expected src/vscode/*.ts modules');
    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(vscodeDir, file), 'utf8');
      const lines = content.split(/\r?\n/);
      const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
      if (lineCount > 300) violations.push(`${file}: ${lineCount} lines`);
    }
    assert.deepEqual(violations, [], `src/vscode files exceeding 300 lines: ${violations.join(', ')}`);
  });
});
