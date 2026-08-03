import { Skeleton } from "@/shared/components/ui/skeleton";

export default function Loading() {
	return (
		<main className="flex flex-col gap-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-4 w-96 max-w-full" />
			</div>
			<Skeleton className="h-56 w-full rounded-xl" />
			<Skeleton className="h-72 w-full rounded-xl" />
		</main>
	);
}
