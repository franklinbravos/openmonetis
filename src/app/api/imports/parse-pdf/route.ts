import { NextResponse } from "next/server";
import { parseImportPdfAction } from "@/features/transactions/actions/parse-import-pdf-action";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

export async function POST(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	try {
		const formData = await request.formData();
		const result = await parseImportPdfAction(formData);

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
