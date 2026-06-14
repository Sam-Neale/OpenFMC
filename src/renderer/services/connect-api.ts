export const connectApiService = {
	async connect(): Promise<void> {
		console.log("Connecting to Infinite Flight ConnectAPI...");

		// Replace this with your actual ConnectAPI connection.
		await new Promise<void>((resolve) => {
			window.setTimeout(resolve, 750);
		});
	},

	async disconnect(): Promise<void> {
		console.log("Disconnecting from Infinite Flight ConnectAPI...");

		await new Promise<void>((resolve) => {
			window.setTimeout(resolve, 250);
		});
	},
};
