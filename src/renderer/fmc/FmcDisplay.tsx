import type { FmcScreenModel } from "./types";

interface FmcDisplayProps {
	screen: FmcScreenModel;
}

export function FmcDisplay({ screen }: FmcDisplayProps) {
	return (
		<section
			className="fmc-display"
			aria-label="Flight management computer display"
		>
			<header className="fmc-display__title">
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
						<div className="fmc-display__slot" key={index}>
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
								<span>{slot.valueLeft}</span>
								<span>{slot.valueCenter}</span>
								<span>{slot.valueRight}</span>
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
