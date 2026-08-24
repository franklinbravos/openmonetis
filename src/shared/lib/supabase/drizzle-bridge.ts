import type { SupabaseClient } from "@supabase/supabase-js";
import {
	asc,
	desc,
	getTableColumns,
	getTableName,
	type SQL,
	type Table,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { getSupabaseAdmin } from "@/shared/lib/supabase/admin";
import type { Database } from "@/shared/lib/supabase/database.types";

/** Incrementar ao alterar a API pública do bridge (invalida cache em db.ts). */
export const DRIZZLE_BRIDGE_VERSION = 16;

type ColumnFilter = {
	table?: string;
	column: string;
};

type Filter =
	| ({ type: "eq" } & ColumnFilter & { value: unknown })
	| ({ type: "neq" } & ColumnFilter & { value: unknown })
	| ({ type: "gt" } & ColumnFilter & { value: unknown })
	| ({ type: "gte" } & ColumnFilter & { value: unknown })
	| ({ type: "lt" } & ColumnFilter & { value: unknown })
	| ({ type: "lte" } & ColumnFilter & { value: unknown })
	| ({ type: "is" } & ColumnFilter & { value: null; negated?: boolean })
	| ({ type: "in" } & ColumnFilter & { values: unknown[] })
	| ({ type: "ilike" } & ColumnFilter & { value: string; negated?: boolean })
	| ({ type: "like" } & ColumnFilter & { value: string; negated?: boolean })
	| { type: "or"; filters: Filter[] }
	| { type: "and"; filters: Filter[] }
	| { type: "unsupported" };

const DRIZZLE_QUERY_KEY = "queryChunks";

/** Operadores de padrão que o PostgREST expressa (`like`/`ilike`, negados ou não). */
const PATTERN_OPERATORS: Record<
	string,
	{ type: "like" | "ilike"; negated?: boolean }
> = {
	like: { type: "like" },
	ilike: { type: "ilike" },
	"not like": { type: "like", negated: true },
	"not ilike": { type: "ilike", negated: true },
};

/** Checagens de nulo que o PostgREST expressa via `.is(col, null)`. */
const NULL_CHECK_OPERATORS: Record<string, { negated: boolean }> = {
	"is null": { negated: false },
	"is not null": { negated: true },
};

/**
 * Texto de chunk que não carrega condição: conectores e pontuação.
 *
 * Qualquer outro texto — chamada de função, `exists`, aritmética — significa que
 * a expressão não é traduzível, e o scanner precisa reclamar em vez de seguir.
 */
const HARMLESS_CHUNK_TEXT = new Set([
	"",
	"(",
	")",
	",",
	"and",
	"or",
	"not",
	"true",
	"false",
	"is",
	"null",
	"is null",
	"is not null",
]);

function toBridgeError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "string") return new Error(error);
	if (
		error &&
		typeof error === "object" &&
		"message" in error &&
		typeof (error as { message: unknown }).message === "string"
	) {
		const message = (error as { message: string }).message;
		const code =
			"code" in error && typeof (error as { code: unknown }).code === "string"
				? (error as { code: string }).code
				: null;
		const bridgeError = new Error(code ? `[${code}] ${message}` : message);
		// Preserva o SQLSTATE: quem trata o erro (ex.: 23505, violação de índice
		// único) precisa lê-lo como propriedade, não garimpar na mensagem.
		if (code) {
			Object.assign(bridgeError, { code });
		}
		return bridgeError;
	}
	return new Error("Falha na operação do banco.");
}

const TABLE_BY_JS_NAME: Record<string, Table> = {
	user: schema.user,
	account: schema.account,
	session: schema.session,
	verification: schema.verification,
	passkey: schema.passkey,
	userPreferences: schema.userPreferences,
	financialAccounts: schema.financialAccounts,
	categories: schema.categories,
	payers: schema.payers,
	payerShares: schema.payerShares,
	payerShareInvites: schema.payerShareInvites,
	cards: schema.cards,
	invoices: schema.invoices,
	budgets: schema.budgets,
	notes: schema.notes,
	savedInsights: schema.savedInsights,
	apiTokens: schema.apiTokens,
	inboxItems: schema.inboxItems,
	dashboardNotificationStates: schema.dashboardNotificationStates,
	installmentAnticipations: schema.installmentAnticipations,
	transactions: schema.transactions,
	attachments: schema.attachments,
	transactionAttachments: schema.transactionAttachments,
	noteAttachments: schema.noteAttachments,
	importBatches: schema.importBatches,
	importCategoryMappings: schema.importCategoryMappings,
	reconciliationSessions: schema.reconciliationSessions,
	reconciliationLines: schema.reconciliationLines,
	reconciliationAliases: schema.reconciliationAliases,
	establishmentLogos: schema.establishmentLogos,
};

const TABLE_BY_DB_NAME: Record<string, Table> = Object.fromEntries(
	Object.values(TABLE_BY_JS_NAME).map((table) => [getTableName(table), table]),
);

/** Nested selects PostgREST por relação Drizzle `with`. */
const RELATION_SELECTS: Record<string, Record<string, string>> = {
	transactions: {
		payer: "pagadores!pagador_id(*)",
		financialAccount: "contas!conta_id(*)",
		card: "cartoes!cartao_id(*)",
		category: "categorias!categoria_id(*)",
		user: "user!user_id(*)",
	},
	payers: {
		user: "user!user_id(*)",
	},
	cards: {
		account: "contas!conta_id(*)",
		transactions: "lancamentos!cartao_id(*)",
		invoices: "faturas!cartao_id(*)",
	},
	financialAccounts: {
		transactions: "lancamentos!conta_id(*)",
	},
	invoices: {
		card: "cartoes!cartao_id(*)",
		transactions: "lancamentos!cartao_id(*)",
	},
	budgets: {
		category: "categorias!categoria_id(*)",
	},
	importBatches: {
		attachment: "anexos!anexo_id(*)",
		user: "user!user_id(*)",
		card: "cartoes!cartao_id(*)",
		account: "contas!conta_id(*)",
	},
	notes: {
		attachments: "anotacoes_anexos(*, anexo:anexos(*))",
	},
	transactions_attachments: {
		attachment: "anexos!anexo_id(*)",
	},
};

function isPgColumn(value: unknown): value is PgColumn {
	return (
		typeof value === "object" &&
		value !== null &&
		"columnType" in value &&
		"name" in value
	);
}

function isPgTable(value: unknown): value is Table {
	if (typeof value !== "object" || value === null || isPgColumn(value)) {
		return false;
	}

	try {
		getTableName(value as Table);
		return true;
	} catch {
		return false;
	}
}

function unwrapSelectionField(value: unknown): unknown {
	if (
		value &&
		typeof value === "object" &&
		"isSelectionField" in (value as object) &&
		"sql" in (value as object)
	) {
		return (value as { sql: unknown }).sql;
	}
	return value;
}

function getSqlChunks(where: SQL | undefined): unknown[] {
	if (!where) return [];
	const unwrapped = unwrapSelectionField(where);
	const chunks = (unwrapped as unknown as Record<string, unknown>)[
		DRIZZLE_QUERY_KEY
	];
	return Array.isArray(chunks) ? chunks : [];
}

function chunkText(part: unknown): string {
	if (typeof part === "object" && part !== null && "value" in part) {
		const value = (part as { value: string | string[] }).value;
		return Array.isArray(value) ? value.join("") : String(value);
	}
	return "";
}

function chunkParamValue(part: unknown): unknown {
	if (typeof part === "string") {
		return part;
	}
	if (
		typeof part === "object" &&
		part !== null &&
		"value" in part &&
		"encoder" in part
	) {
		return (part as { value: unknown }).value;
	}
	return undefined;
}

function normalizeFilterValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => normalizeFilterValue(entry));
	}
	const paramValue = chunkParamValue(value);
	return paramValue !== undefined ? paramValue : value;
}

function columnTable(column: PgColumn): string | undefined {
	try {
		return getTableName(column.table);
	} catch {
		return undefined;
	}
}

function parseComparison(
	column: PgColumn,
	operator: string,
	value: unknown,
): Filter {
	const base = { table: columnTable(column), column: column.name };
	switch (operator.trim()) {
		case "=":
			return { type: "eq", ...base, value: normalizeFilterValue(value) };
		case "<>":
		case "!=":
			return { type: "neq", ...base, value: normalizeFilterValue(value) };
		case ">":
			return { type: "gt", ...base, value: normalizeFilterValue(value) };
		case ">=":
			return { type: "gte", ...base, value: normalizeFilterValue(value) };
		case "<":
			return { type: "lt", ...base, value: normalizeFilterValue(value) };
		case "<=":
			return { type: "lte", ...base, value: normalizeFilterValue(value) };
		default:
			return { type: "unsupported" };
	}
}

function negateFilter(filter: Filter): Filter {
	if (filter.type === "eq") {
		return { ...filter, type: "neq" };
	}
	if (filter.type === "ilike") {
		return { ...filter, negated: !filter.negated };
	}
	return filter;
}

