const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.tmp', 'zmanim-test');

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
			'zmanim.ts',
			'molad.ts',
			'omer.ts',
			'Hebcal.node.ts',
		].map((file) => path.join(root, 'nodes/Hebcal', file)),
		path.join(root, 'types/hebcal-locales.d.ts'),
		path.join(root, 'types/zip-geo.d.ts'),
	],
	{ cwd: root, stdio: 'pipe' },
);

const { executeZmanim } = require(path.join(outputDir, 'zmanim.js'));
const { executeMolad } = require(path.join(outputDir, 'molad.js'));
const { executeOmer } = require(path.join(outputDir, 'omer.js'));
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

function nycDateParams(date, overrides = {}) {
	return {
		dateType: 'gregorian',
		dateGregorianDate: date,
		locationMode: 'custom',
		locationCity: 'Jerusalem',
		locationLatitude: 40.71,
		locationLongitude: -74.0,
		locationTimezone: 'America/New_York',
		locationIsrael: false,
		locationElevation: 0,
		useElevation: false,
		...overrides,
	};
}

function zmanimParams(date, overrides = {}) {
	return {
		...nycDateParams(date),
		tzeitAngle: 8.5,
		calculation: 'timeAtAngle',
		angle: 8.5,
		rising: false,
		offsetMinutes: -18,
		roundMinute: true,
		forceSeaLevel: false,
		hourMethod: 'fixed72',
		temporalSeaLevel: false,
		alosReference: '',
		tzaisReference: '',
		instant: '',
		astronomyOffsetMinutes: 60,
		formatInstant: '2024-03-08T18:49:00-05:00[America/New_York]',
		timeFormat: 'default',
		...overrides,
	};
}

test('daily times match verified New York fixtures and ordering', async () => {
	const [result] = await executeZmanim(mockCtx([zmanimParams('2024-03-08')]), 'day', 0);
	assert.equal(result.times.sunrise, '2024-03-08T11:18:04.000Z');
	assert.equal(result.times.sunset, '2024-03-08T22:55:43.000Z');
	assert.equal(result.localTimes.sunrise, '2024-03-08T06:18:04-05:00');
	assert.equal(result.localTimes.sunset, '2024-03-08T17:55:43-05:00');
	assert.ok(result.times.alotHaShachar < result.times.sunrise);
	assert.ok(result.times.sunrise < result.times.chatzot);
	assert.ok(result.times.chatzot < result.times.sunset);
	assert.ok(result.times.sunset < result.times.tzeit);
	assert.equal(result.nightHourMs, 3717250);
	assert.ok(result.temporal.tzeit72);
	assert.equal(result.temporal.moladMoment, null);
	assert.equal(result.location.timezone, 'America/New_York');
});

test('polar day returns null instead of false times', async () => {
	const [result] = await executeZmanim(
		mockCtx([
			zmanimParams('2024-06-21', {
				locationLatitude: 78.22,
				locationLongitude: 15.63,
				locationTimezone: 'Europe/Oslo',
			}),
		]),
		'day',
		0,
	);
	assert.equal(result.times.sunrise, null);
	assert.equal(result.times.sunset, null);
	assert.equal(result.localTimes.sunrise, null);
});

test('custom calculations agree with daily times', async () => {
	const [day] = await executeZmanim(mockCtx([zmanimParams('2024-03-08')]), 'day', 0);
	const [angle] = await executeZmanim(
		mockCtx([
			zmanimParams('2024-03-08', { calculation: 'timeAtAngle', angle: 8.5, rising: false }),
		]),
		'custom',
		0,
	);
	assert.equal(angle.result, day.times.tzeit);
	assert.equal(angle.resultLocal, day.localTimes.tzeit);
	const [offset] = await executeZmanim(
		mockCtx([zmanimParams('2024-03-08', { calculation: 'sunsetOffset', offsetMinutes: -18 })]),
		'custom',
		0,
	);
	assert.ok(offset.result > day.times.sunrise && offset.result < day.times.sunset);
});

test('temporal hours expose start and millisecond length', async () => {
	const [fixed] = await executeZmanim(
		mockCtx([zmanimParams('2024-03-08', { hourMethod: 'fixed72' })]),
		'temporalHour',
		0,
	);
	assert.equal(fixed.start, '2024-03-08T10:06:04.000Z');
	assert.equal(fixed.startLocal, '2024-03-08T05:06:04-05:00');
	assert.ok(fixed.hourMs > 0);
	const [day] = await executeZmanim(mockCtx([zmanimParams('2024-03-08')]), 'day', 0);
	const [byDeg] = await executeZmanim(
		mockCtx([zmanimParams('2024-03-08', { hourMethod: 'byDegrees', angle: 16.1 })]),
		'temporalHour',
		0,
	);
	assert.equal(byDeg.start, day.times.alotHaShachar);
});

test('lunar times are date-relevant with null away from the molad', async () => {
	const [far] = await executeZmanim(mockCtx([zmanimParams('2024-03-08')]), 'lunar', 0);
	assert.equal(far.moladMoment, null);
	assert.equal(far.tchilas3Days, null);
	assert.equal(far.sof15Days, null);
	const [moladDay] = await executeZmanim(mockCtx([zmanimParams('2024-04-08')]), 'lunar', 0);
	assert.equal(moladDay.moladMoment, '2024-04-08T16:36:26.837-04:00');
	const [third] = await executeZmanim(mockCtx([zmanimParams('2024-04-11')]), 'lunar', 0);
	assert.equal(third.tchilas3Days, '2024-04-11T16:36:26.837-04:00');
	const [adjusted] = await executeZmanim(
		mockCtx([
			zmanimParams('2024-04-11', {
				alosReference: '2024-04-11T04:30:00-04:00[America/New_York]',
				tzaisReference: '2024-04-11T20:00:00-04:00[America/New_York]',
			}),
		]),
		'lunar',
		0,
	);
	assert.equal(adjusted.tchilas3Days, '2024-04-11T20:00:00-04:00');
	const [last] = await executeZmanim(mockCtx([zmanimParams('2024-04-23')]), 'lunar', 0);
	assert.equal(last.sofBetweenMoldos, '2024-04-23T10:58:28.503-04:00');
	assert.equal(last.sof15Days, '2024-04-23T16:36:26.837-04:00');
});

