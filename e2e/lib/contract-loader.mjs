import fs from 'node:fs';
import path from 'node:path';
import { createRequire, registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ContractTargetError } from './diagnostics.mjs';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOOKS_SYMBOL = Symbol.for('reqbridge.e2e.tsHooksRegistered');

export const CORE_CONTRACTS = {
  types: {
    feature: 'F2',
    expectedExports: ['ParseError'],
    optional: true,
  },
  parsers: {
    feature: 'F2',
    expectedExports: ['parseInputCollection', 'parseBrunoDirectory'],
  },
  transpiler: {
    feature: 'F2',
    expectedExports: ['toHttpFile', 'toOpenApiYaml'],
  },
  runner: {
    feature: 'F3',
    expectedExports: ['parseCsvRows', 'runBatch', 'exportJUnitXml', 'exportBatchMarkdown'],
  },
  diff: {
    feature: 'F4',
    expectedExports: ['diffResponses'],
  },
  'ci-exporter': {
    feature: 'F5',
    expectedExports: ['exportCiBundle'],
  },
  license: {
    feature: 'F6',
    expectedExports: ['verifyLicenseKey'],
  },
  byok: {
    feature: 'F6',
    expectedExports: ['translateScriptWithByok'],
  },
};

export function getRootDir() {
  return path.resolve(process.env.REQBRIDGE_ROOT || DEFAULT_ROOT);
}

export function ensureTypeScriptHooks() {
  if (globalThis[HOOKS_SYMBOL]) return;
  globalThis[HOOKS_SYMBOL] = true;

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        context.parentURL &&
        context.parentURL.startsWith('file://') &&
        (specifier.startsWith('./') || specifier.startsWith('../'))
      ) {
        const parentPath = fileURLToPath(context.parentURL);
        const normParent = parentPath.replace(/\\/g, '/');
        if (normParent.includes('/extension/src/core/')) {
          const parentDir = path.dirname(parentPath);
          if (specifier.endsWith('.js')) {
            const exactJs = path.resolve(parentDir, specifier);
            if (!fs.existsSync(exactJs)) {
              const candidateTs = path.resolve(parentDir, `${specifier.slice(0, -3)}.ts`);
              if (fs.existsSync(candidateTs)) {
                return { shortCircuit: true, url: pathToFileURL(candidateTs).href };
              }
            }
          } else if (!path.extname(specifier)) {
            const candidateTs = path.resolve(parentDir, `${specifier}.ts`);
            if (fs.existsSync(candidateTs)) {
              return { shortCircuit: true, url: pathToFileURL(candidateTs).href };
            }
            const indexTs = path.resolve(parentDir, specifier, 'index.ts');
            if (fs.existsSync(indexTs)) {
              return { shortCircuit: true, url: pathToFileURL(indexTs).href };
            }
          }
        }
      }
      return nextResolve(specifier, context);
    },

    load(url, context, nextLoad) {
      if (url.startsWith('file://') && url.endsWith('.ts')) {
        const normUrl = url.replace(/\\/g, '/');
        if (normUrl.includes('/extension/src/core/')) {
          try {
            return nextLoad(url, context);
          } catch (err) {
            if (err && (err.code === 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX' || /enum|parameter property/i.test(String(err.message)))) {
              const filePath = fileURLToPath(url);
              const raw = fs.readFileSync(filePath, 'utf8');
              const transformed = stripTypeScriptTypes(raw, {
                mode: 'transform',
                sourceUrl: url,
              });
              return {
                shortCircuit: true,
                format: 'module',
                source: transformed,
              };
            }
            throw err;
          }
        }
      }
      return nextLoad(url, context);
    },
  });
}

function normalizeLoadedNamespace(mod) {
  if (!mod || typeof mod !== 'object') return mod;
  if (mod.default && typeof mod.default === 'object') {
    return { ...mod.default, ...mod };
  }
  return mod;
}

function hasRequiredExports(mod, expectedExports) {
  if (!expectedExports || expectedExports.length === 0) return true;
  return expectedExports.every((name) => mod && mod[name] !== undefined);
}

/**
 * Loads a Core module and returns both its normalized exports and resolved file path.
 * @param {keyof typeof CORE_CONTRACTS} modName
 */
