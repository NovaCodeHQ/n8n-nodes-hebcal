const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.tmp', 'learning-test');

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
		...[
			'library.ts',
			'dateUtils.ts',
			'locales.ts',
			'locations.ts',
			'events.ts',
			'timeUtils.ts',
			'learningKeys.ts',
			'learning.ts',
			'liturgy.ts',
			'utilities.ts',
			'Hebcal.node.ts',
		].map((file) => path.join(root, 'nodes/Hebcal', file)),
		path.join(root, 'types/hebcal-locales.d.ts'),
		path.join(root, 'types/zip-geo.d.ts'),
	],
	{ cwd: root, stdio: 'pipe' },
);

const { executeLearning } = require(path.join(outputDir, 'learning.js'));
const { executeLiturgy } = require(path.join(outputDir, 'liturgy.js'));
const { executeUtilities } = require(path.join(outputDir, 'utilities.js'));
const { Hebcal } = require(path.join(outputDir, 'Hebcal.node.js'));

function mockCtx(paramsByItem, continueOnFail = false) {
	return {
		getNodeParameter: (name, index) => {
			const params = paramsByItem[index] ?? {};
			if (!(name in params)) throw new Error(`missing mock parameter ${name} for item ${index}`);
			return params[name];
		},
		getInputData: () => paramsByItem.map(() => ({})),
		continueOnFail: () => continueOnFail,
		getNode: () => ({ name: 'Hebcal', type: 'hebcal', typeVersion: 1 }),
	};
}

function gregorian(date) {
	return { dateType: 'gregorian', dateGregorianDate: date };
}

function learningParams(overrides = {}) {
	return {
		learningSchedule: 'dafyomi',
		...gregorian('2024-04-08'),
		startType: 'gregorian',
		startGregorianDate: '2024-04-08',
		endType: 'gregorian',
		endGregorianDate: '2024-04-10',
		israelSchedule: false,
		locale: 'en',
		returnAll: true,
		limit: 100,
		...overrides,
	};
}

function nycWorkParams(moment) {
	return {
		moment,
		locationMode: 'custom',
		locationCity: 'Jerusalem',
		locationLatitude: 40.71,
		locationLongitude: -74.0,
		locationTimezone: 'America/New_York',
		locationIsrael: false,
		locationElevation: 0,
		useElevation: false,
	};
}

test('Daf Yomi lookup returns structured reading metadata', async () => {
	const [result] = await executeLearning(mockCtx([learningParams()]), 'lookup', 0);
	assert.equal(result.schedule, 'dafyomi');
	assert.ok(result.result.title.includes('Baba Metzia 40'));
	assert.deepEqual(result.result.learning.daf, {
		name: 'Baba Metzia',
		blatt: 40,
		cycle: 14,
		edition: null,
	});
	assert.ok(result.result.url?.includes('sefaria.org'));
	const [empty] = await executeLearning(
		mockCtx([learningParams({ ...gregorian('1920-01-01') })]),
		'lookup',
		0,
	);
	assert.equal(empty.result, null);
});

test('learning ranges collect consecutive days and enforce a cap', async () => {
	const results = await executeLearning(mockCtx([learningParams()]), 'range', 0);
	assert.equal(results.length, 3);
	assert.ok(results.every((item) => item.learning.daf));
	const [limited] = [
		await executeLearning(mockCtx([learningParams({ returnAll: false, limit: 2 })]), 'range', 0),
	];
	assert.equal(limited.length, 2);
	await assert.rejects(
		executeLearning(mockCtx([learningParams({ endGregorianDate: '2026-04-08' })]), 'range', 0),
		/370/,
	);
});

test('schedules list every registered calendar with start dates', async () => {
	const schedules = await executeLearning(mockCtx([{}]), 'schedules', 0);
	assert.equal(schedules.length, 21);
	const daf = schedules.find((item) => item.schedule === 'dafyomi');
	assert.ok(daf.registered);
	assert.equal(daf.startDate.gregorian, '1923-09-11');
});

test('daily status distinguishes Yom Kippur from an ordinary day', async () => {
	const [yomKippur] = await executeLiturgy(
		mockCtx([{ ...gregorian('2023-09-25'), israelSchedule: false }]),
		'status',
		0,
	);
	assert.deepEqual(yomKippur.hallel, { value: 0, label: 'none' });
	assert.deepEqual(yomKippur.tachanun, { shacharit: false, mincha: false, allCongs: false });
	assert.equal(yomKippur.fastDay, true);
	const [ordinary] = await executeLiturgy(
		mockCtx([{ ...gregorian('2024-03-12'), israelSchedule: false }]),
		'status',
		0,
	);
	assert.deepEqual(ordinary.tachanun, { shacharit: true, mincha: true, allCongs: true });
	assert.equal(ordinary.hallel.label, 'none');
	assert.equal(ordinary.eruvTavshilin, false);
	assert.equal(ordinary.fastDay, false);
	assert.equal(ordinary.aveilut, false);
	const [erev] = await executeLiturgy(
		mockCtx([{ ...gregorian('2024-10-02'), israelSchedule: false }]),
		'status',
		0,
	);
	assert.equal(erev.eruvTavshilin, true);
});

