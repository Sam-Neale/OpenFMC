import type { CSSProperties, PropsWithChildren } from "react";
import type { FmcKey } from "./types";

interface FmcButtonProps extends PropsWithChildren {
	fmcKey: FmcKey;
	onPress: (key: FmcKey) => void;
	className?: string;
	title?: string;
	style?: CSSProperties;
}

export function FmcButton({
	fmcKey,
	onPress,
	className = "",
	title,
	style,
	children,
}: FmcButtonProps) {
	return (
		<button
			type="button"
			className={`fmc-key ${className}`}
			title={title}
			style={style}
			aria-label={title ?? fmcKey.replaceAll("_", " ")}
			onPointerDown={(event) => {
				event.preventDefault();
				onPress(fmcKey);
			}}
		>
			{children}
		</button>
	);
}
