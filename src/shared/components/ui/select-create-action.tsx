"use client";

import { RiAddFill } from "@remixicon/react";
import { SelectSeparator } from "@/shared/components/ui/select";

type SelectCreateActionProps = {
	label: string;
	onClick: () => void;
};

export function SelectCreateAction({
	label,
	onClick,
}: SelectCreateActionProps) {
	return (
		<>
			<SelectSeparator />
			<div className="p-1">
				<button
					type="button"
					className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary hover:bg-accent"
					onClick={onClick}
				>
					<RiAddFill className="size-4" aria-hidden />
					{label}
				</button>
			</div>
		</>
	);
}
