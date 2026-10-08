const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.tmp', 'calendar-test');

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
		path.join(root, 'nodes/Hebcal/library.ts'),
		path.join(root, 'nodes/Hebcal/dateUtils.ts'),
		path.join(root, 'nodes/Hebcal/locales.ts'),
		path.join(root, 'nodes/Hebcal/locations.ts'),
		path.join(root, 'nodes/Hebcal/events.ts'),
		path.join(root, 'nodes/Hebcal/learningKeys.ts'),
		path.join(root, 'nodes/Hebcal/calendar.ts'),
		path.join(root, 'nodes/Hebcal/holiday.ts'),
		path.join(root, 'nodes/Hebcal/Hebcal.node.ts'),
		path.join(root, 'types/hebcal-locales.d.ts'),
	],
	{ cwd: root, stdio: 'pipe' },
);

const { executeCalendar } = require(path.join(outputDir, 'calendar.js'));
const { executeHoliday } = require(path.join(outputDir, 'holiday.js'));
const { Hebcal } = require(path.join(outputDir, 'Hebcal.node.js'));
const { LEARNING_SCHEDULE_OPTIONS } = require(path.join(outputDir, 'learningKeys.js'));

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

function calendarParams(overrides = {}) {
	return {
		rangeMode: 'gregorianYear',
		gregorianYear: 2024,
		hebrewYear: 5784,
		gregorianMonth: 1,
		hebrewMonth: 7,
		numYears: 1,
		startType: 'gregorian',
		startGregorianDate: '2024-03-08',
		endType: 'gregorian',
		endGregorianDate: '2024-03-08',
		israelSchedule: false,
		locationMode: 'none',
		locationCity: 'Jerusalem',
		locationLatitude: 40.71,
		locationLongitude: -74.0,
		locationTimezone: 'America/New_York',
		locationIsrael: false,
		locationElevation: 0,
		useElevation: false,
		candlelighting: false,
		candleLightingMins: 0,
		havdalahMode: 'default',
		havdalahValue: 42,
		fastStartMode: 'default',
		fastStartValue: 0,
		fastEndMode: 'default',
		fastEndValue: 0,
		tishaBavEndMode: 'default',
		tishaBavEndValue: 0,
		sedrot: false,
		shabbatMevarchim: false,
		omer: false,
		molad: false,
		yomKippurKatan: false,
		behab: false,
		yizkor: false,
		noMinorFast: false,
		noModern: false,
		noRoshChodesh: false,
		noSpecialShabbat: false,
		noHolidays: false,
		addHebrewDates: false,
		addHebrewDatesForEvents: false,
		locale: 'en',
		hour12: 'default',
		maskFlags: [],
		dailyLearning: [],
		returnAll: true,
		limit: 100,
		...overrides,
	};
}

function holidayParams(overrides = {}) {
	return {
		dateType: 'gregorian',
		dateGregorianDate: '2023-09-16',
		schedule: 'both',
		hebrewYear: 5784,
		israelSchedule: false,
		flagsFilter: [],
		flagMatch: 'any',
		locale: 'en',
		returnAll: true,
		limit: 100,
		...overrides,
	};
}

test('Gregorian 2024 calendar contains Erev Pesach on 2024-04-22', async () => {
	const events = await executeCalendar(mockCtx([calendarParams()]), 'generate', 0);
	const erev = events.find((event) => event.description === 'Erev Pesach');
	assert.ok(erev);
	assert.equal(erev.date.gregorian, '2024-04-22');
	assert.equal(erev.basename, 'Pesach');
	assert.ok(erev.flags.includes('EREV'));
	assert.ok(erev.url?.startsWith('https://www.hebcal.com/holidays/'));
});

test('Israel and Diaspora schedules diverge on Shavuot II', async () => {
	const diaspora = await executeCalendar(
		mockCtx([calendarParams({ rangeMode: 'hebrewYear' })]),
		'generate',
		0,
	);
	assert.ok(diaspora.some((event) => event.description === 'Shavuot II'));
	const israel = await executeCalendar(
		mockCtx([calendarParams({ rangeMode: 'hebrewYear', israelSchedule: true })]),
		'generate',
		0,
	);
	assert.ok(!israel.some((event) => event.description === 'Shavuot II'));
	assert.ok(israel.some((event) => event.description === 'Shavuot'));
});

test('Hebrew month Tishrei 5784 stays within exact boundaries', async () => {
	const events = await executeCalendar(
		mockCtx([calendarParams({ rangeMode: 'hebrewMonth', hebrewYear: 5784, hebrewMonth: 7 })]),
		'generate',
		0,
	);
	assert.ok(events.length > 0);
	const dates = events.map((event) => event.date.gregorian).sort();
	assert.equal(dates[0], '2023-09-16');
	assert.ok(dates.every((date) => date >= '2023-09-16' && date <= '2023-10-15'));
});

