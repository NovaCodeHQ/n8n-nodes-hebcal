import type { IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';
import { dateInputProperties, getDateParameter, serializeHebrewDate } from './dateUtils';
import { loadHebcalCore } from './library';
import { locationProperties, resolveLocation, serializeLocation } from './locations';
import { parseZonedInstant } from './timeUtils';

const HALLEL_LABELS = ['none', 'half', 'whole'] as const;

export const liturgyOperationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['liturgy'] } },
	options: [
		{
			name: 'Daily Status',
			value: 'status',
			description: 'Hallel, Tachanun, Eruv Tavshilin, fast, and mourning status',
			action: 'Get the daily status',
		},
		{
			name: 'Work Prohibition',
			value: 'work',
			description: 'Whether melacha is prohibited at an instant for a location',
			action: 'Check work prohibition',
		},
	],
	default: 'status',
};

export const liturgyFields: INodeProperties[] = [
	...dateInputProperties('date', 'liturgy', ['status']),
	{
		displayName: 'Israel Schedule',
		name: 'israelSchedule',
		type: 'boolean',
		default: false,
		description: 'Whether to use the Israeli schedule for observance',
		displayOptions: { show: { resource: ['liturgy'], operation: ['status'] } },
	},
	{
		displayName: 'Moment',
		name: 'moment',
		type: 'string',
		required: true,
		default: '',
		placeholder: '2024-04-26T23:50:00Z',
		description: 'The moment to test, as an ISO-8601 instant with timezone or offset',
		displayOptions: { show: { resource: ['liturgy'], operation: ['work'] } },
	},
	...locationProperties('location', 'liturgy', ['work'], 'custom'),
	{
		displayName: 'Use Elevation',
		name: 'useElevation',
		type: 'boolean',
		default: false,
		description: 'Whether to factor the location elevation into sunset',
		displayOptions: { show: { resource: ['liturgy'], operation: ['work'] } },
	},
];

export async function executeLiturgy(
	ctx: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	const core = await loadHebcalCore();

	if (operation === 'status') {
		const date = await getDateParameter(ctx, itemIndex, 'date');
		const israel = ctx.getNodeParameter('israelSchedule', itemIndex) as boolean;
		const hallel = core.HebrewCalendar.hallel(date, israel);
		return [
			{
				date: serializeHebrewDate(date),
				israel,
				hallel: { value: hallel, label: HALLEL_LABELS[hallel] ?? 'unknown' },
				tachanun: core.tachanun(date, israel),
				eruvTavshilin: core.HebrewCalendar.eruvTavshilin(date, israel),
				fastDay: core.isFastDay(date, israel),
				aveilut: core.isAveilut(date),
			},
		];
	}

	if (operation === 'work') {
		const instant = parseZonedInstant(ctx.getNodeParameter('moment', itemIndex), 'Moment');
		const location = await resolveLocation(ctx, itemIndex, 'location');
		if (!location) throw new RangeError('A location is required to check work prohibition');
		const useElevation = ctx.getNodeParameter('useElevation', itemIndex) as boolean;
		return [
			{
				instant: instant.toString(),
				location: serializeLocation(location),
				prohibited: core.isAssurBemlacha(
					new Date(instant.epochMilliseconds),
					location,
					useElevation,
				),
			},
		];
	}

	throw new RangeError(`Unsupported Liturgy operation: ${operation}`);
}
