const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.tmp', 'location-test');

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
		...['library.ts', 'dateUtils.ts', 'locales.ts', 'locations.ts'].map((file) =>
			path.join(root, 'nodes/Hebcal', file),
		),
		path.join(root, 'types/hebcal-locales.d.ts'),
		path.join(root, 'types/zip-geo.d.ts'),
	],
	{ cwd: root, stdio: 'pipe' },
);

const { resolveLocation, serializeLocation } = require(path.join(outputDir, 'locations.js'));

function mockCtx(params) {
	return {
		getNodeParameter: (name) => {
			if (!(name in params)) throw new Error(`missing mock parameter ${name}`);
			return params[name];
		},
	};
}

function base(overrides = {}) {
	return {
		locationMode: 'zip',
		locationCity: 'Jerusalem',
		locationZip: '10001',
		locationLatitude: 40.71,
		locationLongitude: -74.0,
		locationTimezone: 'America/New_York',
		locationIsrael: false,
		locationElevation: 0,
		...overrides,
	};
}

test('US ZIP codes resolve offline with coordinates and IANA timezone', async () => {
	const east = await resolveLocation(mockCtx(base({ locationZip: '10001' })), 0, 'location');
	const eastJson = serializeLocation(east);
	assert.equal(eastJson.latitude, 40.7484);
	assert.equal(eastJson.longitude, -73.9967);
	assert.equal(eastJson.timezone, 'America/New_York');
	assert.equal(eastJson.countryCode, 'US');
	assert.equal(eastJson.israel, false);
	assert.match(eastJson.name, /New York/);

	const west = await resolveLocation(mockCtx(base({ locationZip: '90210' })), 0, 'location');
	assert.equal(serializeLocation(west).timezone, 'America/Los_Angeles');

	const plusFour = await resolveLocation(
		mockCtx(base({ locationZip: '10001-1234' })),
		0,
		'location',
	);
	assert.equal(serializeLocation(plusFour).timezone, 'America/New_York');
});

test('unknown and malformed ZIP codes are rejected', async () => {
	await assert.rejects(
		resolveLocation(mockCtx(base({ locationZip: '00000' })), 0, 'location'),
		/Unknown US ZIP code/,
	);
	await assert.rejects(
		resolveLocation(mockCtx(base({ locationZip: 'abc' })), 0, 'location'),
		/5-digit US ZIP/,
	);
	await assert.rejects(
		resolveLocation(mockCtx(base({ locationZip: '' })), 0, 'location'),
		/5-digit US ZIP/,
	);
});

test('classic and custom modes keep working alongside ZIP mode', async () => {
	const classic = await resolveLocation(
		mockCtx(base({ locationMode: 'classic', locationCity: 'Jerusalem' })),
		0,
		'location',
	);
	assert.equal(serializeLocation(classic).israel, true);
	assert.equal(
		await resolveLocation(mockCtx(base({ locationMode: 'none' })), 0, 'location'),
		undefined,
	);
	await assert.rejects(
		resolveLocation(
			mockCtx(base({ locationMode: 'custom', locationTimezone: 'Not/AZone' })),
			0,
			'location',
		),
		/Unknown IANA timezone/,
	);
});
