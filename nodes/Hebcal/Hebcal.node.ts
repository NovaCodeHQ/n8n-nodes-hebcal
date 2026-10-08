import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { anniversaryFields, anniversaryOperationProperty, executeAnniversary } from './anniversary';
import { calendarFields, calendarOperationProperty, executeCalendar } from './calendar';
import { executeHebrewDate, hebrewDateFields, hebrewDateOperationProperty } from './hebrewDate';
import { executeHoliday, holidayFields, holidayOperationProperty } from './holiday';
import { executeLearning, learningFields, learningOperationProperty } from './learning';
import { executeLiturgy, liturgyFields, liturgyOperationProperty } from './liturgy';
import { executeMolad, moladFields, moladOperationProperty } from './molad';
import { executeOmer, omerFields, omerOperationProperty } from './omer';
import { executeTorah, torahFields, torahOperationProperty } from './torah';
import { executeTriennial, triennialFields, triennialOperationProperty } from './triennial';
import { executeUtilities, utilitiesFields, utilitiesOperationProperty } from './utilities';
import { executeZmanim, zmanimFields, zmanimOperationProperty } from './zmanim';

export const hebcalResources: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Anniversary', value: 'anniversary' },
			{ name: 'Calendar', value: 'calendar' },
			{ name: 'Hebrew Date', value: 'hebrewDate' },
			{ name: 'Holiday', value: 'holiday' },
			{ name: 'Learning', value: 'learning' },
			{ name: 'Liturgy', value: 'liturgy' },
			{ name: 'Molad', value: 'molad' },
			{ name: 'Omer', value: 'omer' },
			{ name: 'Torah', value: 'torah' },
			{ name: 'Triennial', value: 'triennial' },
			{ name: 'Utility', value: 'utility' },
			{ name: 'Zmanim', value: 'zmanim' },
		],
		default: 'hebrewDate',
	},
	hebrewDateOperationProperty,
	anniversaryOperationProperty,
	calendarOperationProperty,
	holidayOperationProperty,
	learningOperationProperty,
	liturgyOperationProperty,
	moladOperationProperty,
	omerOperationProperty,
	torahOperationProperty,
	triennialOperationProperty,
	utilitiesOperationProperty,
	zmanimOperationProperty,
	...hebrewDateFields,
	...anniversaryFields,
	...calendarFields,
	...holidayFields,
	...learningFields,
	...liturgyFields,
	...moladFields,
	...omerFields,
	...torahFields,
	...triennialFields,
	...utilitiesFields,
	...zmanimFields,
];

async function dispatchResource(
	ctx: IExecuteFunctions,
	resource: string,
	operation: string,
	itemIndex: number,
): Promise<IDataObject[]> {
	if (resource === 'anniversary') return executeAnniversary(ctx, operation, itemIndex);
	if (resource === 'calendar') return executeCalendar(ctx, operation, itemIndex);
	if (resource === 'hebrewDate') return executeHebrewDate(ctx, operation, itemIndex);
	if (resource === 'holiday') return executeHoliday(ctx, operation, itemIndex);
	if (resource === 'learning') return executeLearning(ctx, operation, itemIndex);
	if (resource === 'liturgy') return executeLiturgy(ctx, operation, itemIndex);
	if (resource === 'molad') return executeMolad(ctx, operation, itemIndex);
	if (resource === 'omer') return executeOmer(ctx, operation, itemIndex);
	if (resource === 'torah') return executeTorah(ctx, operation, itemIndex);
	if (resource === 'triennial') return executeTriennial(ctx, operation, itemIndex);
	if (resource === 'utility') return executeUtilities(ctx, operation, itemIndex);
	if (resource === 'zmanim') return executeZmanim(ctx, operation, itemIndex);
	throw new NodeOperationError(ctx.getNode(), `Unknown resource: ${resource}`, {
		itemIndex,
	});
}

export class Hebcal implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Hebcal',
		name: 'hebcal',
		icon: { light: 'file:hebcal.svg', dark: 'file:hebcal.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Calculate Jewish calendar dates, observances, readings, and times locally',
		defaults: {
			name: 'Hebcal',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: hebcalResources,
		usableAsTool: true,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const results = await dispatchResource(this, resource, operation, i);

				for (const json of results) {
					returnData.push({ json, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), (error as Error).message, {
					itemIndex: i,
				});
			}
		}

		return [returnData];
	}
}
