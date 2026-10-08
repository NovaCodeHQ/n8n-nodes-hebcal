import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import type { CalOptions } from '@hebcal/core' with { 'resolution-mode': 'import' };
import { dateInputProperties, getDateParameter, parseDateInput, requiredInteger } from './dateUtils';
import { serializeEvent, EVENT_FLAG_OPTIONS } from './events';
import { loadHebcalCore, loadHebcalHdate } from './library';
import { LEARNING_SCHEDULE_OPTIONS } from './learningKeys';
import { HEBREW_LOCALES } from './locales';
import { locationProperties, resolveLocation } from './locations';

const GREGORIAN_MONTH_OPTIONS = [
	{ name: 'January', value: 1 },
	{ name: 'February', value: 2 },
	{ name: 'March', value: 3 },
	{ name: 'April', value: 4 },
	{ name: 'May', value: 5 },
	{ name: 'June', value: 6 },
	{ name: 'July', value: 7 },
	{ name: 'August', value: 8 },
	{ name: 'September', value: 9 },
	{ name: 'October', value: 10 },
	{ name: 'November', value: 11 },
	{ name: 'December', value: 12 },
];

const HEBREW_MONTH_OPTIONS = [
	{ name: 'Nisan (1)', value: 1 },
	{ name: 'Iyyar (2)', value: 2 },
	{ name: 'Sivan (3)', value: 3 },
	{ name: 'Tamuz (4)', value: 4 },
	{ name: 'Av (5)', value: 5 },
	{ name: 'Elul (6)', value: 6 },
	{ name: 'Tishrei (7)', value: 7 },
	{ name: 'Cheshvan (8)', value: 8 },
	{ name: 'Kislev (9)', value: 9 },
	{ name: 'Tevet (10)', value: 10 },
	{ name: "Sh'vat (11)", value: 11 },
	{ name: 'Adar / Adar I (12)', value: 12 },
	{ name: 'Adar II (13, Leap Years Only)', value: 13 },
];

export const calendarOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['calendar'] } },
	options: [
		{
			name: 'Generate Calendar',
			value: 'generate',
			description: 'Generate Jewish calendar events for a year, month, or date range',
			action: 'Generate a calendar',
		},
	],
	default: 'generate',
};

const TIMING_MODES = [
	{ name: 'Default', value: 'default' },
	{ name: 'Degrees Below Horizon', value: 'degrees' },
	{ name: 'Minutes From Sunrise/Set', value: 'minutes' },
];

