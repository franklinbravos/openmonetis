import { RiCheckLine } from "@remixicon/react";
import { Fragment } from "react";
import { cn } from "@/shared/utils/ui";

type Step = "upload" | "review" | "done";

const STEPS: { key: Step; label: string }[] = [
	{ key: "upload", label: "Upload" },
	{ key: "review", label: "Revisar" },
	{ key: "done", label: "Concluído" },
];

interface ImportStepsProps {
	/** Etapa ativa no fluxo. */
	active: Step;
	/** Upload concluído no storage (ex.: Supabase). Sem isso, a etapa Upload não recebe ✓. */
	uploadComplete?: boolean;
	className?: string;
}

function isStepCompleted(
	step: Step,
	active: Step,
	uploadComplete: boolean,
): boolean {
	if (step === "upload") {
		return uploadComplete && active !== "upload";
	}

	if (step === "review") {
		return active === "done";
	}

	return false;
}

function isConnectorCompleted(
	afterStep: Step,
	active: Step,
	uploadComplete: boolean,
): boolean {
	if (afterStep === "upload") {
		return uploadComplete;
	}

	if (afterStep === "review") {
		return active === "done";
	}

	return false;
}

export function ImportSteps({
	active,
	uploadComplete = false,
	className,
}: ImportStepsProps) {
	return (
		<div
			className={cn(
				"flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start sm:gap-0",
				className,
			)}
		>
			{STEPS.map((step, index) => {
				const isCompleted = isStepCompleted(step.key, active, uploadComplete);
				const isActive = step.key === active;

				return (
					<Fragment key={step.key}>
						<div className="flex shrink-0 flex-col items-center gap-1 sm:flex-row sm:gap-2">
							<div
								className={cn(
									"flex size-6 items-center justify-center rounded-full border text-xs font-medium transition-colors",
									isCompleted &&
										"border-primary bg-primary text-primary-foreground",
									isActive && "border-primary text-primary",
									!isCompleted &&
										!isActive &&
										"border-muted-foreground/30 text-muted-foreground",
								)}
							>
								{isCompleted ? (
									<RiCheckLine className="size-3.5" />
								) : (
									<span>{index + 1}</span>
								)}
							</div>
							<span
								className={cn(
									"text-xs sm:text-sm",
									isActive && "font-medium text-foreground",
									!isActive && "text-muted-foreground",
								)}
							>
								{step.label}
							</span>
						</div>

						{index < STEPS.length - 1 ? (
							<div
								className={cn(
									"mx-1 h-px min-w-2 flex-1 transition-colors sm:mx-3 sm:w-10 sm:flex-none",
									isConnectorCompleted(step.key, active, uploadComplete)
										? "bg-primary"
										: "bg-border",
								)}
							/>
						) : null}
					</Fragment>
				);
			})}
		</div>
	);
}
