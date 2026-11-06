// Jest stand-in for the ESM-only bugfixes package: logs locally, never sends.
export const error = (...inputs: unknown[]): Error => {
	console.error(...inputs);
	return new Error(String(inputs[0]));
};
export const loadConfigFromEnv = () => ({});
export const setDefaultConfig = () => {};
