const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.tmp', 'hebrew-date-test');

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
		path.join(root, 'nodes/Hebcal/hebrewDate.ts'),
		path.join(root, 'nodes/Hebcal/anniversary.ts'),
		path.join(root, 'nodes/Hebcal/Hebcal.node.ts'),
		path.join(root, 'types/hebcal-locales.d.ts'),
	],
	{ cwd: root, stdio: 'pipe' },
);

const { parseDateInput, serializeHebrewDate, getCalendarInformation } = require(
	path.join(outputDir, 'dateUtils.js'),
);
const { executeHebrewDate } = require(path.join(outputDir, 'hebrewDate.js'));
const { executeAnniversary } = require(path.join(outputDir, 'anniversary.js'));
const { Hebcal } = require(path.join(outputDir, 'Hebcal.node.js'));
const { HEBREW_LOCALES } = require(path.join(outputDir, 'locales.js'));

function mockCtx(paramsByItem, continueOnFail = false) {
	return {
		getNodeParameter: (name, index) => {
			const params = paramsByItem[index] ?? {};
			if (!(name in params)) throw new Error(`missing mock parameter ${name} for item ${index}`);
			return params[name];
		},
		getInputData: () => paramsByItem.map((parameters) => ({ json: {}, parameters })),
		continueOnFail: () => continueOnFail,
		getNode: () => ({ name: 'Hebcal', type: 'hebcal', typeVersion: 1 }),
	};
}

function gregorianParams(date, extra = {}) {
	return { dateType: 'gregorian', dateGregorianDate: date, ...extra };
}

test('Gregorian 2024-03-11 converts to 1 Adar II 5784 with known absolute day', async () => {
	const date = await parseDateInput('gregorian', { gregorianDate: '2024-03-11' });
	const json = serializeHebrewDate(date);
	assert.equal(json.gregorian, '2024-03-11');
	assert.equal(json.hebrew.year, 5784);
	assert.equal(json.hebrew.month, 13);
	assert.equal(json.hebrew.day, 1);
	assert.equal(json.absoluteDay, 738956);
	assert.equal(json.weekday.number, 1);
	assert.equal(json.weekday.name, 'Monday');
	assert.equal(json.hebrewLeapYear, true);
});

test('Hebrew 15 Cheshvan 5769 round-trips to Gregorian 2008-11-13', async () => {
	const date = await parseDateInput('hebrew', { hebrewYear: 5769, hebrewMonth: 8, hebrewDay: 15 });
	const json = serializeHebrewDate(date);
	assert.equal(json.gregorian, '2008-11-13');
	assert.equal(json.absoluteDay, 733359);
	const calendar = await getCalendarInformation(date);
	assert.equal(calendar.daysInYear, 354);
	assert.equal(calendar.monthsInYear, 12);
});

test('invalid civil and Hebrew dates are rejected without silent rollover', async () => {
	await assert.rejects(parseDateInput('gregorian', { gregorianDate: '2024-02-30' }), RangeError);
	await assert.rejects(
		parseDateInput('hebrew', { hebrewYear: 5769, hebrewMonth: 8, hebrewDay: 30 }),
		RangeError,
	);
	await assert.rejects(
		parseDateInput('hebrew', { hebrewYear: 5783, hebrewMonth: 13, hebrewDay: 1 }),
		RangeError,
	);
});

test('gematriya fixture parses to 15 Cheshvan 5784', async () => {
	const date = await parseDateInput('gematriya', { gematriya: 'ט״ו חֶשְׁוָן תשפ״ד' });
	const json = serializeHebrewDate(date);
	assert.equal(json.hebrew.year, 5784);
	assert.equal(json.hebrew.month, 8);
	assert.equal(json.hebrew.day, 15);
});

test('adjust, difference, and weekday helpers follow library semantics', async () => {
	const ctx = mockCtx([
		{ ...gregorianParams('2008-11-13'), direction: 'add', amount: 7, unit: 'day' },
	]);
	const [adjusted] = await executeHebrewDate(ctx, 'adjust', 0);
	assert.equal(adjusted.result.hebrew.day, 22);
	assert.equal(adjusted.result.hebrew.monthName, 'Cheshvan');

	const [diff] = await executeHebrewDate(
		mockCtx([
			{
				dateAType: 'hebrew',
				dateAHebrewDay: 25,
				dateAHebrewMonth: 9,
				dateAHebrewYear: 5770,
				dateBType: 'hebrew',
				dateBHebrewDay: 15,
				dateBHebrewMonth: 8,
				dateBHebrewYear: 5769,
			},
		]),
		'difference',
		0,
	);
	assert.equal(diff.daysFromFirstToSecond, -394);
	assert.equal(diff.daysFromSecondToFirst, 394);
	assert.equal(diff.isSameDate, false);

	const [weekday] = await executeHebrewDate(
		mockCtx([{ ...gregorianParams('2014-02-19'), weekdayMode: 'onOrAfter', weekday: 6 }]),
		'weekday',
		0,
	);
	assert.equal(weekday.result.gregorian, '2014-02-22');
});