function tryParseOrGroup(chunks: unknown[]): Filter[] | null {
	if (chunks.length < 3) return null;
	if (!chunkText(chunks[0]).includes("(")) return null;
	if (!chunkText(chunks[chunks.length - 1]).includes(")")) return null;

	const innerChunks = getSqlChunks(chunks[1] as SQL);
	const orIndex = innerChunks.findIndex(
		(part) => chunkText(part).trim().toLowerCase() === "or",
	);
	if (orIndex === -1) return null;

	const leftFilters = parseWhereChunk({
		queryChunks: innerChunks.slice(0, orIndex),
	} as SQL);
	const rightFilters = parseWhereChunk({
		queryChunks: innerChunks.slice(orIndex + 1),
	} as SQL);

	return [{ type: "or", filters: [...leftFilters, ...rightFilters] }];
}

/** Chunk de parâmetro (valor ligado), não texto SQL. */
function isParamChunk(part: unknown): boolean {
	return (
		typeof part === "object" &&
		part !== null &&
		"value" in part &&
		"encoder" in part
	);
}

/**
 * Recusa chunk de texto que carrega condição não traduzível.
 *
 * O scanner só entende `coluna operador valor` e os conectores. Chamada de
 * função (`lower(...)`, `abs(...)`), subconsulta (`exists (select ...)`) e
 * aritmética não têm equivalente em PostgREST — e antes eram puladas em
 * silêncio, deixando a consulta sem aquela condição. Vindo de dado financeiro,
 * o resultado errado passava por certo.
 */
function assertChunkCarriesNoCondition(part: unknown): void {
	if (isPgColumn(part) || isParamChunk(part) || Array.isArray(part)) return;

	const text = chunkText(part).trim().toLowerCase();
	if (!text) return;

	const normalized = text.replace(/\s+/g, " ");
	if (HARMLESS_CHUNK_TEXT.has(normalized)) return;

	// Conectores colados em parênteses, ex.: "(", ") and (", " or ".
	const withoutConnectors = normalized
		.replace(/[()]/g, " ")
		.replace(/\b(and|or|not)\b/g, " ")
		.replace(/\s+/g, "")
		.trim();
	if (!withoutConnectors) return;

	throw new Error(
		`[bridge] expressão SQL não traduzível para PostgREST: "${text}". ` +
			"Reescreva com colunas e operadores simples, ou mova a consulta para uma RPC.",
	);
}

function parseWhereChunk(chunk: unknown): Filter[] {
	if (!chunk || typeof chunk !== "object") return [];

	const sqlChunk = chunk as SQL;
	const chunks = getSqlChunks(sqlChunk);
	if (chunks.length === 0) return [];

	const orGroup = tryParseOrGroup(chunks);
	if (orGroup) return orGroup;

	if (
		chunkText(chunks[0]).trim().toLowerCase() === "not" &&
		getSqlChunks(chunks[1] as SQL).length > 0
	) {
		return parseWhereChunk(chunks[1] as SQL).map(negateFilter);
	}

	const text = chunks
		.map((part) => chunkText(part))
		.join("")
		.trim();

	if (text === "false") {
		return [{ type: "eq", column: "id", value: null }];
	}

	const filters: Filter[] = [];
	let i = 0;

	while (i < chunks.length) {
		const part = chunks[i];

		if (isPgColumn(part)) {
			const op = chunkText(chunks[i + 1])
				.trim()
				.toLowerCase();
			const value = chunkParamValue(chunks[i + 2]);

			// `isNull` chega como um único chunk " is null"; `isNotNull`, como
			// " is not null". A versão anterior só testava op === "is", então
			// todo isNull/isNotNull virava no-op silencioso.
			const nullCheck = NULL_CHECK_OPERATORS[op];
			if (nullCheck) {
				filters.push({
					type: "is",
					table: columnTable(part),
					column: part.name,
					value: null,
					negated: nullCheck.negated,
				});
				i += 4;
				continue;
			}

			if (op === "is") {
				const isValue = String(value ?? "").toLowerCase();
				if (isValue.includes("null")) {
					filters.push({
						type: "is",
						table: columnTable(part),
						column: part.name,
						value: null,
						negated: isValue.includes("not"),
					});
					i += 4;
					continue;
				}
			}

			if (op === "in" && Array.isArray(chunks[i + 2])) {
				filters.push({
					type: "in",
					table: columnTable(part),
					column: part.name,
					values: normalizeFilterValue(chunks[i + 2]) as unknown[],
				});
				i += 4;
				continue;
			}

			const patternOp = PATTERN_OPERATORS[op];
			if (patternOp) {
				filters.push({
					type: patternOp.type,
					table: columnTable(part),
					column: part.name,
					value: String(value ?? ""),
					negated: patternOp.negated,
				});
				i += 4;
				continue;
			}

			if (["=", "<>", "!=", ">", ">=", "<", "<="].includes(op)) {
				filters.push(parseComparison(part, op, value));
				i += 4;
				continue;
			}

			// Coluna seguida de operador que o PostgREST não expressa. Antes o
			// scanner pulava e a condição desaparecia calada — resultado errado
			// em dado financeiro é pior que erro.
			throw new Error(
				`[bridge] operador não suportado "${op}" sobre ${columnTable(part) ?? "?"}.${part.name}. ` +
					"Reescreva a condição com operadores que o PostgREST expressa, ou mova a consulta para uma RPC.",
			);
		}

		if (
			typeof part === "object" &&
			part !== null &&
			getSqlChunks(part as SQL).length > 0
		) {
			filters.push(...parseWhereChunk(part));
			i += 1;
			continue;
		}

		assertChunkCarriesNoCondition(part);

		i += 1;
	}

	return filters;
}

export function __parseWhereForTests(where: SQL | undefined): Filter[] {
	return parseWhere(where);
}

function parseWhere(where: SQL | undefined): Filter[] {
	if (!where) return [];
	return parseWhereChunk(where);
}

function filterHasForeignTable(filter: Filter, mainTable: string): boolean {
	if (filter.type === "or" || filter.type === "and") {
		return filter.filters.some((entry) =>
			filterHasForeignTable(entry, mainTable),
		);
	}
	if (filter.type === "unsupported") return false;
	return Boolean(filter.table && filter.table !== mainTable);
}

function partitionFilters(
	filters: Filter[],
	mainTable: string,
): { api: Filter[]; deferred: Filter[] } {
	const api: Filter[] = [];
	const deferred: Filter[] = [];

	for (const filter of filters) {
		if (filter.type === "and") {
			const nested = partitionFilters(filter.filters, mainTable);
			if (nested.api.length > 0) {
				api.push({ type: "and", filters: nested.api });
			}
			if (nested.deferred.length > 0) {
				deferred.push({ type: "and", filters: nested.deferred });
			}
			continue;
		}

		if (filterHasForeignTable(filter, mainTable)) {
			deferred.push(filter);
		} else {
			api.push(filter);
		}
	}

	return { api, deferred };
}

type RowEvalContext = {
	mainTable: string;
	mainRow: Record<string, unknown>;
	joinRows: Map<string, Record<string, unknown> | Record<string, unknown>[]>;
};

function findEmbedKeyForTable(
	fromTable: Table,
	joinTableName: string,
): string | null {
	const tableKey = jsKeyFromTable(fromTable);
	const relations = RELATION_SELECTS[tableKey] ?? {};
	for (const [key, fragment] of Object.entries(relations)) {
		if (fragment.includes(joinTableName)) return key;
	}
	return joinTableName;
}

function buildRowEvalContext(
	fromTable: Table,
	rawRow: Record<string, unknown>,
	joins: { table: Table }[],
): RowEvalContext {
	const mainTable = getTableName(fromTable);
	const mainRow = fromDbRow(fromTable, rawRow);
	const joinRows = new Map<
		string,
		Record<string, unknown> | Record<string, unknown>[]
	>();

	for (const join of joins) {
		const joinTableName = getTableName(join.table);
		const embedKey = findEmbedKeyForTable(fromTable, joinTableName);
		const embed =
			(embedKey ? rawRow[embedKey] : undefined) ?? rawRow[joinTableName];
		if (!embed) continue;

		if (Array.isArray(embed)) {
			joinRows.set(
				joinTableName,
				embed.map((entry) =>
					fromDbRow(join.table, entry as Record<string, unknown>),
				),
			);
			continue;
		}

		joinRows.set(
			joinTableName,
			fromDbRow(join.table, embed as Record<string, unknown>),
		);
	}

	return { mainTable, mainRow, joinRows };
}

function resolveMappedColumnValue(
	row: Record<string, unknown>,
	tableName: string,
	columnName: string,
): unknown {
	if (columnName in row) {
		return row[columnName];
	}

	const table = TABLE_BY_DB_NAME[tableName];
	if (!table) {
		return undefined;
	}

	const columns = getTableColumns(table);
	for (const [jsKey, column] of Object.entries(columns)) {
		if (column.name === columnName) {
			if (jsKey in row) {
				return row[jsKey];
			}
			break;
		}
	}

	return undefined;
}