export async function loadCoreModuleWithPath(modName) {
  const spec = CORE_CONTRACTS[modName];
  if (!spec) {
    throw new Error(`Unknown core contract module: ${String(modName)}`);
  }

  const root = getRootDir();
  const extDir = path.join(root, 'extension');

  // Ordered per TEST_INFRA.md: pre-built pure-JS Core outputs first, then Node 24 TS fallback
  const candidatePaths = [
    path.join(extDir, 'dist', 'core.cjs'),
    path.join(extDir, 'dist', 'core', `${modName}.js`),
    path.join(extDir, 'dist', 'core', 'index.js'),
    path.join(extDir, 'out', 'core', `${modName}.js`),
    path.join(extDir, 'out', 'core', 'index.js'),
    path.join(extDir, 'out', 'src', 'core', `${modName}.js`),
    path.join(extDir, 'out-test', 'src', 'core', `${modName}.js`),
    path.join(extDir, 'src', 'core', `${modName}.ts`),
    path.join(extDir, 'src', 'core', 'index.ts'),
  ];

  const existingCandidates = candidatePaths.filter((p) => fs.existsSync(p));
  if (existingCandidates.length === 0) {
    throw new ContractTargetError({
      feature: spec.feature,
      contractName: `core/${modName}`,
      probedPaths: candidatePaths,
      expectedExports: spec.expectedExports,
      reason: 'No compiled JS core or TypeScript core source exists yet.',
    });
  }

  ensureTypeScriptHooks();
  const errors = [];
  for (const candidate of existingCandidates) {
    try {
      let rawMod;
      if (candidate.endsWith('.cjs')) {
        const req = createRequire(import.meta.url);
        rawMod = req(candidate);
      } else {
        rawMod = await import(pathToFileURL(candidate).href);
      }
      const mod = normalizeLoadedNamespace(rawMod);
      if (spec.optional || hasRequiredExports(mod, spec.expectedExports)) {
        return { mod, filePath: candidate };
      }
      const missing = spec.expectedExports.filter((name) => mod?.[name] === undefined);
      errors.push(`${candidate}: missing exports [${missing.join(', ')}]`);
    } catch (err) {
      errors.push(`${candidate}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new ContractTargetError({
    feature: spec.feature,
    contractName: `core/${modName}`,
    probedPaths: existingCandidates,
    expectedExports: spec.expectedExports,
    reason: errors.join(' | '),
  });
}

/**
 * Loads a Core module by contract name ('parsers', 'transpiler', 'runner', 'diff', 'ci-exporter', 'license', 'byok', 'types').
 * @param {keyof typeof CORE_CONTRACTS} modName
 */
export async function loadCoreModule(modName) {
  const { mod } = await loadCoreModuleWithPath(modName);
  return mod;
}

export function getExtensionPackageJsonPath() {
  const root = getRootDir();
  const pkgPath = path.join(root, 'extension', 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new ContractTargetError({
      feature: 'F7',
      contractName: 'extension/package.json',
      probedPaths: [pkgPath],
      expectedExports: ['name', 'publisher', 'version', 'engines.vscode', 'main', 'contributes'],
    });
  }
  return pkgPath;
}

export function loadExtensionPackageJson() {
  const pkgPath = getExtensionPackageJsonPath();
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

export function getExtensionBundlePath() {
  const root = getRootDir();
  const bundlePath = path.join(root, 'extension', 'dist', 'extension.js');
  if (!fs.existsSync(bundlePath)) {
    throw new ContractTargetError({
      feature: 'F7',
      contractName: 'extension/dist/extension.js',
      probedPaths: [bundlePath],
      expectedExports: ['activate', 'deactivate'],
    });
  }
  return bundlePath;
}

export function getVsixPath() {
  const root = getRootDir();
  const extDir = path.join(root, 'extension');
  if (!fs.existsSync(extDir)) {
    throw new ContractTargetError({
      feature: 'F7',
      contractName: 'extension/*.vsix',
      probedPaths: [path.join(extDir, '*.vsix')],
      expectedExports: ['[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json'],
    });
  }
  const vsixFiles = fs
    .readdirSync(extDir)
    .filter((name) => name.toLowerCase().endsWith('.vsix'))
    .sort();
  if (vsixFiles.length === 0) {
    throw new ContractTargetError({
      feature: 'F7',
      contractName: 'extension/*.vsix',
      probedPaths: [path.join(extDir, '*.vsix')],
      expectedExports: ['[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json'],
    });
  }
  return path.join(extDir, vsixFiles[0]);
}

export function loadExtensionArtifacts() {
  return {
    packageJsonPath: getExtensionPackageJsonPath(),
    packageJson: loadExtensionPackageJson(),
    bundlePath: getExtensionBundlePath(),
    vsixPath: getVsixPath(),
  };
}

export const REQUIRED_LANDING_FILES = [
  'index.html',
  'demo.js',
  'styles.css',
  'checkout-personal.html',
  'checkout-team.html',
  'privacy.html',
  'terms.html',
  'refund.html',
  'robots.txt',
  'sitemap.xml',
  'favicon.svg',
];

export function getLandingDir() {
  const root = getRootDir();
  const landingDir = path.join(root, 'landing');
  if (!fs.existsSync(landingDir)) {
    throw new ContractTargetError({
      feature: 'F9',
      contractName: 'landing/',
      probedPaths: [landingDir],
      expectedExports: REQUIRED_LANDING_FILES,
    });
  }
  return landingDir;
}

export function loadLandingFiles() {
  const landingDir = getLandingDir();
  const files = {};
  for (const name of REQUIRED_LANDING_FILES) {
    const fullPath = path.join(landingDir, name);
    files[name] = {
      name,
      path: fullPath,
      exists: fs.existsSync(fullPath),
      readText: () => fs.readFileSync(fullPath, 'utf8'),
    };
  }
  return { landingDir, files };
}