test('work prohibition follows sunset in the location timezone', async () => {
	const [daytime] = await executeLiturgy(
		mockCtx([nycWorkParams('2024-04-26T17:00:00Z')]),
		'work',
		0,
	);
	assert.equal(daytime.prohibited, false);
	const [night] = await executeLiturgy(mockCtx([nycWorkParams('2024-04-26T23:50:00Z')]), 'work', 0);
	assert.equal(night.prohibited, true);
	assert.equal(night.location.timezone, 'America/New_York');
});

test('location and timezone converters resolve documented fixtures', async () => {
	const [paris] = await executeUtilities(mockCtx([{ cityName: 'Paris' }]), 'locationLookup', 0);
	assert.equal(paris.found, true);
	assert.equal(paris.location.timezone, 'Europe/Paris');
	const [unknown] = await executeUtilities(
		mockCtx([{ cityName: 'Atlantis' }]),
		'locationLookup',
		0,
	);
	assert.equal(unknown.found, false);
	assert.equal(unknown.location, null);
	const [legacy] = await executeUtilities(
		mockCtx([{ gmtOffset: 2, dstRegion: 'israel' }]),
		'legacyTimezone',
		0,
	);
	assert.equal(legacy.timezone, 'Asia/Jerusalem');
	const [usa] = await executeUtilities(
		mockCtx([{ usState: 'AZ', usZone: 7, usDst: 'Y' }]),
		'usaTimezone',
		0,
	);
	assert.equal(usa.timezone, 'America/Denver');
});

test('text utilities convert, translate, and format as documented', async () => {
	const [encode] = await executeUtilities(
		mockCtx([{ gematriyaDirection: 'encode', gematriyaValue: '25' }]),
		'gematriya',
		0,
	);
	assert.equal(encode.result, 'כ״ה');
	const [decode] = await executeUtilities(
		mockCtx([{ gematriyaDirection: 'decode', gematriyaValue: 'ט״ו' }]),
		'gematriya',
		0,
	);
	assert.equal(decode.result, 15);
	const [translated] = await executeUtilities(
		mockCtx([{ textId: 'Shabbat', locale: 'he' }]),
		'translate',
		0,
	);
	assert.equal(translated.translation, 'שַׁבָּת');
	const [missing] = await executeUtilities(
		mockCtx([{ textId: 'Foobar', locale: 'he' }]),
		'translate',
		0,
	);
	assert.equal(missing.translation, 'Foobar');
	assert.equal(missing.exact, null);
	const [ordinal] = await executeUtilities(
		mockCtx([{ ordinalNumber: 15, locale: 'en' }]),
		'ordinal',
		0,
	);
	assert.equal(ordinal.ordinal, '15th');
	const [stripped] = await executeUtilities(mockCtx([{ hebrewText: 'אֱלוּל' }]), 'stripNikud', 0);
	assert.equal(stripped.output, 'אלול');
	const [time] = await executeUtilities(
		mockCtx([{ timeString: '20:30', timeSuffix: 'pm', timeFormat: 'twelve', locale: 'en' }]),
		'reformatTime',
		0,
	);
	assert.equal(time.formatted, '8:30pm');
	const locales = await executeUtilities(mockCtx([{}]), 'locales', 0);
	assert.ok(locales.length >= 21);
	assert.ok(locales.some((item) => item.locale === 'he' && item.hebrew));
	const names = await executeUtilities(mockCtx([{}]), 'holidayNames', 0);
	assert.ok(names.length > 20);
	assert.ok(names.some((item) => item.name === 'Yom HaShoah'));
});

test('node execute dispatches learning, liturgy, and utilities', async () => {
	const node = new Hebcal();
	const ctx = mockCtx(
		[
			{ resource: 'learning', operation: 'lookup', ...learningParams() },
			{
				resource: 'liturgy',
				operation: 'status',
				...gregorian('2023-09-25'),
				israelSchedule: false,
			},
			{ resource: 'utility', operation: 'locationLookup', cityName: 'Paris' },
		],
		false,
	);
	const [items] = await node.execute.call(ctx);
	assert.equal(items.length, 3);
	assert.ok(items[0].json.result.title.includes('Baba Metzia'));
	assert.equal(items[1].json.fastDay, true);
	assert.equal(items[2].json.location.timezone, 'Europe/Paris');
	const resources = node.description.properties.find((property) => property.name === 'resource');
	assert.deepEqual(
		resources.options.map((option) => option.value),
		[
			'anniversary',
			'calendar',
			'hebrewDate',
			'holiday',
			'learning',
			'liturgy',
			'molad',
			'omer',
			'torah',
			'triennial',
			'utility',
			'zmanim',
		],
	);
});
