import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { loadHebcalCore, type HebcalCore, type HebrewDate } from './library';

export type DateInputType = 'gregorian' | 'hebrew' | 'absolute' | 'gematriya';

type ParameterContext = Pick<IExecuteFunctions, 'getNodeParameter'>;

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hebrewMonths = [
	{ name: 'Nisan', value: 1 },
	{ name: 'Iyyar', value: 2 },
	{ name: 'Sivan', value: 3 },
	{ name: 'Tamuz', value: 4 },
	{ name: 'Av', value: 5 },
	{ name: 'Elul', value: 6 },
	{ name: 'Tishrei', value: 7 },
	{ name: 'Cheshvan', value: 8 },
	{ name: 'Kislev', value: 9 },
	{ name: 'Tevet', value: 10 },
	{ name: "Sh'vat", value: 11 },
	{ name: 'Adar / Adar I', value: 12 },
	{ name: 'Adar II (Leap Years Only)', value: 13 },
];

export function dateInputProperties(
	prefix: string,
	resource: string,
	operations: string[],
	label = 'Date',
): INodeProperties[] {
	const commonShow = { resource: [resource], operation: operations };
	const showForType = (type: DateInputType) => ({
		show: { ...commonShow, [`${prefix}Type`]: [type] },
	});

	return [
		{
			displayName: `${label} Input`,
			name: `${prefix}Type`,
			type: 'options',
			noDataExpression: true,
			options: [
				{ name: 'Gregorian Date', value: 'gregorian' },
				{ name: 'Hebrew Date', value: 'hebrew' },
				{ name: 'Rata Die (Absolute Day)', value: 'absolute' },
				{ name: 'Hebrew Gematriya', value: 'gematriya' },
			],
			default: 'gregorian',
			displayOptions: { show: commonShow },
		},
		{
			displayName: 'Gregorian Date',
			name: `${prefix}GregorianDate`,
			type: 'string',
			required: true,
			default: '',
			placeholder: '2024-03-11',
			description: 'Civil date in YYYY-MM-DD form, interpreted without a time or timezone',
			displayOptions: showForType('gregorian'),
		},
		{
			displayName: 'Hebrew Day',
			name: `${prefix}HebrewDay`,
			type: 'number',
			typeOptions: { numberPrecision: 0 },
			required: true,
			default: 1,
			displayOptions: showForType('hebrew'),
		},
		{
			displayName: 'Hebrew Month',
			name: `${prefix}HebrewMonth`,
			type: 'options',
			noDataExpression: true,
			options: hebrewMonths,
			required: true,
			default: 7,
			description: 'Months are numbered from Nisan; Adar II (13) exists only in leap years',
			displayOptions: showForType('hebrew'),
		},
		{
			displayName: 'Hebrew Year',
			name: `${prefix}HebrewYear`,
			type: 'number',
			typeOptions: { numberPrecision: 0 },
			required: true,
			default: 5786,
			displayOptions: showForType('hebrew'),
		},
		{
			displayName: 'Rata Die Day Number',
			name: `${prefix}AbsoluteDay`,
			type: 'number',
			typeOptions: { numberPrecision: 0 },
			required: true,
			default: 738886,
			description: 'Integer Rata Die day count (not a Unix timestamp)',
			displayOptions: showForType('absolute'),
		},
		{
			displayName: 'Hebrew Date in Gematriya',
			name: `${prefix}Gematriya`,
			type: 'string',
			required: true,
			default: '',
			placeholder: 'ט״ו חֶשְׁוָן תשפ״ד',
			description: 'Enter a complete Hebrew date including its year',
			displayOptions: showForType('gematriya'),
		},
	];
}

export function requiredInteger(value: unknown, label: string): number {
	const parsed =
		typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	if (!Number.isSafeInteger(parsed)) {
		throw new RangeError(`${label} must be a whole number`);
	}
	return parsed;
}

export async function parseDateInput(
	type: unknown,
	values: Record<string, unknown>,
): Promise<HebrewDate> {
	const { HDate } = await loadHebcalCore();

	switch (type) {
		case 'gregorian':
			return parseGregorianDate(values.gregorianDate, HDate);
		case 'hebrew': {
			const year = requiredInteger(values.hebrewYear, 'Hebrew year');
			const month = requiredInteger(values.hebrewMonth, 'Hebrew month');
			const day = requiredInteger(values.hebrewDay, 'Hebrew day');
			if (year < 1 || year > 9999) throw new RangeError('Hebrew year must be between 1 and 9999');
			if (month < 1 || month > HDate.monthsInYear(year)) {
				throw new RangeError(`Hebrew month ${month} does not exist in year ${year}`);
			}
			const monthLength = HDate.daysInMonth(month, year);
			if (day < 1 || day > monthLength) {
				throw new RangeError(`Day ${day} does not exist in Hebrew month ${month} of year ${year}`);
			}
			return new HDate(day, month, year);
		}
		case 'absolute': {
			const absoluteDay = requiredInteger(values.absoluteDay, 'Rata Die day number');
			if (absoluteDay < 1) throw new RangeError('Rata Die day number must be positive');
			return new HDate(absoluteDay);
		}
		case 'gematriya': {
			const value = requiredString(values.gematriya, 'Hebrew date in gematriya');
			return HDate.fromGematriyaString(value);
		}
		default:
			throw new RangeError(`Unsupported date input type: ${String(type)}`);
	}
}

