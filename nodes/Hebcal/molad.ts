import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { dateInputProperties, getDateParameter, requiredInteger } from './dateUtils';
import { serializeMolad } from './events';
import { loadHebcalCore } from './library';
import { HEBREW_LOCALES } from './locales';

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

export const moladOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['molad'] } },
	options: [
		{
			name: 'Calculate Molad',
			value: 'calculate',
			description: 'Calculate the molad and Kiddush Levana windows for a Hebrew month',
			action: 'Calculate a molad',
		},
		{
			name: 'Molad for Date',
			value: 'forDate',
			description: 'Calculate the molad of the Hebrew month containing a date',
			action: 'Get the molad for a date',
		},
	],
	default: 'calculate',
};

export const moladFields: INodeProperties[] = [
	{
		displayName: 'Hebrew Year',
		name: 'hebrewYear',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 5786,
		displayOptions: { show: { resource: ['molad'], operation: ['calculate'] } },
	},
	{
		displayName: 'Hebrew Month',
		name: 'hebrewMonth',
		type: 'options',
		noDataExpression: true,
		options: HEBREW_MONTH_OPTIONS,
		required: true,
		default: 1,
		displayOptions: { show: { resource: ['molad'], operation: ['calculate'] } },
	},
	...dateInputProperties('date', 'molad', ['forDate']),
	{
		displayName: 'Locale',
		name: 'locale',
		type: 'options',
		options: HEBREW_LOCALES,
		default: 'en',
		description: 'Language used for the rendered molad announcement',
		displayOptions: { show: { resource: ['molad'], operation: ['calculate', 'forDate'] } },
	},
];

export async function executeMolad(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const { HDate, Molad } = await loadHebcalCore();
	const locale = (ctx.getNodeParameter('locale', itemIndex) as string) || 'en';

	if (operation === 'calculate') {
		const year = requiredInteger(ctx.getNodeParameter('hebrewYear', itemIndex), 'Hebrew year');
		const month = requiredInteger(ctx.getNodeParameter('hebrewMonth', itemIndex), 'Hebrew month');
		if (year < 1 || year > 9999) throw new RangeError('Hebrew year must be between 1 and 9999');
		if (month < 1 || month > HDate.monthsInYear(year)) {
			throw new RangeError(`Hebrew month ${month} does not exist in year ${year}`);
		}
		return [serializeMolad(new Molad(year, month), locale)];
	}

	if (operation === 'forDate') {
		const date = await getDateParameter(ctx, itemIndex, 'date');
		return [serializeMolad(new Molad(date.getFullYear(), date.getMonth()), locale)];
	}

	throw new RangeError(`Unsupported Molad operation: ${operation}`);
}