test('astronomy exposes twilight ordering, transit, and solar position', async () => {
	const [astro] = await executeZmanim(mockCtx([zmanimParams('2024-03-08')]), 'astronomy', 0);
	assert.ok(astro.twilight.civilDawn < astro.sunrise);
	assert.ok(astro.sunrise < astro.sunset);
	assert.ok(astro.sunset < astro.twilight.civilDusk);
	assert.ok(astro.transit);
	assert.ok(astro.temporalHourMs > 0);
	assert.ok(astro.solarPosition.elevation > 40 && astro.solarPosition.elevation < 50);
	assert.ok(astro.solarPosition.azimuth > 170 && astro.solarPosition.azimuth < 185);
	assert.equal(astro.offsetApplied.time, '2024-03-08T06:18:04.798-05:00');
});

test('format exposes timezone offset, DST change, and sunset-aware date', async () => {
	const [before] = await executeZmanim(mockCtx([zmanimParams('2024-03-08')]), 'format', 0);
	assert.equal(before.isoWithTimezone, '2024-03-08T18:49:00-05:00');
	assert.equal(before.timezoneOffset, '-05:00');
	assert.equal(before.sunsetAwareDate.hebrew.month, 12);
	const [after] = await executeZmanim(
		mockCtx([
			zmanimParams('2024-03-08', { formatInstant: '2024-03-11T18:49:00-04:00[America/New_York]' }),
		]),
		'format',
		0,
	);
	assert.equal(after.timezoneOffset, '-04:00');
	await assert.rejects(
		executeZmanim(
			mockCtx([zmanimParams('2024-03-08', { formatInstant: 'not-an-instant' })]),
			'format',
			0,
		),
		/ISO-8601/,
	);
});

test('molad matches the documented Nisan 5784 announcement', async () => {
	const [molad] = await executeMolad(
		mockCtx([{ hebrewYear: 5784, hebrewMonth: 1, locale: 'en' }]),
		'calculate',
		0,
	);
	assert.equal(molad.hour, 22);
	assert.equal(molad.minutes, 57);
	assert.equal(molad.chalakim, 7);
	assert.equal(molad.instant, '2024-04-08T20:36:26.837+00:00[UTC]');
	assert.ok(molad.kiddushLevana.threeDays);
	assert.match(molad.rendered, /Monday/);
	const [forDate] = await executeMolad(
		mockCtx([{ dateType: 'gregorian', dateGregorianDate: '2024-04-24', locale: 'en' }]),
		'forDate',
		0,
	);
	assert.equal(forDate.month, 1);
	assert.equal(forDate.year, 5784);
});

test('omer day boundaries, texts, and season validation', async () => {
	const [first] = await executeOmer(
		mockCtx([{ hebrewYear: 5784, omerDay: 1, locale: 'en' }]),
		'byDay',
		0,
	);
	assert.equal(first.date.gregorian, '2024-04-24');
	assert.equal(first.omer.day, 1);
	assert.equal(first.omer.sefira.en, 'Lovingkindness within Lovingkindness');
	assert.equal(first.omer.todayIs, 'Today is 1 day of the Omer');
	const [last] = await executeOmer(
		mockCtx([{ hebrewYear: 5784, omerDay: 49, locale: 'en' }]),
		'byDay',
		0,
	);
	assert.equal(last.date.gregorian, '2024-06-11');
	assert.equal(last.date.hebrew.day, 5);
	const [fromDate] = await executeOmer(
		mockCtx([{ dateType: 'gregorian', dateGregorianDate: '2024-04-24', locale: 'en' }]),
		'fromDate',
		0,
	);
	assert.equal(fromDate.omer.day, 1);
	await assert.rejects(
		executeOmer(
			mockCtx([{ dateType: 'gregorian', dateGregorianDate: '2024-03-11', locale: 'en' }]),
			'fromDate',
			0,
		),
		/outside the Omer season/,
	);
});

test('node execute dispatches molad, omer, and zmanim with pairing', async () => {
	const node = new Hebcal();
	const ctx = mockCtx(
		[
			{ resource: 'molad', operation: 'calculate', hebrewYear: 5784, hebrewMonth: 1, locale: 'en' },
			{ resource: 'omer', operation: 'byDay', hebrewYear: 5784, omerDay: 1, locale: 'en' },
			{ resource: 'zmanim', operation: 'day', ...zmanimParams('2024-03-08') },
		],
		false,
	);
	const [items] = await node.execute.call(ctx);
	assert.equal(items.length, 3);
	assert.deepEqual(items[0].pairedItem, { item: 0 });
	assert.equal(items[1].json.omer.day, 1);
	assert.ok(items[2].json.times.sunrise);
	await assert.rejects(
		node.execute.call(
			mockCtx(
				[
					{
						resource: 'zmanim',
						operation: 'day',
						...nycDateParams('2024-03-08', { locationMode: 'none' }),
					},
				],
				false,
			),
		),
		/location is required/,
	);
});