export async function getDateParameter(
	ctx: ParameterContext,
	itemIndex: number,
	prefix: string,
): Promise<HebrewDate> {
	const type = ctx.getNodeParameter(`${prefix}Type`, itemIndex);
	const values: Record<string, unknown> = {};

	switch (type) {
		case 'gregorian':
			values.gregorianDate = ctx.getNodeParameter(`${prefix}GregorianDate`, itemIndex);
			break;
		case 'hebrew':
			values.hebrewDay = ctx.getNodeParameter(`${prefix}HebrewDay`, itemIndex);
			values.hebrewMonth = ctx.getNodeParameter(`${prefix}HebrewMonth`, itemIndex);
			values.hebrewYear = ctx.getNodeParameter(`${prefix}HebrewYear`, itemIndex);
			break;
		case 'absolute':
			values.absoluteDay = ctx.getNodeParameter(`${prefix}AbsoluteDay`, itemIndex);
			break;
		case 'gematriya':
			values.gematriya = ctx.getNodeParameter(`${prefix}Gematriya`, itemIndex);
			break;
		default:
			throw new RangeError(`Unsupported date input type: ${String(type)}`);
	}
	return parseDateInput(type, values);
}

export function serializeHebrewDate(date: HebrewDate, locale = 'en'): IDataObject {
	const gregorian = date.greg();
	const year = gregorian.getFullYear();
	const civilYear =
		year >= 0 && year <= 9999
			? String(year).padStart(4, '0')
			: `${year < 0 ? '-' : '+'}${String(Math.abs(year)).padStart(6, '0')}`;
	const gregorianDate = `${civilYear}-${String(gregorian.getMonth() + 1).padStart(2, '0')}-${String(gregorian.getDate()).padStart(2, '0')}`;
	const hebrewYear = date.getFullYear();
	const month = date.getMonth();
	const day = date.getDate();

	return {
		gregorian: gregorianDate,
		hebrew: {
			year: hebrewYear,
			month,
			monthName: date.getMonthName(),
			day,
			rendered: date.render(locale),
			gematriya: date.renderGematriya(),
		},
		absoluteDay: date.abs(),
		weekday: { number: date.getDay(), name: weekdayNames[date.getDay()] },
		hebrewLeapYear: date.isLeapYear(),
	};
}

export async function getCalendarInformation(date: HebrewDate): Promise<IDataObject> {
	const { HDate } = await loadHebcalCore();
	const hebrewYear = date.getFullYear();
	const month = date.getMonth();
	const day = date.getDate();
	return {
		hebrewYear,
		isLeapYear: date.isLeapYear(),
		monthsInYear: HDate.monthsInYear(hebrewYear),
		daysInYear: HDate.daysInYear(hebrewYear),
		longCheshvan: HDate.longCheshvan(hebrewYear),
		shortKislev: HDate.shortKislev(hebrewYear),
		month,
		monthName: date.getMonthName(),
		day,
		daysInMonth: date.daysInMonth(),
	};
}

function parseGregorianDate(value: unknown, HDate: HebcalCore['HDate']): HebrewDate {
	const text = requiredString(value, 'Gregorian date');
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
	if (!match) throw new RangeError('Gregorian date must use YYYY-MM-DD format');
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const monthLength =
		month === 2 ? (isGregorianLeapYear(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
	if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthLength) {
		throw new RangeError(`Invalid Gregorian date: ${text}`);
	}

	// Set full year after construction to avoid Date's special handling of years 0-99.
	const date = new Date(0);
	date.setFullYear(year, month - 1, day);
	date.setHours(12, 0, 0, 0);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		throw new RangeError(`Gregorian date is not representable in the host timezone: ${text}`);
	}
	return new HDate(date);
}

export function requiredString(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.trim() === '')
		throw new RangeError(`${label} is required`);
	return value.trim();
}

function isGregorianLeapYear(year: number): boolean {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
