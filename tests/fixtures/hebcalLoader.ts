export async function loadHebcalPackages() {
	const [core, hdate] = await Promise.all([import('@hebcal/core'), import('@hebcal/hdate')]);
	await Promise.all([
		import('@hebcal/learning'),
		import('@hebcal/leyning'),
		import('@hebcal/triennial'),
		import('@hebcal/locales'),
	]);
	return { core, hdate };
}
