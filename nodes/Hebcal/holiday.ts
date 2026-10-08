import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { dateInputProperties, getDateParameter, requiredInteger } from './dateUtils';
import { serializeEvent, EVENT_FLAG_OPTIONS, type HebcalEvent } from './events';
import { loadHebcalCore } from './library';
import { HEBREW_LOCALES } from './locales';

export const holidayOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['holiday'] } },
	options: [
		{
			name: 'Holidays For Year',
			value: 'year',
			description: 'List holidays observed during a Hebrew year for one schedule',
			action: 'Get holidays for a year',
		},
		{
			name: 'Holidays On Date',
			value: 'onDate',
			description: 'Look up the holidays falling on a single date',
			action: 'Get holidays on a date',
		},
	],
	default: 'onDate',
};

export const holidayFields: INodeProperties[] = [
	...dateInputProperties('date', 'holiday', ['onDate']),
	{
		displayName: 'Schedule',
		name: 'schedule',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Both Schedules', value: 'both' },
			{ name: 'Diaspora', value: 'diaspora' },
			{ name: 'Israel', value: 'israel' },
		],
		default: 'both',
		description: 'Omitting the schedule returns Israel and Diaspora events unfiltered',
		displayOptions: { show: { resource: ['holiday'], operation: ['onDate'] } },
	},
	{
		displayName: 'Hebrew Year',
		name: 'hebrewYear',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 5786,
		displayOptions: { show: { resource: ['holiday'], operation: ['year'] } },
	},
	{
		displayName: 'Israel Schedule',
		name: 'israelSchedule',
		type: 'boolean',
		default: false,
		description: 'Whether to use the Israeli holiday schedule for the year',
		displayOptions: { show: { resource: ['holiday'], operation: ['year'] } },
	},
	{
		displayName: 'Flags Filter',
		name: 'flagsFilter',
		type: 'multiOptions',
		options: EVENT_FLAG_OPTIONS,
		default: [],
		description: 'Keep only holidays carrying these flags',
		displayOptions: { show: { resource: ['holiday'], operation: ['onDate', 'year'] } },
	},
	{
		displayName: 'Flag Match',
		name: 'flagMatch',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Match All Flags', value: 'all' },
			{ name: 'Match Any Flag', value: 'any' },
		],
		default: 'any',
		displayOptions: { show: { resource: ['holiday'], operation: ['onDate', 'year'] } },
	},
	{
		displayName: 'Locale',
		name: 'locale',
		type: 'options',
		options: HEBREW_LOCALES,
		default: 'en',
		description: 'Language used for holiday titles; passed explicitly per item',
		displayOptions: { show: { resource: ['holiday'], operation: ['onDate', 'year'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['holiday'], operation: ['year'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, numberPrecision: 0 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['holiday'], operation: ['year'], returnAll: [false] },
		},
	},
];

function applyFlagsFilter(
	events: HebcalEvent[],
	ctx: IExecuteFunctions,
	itemIndex: number,
): HebcalEvent[] {
	const selected = (ctx.getNodeParameter('flagsFilter', itemIndex) as string[]) ?? [];
	if (selected.length === 0) return events;
	const match = ctx.getNodeParameter('flagMatch', itemIndex) as string;
	if (match !== 'any' && match !== 'all') throw new RangeError(`Unsupported flag match: ${match}`);
	return events.filter((event) =>
		match === 'any'
			? selected.some((name) => event.hasFlag(name as Parameters<HebcalEvent['hasFlag']>[0]))
			: selected.every((name) => event.hasFlag(name as Parameters<HebcalEvent['hasFlag']>[0])),
	);
}

export async function executeHoliday(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const { getHolidaysOnDate, HebrewCalendar } = await loadHebcalCore();
	const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';

	if (operation === 'onDate') {
		const date = await getDateParameter(ctx, itemIndex, 'date');
		const schedule = ctx.getNodeParameter('schedule', itemIndex) as string;
		let israel: boolean | undefined;
		if (schedule === 'israel') israel = true;
		else if (schedule === 'diaspora') israel = false;
		else if (schedule !== 'both') throw new RangeError(`Unsupported schedule: ${schedule}`);
		const events = applyFlagsFilter(getHolidaysOnDate(date, israel) ?? [], ctx, itemIndex);
		return events.map((event) => serializeEvent(event, locale));
	}

	if (operation === 'year') {
		const year = requiredInteger(ctx.getNodeParameter('hebrewYear', itemIndex), 'Hebrew year');
		if (year < 1 || year > 9999) throw new RangeError('Hebrew year must be between 1 and 9999');
		const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
		let events = applyFlagsFilter(HebrewCalendar.getHolidaysForYearArray(year, israel), ctx, itemIndex);
		const returnAll = ctx.getNodeParameter('returnAll', itemIndex) as boolean;
		if (!returnAll) {
			const limit = requiredInteger(ctx.getNodeParameter('limit', itemIndex), 'Limit');
			if (limit < 1) throw new RangeError('Limit must be at least 1');
			events = events.slice(0, limit);
		}
		return events.map((event) => serializeEvent(event, locale));
	}

	throw new RangeError(`Unsupported Holiday operation: ${operation}`);
}
