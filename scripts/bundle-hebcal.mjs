import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const entryPoint = path.resolve('dist/nodes/Hebcal/Hebcal.node.js');
const temporaryOutput = `${entryPoint}.bundle-tmp`;

const result = await build({
	entryPoints: [entryPoint],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node18',
	external: ['n8n-workflow'],
	legalComments: 'inline',
	write: false,
	metafile: true,
});

const output = result.outputFiles[0];
if (!output) {
	throw new Error('esbuild did not emit the Hebcal node bundle');
}

const externalHebcalImports = Object.values(result.metafile.outputs)
	.flatMap(({ imports }) => imports)
	.filter(({ external, path: importPath }) => external && importPath.startsWith('@hebcal/'));
if (externalHebcalImports.length > 0) {
	throw new Error(
		`Hebcal imports were left external: ${externalHebcalImports.map(({ path: p }) => p).join(', ')}`,
	);
}

await writeFile(temporaryOutput, output.contents);
await rename(temporaryOutput, entryPoint);
await rm(`${entryPoint}.map`, { force: true });