test('year, month, and Gregorian helpers return known values', async () => {
	const [yearInfo] = await executeHebrewDate(mockCtx([{ hebrewYear: 5784 }]), 'yearInfo', 0);
	assert.equal(yearInfo.isLeapYear, true);
	assert.equal(yearInfo.monthsInYear, 13);

	const [monthInfo] = await executeHebrewDate(
		mockCtx([{ hebrewYear: 5769, hebrewMonth: 8 }]),
		'monthInfo',
		0,
	);
	assert.equal(monthInfo.monthName, 'Cheshvan');
	assert.equal(monthInfo.daysInMonth, 29);

	const [monthNumber] = await executeHebrewDate(
		mockCtx([{ monthName: 'Cheshvan' }]),
		'monthFromName',
		0,
	);
	assert.equal(monthNumber.month, 8);

	const [gregorian] = await executeHebrewDate(
		mockCtx([{ gregorianYear: 2024, gregorianMonth: 2 }]),
		'gregorianMonthInfo',
		0,
	);
	assert.equal(gregorian.daysInMonth, 29);
	assert.equal(gregorian.isLeapYear, true);
});

test('birthday moves forward while yahrzeit moves back for 30 Adar I 5774', async () => {
	const original = {
		originalType: 'gregorian',
		originalGregorianDate: '2014-03-02',
		targetHebrewYear: 5780,
	};
	const [birthday] = await executeAnniversary(mockCtx([original]), 'birthday', 0);
	assert.equal(birthday.result.hebrew.month, 1);
	assert.equal(birthday.result.hebrew.day, 1);

	const [yahrzeit] = await executeAnniversary(mockCtx([original]), 'yahrzeit', 0);
	assert.equal(yahrzeit.result.hebrew.month, 11);
	assert.equal(yahrzeit.result.hebrew.day, 30);

	const [sameYearBirthday] = await executeAnniversary(
		mockCtx([{ ...original, targetHebrewYear: 5774 }]),
		'birthday',
		0,
	);
	assert.ok(sameYearBirthday.result);

	const [sameYearYahrzeit] = await executeAnniversary(
		mockCtx([{ ...original, targetHebrewYear: 5774 }]),
		'yahrzeit',
		0,
	);
	assert.equal(sameYearYahrzeit.result, null);
});

test('locale list covers every installed translation and renders without global leakage', async () => {
	const { Locale } = await import('@hebcal/core');
	await import('@hebcal/locales');
	const installed = new Set(Locale.getLocaleNames().map((name) => name.toLowerCase()));
	const exposed = new Set(HEBREW_LOCALES.map(({ value }) => value.toLowerCase()));
	assert.deepEqual(exposed, installed);

	const params = (locale) => ({ ...gregorianParams('2024-03-11'), locale, showYear: true });
	const [first] = await executeHebrewDate(mockCtx([params('en')]), 'format', 0);
	await executeHebrewDate(mockCtx([params('he')]), 'format', 0);
	const [second] = await executeHebrewDate(mockCtx([params('en')]), 'format', 0);
	assert.equal(first.rendered, second.rendered);
	assert.match(first.rendered, /Adar II/);
});

test('Gregorian conversion is stable across host timezones', () => {
	const script = `const m=require(${JSON.stringify(path.join(outputDir, 'dateUtils.js'))});m.parseDateInput('gregorian',{gregorianDate:'2024-03-11'}).then(d=>console.log(JSON.stringify(m.serializeHebrewDate(d))));`;
	const run = (tz) =>
		execFileSync(process.execPath, ['-e', script], {
			cwd: root,
			env: { ...process.env, TZ: tz },
			encoding: 'utf8',
		}).trim();
	assert.equal(run('Pacific/Kiritimati'), run('Pacific/Midway'));
});

test('node execute pairs items and honors continueOnFail', async () => {
	const node = new Hebcal();
	assert.ok(node.description.properties.length > 0);
	assert.equal(node.description.credentials, undefined);

	const ctx = mockCtx(
		[
			{
				resource: 'hebrewDate',
				operation: 'convert',
				...gregorianParams('2024-03-11'),
				locale: 'en',
			},
			{
				resource: 'hebrewDate',
				operation: 'convert',
				...gregorianParams('2023-09-16'),
				locale: 'en',
			},
		],
		false,
	);
	const [items] = await node.execute.call(ctx);
	assert.equal(items.length, 2);
	assert.deepEqual(items[0].pairedItem, { item: 0 });
	assert.deepEqual(items[1].pairedItem, { item: 1 });
	assert.equal(items[1].json.hebrew.day, 1);
	assert.equal(items[1].json.hebrew.month, 7);

	const partial = mockCtx(
		[
			{
				resource: 'hebrewDate',
				operation: 'convert',
				...gregorianParams('2024-03-11'),
				locale: 'en',
			},
			{
				resource: 'hebrewDate',
				operation: 'convert',
				...gregorianParams('not-a-date'),
				locale: 'en',
			},
		],
		true,
	);
	const [partialItems] = await node.execute.call(partial);
	assert.equal(partialItems.length, 2);
	assert.ok(partialItems[0].json.gregorian);
	assert.match(partialItems[1].json.error, /YYYY-MM-DD/);

	const failing = mockCtx(
		[
			{
				resource: 'hebrewDate',
				operation: 'convert',
				...gregorianParams('not-a-date'),
				locale: 'en',
			},
		],
		false,
	);
	await assert.rejects(node.execute.call(failing));
});