function getFilterColumnValue(
	ctx: RowEvalContext,
	filter: ColumnFilter,
): unknown {
	const table = filter.table ?? ctx.mainTable;
	if (table === ctx.mainTable) {
		return resolveMappedColumnValue(ctx.mainRow, table, filter.column);
	}

	const joinData = ctx.joinRows.get(table);
	if (!joinData) return null;
	if (Array.isArray(joinData)) {
		return joinData.map((row) =>
			resolveMappedColumnValue(row, table, filter.column),
		);
	}
	return resolveMappedColumnValue(
		joinData as Record<string, unknown>,
		table,
		filter.column,
	);
}

function flattenJoinColumnValue(value: unknown): unknown[] {
	if (!Array.isArray(value)) {
		return [value];
	}
	if (value.length === 0) {
		return [null];
	}
	return value;
}

function columnValuesMatch(
	value: unknown,
	predicate: (scalar: unknown) => boolean,
): boolean {
	return flattenJoinColumnValue(value).some(predicate);
}

function compareFilterValues(
	left: unknown,
	right: unknown,
	operator: "gt" | "gte" | "lt" | "lte",
): boolean {
	if (left == null || right == null) return false;
	if (
		typeof left === "number" &&
		typeof right === "number" &&
		!Number.isNaN(left) &&
		!Number.isNaN(right)
	) {
		if (operator === "gt") return left > right;
		if (operator === "gte") return left >= right;
		if (operator === "lt") return left < right;
		return left <= right;
	}

	const leftText = String(left);
	const rightText = String(right);
	if (operator === "gt") return leftText > rightText;
	if (operator === "gte") return leftText >= rightText;
	if (operator === "lt") return leftText < rightText;
	return leftText <= rightText;
}

function evaluateFilter(ctx: RowEvalContext, filter: Filter): boolean {
	switch (filter.type) {
		case "unsupported":
			return true;
		case "and":
			return filter.filters.every((entry) => evaluateFilter(ctx, entry));
		case "or":
			return filter.filters.some((entry) => evaluateFilter(ctx, entry));
		case "eq":
			return columnValuesMatch(
				getFilterColumnValue(ctx, filter),
				(value) => value === filter.value,
			);
		case "neq":
			return columnValuesMatch(
				getFilterColumnValue(ctx, filter),
				(value) => value !== filter.value,
			);
		case "gt": {
			const value = getFilterColumnValue(ctx, filter);
			return columnValuesMatch(value, (entry) =>
				compareFilterValues(entry, filter.value, "gt"),
			);
		}
		case "gte": {
			const value = getFilterColumnValue(ctx, filter);
			return columnValuesMatch(value, (entry) =>
				compareFilterValues(entry, filter.value, "gte"),
			);
		}
		case "lt": {
			const value = getFilterColumnValue(ctx, filter);
			return columnValuesMatch(value, (entry) =>
				compareFilterValues(entry, filter.value, "lt"),
			);
		}
		case "lte": {
			const value = getFilterColumnValue(ctx, filter);
			return columnValuesMatch(value, (entry) =>
				compareFilterValues(entry, filter.value, "lte"),
			);
		}
		case "is": {
			const isNullValue = columnValuesMatch(
				getFilterColumnValue(ctx, filter),
				(value) => value == null,
			);
			return filter.negated ? !isNullValue : isNullValue;
		}
		case "in": {
			const value = getFilterColumnValue(ctx, filter);
			return columnValuesMatch(value, (entry) => filter.values.includes(entry));
		}
		case "ilike": {
			const value = getFilterColumnValue(ctx, filter);
			const pattern = String(filter.value ?? "");
			const normalizedPattern = pattern.replace(/%/g, "").toLowerCase();
			const matches = columnValuesMatch(value, (entry) =>
				String(entry ?? "")
					.toLowerCase()
					.includes(normalizedPattern),
			);
			return filter.negated ? !matches : matches;
		}
		default:
			return true;
	}
}

function rowMatchesDeferredFilters(
	ctx: RowEvalContext,
	deferred: Filter[],
): boolean {
	return deferred.every((filter) => evaluateFilter(ctx, filter));
}

type EqCondition = {
	left: PgColumn;
	right: PgColumn | unknown;
};

function collectEqConditions(sql: SQL | undefined): EqCondition[] {
	if (!sql) return [];
	const results: EqCondition[] = [];
	const chunks = getSqlChunks(sql);

	for (let i = 0; i < chunks.length; i += 1) {
		const part = chunks[i];
		if (isPgColumn(part) && chunkText(chunks[i + 1]).trim() === "=") {
			const right = chunks[i + 2];
			if (isPgColumn(right)) {
				results.push({ left: part, right });
			} else {
				results.push({
					left: part,
					right: normalizeFilterValue(right),
				});
			}
			i += 3;
			continue;
		}

		if (
			typeof part === "object" &&
			part !== null &&
			getSqlChunks(part as SQL).length > 0
		) {
			results.push(...collectEqConditions(part as SQL));
		}
	}

	return results;
}

type JoinMetadata = {
	joinTable: Table;
	joinFkColumn: string;
	mainPkColumn: string;
	constantFilters: Filter[];
};

function parseJoinMetadata(
	mainTable: Table,
	join: { table: Table; on: SQL },
): JoinMetadata {
	const mainName = getTableName(mainTable);
	const joinName = getTableName(join.table);
	const constantFilters: Filter[] = [];
	let joinFkColumn = "";
	let mainPkColumn = "";

	for (const condition of collectEqConditions(join.on)) {
		const leftTable = columnTable(condition.left);
		const rightIsColumn = isPgColumn(condition.right);
		const rightTable = rightIsColumn
			? columnTable(condition.right as PgColumn)
			: undefined;

		if (rightIsColumn && leftTable && rightTable && leftTable !== rightTable) {
			if (leftTable === joinName && rightTable === mainName) {
				joinFkColumn = condition.left.name;
				mainPkColumn = (condition.right as PgColumn).name;
			} else if (leftTable === mainName && rightTable === joinName) {
				mainPkColumn = condition.left.name;
				joinFkColumn = (condition.right as PgColumn).name;
			}
			continue;
		}

		if (leftTable === joinName) {
			const base = {
				table: joinName,
				column: condition.left.name,
			};
			if (condition.right === null) {
				constantFilters.push({ type: "is", ...base, value: null });
			} else {
				constantFilters.push({
					type: "eq",
					...base,
					value: condition.right,
				});
			}
		}
	}

	return {
		joinTable: join.table,
		joinFkColumn,
		mainPkColumn,
		constantFilters,
	};
}

function resolveShapeColumnValue(
	row: Record<string, unknown>,
	col: PgColumn,
	fromTable: Table,
	joins: { table: Table }[],
): unknown {
	const colTable = columnTable(col);
	const mainTableName = getTableName(fromTable);
	if (!colTable || colTable === mainTableName) {
		return decodeColumnValue(
			col,
			row[col.name] ?? fromDbRow(fromTable, row)[col.name],
		);
	}

	const embedKey = findEmbedKeyForTable(fromTable, colTable);
	const embed = (embedKey ? row[embedKey] : undefined) ?? row[colTable];
	if (!embed) return null;
	if (Array.isArray(embed)) {
		return decodeColumnValue(
			col,
			(embed[0] as Record<string, unknown> | undefined)?.[col.name] ?? null,
		);
	}
	return decodeColumnValue(col, (embed as Record<string, unknown>)[col.name]);
}

function sqlExpressionText(expr: unknown): string {
	if (!expr || typeof expr !== "object") return "";
	return getSqlChunks(expr as SQL)
		.map((part) => {
			if (isPgColumn(part)) return part.name;
			return chunkText(part);
		})
		.join("")
		.toLowerCase();
}

function extractSqlColumns(expr: unknown): PgColumn[] {
	if (!expr || typeof expr !== "object") return [];
	return getSqlChunks(expr as SQL).filter(isPgColumn);
}

function columnValueFromMappedRow(
	row: Record<string, unknown>,
	col: PgColumn,
): unknown {
	if (col.name in row) return row[col.name];
	const columns = getTableColumns(col.table);
	for (const [jsKey, column] of Object.entries(columns)) {
		if (column.name === col.name) {
			return row[jsKey];
		}
	}
	return null;
}

