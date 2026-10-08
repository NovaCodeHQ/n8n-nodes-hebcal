import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import {
	dateInputProperties,
	getCalendarInformation,
	getDateParameter,
	requiredInteger,
	serializeHebrewDate,
} from './dateUtils';
import { loadHebcalCore, loadHebcalHdate } from './library';
import { HEBREW_LOCALES } from './locales';

export const HEBREW_DATE_OPERATIONS = [
	'convert',
	'format',
	'fromGematriya',
	'adjust',
	'difference',
	'weekday',
	'yearInfo',
	'monthInfo',
	'monthFromName',
	'gregorianMonthInfo',
] as const;

export type HebrewDateOperation = (typeof HEBREW_DATE_OPERATIONS)[number];

const WEEKDAY_OPTIONS = [
	{ name: 'Sunday', value: 0 },
	{ name: 'Monday', value: 1 },
	{ name: 'Tuesday', value: 2 },
	{ name: 'Wednesday', value: 3 },
	{ name: 'Thursday', value: 4 },
	{ name: 'Friday', value: 5 },
	{ name: 'Saturday', value: 6 },
];

const MONTH_OPTIONS = [
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

export const hebrewDateOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['hebrewDate'] } },
	options: [
		{
			name: 'Add or Subtract Time',
			value: 'adjust',
			description: 'Add or subtract days, weeks, months, or years',
			action: 'Adjust a date',
		},
		{
			name: 'Compare Two Dates',
			value: 'difference',
			description: 'Calculate the signed day difference and equality for two dates',
			action: 'Compare two dates',
		},
		{
			name: 'Convert Date',
			value: 'convert',
			description: 'Convert between Gregorian, Hebrew, Rata Die, and gematriya dates',
			action: 'Convert a date',
		},
		{
			name: 'Find Weekday Date',
			value: 'weekday',
			description: 'Find a weekday before, after, nearest, or adjacent to a date',
			action: 'Find a weekday date',
		},
		{
			name: 'Format Date',
			value: 'format',
			description: 'Render a Hebrew date in a locale with optional gematriya forms',
			action: 'Format a date',
		},
		{
			name: 'Gregorian Month Information',
			value: 'gregorianMonthInfo',
			description: 'Get Gregorian month length and leap-year status',
			action: 'Get gregorian month information',
		},
		{
			name: 'Hebrew Month Information',
			value: 'monthInfo',
			description: 'Get month name, length, and Tishrei-based month number',
			action: 'Get hebrew month information',
		},
		{
			name: 'Hebrew Year Information',
			value: 'yearInfo',
			description: 'Get leap-year, month-count, day-count, and Cheshvan/Kislev length',
			action: 'Get hebrew year information',
		},
		{
			name: 'Month Number From Name',
			value: 'monthFromName',
			description: 'Resolve a transliterated or Hebrew month name to its number',
			action: 'Resolve a month name',
		},
		{
			name: 'Parse Gematriya Date',
			value: 'fromGematriya',
			description: 'Parse a complete Hebrew date written in gematriya',
			action: 'Parse a gematriya date',
		},
	],
	default: 'convert',
};

