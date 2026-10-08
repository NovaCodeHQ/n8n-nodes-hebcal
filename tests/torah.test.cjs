const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, '.tmp', 'torah-test');

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
			'torah.ts',
			'triennial.ts',
			'Hebcal.node.ts',
		].map((file) => path.join(root, 'nodes/Hebcal', file)),
		path.join(root, 'types/hebcal-locales.d.ts'),
	],
	{ cwd: root, stdio: 'pipe' },
);

const { executeTorah } = require(path.join(outputDir, 'torah.js'));
const { executeTriennial } = require(path.join(outputDir, 'triennial.js'));
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

function torahParams(overrides = {}) {
	return {
		...gregorian('2023-10-29'),
		hebrewYear: 5784,
		israelSchedule: false,
		parshaName: '',
		locale: 'en',
		aliyahBook: 'Numbers',
		aliyahBegin: '25:10',
		aliyahEnd: '30:1',
		aliyahShowBook: true,
		returnAll: true,
		limit: 100,
		...overrides,
	};
}

function triennialParams(overrides = {}) {
	return {
		...gregorian('2023-10-28'),
		hebrewYear: 5784,
		israelSchedule: false,
		parshaName: 'Bereshit',
		cycleYear: 1,
		...overrides,
	};
}

test('sedra lookup finds Vayera after 15 Cheshvan 5784', async () => {
	const [result] = await executeTorah(
		mockCtx([torahParams({ ...gregorian('2023-10-29') })]),
		'sedra',
		0,
	);
	assert.deepEqual(result.parsha, ['Vayera']);
	assert.equal(result.chag, false);
	assert.equal(result.readingDate.gregorian, '2023-11-04');
});

test('weekday lookup returns Lech-Lecha on Monday and null on Tuesday', async () => {
	const [monday] = await executeTorah(
		mockCtx([torahParams({ ...gregorian('2023-10-23') })]),
		'weekday',
		0,
	);
	assert.deepEqual(monday.parsha, ['Lech-Lecha']);
	const [tuesday] = await executeTorah(
		mockCtx([torahParams({ ...gregorian('2023-10-24') })]),
		'weekday',
		0,
	);
	assert.equal(tuesday.reading, null);
});

test('find distinguishes exact and containing matches', async () => {
	const [noach] = await executeTorah(mockCtx([torahParams({ parshaName: 'Noach' })]), 'find', 0);
	assert.equal(noach.date.hebrew.day, 6);
	assert.equal(noach.date.hebrew.monthName, 'Cheshvan');
	const [matot] = await executeTorah(mockCtx([torahParams({ parshaName: 'Matot' })]), 'find', 0);
	assert.equal(matot.date, null);
	const [containing] = await executeTorah(
		mockCtx([torahParams({ parshaName: 'Matot' })]),
		'containing',
		0,
	);
	assert.equal(containing.date.hebrew.day, 28);
	assert.equal(containing.date.hebrew.monthName, 'Tamuz');
});

test('annual schedule starts with Bereshit and includes holidays', async () => {
	const schedule = await executeTorah(mockCtx([torahParams()]), 'schedule', 0);
	assert.ok(schedule.length >= 50);
	assert.deepEqual(schedule[0].parsha, ['Rosh Hashana']);
	assert.equal(schedule[0].chag, true);
	assert.ok(schedule.some((entry) => !entry.chag && entry.parsha[0] === 'Bereshit'));
	const [limited] = [
		await executeTorah(mockCtx([torahParams({ returnAll: false, limit: 5 })]), 'schedule', 0),
	];
	assert.equal(limited.length, 5);
});

test('readings on a Shabbat carry full aliyot and Haftarah', async () => {
	const readings = await executeTorah(
		mockCtx([torahParams({ ...gregorian('2023-10-28') })]),
		'reading',
		0,
	);
	assert.equal(readings.length, 1);
	assert.equal(readings[0].type, 'shabbat');
	assert.deepEqual(readings[0].parsha, ['Lech-Lecha']);
	assert.deepEqual(Object.keys(readings[0].fullkriyah), ['1', '2', '3', '4', '5', '6', '7', 'M']);
	assert.ok(readings[0].haftara);
	assert.ok(readings[0].haftaraVerses > 0);
	const monday = await executeTorah(
		mockCtx([torahParams({ ...gregorian('2023-10-23') })]),
		'reading',
		0,
	);
	assert.ok(monday.some((reading) => reading.type === 'weekday' && reading.weekday));
});