function computeAggregateValue(
	expr: unknown,
	joinRows: Record<string, unknown>[],
	ctx: RowEvalContext,
): number {
	const text = sqlExpressionText(expr);
	const columns = extractSqlColumns(expr);

	if (text.includes("count(")) {
		if (text.includes("count(*)")) {
			return joinRows.length;
		}
		return joinRows.filter((row) => {
			const col = columns.find((entry) => text.includes(entry.name));
			return col ? row[col.name] != null : true;
		}).length;
	}

	if (!text.includes("sum(")) {
		return 0;
	}

	const amountColumn =
		columns.find(
			(entry) => entry.name === "valor" || entry.name === "amount",
		) ?? columns.at(-1);

	const amountColumnTable = amountColumn
		? columnTable(amountColumn)
		: undefined;
	const rowsToSum =
		amountColumnTable === ctx.mainTable
			? [ctx.mainRow]
			: joinRows.length > 0
				? joinRows
				: [ctx.mainRow];

	return rowsToSum.reduce((total, row) => {
		const joinCtx: RowEvalContext = {
			...ctx,
			joinRows: new Map(ctx.joinRows),
		};
		const joinTableName = amountColumn ? columnTable(amountColumn) : undefined;
		if (joinTableName && joinTableName !== ctx.mainTable) {
			joinCtx.joinRows.set(joinTableName, row);
		}

		if (text.includes("case when")) {
			const caseChunks = getSqlChunks(expr as SQL);
			const whenIndex = caseChunks.findIndex((part) =>
				chunkText(part).toLowerCase().includes("when"),
			);
			if (whenIndex >= 0) {
				const whenFilters = parseWhere(caseChunks[whenIndex + 1] as SQL);
				const whenMatches = whenFilters.every((filter) =>
					evaluateFilter(joinCtx, filter),
				);
				const thenIsZero = /\bthen\s+0\b/i.test(text);
				const elseIsZero = /\belse\s+0\b/i.test(text);

				const amountSourceRow =
					amountColumnTable === ctx.mainTable ? ctx.mainRow : row;
				const rawAmount = amountColumn
					? columnValueFromMappedRow(amountSourceRow, amountColumn)
					: 0;
				const amount = Number(rawAmount ?? 0);
				const signedAmount = text.includes("abs(") ? Math.abs(amount) : amount;

				if (whenMatches) {
					return total + (thenIsZero ? 0 : signedAmount);
				}
				return total + (elseIsZero ? 0 : signedAmount);
			}
		}

		const amountSourceRow =
			amountColumnTable === ctx.mainTable ? ctx.mainRow : row;
		const rawAmount = amountColumn
			? columnValueFromMappedRow(amountSourceRow, amountColumn)
			: 0;
		const amount = Number(rawAmount ?? 0);
		if (text.includes("abs(")) {
			return total + Math.abs(amount);
		}
		return total + amount;
	}, 0);
}

function resolveGroupedColumnValue(
	expr: unknown,
	rawMainRow: Record<string, unknown>,
	mainMapped: Record<string, unknown>,
	fromTable: Table,
	joins: { table: Table }[],
	relatedJoinRows: Record<string, unknown>[][],
	joinIndexes: { meta: JoinMetadata }[],
): unknown {
	if (!isPgColumn(expr)) {
		const chunks = getSqlChunks(expr as SQL);
		const nestedColumn = chunks.find(isPgColumn);
		if (nestedColumn) {
			return resolveGroupedColumnValue(
				nestedColumn,
				rawMainRow,
				mainMapped,
				fromTable,
				joins,
				relatedJoinRows,
				joinIndexes,
			);
		}
		return null;
	}

	const colTable = columnTable(expr);
	const mainTableName = getTableName(fromTable);
	if (!colTable || colTable === mainTableName) {
		return decodeColumnValue(
			expr,
			columnValueFromMappedRow(mainMapped, expr) ??
				rawMainRow[expr.name] ??
				null,
		);
	}

	const joinIndex = joinIndexes.findIndex(
		({ meta }) => getTableName(meta.joinTable) === colTable,
	);
	if (joinIndex >= 0) {
		const joinRow = relatedJoinRows[joinIndex]?.[0];
		if (joinRow) {
			return decodeColumnValue(expr, columnValueFromMappedRow(joinRow, expr));
		}
		return null;
	}

	return resolveShapeColumnValue(rawMainRow, expr, fromTable, joins);
}

function qualifyColumn(filter: ColumnFilter, mainTable?: string): string {
	if (!filter.table || !mainTable || filter.table === mainTable) {
		return filter.column;
	}
	return `${filter.table}.${filter.column}`;
}

function formatOrValue(value: unknown): string {
	if (value === null || value === undefined) return "null";
	if (typeof value === "boolean") return String(value);
	if (value instanceof Date) return value.toISOString();
	return String(value);
}

/**
 * O texto cru de um chunk SQL. O StringChunk do Drizzle guarda `value` como
 * array de strings, então ler só `typeof value === "string"` perde o " desc".
 */
function sqlChunkToText(part: unknown): string {
	if (typeof part === "string") return part;
	if (typeof part !== "object" || part === null || !("value" in part))
		return "";

	const value = (part as { value: unknown }).value;
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		return value.filter((item) => typeof item === "string").join(" ");
	}
	return "";
}

/**
 * Extrai coluna + direção de um orderBy do Drizzle.
 * Aceita PgColumn direto (asc) ou wrappers desc()/asc() (objetos SQL com chunks).
 */
export function extractOrderSpec(orderExpr: unknown): {
	column: PgColumn | null;
	ascending: boolean;
} {
	if (isPgColumn(orderExpr)) {
		return { column: orderExpr, ascending: true };
	}

	const chunks = getSqlChunks(orderExpr as SQL);
	const column = chunks.find(isPgColumn) as PgColumn | undefined;
	const direction = chunks.map(sqlChunkToText).join(" ").toLowerCase();

	return {
		column: column ?? null,
		ascending: !direction.includes("desc"),
	};
}

/**
 * O orderBy do relational query aceita array de expressões ou callback
 * `(fields, { asc, desc }) => [...]`. Resolve as duas formas em uma lista.
 */
function normalizeOrderExprs(orderBy: unknown, table: Table): unknown[] {
	if (orderBy === undefined || orderBy === null) return [];

	const resolved =
		typeof orderBy === "function"
			? (
					orderBy as (
						fields: Record<string, PgColumn>,
						operators: { asc: typeof asc; desc: typeof desc },
					) => unknown
				)(getTableColumns(table) as Record<string, PgColumn>, { asc, desc })
			: orderBy;

	if (resolved === undefined || resolved === null) return [];
	return Array.isArray(resolved) ? resolved : [resolved];
}

function filterToOrExpr(filter: Filter, mainTable?: string): string | null {
	if (
		filter.type === "or" ||
		filter.type === "and" ||
		filter.type === "unsupported"
	) {
		return null;
	}

	const col = qualifyColumn(filter, mainTable);
	switch (filter.type) {
		case "eq":
			return `${col}.eq.${formatOrValue(filter.value)}`;
		case "neq":
			return `${col}.neq.${formatOrValue(filter.value)}`;
		case "gt":
			return `${col}.gt.${formatOrValue(filter.value)}`;
		case "gte":
			return `${col}.gte.${formatOrValue(filter.value)}`;
		case "lt":
			return `${col}.lt.${formatOrValue(filter.value)}`;
		case "lte":
			return `${col}.lte.${formatOrValue(filter.value)}`;
		case "is":
			return filter.negated ? `${col}.not.is.null` : `${col}.is.null`;
		case "in":
			return `${col}.in.(${filter.values.map(formatOrValue).join(",")})`;
		case "ilike":
			return filter.negated
				? `${col}.not.ilike.${formatOrValue(filter.value)}`
				: `${col}.ilike.${formatOrValue(filter.value)}`;
		case "like":
			return filter.negated
				? `${col}.not.like.${formatOrValue(filter.value)}`
				: `${col}.like.${formatOrValue(filter.value)}`;
		default:
			return null;
	}
}

function serializeFilterValue(value: unknown): unknown {
	return value instanceof Date ? value.toISOString() : value;
}

// biome-ignore lint/complexity/noBannedTypes: métodos variados do builder PostgREST.
type FilterBuilderMethod = Function;

function applyFilters<
	T extends {
		eq: FilterBuilderMethod;
		neq: FilterBuilderMethod;
		gt: FilterBuilderMethod;
		gte: FilterBuilderMethod;
		lt: FilterBuilderMethod;
		lte: FilterBuilderMethod;
		is: FilterBuilderMethod;
		in: FilterBuilderMethod;
		or: FilterBuilderMethod;
		ilike: FilterBuilderMethod;
		like: FilterBuilderMethod;
		not: FilterBuilderMethod;
	},
>(query: T, filters: Filter[], mainTable?: string): T {
	for (const filter of filters) {
		if (filter.type === "unsupported") continue;
		if (filter.type === "and") {
			for (const nested of filter.filters) {
				query = applyFilters(query, [nested], mainTable);
			}
			continue;
		}
		if (filter.type === "or") {
			const orExpr = filter.filters
				.map((entry) => filterToOrExpr(entry, mainTable))
				.filter((entry): entry is string => Boolean(entry))
				.join(",");
			if (orExpr && orExpr.split(",").length === filter.filters.length) {
				query = query.or(orExpr) as T;
			}
			continue;
		}

		const col = qualifyColumn(filter, mainTable);
		const value =
			"value" in filter ? serializeFilterValue(filter.value) : undefined;
		switch (filter.type) {
			case "eq":
				query = query.eq(col, value) as T;
				break;
			case "neq":
				query = query.neq(col, value) as T;
				break;
			case "gt":
				query = query.gt(col, value) as T;
				break;
			case "gte":
				query = query.gte(col, value) as T;
				break;
			case "lt":
				query = query.lt(col, value) as T;
				break;
			case "lte":
				query = query.lte(col, value) as T;
				break;
			case "is":
				query = filter.negated
					? (query.not(col, "is", null) as T)
					: (query.is(col, filter.value) as T);
				break;
			case "in":
				query = query.in(col, filter.values) as T;
				break;
			case "ilike":
				if (filter.negated) {
					query = query.not(col, "ilike", value) as T;
				} else {
					query = query.ilike(col, value) as T;
				}
				break;
			case "like":
				if (filter.negated) {
					query = query.not(col, "like", value) as T;
				} else {
					query = query.like(col, value) as T;
				}
				break;
		}
	}
	return query;
}