export const hebrewDateFields: INodeProperties[] = [
	...dateInputProperties('date', 'hebrewDate', ['convert', 'format', 'adjust', 'weekday']),
	...dateInputProperties('dateA', 'hebrewDate', ['difference'], 'First Date'),
	...dateInputProperties('dateB', 'hebrewDate', ['difference'], 'Second Date'),
	{
		displayName: 'Locale',
		name: 'locale',
		type: 'options',
		options: HEBREW_LOCALES,
		default: 'en',
		description: 'Language used for rendered date names; passed explicitly per item',
		displayOptions: { show: { resource: ['hebrewDate'], operation: ['convert', 'format'] } },
	},
	{
		displayName: 'Show Year',
		name: 'showYear',
		type: 'boolean',
		default: true,
		description: 'Whether the rendered date includes the Hebrew year',
		displayOptions: { show: { resource: ['hebrewDate'], operation: ['format'] } },
	},
	{
		displayName: 'Hebrew Date in Gematriya',
		name: 'gematriyaString',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'ט״ו חֶשְׁוָן תשפ״ד',
		description: 'Complete Hebrew date, including its year',
		displayOptions: { show: { resource: ['hebrewDate'], operation: ['fromGematriya'] } },
	},
	{
		displayName: 'Current Thousands',
		name: 'currentThousands',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		default: 5000,
		description: 'Thousands value assumed when the gematriya year omits it',
		displayOptions: { show: { resource: ['hebrewDate'], operation: ['fromGematriya'] } },
	},
	{
		displayName: 'Direction',
		name: 'direction',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Add', value: 'add' },
			{ name: 'Subtract', value: 'subtract' },
		],
		default: 'add',
		displayOptions: { show: { resource: ['hebrewDate'], operation: ['adjust'] } },
	},
	{
		displayName: 'Amount',
		name: 'amount',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 1,
		description: 'Whole units to add or subtract; month arithmetic walks month lengths',
		displayOptions: { show: { resource: ['hebrewDate'], operation: ['adjust'] } },
	},
	{
		displayName: 'Unit',
		name: 'unit',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Days', value: 'day' },
			{ name: 'Weeks', value: 'week' },
			{ name: 'Months', value: 'month' },
			{ name: 'Years', value: 'year' },
		],
		default: 'day',
		description: 'Year arithmetic normalizes the date and is not anniversary arithmetic',
		displayOptions: { show: { resource: ['hebrewDate'], operation: ['adjust'] } },
	},
	{
		displayName: 'Weekday Mode',
		name: 'weekdayMode',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'After', value: 'after' },
			{ name: 'Before', value: 'before' },
			{ name: 'Nearest', value: 'nearest' },
			{ name: 'Next Day', value: 'next' },
			{ name: 'On or After', value: 'onOrAfter' },
			{ name: 'On or Before', value: 'onOrBefore' },
			{ name: 'Previous Day', value: 'prev' },
		],
		default: 'onOrAfter',
		displayOptions: { show: { resource: ['hebrewDate'], operation: ['weekday'] } },
	},
	{
		displayName: 'Weekday',
		name: 'weekday',
		type: 'options',
		noDataExpression: true,
		options: WEEKDAY_OPTIONS,
		default: 6,
		description: 'Sunday is 0 and Saturday is 6',
		displayOptions: {
			show: {
				resource: ['hebrewDate'],
				operation: ['weekday'],
				weekdayMode: ['before', 'onOrBefore', 'nearest', 'onOrAfter', 'after'],
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
			show: { resource: ['hebrewDate'], operation: ['yearInfo', 'monthInfo'] },
		},
	},
	{
		displayName: 'Hebrew Month',
		name: 'hebrewMonth',
		type: 'options',
		noDataExpression: true,
		options: MONTH_OPTIONS,
		required: true,
		default: 7,
		displayOptions: { show: { resource: ['hebrewDate'], operation: ['monthInfo'] } },
	},
	{
		displayName: 'Month Name',
		name: 'monthName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Cheshvan',
		description: 'Accepts transliterated or Hebrew names; bare Adar defaults to Adar II',
		displayOptions: { show: { resource: ['hebrewDate'], operation: ['monthFromName'] } },
	},
	{
		displayName: 'Gregorian Year',
		name: 'gregorianYear',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 2024,
		displayOptions: { show: { resource: ['hebrewDate'], operation: ['gregorianMonthInfo'] } },
	},
	{
		displayName: 'Gregorian Month',
		name: 'gregorianMonth',
		type: 'options',
		noDataExpression: true,
		options: GREGORIAN_MONTH_OPTIONS,
		required: true,
		default: 1,
		displayOptions: { show: { resource: ['hebrewDate'], operation: ['gregorianMonthInfo'] } },
	},
];