test('named parsha reading carries summary and alternatives', async () => {
	const [pinchas] = await executeTorah(
		mockCtx([torahParams({ parshaName: 'Pinchas' })]),
		'parsha',
		0,
	);
	assert.equal(pinchas.summary, 'Numbers 25:10-30:1');
	assert.ok(pinchas.haftara);
});

test('Shabbat reading rejects holiday displacements with guidance', async () => {
	const [lech] = await executeTorah(
		mockCtx([torahParams({ ...gregorian('2023-10-28') })]),
		'shabbat',
		0,
	);
	assert.deepEqual(lech.parsha, ['Lech-Lecha']);
	await assert.rejects(
		executeTorah(mockCtx([torahParams({ ...gregorian('2023-09-16') })]), 'shabbat', 0),
		/holiday reading/,
	);
});

test('aliyah formatting produces short and full citations', async () => {
	const [formatted] = await executeTorah(
		mockCtx([
			torahParams({
				aliyahBook: 'Numbers',
				aliyahBegin: '25:10',
				aliyahEnd: '30:1',
				aliyahShowBook: true,
			}),
		]),
		'formatAliyah',
		0,
	);
	assert.equal(formatted.short, 'Numbers 25:10-30:1');
	assert.equal(formatted.full, 'Numbers 25:10-30:1');
	const [compact] = await executeTorah(
		mockCtx([
			torahParams({
				aliyahBook: 'Numbers',
				aliyahBegin: '28:9',
				aliyahEnd: '28:15',
				aliyahShowBook: false,
			}),
		]),
		'formatAliyah',
		0,
	);
	assert.equal(compact.short, '28:9-15');
	await assert.rejects(executeTorah(mockCtx([torahParams({ parshaName: 'Bogus' })]), 'parsha', 0));
});

test('triennial cycle math and bounds', async () => {
	const [cycle] = await executeTriennial(mockCtx([triennialParams()]), 'cycle', 0);
	assert.equal(cycle.cycleYear, 2);
	assert.equal(cycle.cycleStartYear, 5783);
	assert.equal(cycle.scheduleStartYear, 5783);
	await assert.rejects(
		executeTriennial(mockCtx([triennialParams({ hebrewYear: 5700 })]), 'cycle', 0),
		/5744/,
	);
});

test('triennial parsha and named readings expose aliyot', async () => {
	const [parsha] = await executeTriennial(mockCtx([triennialParams()]), 'parsha', 0);
	assert.deepEqual(Object.keys(parsha.aliyot), ['1', '2', '3', '4', '5', '6', '7', 'M']);
	assert.equal(parsha.cycleYear, 2);
	const [named] = await executeTriennial(mockCtx([triennialParams()]), 'reading', 0);
	assert.ok(named.aliyot['1']);
	assert.equal(named.cycleYear, 1);
});

test('triennial holiday haftara resolves Rosh Hashana II', async () => {
	const haftara = await executeTriennial(
		mockCtx([triennialParams({ ...gregorian('2023-09-17'), cycleYear: 1 })]),
		'holidayHaftara',
		0,
	);
	assert.equal(haftara.length, 1);
	assert.equal(haftara[0].triHaftara, 'Jeremiah 31:2-20');
});

test('triennial CSV renders in memory without filesystem access', async () => {
	const [csv] = await executeTriennial(mockCtx([triennialParams()]), 'csv', 0);
	assert.ok(csv.csv.startsWith('"Date","Parashah","Aliyah","Triennial Reading","Verses"'));
	assert.ok(csv.csv.includes('Bereshit'));
	assert.ok(csv.csv.length > 10000);
});

test('node execute dispatches torah and triennial with pairing', async () => {
	const node = new Hebcal();
	const ctx = mockCtx(
		[
			{ resource: 'torah', operation: 'sedra', ...torahParams({ ...gregorian('2023-10-29') }) },
			{ resource: 'triennial', operation: 'cycle', ...triennialParams() },
		],
		false,
	);
	const [items] = await node.execute.call(ctx);
	assert.equal(items.length, 2);
	assert.deepEqual(items[0].pairedItem, { item: 0 });
	assert.deepEqual(items[0].json.parsha, ['Vayera']);
	assert.equal(items[1].json.cycleYear, 2);
});
