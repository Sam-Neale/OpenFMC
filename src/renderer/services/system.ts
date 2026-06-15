export const systemService = {
	async openExternal(url: string): Promise<void> {
		await window.openFmc.system.openExternal(url);
	},
};
