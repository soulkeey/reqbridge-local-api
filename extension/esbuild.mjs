import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/vscode/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});
