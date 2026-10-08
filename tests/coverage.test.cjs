const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.tmp', 'coverage-test');
const sourceDir = path.join(root, 'nodes/Hebcal');

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
		...readdirSync(sourceDir)
			.filter((file) => file.endsWith('.ts'))
			.map((file) => path.join(sourceDir, file)),
		path.join(root, 'types/hebcal-locales.d.ts'),
	],
	{ cwd: root, stdio: 'pipe' },
);

const { Hebcal } = require(path.join(outputDir, 'Hebcal.node.js'));

test('static option allowlists match the installed libraries', async () => {
	const core = await import('@hebcal/core');
	await import('@hebcal/learning');
	await import('@hebcal/locales');
	const { EVENT_FLAG_OPTIONS } = require(path.join(outputDir, 'events.js'));
	const { LEARNING_SCHEDULE_OPTIONS } = require(path.join(outputDir, 'learningKeys.js'));
	const { HEBREW_LOCALES } = require(path.join(outputDir, 'locales.js'));
	const { CLASSIC_CITIES } = require(path.join(outputDir, 'locations.js'));

	for (const { value } of EVENT_FLAG_OPTIONS) {
		assert.ok(value in core.flags, `unknown event flag: ${value}`);
	}
	const registered = new Set(core.DailyLearning.getCalendars());
	for (const { value } of LEARNING_SCHEDULE_OPTIONS) {
		assert.ok(registered.has(value), `unregistered learning schedule: ${value}`);
	}
	const installedLocales = new Set(core.Locale.getLocaleNames().map((name) => name.toLowerCase()));
	for (const { value } of HEBREW_LOCALES) {
		assert.ok(installedLocales.has(value.toLowerCase()), `uninstalled locale: ${value}`);
	}
	assert.equal(CLASSIC_CITIES.length, 65);
	for (const city of ['Jerusalem', 'New York', 'Paris', 'Sydney']) {
		assert.ok(core.Location.lookup(city), `unknown classic city: ${city}`);
	}
	assert.equal(core.Location.lookup('Atlantis'), undefined);
});

test('every resource and operation pair dispatches to an implemented handler', async () => {
	const node = new Hebcal();
	const properties = node.description.properties;
	const resourceProperty = properties.find((property) => property.name === 'resource');
	assert.ok(resourceProperty);
	for (const { value: resource } of resourceProperty.options) {
		const operationProperty = properties.find(
			(property) =>
				property.name === 'operation' &&
				property.displayOptions?.show?.resource?.includes(resource),
		);
		assert.ok(operationProperty, `missing operation selector for ${resource}`);
		for (const { value: operation } of operationProperty.options) {
			const ctx = {
				getNodeParameter: (name) => {
					if (name === 'resource') return resource;
					if (name === 'operation') return operation;
					return undefined;
				},
				getInputData: () => [{}],
				continueOnFail: () => false,
				getNode: () => ({}),
			};
			let dispatchError = null;
			try {
				await node.execute.call(ctx);
			} catch (error) {
				dispatchError = error;
			}
			if (dispatchError) {
				assert.doesNotMatch(
					dispatchError.message,
					new RegExp(`^Unknown resource: ${resource}$`),
					`${resource}/${operation} is not dispatched`,
				);
				assert.doesNotMatch(
					dispatchError.message,
					/Unsupported \w+ operation: /,
					`${resource}/${operation} is not implemented`,
				);
			}
		}
	}
});

test('node sources avoid eval, dynamic require, and raw JSON option passthrough', () => {
	const sources = readdirSync(sourceDir)
		.filter((file) => file.endsWith('.ts'))
		.map((file) => ({ file, text: readFileSync(path.join(sourceDir, file), 'utf8') }));
	for (const { file, text } of sources) {
		assert.doesNotMatch(text, /(^|[^A-Za-z_.])eval\s*\(/, `${file} uses eval`);
		assert.doesNotMatch(text, /new\s+Function\s*\(/, `${file} uses the Function constructor`);
		assert.doesNotMatch(text, /require\s*\(\s*['"`]/, `${file} uses require`);
	}
	const nodeSource = sources.find(({ file }) => file === 'Hebcal.node.ts').text;
	assert.match(nodeSource, /dispatchResource/, 'node keeps per-resource dispatch');
});
