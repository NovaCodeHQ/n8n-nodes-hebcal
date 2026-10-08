import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { dateInputProperties, getDateParameter, requiredInteger } from './dateUtils';
import { serializeEvent } from './events';
import { loadHebcalCore } from './library';
import { HEBREW_LOCALES } from './locales';

export const omerOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['omer'] } },
	options: [
		{
			name: 'Count for Date',
			value: 'fromDate',
			description: 'Find the Omer day falling on a date within the season',
			action: 'Get the omer count for a date',
		},
		{
			name: 'Count for Day',
			value: 'byDay',
			description: 'Get the full Omer details for day 1 to 49 of a Hebrew year',
			action: 'Get the omer count for a day',
		},
	],
	default: 'byDay',
};

export const omerFields: INodeProperties[] = [
	{
		displayName: 'Hebrew Year',
		name: 'hebrewYear',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 5786,
		description: 'The Omer is counted from 16 Nisan to 5 Sivan of this year',
		displayOptions: { show: { resource: ['omer'], operation: ['byDay'] } },
	},
	{
		displayName: 'Omer Day',
		name: 'omerDay',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 49, numberPrecision: 0 },
		required: true,
		default: 1,
		displayOptions: { show: { resource: ['omer'], operation: ['byDay'] } },
	},
	...dateInputProperties('date', 'omer', ['fromDate']),
	{
		displayName: 'Locale',
		name: 'locale',
		type: 'options',
		options: HEBREW_LOCALES,
		default: 'en',
		description: 'Language used for Omer titles and counting text',
		displayOptions: { show: { resource: ['omer'], operation: ['byDay', 'fromDate'] } },
	},
];

export async function executeOmer(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const { HDate, OmerEvent } = await loadHebcalCore();
	const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';

	if (operation === 'byDay') {
		const year = requiredInteger(ctx.getNodeParameter('hebrewYear', itemIndex), 'Hebrew year');
		const day = requiredInteger(ctx.getNodeParameter('omerDay', itemIndex), 'Omer day');
		if (year < 1 || year > 9999) throw new RangeError('Hebrew year must be between 1 and 9999');
		if (day < 1 || day > 49) throw new RangeError('Omer day must be between 1 and 49');
		const date = new HDate(16, 1, year).add(day - 1, 'day');
		return [serializeEvent(new OmerEvent(date, day), locale)];
	}

	if (operation === 'fromDate') {
		const date = await getDateParameter(ctx, itemIndex, 'date');
		const year = date.getFullYear();
		const first = new HDate(16, 1, year);
		const last = new HDate(5, 3, year);
		const absoluteDay = date.abs();
		if (absoluteDay < first.abs() || absoluteDay > last.abs()) {
			throw new RangeError(
				'The date is outside the Omer season, which runs from 16 Nisan to 5 Sivan',
			);
		}
		const day = absoluteDay - first.abs() + 1;
		return [serializeEvent(new OmerEvent(date, day), locale)];
	}

	throw new RangeError(`Unsupported Omer operation: ${operation}`);
}
