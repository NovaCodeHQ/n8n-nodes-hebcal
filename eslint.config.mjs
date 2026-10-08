import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	...configWithoutCloudSupport,
	{
		files: ['package.json'],
		rules: {
			// @hebcal/core is GPL-2.0; this package intentionally follows its license.
			'n8n-nodes-base/community-package-json-license-not-default': 'off',
		},
	},
];