function jsKeyFromTable(table: Table): string {
	for (const [key, value] of Object.entries(TABLE_BY_JS_NAME)) {
		if (value === table) return key;
	}
	return getTableName(table);
}

/** Objeto SQL do Drizzle (não um valor literal). */
function isSqlExpression(value: unknown): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		DRIZZLE_QUERY_KEY in (value as object)
	);
}

/**
 * Remove de um `set` de upsert as referências a `excluded.*`.
 *
 * `excluded.x` significa "grave o valor que está entrando" — que é justamente
 * o que o upsert do PostgREST faz por padrão. Mantê-las no payload enviaria o
 * objeto SQL do Drizzle para a API. Qualquer outra expressão não tem tradução
 * e para aqui, em vez de virar lixo gravado.
 */
function stripExcludedReferences(
	set: Record<string, unknown>,
): Record<string, unknown> {
	const cleaned: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(set)) {
		if (!isSqlExpression(value)) {
			cleaned[key] = value;
			continue;
		}

		const text = sqlExpressionText(value).toLowerCase();
		if (/^excluded\.[a-z0-9_]+$/.test(text)) continue;

		throw new Error(
			`[bridge] expressão SQL não suportada em gravação: "${sqlExpressionText(value)}" (campo "${key}"). ` +
				"Calcule o valor antes de gravar, ou mova a operação para uma RPC.",
		);
	}

	return cleaned;
}

/**
 * Recusa expressão SQL em valores de gravação.
 *
 * O PostgREST recebe JSON: `coluna + 1` ou qualquer cálculo precisa ser
 * resolvido antes, ou virar RPC.
 */
function assertNoSqlExpressions(
	values: Record<string, unknown>,
): Record<string, unknown> {
	for (const [key, value] of Object.entries(values)) {
		if (!isSqlExpression(value)) continue;
		throw new Error(
			`[bridge] expressão SQL não suportada em gravação: "${sqlExpressionText(value)}" (campo "${key}"). ` +
				"Calcule o valor antes de gravar, ou mova a operação para uma RPC.",
		);
	}
	return values;
}

/**
 * Traduz as chaves de um objeto do schema (camelCase) para os nomes reais das
 * colunas. Útil para montar payload de RPC sem duplicar o mapa de nomes.
 */
export function toDbColumnNames(
	table: Table,
	values: Record<string, unknown>,
): Record<string, unknown> {
	return toDbRow(table, values);
}

function toDbRow(
	table: Table,
	values: Record<string, unknown>,
): Record<string, unknown> {
	const columns = getTableColumns(table);
	const row: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(values)) {
		const column = columns[key];
		if (column) {
			row[column.name] = value;
		} else {
			row[key] = value;
		}
	}
	return row;
}

/**
 * Converte o valor cru da API para o tipo que a coluna declara.
 *
 * A API do Supabase devolve JSON: data vira string, `numeric` vira número. O
 * schema promete `Date` e `string` respectivamente, e o resto do código confia
 * nesse contrato — daí erros como `value.getTime is not a function` e
 * `.toFixed` sobre o que deveria ser texto. Contra o Postgres direto o Drizzle
 * já entregava convertido; aqui a conversão precisa ser explícita.
 *
 * O guia é o `dataType` da coluna, que é o tipo TypeScript declarado, e não o
 * tipo do Postgres — assim `date({ mode: "string" })` continua string.
 */
function decodeColumnValue(column: PgColumn, value: unknown): unknown {
	if (value === null || value === undefined) return value;

	switch (column.dataType) {
		case "date": {
			if (value instanceof Date) return value;
			if (typeof value !== "string" && typeof value !== "number") return value;
			const parsed = new Date(value);
			return Number.isNaN(parsed.getTime()) ? value : parsed;
		}
		case "string":
			return typeof value === "number" || typeof value === "bigint"
				? String(value)
				: value;
		case "number":
			if (typeof value === "string") {
				const parsed = Number(value);
				return Number.isNaN(parsed) ? value : parsed;
			}
			return value;
		case "boolean":
			if (typeof value === "string") {
				if (value === "true") return true;
				if (value === "false") return false;
			}
			return value;
		default:
			return value;
	}
}

export function __decodeColumnValueForTests(
	column: PgColumn,
	value: unknown,
): unknown {
	return decodeColumnValue(column, value);
}

function fromDbRow(
	table: Table,
	row: Record<string, unknown>,
): Record<string, unknown> {
	const columns = getTableColumns(table);
	const mapped: Record<string, unknown> = {};
	for (const [jsKey, column] of Object.entries(columns)) {
		if (column.name in row) {
			mapped[jsKey] = decodeColumnValue(column, row[column.name]);
		} else if (jsKey in row) {
			mapped[jsKey] = decodeColumnValue(column, row[jsKey]);
		}
	}
	return mapped;
}

function buildSelectColumns(
	table: Table,
	columns?: Record<string, boolean>,
): string {
	if (!columns) return "*";
	const cols = getTableColumns(table);
	const selected = Object.entries(columns)
		.filter(([, enabled]) => enabled)
		.map(([key]) => cols[key]?.name ?? key);
	return selected.length > 0 ? selected.join(",") : "*";
}

function buildWithSelect(
	tableKey: string,
	withConfig?: Record<string, boolean | object>,
): string {
	if (!withConfig) return "*";
	const relations = RELATION_SELECTS[tableKey];
	if (!relations) return "*";

	const parts = ["*"];
	for (const [relation, enabled] of Object.entries(withConfig)) {
		if (!enabled || !relations[relation]) continue;
		parts.push(relations[relation]);
	}
	return parts.join(",");
}

type FindOptions = {
	where?: SQL;
	columns?: Record<string, boolean>;
	with?: Record<string, boolean | object>;
	orderBy?: unknown;
	limit?: number;
	offset?: number;
};

async function runFind<T extends Table>(
	client: SupabaseClient<Database>,
	table: T,
	options: FindOptions,
	single: boolean,
) {
	const tableKey = jsKeyFromTable(table);
	const tableName = getTableName(table);
	let query = client
		.from(tableName as keyof Database["public"]["Tables"])
		.select(
			options.with
				? buildWithSelect(tableKey, options.with as Record<string, boolean>)
				: buildSelectColumns(table, options.columns),
			{ count: single ? undefined : "exact" },
		);

	const filters = parseWhere(options.where);
	query = applyFilters(query, filters, tableName);

	// A ordenação precisa entrar antes do limit: com findFirst o PostgREST
	// resolve o limit(1) sobre a ordem já aplicada.
	for (const orderExpr of normalizeOrderExprs(options.orderBy, table)) {
		const { column, ascending } = extractOrderSpec(orderExpr);
		if (!column) continue;
		query = query.order(column.name, { ascending }) as typeof query;
	}

	if (options.limit !== undefined) {
		query = query.limit(options.limit);
	} else if (single) {
		query = query.limit(1);
	}
	if (options.offset !== undefined) {
		query = query.range(
			options.offset,
			options.offset + (options.limit ?? 10) - 1,
		);
	}

	const { data, error } = await query;
	if (error) {
		console.error("[bridge] runFind falhou", {
			table: tableName,
			error: error.message,
		});
		throw toBridgeError(error);
	}

	const mapRow = (row: Record<string, unknown>) => {
		const mapped = fromDbRow(table, row);
		if (options.with) {
			for (const relation of Object.keys(options.with)) {
				const relTable = resolveRelationTable(tableKey, relation);
				const relTableName = relTable ? getTableName(relTable) : null;
				// PostgREST devolve as relações aninhadas com o nome da tabela (ex: "pagadores"),
				// não com a chave Drizzle (ex: "payer").
				const relData =
					row[relation] ??
					(relTableName ? row[relTableName] : undefined) ??
					mapped[relation];
				if (relData && typeof relData === "object") {
					if (relTable) {
						mapped[relation] = Array.isArray(relData)
							? relData.map((r) =>
									fromDbRow(relTable, r as Record<string, unknown>),
								)
							: fromDbRow(relTable, relData as Record<string, unknown>);
					}
				}
			}
		}
		return mapped;
	};

	if (single) {
		const row = Array.isArray(data) ? data[0] : data;
		if (!row) return undefined as never;
		return mapRow(row as unknown as Record<string, unknown>) as never;
	}

	if (!data) return [] as never;

	return (data as unknown as Record<string, unknown>[]).map(mapRow) as never;
}

function resolveRelationTable(
	parentKey: string,
	relation: string,
): Table | null {
	const map: Record<string, Record<string, Table>> = {
		transactions: {
			payer: schema.payers,
			financialAccount: schema.financialAccounts,
			card: schema.cards,
			category: schema.categories,
			user: schema.user,
		},
		payers: { user: schema.user },
		cards: { account: schema.financialAccounts },
		invoices: { card: schema.cards },
		budgets: { category: schema.categories },
		importBatches: {
			attachment: schema.attachments,
			user: schema.user,
			card: schema.cards,
			account: schema.financialAccounts,
		},
	};
	return map[parentKey]?.[relation] ?? null;
}

