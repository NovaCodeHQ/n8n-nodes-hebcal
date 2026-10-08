import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import {
	dateInputProperties,
	getDateParameter,
	requiredInteger,
	serializeHebrewDate,
} from './dateUtils';
import { serializeEvent } from './events';
import { loadHebcalCore } from './library';
import { LEARNING_SCHEDULE_OPTIONS } from './learningKeys';
import { HEBREW_LOCALES } from './locales';

const MAX_RANGE_DAYS = 370;

export const learningOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['learning'] } },
	options: [
		{
			name: 'Date Range Lookup',
			value: 'range',
			description: 'Daily readings for every day in a range, skipping empty days',
			action: 'Get readings for a range',
		},
		{
			name: 'List Schedules',
			value: 'schedules',
			description: 'Every registered schedule with its start date',
			action: 'List schedules',
		},
		{
			name: 'Single Date Lookup',
			value: 'lookup',
			description: 'The reading for one schedule on one date, if any',
			action: 'Get the reading for a date',
		},
	],
	default: 'lookup',
};

const showFor = (operations: string[]) => ({
	show: { resource: ['learning'], operation: operations },
});

export const learningFields: INodeProperties[] = [
	{
		displayName: 'Schedule',
		name: 'learningSchedule',
		type: 'options',
		noDataExpression: true,
		options: LEARNING_SCHEDULE_OPTIONS,
		required: true,
		default: 'dafyomi',
		displayOptions: showFor(['lookup', 'range']),
	},
	...dateInputProperties('date', 'learning', ['lookup']),
	...dateInputProperties('start', 'learning', ['range'], 'Start Date'),
	...dateInputProperties('end', 'learning', ['range'], 'End Date'),
	{
		displayName: 'Israel Schedule',
		name: 'israelSchedule',
		type: 'boolean',
		default: false,
		description: 'Whether to use the Israeli schedule for the lookup',
		displayOptions: showFor(['lookup', 'range']),
	},
	{
		displayName: 'Locale',
		name: 'locale',
		type: 'options',
		options: HEBREW_LOCALES,
		default: 'en',
		description: 'Language used for reading titles',
		displayOptions: showFor(['lookup', 'range']),
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: showFor(['range']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, numberPrecision: 0 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['learning'], operation: ['range'], returnAll: [false] },
		},
	},
];

export async function executeLearning(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const { DailyLearning, HDate } = await loadHebcalCore();

	if (operation === 'schedules') {
		return DailyLearning.getCalendars().map((schedule) => {
			const startDate = DailyLearning.getStartDate(schedule);
			return {
				schedule,
				registered: true,
				startDate: startDate ? serializeHebrewDate(startDate) : null,
			};
		});
	}

	const schedule = ctx.getNodeParameter('learningSchedule', itemIndex) as string;
	if (!DailyLearning.has(schedule)) {
		throw new RangeError(`Unknown learning schedule: ${schedule}`);
	}
	const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
	const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';

	if (operation === 'lookup') {
		const date = await getDateParameter(ctx, itemIndex, 'date');
		const event = DailyLearning.lookup(schedule, date, israel);
		return [
			{
				schedule,
				date: serializeHebrewDate(date),
				result: event ? serializeEvent(event, locale) : null,
			},
		];
	}

	if (operation === 'range') {
		const start = await getDateParameter(ctx, itemIndex, 'start');
		const end = await getDateParameter(ctx, itemIndex, 'end');
		if (start.abs() > end.abs()) throw new RangeError('Start date must not be after end date');
		if (end.abs() - start.abs() > MAX_RANGE_DAYS) {
			throw new RangeError(`Date ranges are limited to ${MAX_RANGE_DAYS} days`);
		}
		let results: IDataObject[] = [];
		for (let absolute = start.abs(); absolute <= end.abs(); absolute++) {
			const event = DailyLearning.lookup(schedule, new HDate(absolute), israel);
			if (event) results.push({ schedule, ...serializeEvent(event, locale) });
		}
		const returnAll = ctx.getNodeParameter('returnAll', itemIndex) as boolean;
		if (!returnAll) {
			const limit = requiredInteger(ctx.getNodeParameter('limit', itemIndex), 'Limit');
			if (limit < 1) throw new RangeError('Limit must be at least 1');
			results = results.slice(0, limit);
		}
		return results;
	}

	throw new RangeError(`Unsupported Learning operation: ${operation}`);
}
