import type { FmcScreenModel } from "./types";

interface FmcDisplayProps {
	screen: FmcScreenModel;
}

function getValueClassName(
	disabled?: boolean,
	boxed?: boolean,
	color?: string,
	size?: string,
): string | undefined {
	const classNames = [
		disabled ? "fmc-display__value--disabled" : null,
		boxed ? "fmc-display__value--boxed" : null,
		color ? `fmc-display__value--${color}` : null,
		size ? `fmc-display__value--${size}` : null,
	].filter(Boolean);

	return classNames.length > 0 ? classNames.join(" ") : undefined;
}

export function FmcDisplay({ screen }: FmcDisplayProps) {
	const isRouteTitle = screen.title.includes("RTE");

	return (
		<section
			className="fmc-display"
			aria-label="Flight management computer display"
		>
			<header
				className={
					isRouteTitle
						? "fmc-display__title fmc-display__title--route"
						: "fmc-display__title"
				}
			>
				<span />
				<strong>{screen.title}</strong>
				<span>{screen.page}</span>
			</header>

			<div className="fmc-display__slots">
				{screen.slots.map((slot, index) => {
					const hasLabels = Boolean(
						slot.labelLeft || slot.labelCenter || slot.labelRight,
					);

					return (
						<div
							className={
								slot.disabled
									? "fmc-display__slot fmc-display__slot--disabled"
									: "fmc-display__slot"
							}
							key={index}
						>
							{hasLabels ? (
								<div className="fmc-display__labels">
									<span>{slot.labelLeft}</span>
									<span>{slot.labelCenter}</span>
									<span>{slot.labelRight}</span>
								</div>
							) : (
								<div className="fmc-display__label-gap" aria-hidden="true" />
							)}

							<div className="fmc-display__values">
								<span
									className={getValueClassName(
										slot.disabledLeft,
										slot.boxedLeft,
										slot.colorLeft,
										slot.sizeLeft,
									)}
								>
									{slot.valueLeft}
								</span>
								<span
									className={getValueClassName(
										slot.disabledCenter,
										slot.boxedCenter,
										slot.colorCenter,
										slot.sizeCenter,
									)}
								>
									{slot.valueCenter}
								</span>
								<span
									className={getValueClassName(
										slot.disabledRight,
										slot.boxedRight,
										slot.colorRight,
										slot.sizeRight,
									)}
								>
									{slot.valueRight}
								</span>
							</div>
						</div>
					);
				})}
			</div>

			<div className="fmc-display__scratchpad">
				{screen.scratchpad || "\u00A0"}
			</div>
		</section>
	);
}