function createQueryApi(client: SupabaseClient<Database>) {
	const query = new Proxy(
		{},
		{
			get(_target, prop: string) {
				const table = TABLE_BY_JS_NAME[prop];
				if (!table) {
					throw new Error(`Tabela Drizzle desconhecida: ${String(prop)}`);
				}
				return {
					findFirst: (options: FindOptions = {}) =>
						runFind(client, table, options, true),
					findMany: (options: FindOptions = {}) =>
						runFind(client, table, options, false),
				};
			},
		},
	);

	return { query };
}

function conflictColumnsToDb(columns: PgColumn[]): string {
	return columns.map((column) => column.name).join(",");
}

function buildInsertReturningSelect(
	table: Table,
	shape?: Record<string, unknown> | null,
): string {
	if (!shape) return "*";

	const columns = getTableColumns(table);
	const selected = Object.entries(shape)
		.map(([jsKey, value]) => {
			if (isPgColumn(value)) return value.name;
			if (value === true) return columns[jsKey]?.name ?? jsKey;
			return null;
		})
		.filter((column): column is string => Boolean(column));

	return selected.length > 0 ? selected.join(",") : "*";
}

function mapInsertReturningRows(
	table: Table,
	shape: Record<string, unknown> | null | undefined,
	rows: Record<string, unknown>[],
): Record<string, unknown>[] {
	if (!shape) {
		return rows.map((row) => fromDbRow(table, row));
	}

	return rows.map((row) => {
		const mapped = fromDbRow(table, row);
		const result: Record<string, unknown> = {};

		for (const key of Object.keys(shape)) {
			if (key in mapped) {
				result[key] = mapped[key];
			}
		}

		return result;
	});
}

type InsertConflictConfig =
	| { mode: "nothing"; columns?: PgColumn[] }
	| { mode: "update"; columns: PgColumn[]; set: Record<string, unknown> };

function createInsertBuilder(client: SupabaseClient<Database>, table: Table) {
	const tableName = getTableName(table);

	function createValuesBuilder(rows: Record<string, unknown>[]) {
		const payload = rows.map((row) => toDbRow(table, row));
		let conflict: InsertConflictConfig | null = null;

		const buildWritePayload = () => {
			if (conflict?.mode === "update") {
				const setDb = toDbRow(table, stripExcludedReferences(conflict.set));
				return payload.map((row) => ({ ...row, ...setDb }));
			}
			return payload;
		};

		const buildUpsertOptions = () => {
			if (!conflict) return null;

			const onConflict =
				conflict.columns && conflict.columns.length > 0
					? conflictColumnsToDb(conflict.columns)
					: undefined;

			if (conflict.mode === "nothing") {
				return {
					onConflict,
					ignoreDuplicates: true as const,
				};
			}

			return { onConflict };
		};

		let executed = false;
		let execution: Promise<unknown[]> | null = null;

		const run = async (
			returningShape?: Record<string, unknown> | null,
		): Promise<unknown[]> => {
			const writePayload = buildWritePayload();
			const upsertOptions = buildUpsertOptions();
			const select = buildInsertReturningSelect(table, returningShape);

			if (upsertOptions) {
				const { data, error } = await client
					.from(tableName as keyof Database["public"]["Tables"])
					.upsert(writePayload as never[], upsertOptions)
					.select(select);
				if (error) {
					console.error("[bridge] upsert falhou", {
						table: tableName,
						error: error.message,
					});
					throw toBridgeError(error);
				}
				return mapInsertReturningRows(
					table,
					returningShape,
					(data ?? []) as unknown as Record<string, unknown>[],
				);
			}

			const { data, error } = await client
				.from(tableName as keyof Database["public"]["Tables"])
				.insert(writePayload as never[])
				.select(select);
			if (error) {
				console.error("[bridge] insert falhou", {
					table: tableName,
					error: error.message,
				});
				throw toBridgeError(error);
			}
			return mapInsertReturningRows(
				table,
				returningShape,
				(data ?? []) as unknown as Record<string, unknown>[],
			);
		};

		const execute = async (
			returningShape?: Record<string, unknown> | null,
		): Promise<unknown[]> => {
			if (executed) return execution ?? Promise.resolve([]);
			executed = true;
			execution = run(returningShape);
			return execution;
		};

		const createThenable = (
			returningShape?: Record<string, unknown> | null,
		) => ({
			async execute() {
				await execute(returningShape);
			},
			// biome-ignore lint/suspicious/noThenProperty: thenable necessário para `await db.insert(...)` (API compatível com Drizzle)
			then<TResult1 = unknown[], TResult2 = never>(
				onfulfilled?:
					| ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
					| null,
				onrejected?:
					| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
					| null,
			) {
				return execute(returningShape).then(onfulfilled, onrejected);
			},
		});

		const chain = {
			onConflictDoNothing(options?: { target?: PgColumn[] }) {
				conflict = { mode: "nothing", columns: options?.target };
				return chain;
			},
			onConflictDoUpdate(options: {
				target: PgColumn[];
				set: Record<string, unknown>;
			}) {
				conflict = {
					mode: "update",
					columns: options.target,
					set: options.set,
				};
				return chain;
			},
			returning(shape?: Record<string, unknown>) {
				return createThenable(shape ?? null);
			},
			async execute() {
				await execute(null);
			},
			// biome-ignore lint/suspicious/noThenProperty: thenable necessário para `await db.insert(...)` (API compatível com Drizzle)
			then<TResult1 = unknown[], TResult2 = never>(
				onfulfilled?:
					| ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
					| null,
				onrejected?:
					| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
					| null,
			) {
				return execute(null).then(onfulfilled, onrejected);
			},
		};

		return chain;
	}

	return {
		values(values: Record<string, unknown> | Record<string, unknown>[]) {
			const rows = Array.isArray(values) ? values : [values];
			return createValuesBuilder(rows);
		},
	};
}

function createDeleteBuilder(client: SupabaseClient<Database>, table: Table) {
	const tableName = getTableName(table);
	return {
		where(where: SQL) {
			let executed = false;
			let execution: Promise<unknown[]> | null = null;

			const run = async (withReturning: boolean): Promise<unknown[]> => {
				// biome-ignore lint/suspicious/noExplicitAny: o builder muda de tipo entre delete() e select()
				let query: any = client
					.from(tableName as keyof Database["public"]["Tables"])
					.delete();
				if (withReturning) {
					query = query.select();
				}
				query = applyFilters(query, parseWhere(where), tableName);
				const { data, error } = await query;
				if (error) {
					console.error("[bridge] delete falhou", {
						table: tableName,
						error: error.message,
					});
					throw toBridgeError(error);
				}
				if (!withReturning) return [];
				return (data ?? []).map((row: Record<string, unknown>) =>
					fromDbRow(table, row),
				);
			};

			const execute = async (withReturning = false): Promise<unknown[]> => {
				if (executed) return execution ?? Promise.resolve([]);
				executed = true;
				execution = run(withReturning);
				return execution;
			};

			const thenable = {
				returning: (shape?: Record<string, unknown>) =>
					execute(true).then((rows) =>
						mapInsertReturningRows(
							table,
							shape,
							rows as Record<string, unknown>[],
						),
					),
				async execute() {
					await execute(false);
				},
				// biome-ignore lint/suspicious/noThenProperty: thenable necessário para `await db.delete(...).where(...)` (API compatível com Drizzle)
				then<TResult1 = unknown[], TResult2 = never>(
					onfulfilled?:
						| ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
						| null,
					onrejected?:
						| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
						| null,
				) {
					return execute(false).then(onfulfilled, onrejected);
				},
			};

			return thenable;
		},
	};
}

function createUpdateBuilder(client: SupabaseClient<Database>, table: Table) {
	const tableName = getTableName(table);
	return {
		set(values: Record<string, unknown>) {
			// Expressão SQL em UPDATE (ex.: `coluna + 1`) não tem tradução em
			// PostgREST e antes seguia como objeto no payload.
			const payload = toDbRow(table, assertNoSqlExpressions(values));
			return {
				where(where: SQL) {
					let executed = false;
					let execution: Promise<unknown[]> | null = null;

					const run = async (withReturning: boolean): Promise<unknown[]> => {
						// biome-ignore lint/suspicious/noExplicitAny: o builder muda de tipo entre update() e select()
						let query: any = client
							.from(tableName as keyof Database["public"]["Tables"])
							.update(payload as never);
						if (withReturning) {
							query = query.select();
						}
						query = applyFilters(query, parseWhere(where), tableName);
						const { data, error } = await query;
						if (error) {
							console.error("[bridge] update falhou", {
								table: tableName,
								error: error.message,
							});
							throw toBridgeError(error);
						}
						if (!withReturning) return [];
						return (data ?? []).map((row: Record<string, unknown>) =>
							fromDbRow(table, row),
						);
					};

					const execute = async (withReturning = false): Promise<unknown[]> => {
						if (executed) return execution ?? Promise.resolve([]);
						executed = true;
						execution = run(withReturning);
						return execution;
					};

					const thenable = {
						returning: async () => execute(true),
						async execute() {
							await execute(false);
						},
						// biome-ignore lint/suspicious/noThenProperty: thenable necessário para `await db.update(...).where(...)` (API compatível com Drizzle)
						then<TResult1 = unknown[], TResult2 = never>(
							onfulfilled?:
								| ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
								| null,
							onrejected?:
								| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
								| null,
						) {
							return execute(false).then(onfulfilled, onrejected);
						},
					};

					return thenable;
				},
			};
		},
	};
}

