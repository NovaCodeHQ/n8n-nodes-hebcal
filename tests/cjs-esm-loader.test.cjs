const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.tmp', 'esm-loader-test');

// Compile the TypeScript dynamic-import fixture with the project's module settings.
execFileSync(
	process.execPath,
	[
		path.join(root, 'node_modules/typescript/bin/tsc'),
		'--target',
		'ES2022',
		'--module',
		'Node16',
		'--moduleResolution',
		'Node16',
		'--skipLibCheck',
		'--strict',
		'--outDir',
		outputDir,
		path.join(__dirname, 'fixtures/hebcalLoader.ts'),
		path.join(root, 'types/hebcal-locales.d.ts'),
	],
	{ cwd: root, stdio: 'pipe' },
);

const emittedPath = path.join(outputDir, 'hebcalLoader.js');
const emittedSource = readFileSync(emittedPath, 'utf8');
const bundledPath = path.join(outputDir, 'hebcalLoader.bundle.cjs');
const bundled = buildSync({
	entryPoints: [emittedPath],
	outfile: bundledPath,
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node18',
	legalComments: 'inline',
	write: false,
	metafile: true,
});
const externalHebcalImports = Object.values(bundled.metafile.outputs)
	.flatMap(({ imports }) => imports)
	.filter(({ external, path: importPath }) => external && importPath.startsWith('@hebcal/'));
writeFileSync(bundled.outputFiles[0].path, bundled.outputFiles[0].contents);
const { loadHebcalPackages } = require(bundledPath);

test('TypeScript preserves native dynamic imports in CommonJS output', () => {
	assert.match(emittedSource, /import\(/);
	assert.doesNotMatch(emittedSource, /require\(["']@hebcal\//);
});

test('esbuild bundles all Hebcal ESM packages into loadable CommonJS', async () => {
	assert.deepEqual(externalHebcalImports, []);
	const { core, hdate } = await loadHebcalPackages();
	assert.equal(core.HDate, hdate.HDate);

	const hebrewDate = new core.HDate(8, core.months.NISAN, 5784);
	const events = core.calendar({ year: 5784, isHebrewYear: true, omer: true });
	assert.ok(events.length > 0);
	assert.ok(core.DailyLearning.getCalendars().includes('dafyomi'));
	assert.ok(core.DailyLearning.lookup('dafYomi', hebrewDate));
});
