import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import {
	dateInputProperties,
	getDateParameter,
	requiredInteger,
	serializeHebrewDate,
} from './dateUtils';
import { loadHebcalHdate } from './library';

export const anniversaryOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['anniversary'] } },
	options: [
		{
			name: 'Birthday or Anniversary',
			value: 'birthday',
			description: 'Calculate a birthday or non-yahrzeit anniversary in a Hebrew year',
			action: 'Calculate a birthday or anniversary',
		},
		{
			name: 'Yahrzeit',
			value: 'yahrzeit',
			description: 'Calculate the anniversary of a death in a Hebrew year',
			action: 'Calculate a yahrzeit',
		},
	],
	default: 'birthday',
};

export const anniversaryFields: INodeProperties[] = [
	...dateInputProperties('original', 'anniversary', ['birthday', 'yahrzeit'], 'Original Date'),
	{
		displayName: 'Target Hebrew Year',
		name: 'targetHebrewYear',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		default: 5786,
		description:
			'Birthday accepts the original year; yahrzeit requires a strictly later Hebrew year',
		displayOptions: { show: { resource: ['anniversary'], operation: ['birthday', 'yahrzeit'] } },
	},
];

export async function executeAnniversary(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const { birthdayOrAnniversary, yahrzeit } = await loadHebcalHdate();
	const original = await getDateParameter(ctx, itemIndex, 'original');
	const targetHebrewYear = requiredInteger(
		ctx.getNodeParameter('targetHebrewYear', itemIndex),
		'Target Hebrew year',
	);
	if (targetHebrewYear < 1 || targetHebrewYear > 9999) {
		throw new RangeError('Target Hebrew year must be between 1 and 9999');
	}

	if (operation === 'birthday') {
		const result = birthdayOrAnniversary(targetHebrewYear, original);
		return [
			{
				operation: 'birthday',
				targetHebrewYear,
				original: serializeHebrewDate(original),
				result: result ? serializeHebrewDate(result) : null,
			},
		];
	}

	if (operation === 'yahrzeit') {
		const result = yahrzeit(targetHebrewYear, original);
		return [
			{
				operation: 'yahrzeit',
				targetHebrewYear,
				original: serializeHebrewDate(original),
				result: result ? serializeHebrewDate(result) : null,
			},
		];
	}

	throw new RangeError(`Unsupported Anniversary operation: ${operation}`);
}