type SelectShape = Record<string, unknown>;

class SupabaseSelectBuilder {
	private client: SupabaseClient<Database>;
	private shape: SelectShape = {};
	private fromTable: Table | null = null;
	private joins: { table: Table; on: SQL }[] = [];
	private whereClause?: SQL;
	private limitCount?: number;
	private offsetCount?: number;
	private orderExprs: unknown[] = [];
	private groupByExprs: unknown[] = [];
	private distinct = false;

	constructor(
		client: SupabaseClient<Database>,
		options?: { distinct?: boolean },
	) {
		this.client = client;
		this.distinct = options?.distinct ?? false;
	}

	select(shape: SelectShape) {
		this.shape = shape;
		return this;
	}

	from(table: Table) {
		this.fromTable = table;
		return this;
	}

	leftJoin(table: Table, _on: SQL) {
		this.joins.push({ table, on: _on });
		return this;
	}

	innerJoin(table: Table, _on: SQL) {
		this.joins.push({ table, on: _on });
		return this;
	}

	where(where: SQL) {
		this.whereClause = where;
		return this;
	}

	groupBy(...exprs: unknown[]) {
		this.groupByExprs = exprs;
		return this;
	}

	orderBy(...exprs: unknown[]) {
		this.orderExprs = exprs;
		return this;
	}

	limit(count: number) {
		this.limitCount = count;
		return this;
	}

	offset(count: number) {
		this.offsetCount = count;
		return this;
	}

	// biome-ignore lint/suspicious/noThenProperty: thenable necessário para `await db.select(...)` (API compatível com Drizzle)
	async then<TResult1 = unknown[], TResult2 = never>(
		onfulfilled?:
			| ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	) {
		try {
			const result = await this.execute();
			return Promise.resolve(result).then(onfulfilled, onrejected);
		} catch (error) {
			return Promise.reject(error).catch(onrejected);
		}
	}

	private async execute(): Promise<unknown[]> {
		if (!this.fromTable) {
			throw new Error("select().from() é obrigatório");
		}

		if (this.groupByExprs.length > 0) {
			return this.executeWithGroupBy();
		}

		return this.executeFlat();
	}

	private async executeFlat(): Promise<unknown[]> {
		if (!this.fromTable) {
			throw new Error("select().from() é obrigatório");
		}

		const tableName = getTableName(this.fromTable);

		// Shapes puramente agregados (ex: { total: count() }) — usa count exact do PostgREST.
		const shapeEntries = Object.entries(this.shape);
		const isCountOnlyShape =
			shapeEntries.length > 0 &&
			shapeEntries.every(([, expr]) => {
				const text = sqlExpressionText(expr);
				return text.includes("count(") && !text.includes("sum(");
			});
		const isSumOnlyShape =
			shapeEntries.length > 0 &&
			this.joins.length === 0 &&
			shapeEntries.every(([, expr]) => {
				const text = sqlExpressionText(expr);
				return text.includes("sum(") && !text.includes("count(");
			});

		if (isSumOnlyShape) {
			return this.executeSumOnlyShape(tableName, shapeEntries);
		}

		if (isCountOnlyShape) {
			const parsedFilters = parseWhere(this.whereClause);
			const { api } = partitionFilters(parsedFilters, tableName);
			let countQuery = this.client
				.from(tableName as keyof Database["public"]["Tables"])
				.select("*", { count: "exact", head: true });
			countQuery = applyFilters(countQuery, api, tableName);
			const { count, error } = await countQuery;
			if (error) {
				console.error("[bridge] count falhou", {
					table: tableName,
					error: error.message,
				});
				throw toBridgeError(error);
			}
			return [
				Object.fromEntries(
					shapeEntries.map(([alias, expr]) => {
						const text = sqlExpressionText(expr);
						const value = text.includes("count(*)")
							? (count ?? 0)
							: text.includes("count(")
								? (count ?? 0)
								: 0;
						return [alias, value];
					}),
				),
			];
		}

		const tableKey = jsKeyFromTable(this.fromTable);
		const withParts: string[] = ["*"];

		for (const join of this.joins) {
			const rel = RELATION_SELECTS[tableKey];
			for (const fragment of Object.values(rel ?? {})) {
				if (fragment.includes(getTableName(join.table))) {
					withParts.push(fragment);
				}
			}
			if (!rel) {
				withParts.push(`${getTableName(join.table)}(*)`);
			}
		}

		let query = this.client
			.from(tableName as keyof Database["public"]["Tables"])
			.select(withParts.join(","));

		const parsedFilters = parseWhere(this.whereClause);
		const { api, deferred } = partitionFilters(parsedFilters, tableName);
		query = applyFilters(query, api, tableName);

		// Ordenação aplicada no PostgREST apenas para colunas da tabela principal.
		const jsOrder: { key: string; ascending: boolean }[] = [];
		for (const orderExpr of this.orderExprs) {
			const { column, ascending } = extractOrderSpec(orderExpr);
			if (!column) continue;
			if (column.table === this.fromTable) {
				query = query.order(column.name, { ascending }) as typeof query;
			} else {
				jsOrder.push({ key: column.name, ascending });
			}
		}

		if (this.limitCount !== undefined) {
			query = query.limit(this.limitCount);
		}
		if (this.offsetCount !== undefined) {
			query = query.range(
				this.offsetCount,
				this.offsetCount + (this.limitCount ?? 1000) - 1,
			);
		}

		const { data, error } = await query;
		if (error) {
			console.error("[bridge] select falhou", {
				table: tableName,
				with: withParts,
				error,
			});
			throw toBridgeError(error);
		}

		const rows = (data ?? []).filter((row) => {
			if (!this.fromTable || deferred.length === 0) return true;
			const ctx = buildRowEvalContext(
				this.fromTable,
				row as unknown as Record<string, unknown>,
				this.joins,
			);
			return rowMatchesDeferredFilters(ctx, deferred);
		});

		let mappedRows = rows.map((row) =>
			this.mapSelectRow(row as unknown as Record<string, unknown>),
		);

		// Ordenação JS para colunas de tabelas relacionadas (ex: attachments.createdAt).
		for (const { key, ascending } of jsOrder) {
			mappedRows = mappedRows.sort((left, right) => {
				const leftValue = (left as Record<string, unknown>)[key];
				const rightValue = (right as Record<string, unknown>)[key];
				if (leftValue === rightValue) return 0;
				if (leftValue == null) return 1;
				if (rightValue == null) return -1;
				const result = leftValue > rightValue ? 1 : -1;
				return ascending ? result : -result;
			});
		}

		return this.dedupeMappedRows(mappedRows);
	}

	private async executeSumOnlyShape(
		tableName: string,
		shapeEntries: [string, unknown][],
	): Promise<unknown[]> {
		if (!this.fromTable) {
			throw new Error("select().from() é obrigatório");
		}

		const sumColumnNames = new Set<string>();
		for (const [, expr] of shapeEntries) {
			for (const column of extractSqlColumns(expr)) {
				sumColumnNames.add(column.name);
			}
		}

		const selectColumns =
			sumColumnNames.size > 0 ? Array.from(sumColumnNames).join(",") : "*";

		const parsedFilters = parseWhere(this.whereClause);
		const { api, deferred } = partitionFilters(parsedFilters, tableName);

		let query = this.client
			.from(tableName as keyof Database["public"]["Tables"])
			.select(selectColumns);
		query = applyFilters(query, api, tableName);

		const { data, error } = await query;
		if (error) {
			console.error("[bridge] sum falhou", {
				table: tableName,
				error: error.message,
			});
			throw toBridgeError(error);
		}

		const rows = (data ?? []).filter((row) => {
			if (!this.fromTable || deferred.length === 0) return true;
			const ctx = buildRowEvalContext(
				this.fromTable,
				row as unknown as Record<string, unknown>,
				this.joins,
			);
			return rowMatchesDeferredFilters(ctx, deferred);
		});

		const result: Record<string, unknown> = {};
		for (const [alias, expr] of shapeEntries) {
			let aggregate = 0;
			for (const rawRow of rows) {
				const ctx = buildRowEvalContext(
					this.fromTable,
					rawRow as unknown as Record<string, unknown>,
					this.joins,
				);
				aggregate += computeAggregateValue(expr, [ctx.mainRow], ctx);
			}
			result[alias] = aggregate;
		}

		return [result];
	}

