import type { NoteAttachmentData } from "@/features/notes/actions/attachments";
import {
	fetchActionResult,
	jsonRequestBody,
} from "@/shared/lib/actions/action-api-client";
import type { ActionResult } from "@/shared/lib/types/actions";

export type NoteTask = {
	id: string;
	text: string;
	completed: boolean;
};

export type NotePayload = {
	title: string;
	description?: string;
	type: "nota" | "tarefa";
	tasks?: NoteTask[];
};

type PresignResult =
	| { success: true; presignedUrl: string; uploadToken: string }
	| { success: false; error: string };

export async function createNoteClient(
	input: NotePayload,
): Promise<ActionResult<{ noteId: string }>> {
	return fetchActionResult(
		"/api/notes",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível criar a anotação.",
	);
}

export async function updateNoteClient(
	noteId: string,
	input: NotePayload,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/notes/${noteId}`,
		{
			method: "PATCH",
			...jsonRequestBody(input),
		},
		"Não foi possível atualizar a anotação.",
	);
}

export async function deleteNoteClient(noteId: string): Promise<ActionResult> {
	return fetchActionResult(
		`/api/notes/${noteId}`,
		{
			method: "DELETE",
		},
		"Não foi possível remover a anotação.",
	);
}

export async function archiveNoteClient(
	noteId: string,
	input: { archived: boolean },
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/notes/${noteId}/archive`,
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível arquivar a anotação.",
	);
}

export async function getPresignedNoteAttachmentUploadUrlClient(input: {
	noteId: string;
	fileName: string;
	mimeType: string;
	fileSize: number;
}): Promise<PresignResult> {
	const response = await fetch(
		`/api/notes/${input.noteId}/attachments/presign`,
		{
			method: "POST",
			credentials: "include",
			...jsonRequestBody({
				fileName: input.fileName,
				mimeType: input.mimeType,
				fileSize: input.fileSize,
			}),
		},
	);

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		return { success: false, error: "Algo deu errado." };
	}

	return (await response.json()) as PresignResult;
}

export async function confirmNoteAttachmentUploadClient(input: {
	uploadToken: string;
}): Promise<ActionResult<NoteAttachmentData>> {
	return fetchActionResult(
		"/api/notes/attachments/confirm",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível confirmar o anexo.",
	);
}

export async function removeNoteAttachmentClient(input: {
	noteId: string;
	attachmentId: string;
}): Promise<ActionResult> {
	return fetchActionResult(
		`/api/notes/${input.noteId}/attachments/${input.attachmentId}`,
		{
			method: "DELETE",
		},
		"Não foi possível remover o anexo.",
	);
}
