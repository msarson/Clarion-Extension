import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

// Only 'vscode' must be external — it's provided by the VS Code runtime.
// All other dependencies (including vscode-languageclient/server) are bundled
// so node_modules does not need to ship inside the VSIX.
const external = ['vscode'];

// Stamp the bundle with the version + build date/time so a running server can
// report exactly which build it is (see server/src/buildInfo.ts). These become
// string literals at bundle time; the tsc/dev path leaves them undefined and
// buildInfo.ts falls back to dev defaults.
const pkgVersion = JSON.parse(readFileSync('./package.json', 'utf8')).version;
const buildDate = new Date().toISOString();

const baseConfig = {
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    external,
    sourcemap: true,
    minify: false,
    define: {
        __SERVER_VERSION__: JSON.stringify(pkgVersion),
        __BUILD_DATE__: JSON.stringify(buildDate),
    },
};

await esbuild.build({
    ...baseConfig,
    entryPoints: ['./client/src/extension.ts'],
    outfile: './out/client/src/extension.js',
    tsconfig: './client/tsconfig.json',
});

await esbuild.build({
    ...baseConfig,
    entryPoints: ['./server/src/server.ts'],
    outfile: './out/server/src/server.js',
    tsconfig: './server/tsconfig.json',
});

console.log('✅ Bundle complete');