export const calendarFields: INodeProperties[] = [
	{
		displayName: 'Range',
		name: 'rangeMode',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Date Range', value: 'dateRange' },
			{ name: 'Gregorian Month', value: 'gregorianMonth' },
			{ name: 'Gregorian Year', value: 'gregorianYear' },
			{ name: 'Hebrew Month', value: 'hebrewMonth' },
			{ name: 'Hebrew Year', value: 'hebrewYear' },
		],
		default: 'gregorianYear',
		description: 'Months use exact first-to-last-day endpoints for precise boundaries',
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Gregorian Year',
		name: 'gregorianYear',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 2025,
		displayOptions: {
			show: {
				resource: ['calendar'],
				operation: ['generate'],
				rangeMode: ['gregorianYear', 'gregorianMonth'],
			},
		},
	},
	{
		displayName: 'Hebrew Year',
		name: 'hebrewYear',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 5786,
		displayOptions: {
			show: {
				resource: ['calendar'],
				operation: ['generate'],
				rangeMode: ['hebrewYear', 'hebrewMonth'],
			},
		},
	},
	{
		displayName: 'Gregorian Month',
		name: 'gregorianMonth',
		type: 'options',
		noDataExpression: true,
		options: GREGORIAN_MONTH_OPTIONS,
		required: true,
		default: 1,
		displayOptions: {
			show: { resource: ['calendar'], operation: ['generate'], rangeMode: ['gregorianMonth'] },
		},
	},
	{
		displayName: 'Hebrew Month',
		name: 'hebrewMonth',
		type: 'options',
		noDataExpression: true,
		options: HEBREW_MONTH_OPTIONS,
		required: true,
		default: 7,
		displayOptions: {
			show: { resource: ['calendar'], operation: ['generate'], rangeMode: ['hebrewMonth'] },
		},
	},
	{
		displayName: 'Number of Years',
		name: 'numYears',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		default: 1,
		description: 'Generate multiple years starting from the given year (maximum 2000)',
		displayOptions: {
			show: {
				resource: ['calendar'],
				operation: ['generate'],
				rangeMode: ['gregorianYear', 'hebrewYear'],
			},
		},
	},
	...dateInputProperties('start', 'calendar', ['generate'], 'Start Date').map((property) =>
		property.name.startsWith('startType')
			? property
			: {
					...property,
					displayOptions: {
						show: {
							...(property.displayOptions?.show ?? {}),
							rangeMode: ['dateRange'],
						},
					},
				},
	),
	...dateInputProperties('end', 'calendar', ['generate'], 'End Date').map((property) =>
		property.name.startsWith('endType')
			? property
			: {
					...property,
					displayOptions: {
						show: {
							...(property.displayOptions?.show ?? {}),
							rangeMode: ['dateRange'],
						},
					},
				},
	),
	{
		displayName: 'Israel Schedule',
		name: 'israelSchedule',
		type: 'boolean',
		default: false,
		description: 'Whether to use the Israeli holiday schedule; must agree with the location when one is set',
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	...locationProperties('location', 'calendar', ['generate']),
	{
		displayName: 'Use Elevation',
		name: 'useElevation',
		type: 'boolean',
		default: false,
		description: 'Whether to factor the location elevation into sunrise/sunset-based times',
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Candle Lighting',
		name: 'candlelighting',
		type: 'boolean',
		default: false,
		description: 'Whether to calculate candle-lighting, Havdalah, fast, and Chanukah times',
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Candle Lighting Minutes',
		name: 'candleLightingMins',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		default: 0,
		description: 'Minutes before sundown; 0 uses the traditional default for the location',
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Havdalah Method',
		name: 'havdalahMode',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Default Nightfall', value: 'default' },
			{ name: 'Degrees Below Horizon', value: 'degrees' },
			{ name: 'Minutes After Sunset', value: 'minutes' },
			{ name: 'Suppressed', value: 'suppressed' },
		],
		default: 'default',
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Havdalah Value',
		name: 'havdalahValue',
		type: 'number',
		required: true,
		default: 42,
		description: 'Minutes after sunset, or solar depression degrees (for example 7.083)',
		displayOptions: {
			show: {
				resource: ['calendar'],
				operation: ['generate'],
				havdalahMode: ['minutes', 'degrees'],
			},
		},
	},
	{
		displayName: 'Fast Start Method',
		name: 'fastStartMode',
		type: 'options',
		noDataExpression: true,
		options: TIMING_MODES,
		default: 'default',
		description: "Start of minor fasts; Tisha B'Av always begins at sunset",
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Fast Start Value',
		name: 'fastStartValue',
		type: 'number',
		required: true,
		default: 0,
		description: 'Minutes before sunrise, or solar depression degrees',
		displayOptions: {
			show: {
				resource: ['calendar'],
				operation: ['generate'],
				fastStartMode: ['minutes', 'degrees'],
			},
		},
	},
	{
		displayName: 'Fast End Method',
		name: 'fastEndMode',
		type: 'options',
		noDataExpression: true,
		options: TIMING_MODES,
		default: 'default',
		description: "End of minor fasts; does not affect Tisha B'Av",
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Fast End Value',
		name: 'fastEndValue',
		type: 'number',
		required: true,
		default: 0,
		description: 'Minutes after sunset, or solar depression degrees',
		displayOptions: {
			show: {
				resource: ['calendar'],
				operation: ['generate'],
				fastEndMode: ['minutes', 'degrees'],
			},
		},
	},
	{
		displayName: "Tisha B'Av End Method",
		name: 'tishaBavEndMode',
		type: 'options',
		noDataExpression: true,
		options: TIMING_MODES,
		default: 'default',
		description: "End of Tisha B'Av only; defaults to 6.45 degrees below the horizon",
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: "Tisha B'Av End Value",
		name: 'tishaBavEndValue',
		type: 'number',
		required: true,
		default: 0,
		description: 'Minutes after sunset, or solar depression degrees',
		displayOptions: {
			show: {
				resource: ['calendar'],
				operation: ['generate'],
				tishaBavEndMode: ['minutes', 'degrees'],
			},
		},
	},
	{
		displayName: 'Include Weekly Torah Portions',
		name: 'sedrot',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Include Shabbat Mevarchim',
		name: 'shabbatMevarchim',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Include Omer',
		name: 'omer',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Include Molad Announcement',
		name: 'molad',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Include Yom Kippur Katan',
		name: 'yomKippurKatan',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Include BeHaB Fasts',
		name: 'behab',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Include Yizkor',
		name: 'yizkor',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Exclude Minor Fasts',
		name: 'noMinorFast',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Exclude Modern Holidays',
		name: 'noModern',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Exclude Rosh Chodesh',
		name: 'noRoshChodesh',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Exclude Special Shabbat',
		name: 'noSpecialShabbat',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Exclude All Holidays',
		name: 'noHolidays',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Add Hebrew Dates',
		name: 'addHebrewDates',
		type: 'boolean',
		default: false,
		description: 'Whether to emit a Hebrew-date event for every day in the range',
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Add Hebrew Dates for Events',
		name: 'addHebrewDatesForEvents',
		type: 'boolean',
		default: false,
		description: 'Whether to emit a Hebrew-date event for each day that has events',
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Locale',
		name: 'locale',
		type: 'options',
		options: HEBREW_LOCALES,
		default: 'en',
		description: 'Language used for event titles; passed explicitly per item',
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Time Format',
		name: 'hour12',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: '12-Hour Clock', value: 'twelve' },
			{ name: '24-Hour Clock', value: 'twentyFour' },
			{ name: 'Default', value: 'default' },
		],
		default: 'default',
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Event Flags Filter',
		name: 'maskFlags',
		type: 'multiOptions',
		options: EVENT_FLAG_OPTIONS,
		default: [],
		description: 'Generation-time filter: only generate events carrying these flags',
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Daily Learning',
		name: 'dailyLearning',
		type: 'multiOptions',
		options: LEARNING_SCHEDULE_OPTIONS,
		default: [],
		description: 'Study calendars to include as events',
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		description: 'Whether to return all results or only up to a given limit',
		default: true,
		displayOptions: { show: { resource: ['calendar'], operation: ['generate'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		description: 'Max number of results to return',
		typeOptions: { minValue: 1, numberPrecision: 0 },
		default: 50,
		displayOptions: {
			show: { resource: ['calendar'], operation: ['generate'], returnAll: [false] },
		},
	},
];

function timingOption(
	ctx: IExecuteFunctions,
	itemIndex: number,
	modeName: string,
	valueName: string,
	minutesKey: string,
	degreesKey: string,
): Record<string, number> {
	const mode = ctx.getNodeParameter(modeName, itemIndex) as string;
	if (mode === 'minutes' || mode === 'degrees') {
		const value = ctx.getNodeParameter(valueName, itemIndex) as number;
		if (!Number.isFinite(value) || value <= 0) {
			throw new RangeError(`${valueName} must be a positive number`);
		}
		return mode === 'minutes' ? { [minutesKey]: value } : { [degreesKey]: value };
	}
	if (mode !== 'default') throw new RangeError(`Unsupported timing mode: ${mode}`);
	return {};
}

export async function executeCalendar(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	if (operation !== 'generate')
		throw new RangeError(`Unsupported Calendar operation: ${operation}`);
	const { calendar, flags, HDate } = await loadHebcalCore();
	const options: CalOptions = {};

	const rangeMode = ctx.getNodeParameter('rangeMode', itemIndex) as string;
	if (rangeMode === 'gregorianYear' || rangeMode === 'hebrewYear') {
		const isHebrewYear = rangeMode === 'hebrewYear';
		const year = requiredInteger(
			ctx.getNodeParameter(isHebrewYear ? 'hebrewYear' : 'gregorianYear', itemIndex),
			'Year',
		);
		if (year < 1) throw new RangeError('Year must be positive');
		const numYears = requiredInteger(
			ctx.getNodeParameter('numYears', itemIndex),
			'Number of years',
		);
		if (numYears < 1 || numYears > 2000) {
			throw new RangeError('Number of years must be between 1 and 2000');
		}
		options.year = year;
		options.isHebrewYear = isHebrewYear;
		options.numYears = numYears;
	} else if (rangeMode === 'gregorianMonth' || rangeMode === 'hebrewMonth') {
		// Exact months use explicit first-to-last-day endpoints for precise boundaries.
		const { daysInGregMonth } = await loadHebcalHdate();
		if (rangeMode === 'gregorianMonth') {
			const year = requiredInteger(ctx.getNodeParameter('gregorianYear', itemIndex), 'Year');
			const month = requiredInteger(ctx.getNodeParameter('gregorianMonth', itemIndex), 'Month');
			if (year < 1) throw new RangeError('Year must be positive');
			const lastDay = daysInGregMonth(month, year);
			const pad = (value: number) => String(value).padStart(2, '0');
			options.start = await parseDateInput('gregorian', {
				gregorianDate: `${year}-${pad(month)}-01`,
			});
			options.end = await parseDateInput('gregorian', {
				gregorianDate: `${year}-${pad(month)}-${pad(lastDay)}`,
			});
		} else {
			const year = requiredInteger(ctx.getNodeParameter('hebrewYear', itemIndex), 'Hebrew year');
			const month = requiredInteger(ctx.getNodeParameter('hebrewMonth', itemIndex), 'Hebrew month');
			if (year < 1 || year > 9999) throw new RangeError('Hebrew year must be between 1 and 9999');
			if (month < 1 || month > HDate.monthsInYear(year)) {
				throw new RangeError(`Hebrew month ${month} does not exist in year ${year}`);
			}
			options.start = new HDate(1, month, year);
			options.end = new HDate(HDate.daysInMonth(month, year), month, year);
		}
		// Keep the calendar year context aligned with the explicit endpoints.
		options.isHebrewYear = rangeMode === 'hebrewMonth';
	} else if (rangeMode === 'dateRange') {
		const start = await getDateParameter(ctx, itemIndex, 'start');
		const end = await getDateParameter(ctx, itemIndex, 'end');
		if (start.abs() > end.abs()) throw new RangeError('Start date must not be after end date');
		options.start = start;
		options.end = end;
	} else {
		throw new RangeError(`Unsupported range: ${rangeMode}`);
	}

	const israelSchedule = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
	const location = await resolveLocation(ctx, itemIndex, 'location');
	if (location && location.getIsrael() !== israelSchedule) {
		throw new RangeError(
			'Israel schedule disagrees with the location: an Israeli location requires the Israel schedule, and a Diaspora location requires the Diaspora schedule',
		);
	}
	options.il = israelSchedule;
	if (location) options.location = location;
	if (ctx.getNodeParameter('useElevation', itemIndex)) options.useElevation = true;

	if (ctx.getNodeParameter('candlelighting', itemIndex)) options.candlelighting = true;
	const candleLightingMins = ctx.getNodeParameter('candleLightingMins', itemIndex) as number;
	if (candleLightingMins !== 0) {
		if (!Number.isFinite(candleLightingMins) || candleLightingMins < 0) {
			throw new RangeError('Candle lighting minutes must be zero or positive');
		}
		options.candleLightingMins = candleLightingMins;
	}

	const havdalahMode = ctx.getNodeParameter('havdalahMode', itemIndex) as string;
	if (havdalahMode === 'minutes' || havdalahMode === 'degrees') {
		const value = ctx.getNodeParameter('havdalahValue', itemIndex) as number;
		if (!Number.isFinite(value) || value <= 0) {
			throw new RangeError('Havdalah value must be a positive number');
		}
		if (havdalahMode === 'minutes') options.havdalahMins = value;
		else options.havdalahDeg = value;
	} else if (havdalahMode === 'suppressed') {
		options.havdalahMins = 0;
	} else if (havdalahMode !== 'default') {
		throw new RangeError(`Unsupported Havdalah method: ${havdalahMode}`);
	}

	Object.assign(
		options,
		timingOption(
			ctx,
			itemIndex,
			'fastStartMode',
			'fastStartValue',
			'fastStartMins',
			'fastStartDeg',
		),
	);
	Object.assign(
		options,
		timingOption(ctx, itemIndex, 'fastEndMode', 'fastEndValue', 'fastEndMins', 'fastEndDeg'),
	);
	Object.assign(
		options,
		timingOption(
			ctx,
			itemIndex,
			'tishaBavEndMode',
			'tishaBavEndValue',
			'tishaBavEndMins',
			'tishaBavEndDeg',
		),
	);

	for (const name of [
		'sedrot',
		'shabbatMevarchim',
		'omer',
		'molad',
		'yomKippurKatan',
		'behab',
		'yizkor',
		'noMinorFast',
		'noModern',
		'noRoshChodesh',
		'noSpecialShabbat',
		'noHolidays',
		'addHebrewDates',
		'addHebrewDatesForEvents',
	] as const) {
		if (ctx.getNodeParameter(name, itemIndex)) options[name] = true;
	}

	const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';
	options.locale = locale;
	const hour12 = ctx.getNodeParameter('hour12', itemIndex) as string;
	if (hour12 === 'twelve') options.hour12 = true;
	else if (hour12 === 'twentyFour') options.hour12 = false;
	else if (hour12 !== 'default') throw new RangeError(`Unsupported time format: ${hour12}`);

	const maskFlags = (ctx.getNodeParameter('maskFlags', itemIndex) as string[]) ?? [];
	if (maskFlags.length > 0) {
		let mask = 0;
		for (const name of maskFlags) {
			const value = (flags as Record<string, number>)[name];
			if (!Number.isSafeInteger(value)) throw new RangeError(`Unknown event flag: ${name}`);
			mask |= value;
		}
		options.mask = mask;
	}

	const dailyLearning = (ctx.getNodeParameter('dailyLearning', itemIndex) as string[]) ?? [];
	if (dailyLearning.length > 0) {
		options.dailyLearning = Object.fromEntries(dailyLearning.map((name) => [name, true]));
	}

	const returnAll = ctx.getNodeParameter('returnAll', itemIndex) as boolean;
	let events = calendar(options);
	if (!returnAll) {
		const limit = requiredInteger(ctx.getNodeParameter('limit', itemIndex), 'Limit');
		if (limit < 1) throw new RangeError('Limit must be at least 1');
		events = events.slice(0, limit);
	}

	return events.map((event) => serializeEvent(event, locale));
}