export async function executeHebrewDate(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const { HDate } = await loadHebcalCore();

	switch (operation) {
		case 'convert': {
			const date = await getDateParameter(ctx, itemIndex, 'date');
			const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';
			return [
				{ ...serializeHebrewDate(date, locale), calendar: await getCalendarInformation(date) },
			];
		}
		case 'format': {
			const date = await getDateParameter(ctx, itemIndex, 'date');
			const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';
			const showYear = ctx.getNodeParameter('showYear', itemIndex) as boolean;
			return [
				{
					input: serializeHebrewDate(date, locale),
					rendered: date.render(locale, showYear),
					gematriya: date.renderGematriya(),
					gematriyaNoNikud: date.renderGematriya(true),
					text: date.toString(),
				},
			];
		}
		case 'fromGematriya': {
			const gematriyaString = ctx.getNodeParameter('gematriyaString', itemIndex) as string;
			const currentThousands = requiredInteger(
				ctx.getNodeParameter('currentThousands', itemIndex),
				'Current thousands',
			);
			if (!gematriyaString?.trim()) throw new RangeError('Hebrew date in gematriya is required');
			const date = HDate.fromGematriyaString(gematriyaString.trim(), currentThousands);
			return [{ ...serializeHebrewDate(date), calendar: await getCalendarInformation(date) }];
		}
		case 'adjust': {
			const date = await getDateParameter(ctx, itemIndex, 'date');
			const direction = ctx.getNodeParameter('direction', itemIndex) as string;
			const amount = requiredInteger(ctx.getNodeParameter('amount', itemIndex), 'Amount');
			const unit = ctx.getNodeParameter('unit', itemIndex) as 'day' | 'week' | 'month' | 'year';
			if (!Number.isSafeInteger(amount) || amount === 0) {
				throw new RangeError('Amount must be a non-zero whole number');
			}
			const result =
				direction === 'subtract' ? date.subtract(amount, unit) : date.add(amount, unit);
			return [
				{
					direction,
					amount,
					unit,
					original: serializeHebrewDate(date),
					result: serializeHebrewDate(result),
				},
			];
		}
		case 'difference': {
			const first = await getDateParameter(ctx, itemIndex, 'dateA');
			const second = await getDateParameter(ctx, itemIndex, 'dateB');
			return [
				{
					first: serializeHebrewDate(first),
					second: serializeHebrewDate(second),
					daysFromFirstToSecond: second.deltaDays(first),
					daysFromSecondToFirst: first.deltaDays(second),
					absoluteDays: Math.abs(first.deltaDays(second)),
					isSameDate: first.isSameDate(second),
				},
			];
		}
		case 'weekday': {
			const date = await getDateParameter(ctx, itemIndex, 'date');
			const mode = ctx.getNodeParameter('weekdayMode', itemIndex) as string;
			let result = date;
			if (mode === 'next') result = date.next();
			else if (mode === 'prev') result = date.prev();
			else {
				const weekday = requiredInteger(ctx.getNodeParameter('weekday', itemIndex), 'Weekday');
				if (weekday < 0 || weekday > 6) throw new RangeError('Weekday must be between 0 and 6');
				if (mode === 'before') result = date.before(weekday);
				else if (mode === 'onOrBefore') result = date.onOrBefore(weekday);
				else if (mode === 'nearest') result = date.nearest(weekday);
				else if (mode === 'onOrAfter') result = date.onOrAfter(weekday);
				else if (mode === 'after') result = date.after(weekday);
				else throw new RangeError(`Unsupported weekday mode: ${mode}`);
			}
			return [{ mode, base: serializeHebrewDate(date), result: serializeHebrewDate(result) }];
		}
		case 'yearInfo': {
			const year = requiredInteger(ctx.getNodeParameter('hebrewYear', itemIndex), 'Hebrew year');
			if (year < 1 || year > 9999) throw new RangeError('Hebrew year must be between 1 and 9999');
			return [
				{
					hebrewYear: year,
					isLeapYear: HDate.isLeapYear(year),
					monthsInYear: HDate.monthsInYear(year),
					daysInYear: HDate.daysInYear(year),
					longCheshvan: HDate.longCheshvan(year),
					shortKislev: HDate.shortKislev(year),
				},
			];
		}
		case 'monthInfo': {
			const year = requiredInteger(ctx.getNodeParameter('hebrewYear', itemIndex), 'Hebrew year');
			const month = requiredInteger(ctx.getNodeParameter('hebrewMonth', itemIndex), 'Hebrew month');
			if (year < 1 || year > 9999) throw new RangeError('Hebrew year must be between 1 and 9999');
			if (month < 1 || month > HDate.monthsInYear(year)) {
				throw new RangeError(`Hebrew month ${month} does not exist in year ${year}`);
			}
			const probe = new HDate(1, month, year);
			return [
				{
					hebrewYear: year,
					month,
					monthName: HDate.getMonthName(month, year),
					tishreiMonth: probe.getTishreiMonth(),
					daysInMonth: HDate.daysInMonth(month, year),
				},
			];
		}
		case 'monthFromName': {
			const monthName = ctx.getNodeParameter('monthName', itemIndex) as string;
			if (!monthName?.trim()) throw new RangeError('Month name is required');
			const month = HDate.monthFromName(monthName.trim());
			return [{ monthName: monthName.trim(), month }];
		}
		case 'gregorianMonthInfo': {
			const year = requiredInteger(
				ctx.getNodeParameter('gregorianYear', itemIndex),
				'Gregorian year',
			);
			const month = requiredInteger(
				ctx.getNodeParameter('gregorianMonth', itemIndex),
				'Gregorian month',
			);
			if (month < 1 || month > 12) throw new RangeError('Gregorian month must be between 1 and 12');
			const { isGregLeapYear, daysInGregMonth } = await loadHebcalHdate();
			return [
				{
					gregorianYear: year,
					gregorianMonth: month,
					isLeapYear: isGregLeapYear(year),
					daysInMonth: daysInGregMonth(month, year),
				},
			];
		}
		default:
			throw new RangeError(`Unsupported Hebrew Date operation: ${operation}`);
	}
}
