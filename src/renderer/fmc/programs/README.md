# FMC program SDK

New programs can live in a single `index.ts` file by using `createFmcProgram`
from `../../sdk`.

```ts
import { createFmcProgram } from "../../sdk";

export const myProgram = createFmcProgram({
	id: "MY_PROGRAM",

	pages: [
		{
			title: "MY PAGE",
			slots(api) {
				return [
					{
						labelLeft: "ORIGIN",
						valueLeft: api.store.route.origin,
						onLeft(input, api) {
							if (!input.scratchpad) {
								api.showMessage("ENTER ORIGIN");
								return;
							}

							api.updateStore((store) => ({
								...store,
								route: {
									...store.route,
									origin: input.scratchpad,
								},
							}));

							input.clearScratchpad();
						},
					},
				];
			},
		},
	],
});
```

The `api` object exposes the shared FMC store through `api.store`, updates it
with `api.updateStore`, reads typed scratchpad text through
`input.scratchpad`, changes pages automatically from the `pages` array, and
handles LSK callbacks through `onLeft` and `onRight` on each slot.
