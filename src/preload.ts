// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("openFmc", {
	navData: {
		inspect: () => ipcRenderer.invoke("navdata:inspect"),
	},
	aircraft: {
		list: () => ipcRenderer.invoke("aircraft:list"),
		refresh: () => ipcRenderer.invoke("aircraft:refresh"),
	},
});
