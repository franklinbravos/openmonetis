import { NextResponse } from "next/server";
import { uploadImportSourceFileDirectAction } from "@/features/transactions/actions/import-source-action";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

export async function POST(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	try {
		const formData = await request.formData();
		const result = await uploadImportSourceFileDirectAction(formData);

		return NextResponse.json(result, {
			status: result.success ? 200 : 400,
		});
	} catch (error) {
		const result = handleActionError(error);
		return NextResponse.json(result, {
			status: result.success ? 200 : 400,
		});
	}
}