test('candle lighting produces timed events in the location timezone', async () => {
	const events = await executeCalendar(
		mockCtx([
			calendarParams({
				rangeMode: 'dateRange',
				startGregorianDate: '2024-04-22',
				endGregorianDate: '2024-04-23',
				candlelighting: true,
				locationMode: 'custom',
			}),
		]),
		'generate',
		0,
	);
	const candles = events.filter((event) => event.timed && event.flags.includes('LIGHT_CANDLES'));
	assert.ok(candles.length > 0);
	assert.ok(candles.every((event) => event.timed.eventTime));
	assert.ok(candles.every((event) => event.timed.timezone === 'America/New_York'));
	const linked = candles.find((event) => event.timed.linkedEvent);
	assert.ok(linked);
	assert.equal(linked.timed.linkedEvent.description, 'Erev Pesach');
});

test('fast days expose nested start and end times', async () => {
	const events = await executeCalendar(
		mockCtx([
			calendarParams({
				rangeMode: 'dateRange',
				startGregorianDate: '2024-08-12',
				endGregorianDate: '2024-08-14',
				candlelighting: true,
				locationMode: 'custom',
			}),
		]),
		'generate',
		0,
	);
	const withStart = events.find((event) => event.fast?.start);
	const withEnd = events.find((event) => event.fast?.end);
	assert.ok(withStart);
	assert.ok(withEnd);
	assert.ok(withStart.fast.start.timed.eventTime);
	assert.ok(withEnd.fast.end.timed.eventTime);
	assert.ok(withStart.fastHoliday);
});

test('mask filter restricts generation to flagged events', async () => {
	const events = await executeCalendar(
		mockCtx([calendarParams({ maskFlags: ['CHAG'] })]),
		'generate',
		0,
	);
	assert.ok(events.length > 0);
	assert.ok(events.every((event) => event.flags.includes('CHAG')));
});

test('daily learning integrates Daf Yomi events', async () => {
	const events = await executeCalendar(
		mockCtx([calendarParams({ rangeMode: 'hebrewYear', dailyLearning: ['dafyomi'] })]),
		'generate',
		0,
	);
	assert.ok(events.some((event) => event.flags.includes('DAF_YOMI')));
});

test('holiday lookup diverges by schedule on 7 Sivan 5784', async () => {
	const diaspora = await executeHoliday(
		mockCtx([holidayParams({ dateGregorianDate: '2024-06-13', schedule: 'diaspora' })]),
		'onDate',
		0,
	);
	assert.ok(diaspora.some((event) => event.description === 'Shavuot II'));
	const israel = await executeHoliday(
		mockCtx([holidayParams({ dateGregorianDate: '2024-06-13', schedule: 'israel' })]),
		'onDate',
		0,
	);
	assert.equal(israel.length, 0);
	const both = await executeHoliday(
		mockCtx([holidayParams({ dateGregorianDate: '2023-09-16', schedule: 'both' })]),
		'onDate',
		0,
	);
	assert.ok(both.some((event) => event.basename === 'Rosh Hashana'));
});

test('holiday year supports flags filter and limit', async () => {
	const [limited] = [
		await executeHoliday(mockCtx([holidayParams({ returnAll: false, limit: 5 })]), 'year', 0),
	];
	assert.equal(limited.length, 5);
	const fasts = await executeHoliday(
		mockCtx([holidayParams({ flagsFilter: ['MAJOR_FAST'], flagMatch: 'any' })]),
		'year',
		0,
	);
	assert.ok(fasts.length > 0);
	assert.ok(fasts.every((event) => event.flags.includes('MAJOR_FAST')));
});

test('learning schedule options match the installed registry', async () => {
	const { DailyLearning } = await import('@hebcal/core');
	await import('@hebcal/learning');
	const installed = new Set(DailyLearning.getCalendars());
	const exposed = new Set(LEARNING_SCHEDULE_OPTIONS.map(({ value }) => value));
	assert.deepEqual(exposed, installed);
});

test('Israel schedule must agree with an Israeli location', async () => {
	await assert.rejects(
		executeCalendar(
			mockCtx([calendarParams({ locationMode: 'classic', locationCity: 'Jerusalem' })]),
			'generate',
			0,
		),
		/disagrees/,
	);
	await assert.rejects(
		executeCalendar(mockCtx([calendarParams({ rangeMode: 'unknown' })]), 'generate', 0),
		/Unsupported range/,
	);
});

test('node execute dispatches calendar and holiday with pairing', async () => {
	const node = new Hebcal();
	const ctx = mockCtx(
		[
			{
				resource: 'calendar',
				operation: 'generate',
				...calendarParams({ returnAll: false, limit: 3 }),
			},
			{ resource: 'holiday', operation: 'onDate', ...holidayParams() },
			{
				resource: 'holiday',
				operation: 'onDate',
				...holidayParams({ dateGregorianDate: '2024-06-13', schedule: 'israel' }),
			},
		],
		false,
	);
	const [items] = await node.execute.call(ctx);
	assert.equal(items.filter((item) => item.pairedItem.item === 0).length, 3);
	assert.ok(items.some((item) => item.pairedItem.item === 1));
	assert.ok(!items.some((item) => item.pairedItem.item === 2));
	assert.ok(node.description.properties.some((property) => property.name === 'rangeMode'));
});