	private dedupeMappedRows(
		rows: Record<string, unknown>[],
	): Record<string, unknown>[] {
		if (!this.distinct) return rows;

		const seen = new Set<string>();
		const unique: Record<string, unknown>[] = [];

		for (const row of rows) {
			const key =
				Object.keys(this.shape).length > 0
					? Object.keys(this.shape)
							.map((alias) => String(row[alias] ?? ""))
							.join("|")
					: JSON.stringify(row);
			if (seen.has(key)) continue;
			seen.add(key);
			unique.push(row);
		}

		return unique;
	}

	private async executeWithGroupBy(): Promise<unknown[]> {
		if (!this.fromTable) {
			throw new Error("select().from() é obrigatório");
		}

		const fromTable = this.fromTable;
		const tableName = getTableName(fromTable);
		const parsedFilters = parseWhere(this.whereClause);
		const { api, deferred } = partitionFilters(parsedFilters, tableName);

		let mainQuery = this.client
			.from(tableName as keyof Database["public"]["Tables"])
			.select("*");
		mainQuery = applyFilters(mainQuery, api, tableName);

		const { data: mainData, error: mainError } = await mainQuery;
		if (mainError) throw mainError;

		const mainRows = (mainData ?? []) as Record<string, unknown>[];
		const joinIndexes: Array<{
			meta: JoinMetadata;
			rowsByFk: Map<string, Record<string, unknown>[]>;
		}> = [];

		for (const join of this.joins) {
			const meta = parseJoinMetadata(fromTable, join);
			const joinTableName = getTableName(meta.joinTable);
			let joinQuery = this.client
				.from(joinTableName as keyof Database["public"]["Tables"])
				.select("*");
			joinQuery = applyFilters(joinQuery, meta.constantFilters, joinTableName);

			const { data: joinData, error: joinError } = await joinQuery;
			if (joinError) throw joinError;

			const rowsByFk = new Map<string, Record<string, unknown>[]>();
			for (const row of joinData ?? []) {
				const mapped = fromDbRow(
					meta.joinTable,
					row as Record<string, unknown>,
				);
				const fkValue = String(mapped[meta.joinFkColumn] ?? "");
				if (!fkValue) continue;
				const bucket = rowsByFk.get(fkValue) ?? [];
				bucket.push(mapped);
				rowsByFk.set(fkValue, bucket);
			}

			joinIndexes.push({ meta, rowsByFk });
		}

		const grouped = new Map<string, Record<string, unknown>>();

		for (const rawMainRow of mainRows) {
			const mainMapped = fromDbRow(fromTable, rawMainRow);
			const ctx = buildRowEvalContext(fromTable, rawMainRow, this.joins);

			const relatedJoinRows: Record<string, unknown>[][] = joinIndexes.map(
				({ meta, rowsByFk }) => {
					const mainPk = String(mainMapped[meta.mainPkColumn] ?? "");
					return rowsByFk.get(mainPk) ?? [];
				},
			);

			const flatJoinRows =
				relatedJoinRows.flat().length > 0
					? relatedJoinRows.flat()
					: [mainMapped];
			if (
				deferred.length > 0 &&
				!rowMatchesDeferredFilters(
					{
						...ctx,
						joinRows: new Map(
							joinIndexes.map(({ meta }, index) => [
								getTableName(meta.joinTable),
								relatedJoinRows[index] ?? [],
							]),
						),
					},
					deferred,
				)
			) {
				continue;
			}

			const groupKey = this.groupByExprs
				.map((expr) =>
					String(
						resolveGroupedColumnValue(
							expr,
							rawMainRow,
							mainMapped,
							fromTable,
							this.joins,
							relatedJoinRows,
							joinIndexes,
						) ?? "",
					),
				)
				.join("|");

			if (!grouped.has(groupKey)) {
				const base: Record<string, unknown> = {};
				for (const [alias, expr] of Object.entries(this.shape)) {
					if (isPgColumn(expr)) {
						base[alias] = resolveGroupedColumnValue(
							expr,
							rawMainRow,
							mainMapped,
							fromTable,
							this.joins,
							relatedJoinRows,
							joinIndexes,
						);
					}
				}
				grouped.set(groupKey, base);
			}

			const entry = grouped.get(groupKey);
			if (!entry) continue;
			for (const [alias, expr] of Object.entries(this.shape)) {
				if (isPgColumn(expr)) continue;
				const aggregate = computeAggregateValue(expr, flatJoinRows, ctx);
				entry[alias] = (Number(entry[alias] ?? 0) || 0) + aggregate;
			}
		}

		let results = Array.from(grouped.values());

		if (this.orderExprs.length > 0) {
			const orderExpr = this.orderExprs[0];
			const orderColumn = isPgColumn(orderExpr)
				? orderExpr
				: getSqlChunks(orderExpr as SQL).find(isPgColumn);
			if (orderColumn) {
				results = results.sort((left, right) => {
					const alias = Object.entries(this.shape).find(
						([, expr]) => expr === orderColumn,
					)?.[0];
					const leftValue = alias ? left[alias] : left[orderColumn.name];
					const rightValue = alias ? right[alias] : right[orderColumn.name];
					if (leftValue === rightValue) return 0;
					if (leftValue == null) return 1;
					if (rightValue == null) return -1;
					return leftValue > rightValue ? 1 : -1;
				});
			}
		}

		if (this.limitCount !== undefined) {
			results = results.slice(0, this.limitCount);
		}

		return results;
	}

	private mapSelectRow(row: Record<string, unknown>): Record<string, unknown> {
		if (!this.fromTable) return row;
		const result: Record<string, unknown> = {};

		for (const [alias, expr] of Object.entries(this.shape)) {
			if (
				isPgTable(expr) &&
				this.fromTable &&
				getTableName(expr) === getTableName(this.fromTable)
			) {
				result[alias] = fromDbRow(this.fromTable, row);
				continue;
			}
			if (isPgColumn(expr)) {
				result[alias] = resolveShapeColumnValue(
					row,
					expr,
					this.fromTable,
					this.joins,
				);
				continue;
			}
			if (expr && typeof expr === "object" && "table" in (expr as object)) {
				const col = expr as PgColumn;
				result[alias] = resolveShapeColumnValue(
					row,
					col,
					this.fromTable,
					this.joins,
				);
				continue;
			}
			result[alias] = row[alias];
		}

		if (Object.keys(this.shape).length === 0) {
			return fromDbRow(this.fromTable, row);
		}

		for (const join of this.joins) {
			const joinName = getTableName(join.table);
			const tableKey = jsKeyFromTable(this.fromTable);
			const relKey = Object.keys(RELATION_SELECTS[tableKey] ?? {}).find((k) =>
				RELATION_SELECTS[tableKey][k]?.includes(joinName),
			);
			if (!relKey) continue;

			// PostgREST devolve relações com o nome da tabela (ex: "cartoes"),
			// não com a chave Drizzle (ex: "card") — mesmo padrão de runFind().
			const relData = row[relKey] ?? row[joinName];
			if (!relData || typeof relData !== "object") continue;

			const relRow = Array.isArray(relData)
				? (relData[0] as Record<string, unknown> | undefined)
				: (relData as Record<string, unknown>);
			if (!relRow) continue;

			result[relKey] = fromDbRow(join.table, relRow);
		}

		return result;
	}
}

export type SupabaseDb = {
	query: ReturnType<typeof createQueryApi>["query"];
	insert: (table: Table) => ReturnType<typeof createInsertBuilder>;
	delete: (table: Table) => ReturnType<typeof createDeleteBuilder>;
	update: (table: Table) => ReturnType<typeof createUpdateBuilder>;
	select: (shape?: SelectShape) => SupabaseSelectBuilder;
	selectDistinct: (shape?: SelectShape) => SupabaseSelectBuilder;
	execute: (sql: SQL | string) => Promise<void>;
	transaction: <T>(fn: (tx: SupabaseDb) => Promise<T>) => Promise<T>;
};

export function createSupabaseDb(
	client?: SupabaseClient<Database>,
): SupabaseDb {
	return buildSupabaseDb(client);
}

function buildSupabaseDb(client?: SupabaseClient<Database>): SupabaseDb {
	const supabase = client ?? getSupabaseAdmin();
	const api = createQueryApi(supabase);

	return {
		query: api.query,
		insert: (table: Table) => createInsertBuilder(supabase, table),
		delete: (table: Table) => createDeleteBuilder(supabase, table),
		update: (table: Table) => createUpdateBuilder(supabase, table),
		select: (shape?: SelectShape) => {
			const builder = new SupabaseSelectBuilder(supabase);
			if (shape) builder.select(shape);
			return builder;
		},
		selectDistinct: (shape?: SelectShape) => {
			const builder = new SupabaseSelectBuilder(supabase, { distinct: true });
			if (shape) builder.select(shape);
			return builder;
		},
		async execute(sql: SQL | string) {
			if (typeof sql === "string") {
				const { error } = await supabase.rpc("health_check" as never);
				if (error) throw toBridgeError(error);
				return;
			}
			const { error } = await supabase.rpc("health_check" as never);
			if (error) throw toBridgeError(error);
		},
		transaction: async <T>(fn: (tx: SupabaseDb) => Promise<T>) => {
			return fn(buildSupabaseDb(supabase));
		},
	};
}

export type { SupabaseDb as SupabaseDatabase };
