import * as esbuild from 'esbuild';

// Only 'vscode' must be external — it's provided by the VS Code runtime.
// All other dependencies (including vscode-languageclient/server) are bundled
// so node_modules does not need to ship inside the VSIX.
const external = ['vscode'];

const baseConfig = {
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    external,
    sourcemap: true,
    minify: false,
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
