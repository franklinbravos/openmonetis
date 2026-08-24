import { fixUtf8Mojibake } from "@/shared/utils/string";

const PT_MONTHS: Record<string, number> = {
	janeiro: 1,
	fevereiro: 2,
	março: 3,
	marco: 3,
	abril: 4,
	maio: 5,
	junho: 6,
	julho: 7,
	agosto: 8,
	setembro: 9,
	outubro: 10,
	novembro: 11,
	dezembro: 12,
};

const PT_MONTHS_ABBR: Record<string, number> = {
	jan: 1,
	fev: 2,
	mar: 3,
	abr: 4,
	mai: 5,
	jun: 6,
	jul: 7,
	ago: 8,
	set: 9,
	out: 10,
	nov: 11,
	dez: 12,
};

export function parseBrazilianAmount(raw: string): number {
	const trimmed = raw.trim().replace(/\s/g, "");
	const isNegative = trimmed.startsWith("-");

	const normalized = trimmed
		.replace(/^-/, "")
		.replace(/^R\$/i, "")
		.replace(/\./g, "")
		.replace(",", ".");

	const value = Number.parseFloat(normalized);
	if (Number.isNaN(value)) return 0;
	return isNegative ? -value : value;
}

export function parseSlashDateDMY(raw: string): string | null {
	const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (!match) return null;
	return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

export function parseCnabDate(raw: string): string | null {
	const match = raw.trim().match(/^(\d{2})(\d{2})(\d{4})$/);
	if (!match) return null;
	return `${match[3]}-${match[2]}-${match[1]}`;
}

export function parsePortugueseLongDate(
	day: string,
	monthName: string,
	year: string,
): string | null {
	const month = PT_MONTHS[monthName.toLowerCase()];
	if (!month) return null;
	return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parsePortugueseShortDate(
	day: string,
	monthAbbr: string,
	year: number,
): string | null {
	const month = getPortugueseMonthNumberFromAbbr(monthAbbr);
	if (!month) return null;
	return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function getPortugueseMonthNumberFromAbbr(
	monthAbbr: string,
): number | null {
	const month = PT_MONTHS_ABBR[monthAbbr.replace(/\./g, "").toLowerCase()];
	return month ?? null;
}

export function parsePortugueseAbbrevDotDate(
	day: string,
	monthAbbr: string,
	year: string,
): string | null {
	const month = PT_MONTHS_ABBR[monthAbbr.replace(/\./g, "").toLowerCase()];
	if (!month) return null;
	return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function buildPeriodFromTransactions(
	transactions: { date: string }[],
): { from: string; to: string } | null {
	if (transactions.length === 0) return null;
	const dates = transactions.map((t) => t.date).sort();
	return { from: dates[0], to: dates[dates.length - 1] };
}

export function stripImportExternalIdSuffix(externalId: string): string {
	return externalId.replace(/#\d+$/, "");
}

/** Inclui variantes com/sem sufixo `#2` gerado por `uniquifyImportedExternalIds`. */
export function expandImportExternalIdsForLookup(
	externalIds: string[],
): string[] {
	const expanded = new Set<string>();

	for (const externalId of externalIds) {
		if (!externalId) continue;
		expanded.add(externalId);
		const baseId = stripImportExternalIdSuffix(externalId);
		if (baseId !== externalId) {
			expanded.add(baseId);
		}
	}

	return [...expanded];
}

export function importExternalIdCollidesWithStored(
	externalId: string,
	storedExternalIds: Iterable<string>,
): boolean {
	const baseId = stripImportExternalIdSuffix(externalId);

	for (const storedId of storedExternalIds) {
		if (storedId === externalId) return true;
		if (stripImportExternalIdSuffix(storedId) === baseId) return true;
	}

	return false;
}

/**
 * O que fazer com um registro que carrega identificador do extrato.
 *
 * - `insert`: cobrança nova, entra com o id.
 * - `insert_without_external_id`: cobrança nova, mas o id já tem dono (outra
 *   parcela da mesma compra). Entra sem o id — o índice único
 *   `lancamentos_ofx_fit_id_user_id_idx` admite um só dono por (usuário, id).
 * - `skip`: mesma cobrança já gravada.
 */
export type ImportInsertionPlan =
	| "insert"
	| "insert_without_external_id"
	| "skip";

export function planImportRecordInsertion(
	candidate: ImportOccurrenceIdentity,
	context: {
		storedOccurrences: Iterable<ImportOccurrenceIdentity>;
		storedExternalIds: Iterable<string>;
	},
): ImportInsertionPlan {
	if (
		importOccurrenceCollidesWithStored(candidate, context.storedOccurrences)
	) {
		return "skip";
	}

	if (
		importExternalIdCollidesWithStored(
			candidate.externalId,
			context.storedExternalIds,
		)
	) {
		return "insert_without_external_id";
	}

	return "insert";
}

/**
 * Id derivado do conteúdo da própria linha, não vindo do arquivo.
 *
 * `makeSyntheticExternalId` junta as partes com `|`; FITID de banco não tem
 * esse separador. A origem do id muda o que um sufixo `#2` significa.
 */
export function isSyntheticImportExternalId(externalId: string): boolean {
	return stripImportExternalIdSuffix(externalId).includes("|");
}

/**
 * Os dois ids apontam para a mesma cobrança?
 *
 * Com `sameFile`, o sufixo `#2`/`#3` passa a ser levado em conta, e o que ele
 * significa depende da origem do id:
 *
 * - **Id sintético** (PDF/CSV, derivado de data/descrição/valor): duas
 *   cobranças idênticas colidem por natureza — dois pedágios no mesmo dia pelo
 *   mesmo valor — e o sufixo é justamente o que separa uma da outra. São
 *   cobranças distintas.
 * - **Id do arquivo** (FITID) repetido: é o parser emitindo a mesma transação
 *   duas vezes. É a mesma cobrança.
 *
 * Sem `sameFile` — comparando contra o que já está gravado — a base decide, para
 * reimportar o mesmo arquivo não duplicar quando a numeração do sufixo muda.
 */
export function importExternalIdsPointToSameCharge(
	left: string,
	right: string,
	options?: { sameFile?: boolean },
): boolean {
	if (left === right) return true;

	if (
		stripImportExternalIdSuffix(left) !== stripImportExternalIdSuffix(right)
	) {
		return false;
	}

	if (!options?.sameFile) return true;

	return !(
		isSyntheticImportExternalId(left) && isSyntheticImportExternalId(right)
	);
}

/** Identidade de uma cobrança na hora de decidir se ela já está gravada. */
export type ImportOccurrenceIdentity = {
	externalId: string;
	installmentCount: number | null;
	currentInstallment: number | null;
};

/**
 * Mesma cobrança já gravada?
 *
 * O FITID do Nubank identifica a **compra**, não a cobrança do mês: todas as
 * parcelas de uma série chegam com o mesmo id. Barrar a inserção só pela
 * colisão do id descartava a parcela do mês corrente sempre que qualquer outra
 * ocorrência da mesma compra já existisse — a fatura ficava eternamente sem
 * aquela linha, e reprocessar não resolvia.
 *
 * Mesma regra de `fitIdMatchIsReliable`: o id só decide sozinho quando nenhum
 * dos lados é parcela; entre séries, é preciso ser a mesma ocorrência (N/M).
 */
export function importOccurrenceCollidesWithStored(
	candidate: ImportOccurrenceIdentity,
	storedOccurrences: Iterable<ImportOccurrenceIdentity>,
	options?: {
		/** Comparando linhas do mesmo arquivo — ver `importExternalIdsPointToSameCharge`. */
		sameFile?: boolean;
	},
): boolean {
	const candidateIsSeries = candidate.installmentCount != null;

	for (const stored of storedOccurrences) {
		const sameId = importExternalIdsPointToSameCharge(
			stored.externalId,
			candidate.externalId,
			options,
		);
		if (!sameId) continue;

		const storedIsSeries = stored.installmentCount != null;

		if (!candidateIsSeries && !storedIsSeries) return true;

		if (
			candidateIsSeries &&
			storedIsSeries &&
			stored.installmentCount === candidate.installmentCount &&
			stored.currentInstallment === candidate.currentInstallment
		) {
			return true;
		}
	}

	return false;
}

/**
 * Troca por id sintético o identificador que o arquivo repete em cobranças
 * diferentes.
 *
 * O FITID deveria identificar a cobrança, mas alguns bancos emitem um id por
 * evento. O Nubank usa o mesmo em todo o bloco do rotativo: "valor pendente do
 * mês anterior", juros e IOF chegam com o id idêntico — e o mesmo id volta na
 * fatura seguinte. Tratá-lo como identidade fazia as três linhas casarem com o
 * único lançamento que conseguiu guardá-lo, saírem da conferência como "já
 * cadastrado em outro período" e abrirem um furo do tamanho delas; o índice
 * único `(user_id, ofx_fit_id)` ainda deixava entrar só uma.
 *
 * Quando o mesmo id aparece em linhas de conteúdo diferente, ele é mais
 * grosseiro que a cobrança e não serve de identidade. O id derivado da própria
 * linha serve: é único por cobrança e estável entre reimportações.
 *
 * Id repetido em linhas de conteúdo IGUAL é outra coisa — repetição do parser,
 * ou duas cobranças idênticas — e continua com o tratamento de sempre.
 */
export function replaceAmbiguousImportExternalIds<
	T extends {
		externalId?: string | null;
		date: string;
		amount: number;
		description: string;
		transactionType: "income" | "expense";
	},
>(transactions: T[]): T[] {
	const fingerprintsById = new Map<string, Set<string>>();

	for (const transaction of transactions) {
		if (!transaction.externalId) continue;

		const fingerprints =
			fingerprintsById.get(transaction.externalId) ?? new Set<string>();
		fingerprints.add(buildImportTransactionFingerprint(transaction));
		fingerprintsById.set(transaction.externalId, fingerprints);
	}

	return transactions.map((transaction) => {
		if (!transaction.externalId) return transaction;

		const distinctContents =
			fingerprintsById.get(transaction.externalId)?.size ?? 0;
		if (distinctContents < 2) return transaction;

		return {
			...transaction,
			externalId: makeSyntheticExternalId([
				transaction.date,
				transaction.amount.toFixed(2),
				transaction.description,
			]),
		};
	});
}

export function buildImportTransactionFingerprint(transaction: {
	date: string;
	amount: number;
	description: string;
	transactionType: "income" | "expense";
}): string {
	return [
		transaction.date,
		transaction.amount.toFixed(2),
		transaction.transactionType,
		normalizeImportedText(transaction.description).toLowerCase(),
	].join("|");
}

/**
 * Remove linhas idênticas repetidas no mesmo arquivo (ruído de parser).
 *
 * Só vale para linha sem id próprio: `uniquifyImportedExternalIds` já rodou e
 * deu id distinto a cada ocorrência, e duas compras iguais no mesmo dia — dois
 * lanches na mesma lanchonete — são duas compras, não repetição. Descartar uma
 * delas sumia com o lançamento antes mesmo da revisão e deixava a fatura sem
 * fechar pelo valor da linha perdida.
 */
export function dedupeImportedTransactionsByFingerprint<
	T extends {
		date: string;
		amount: number;
		description: string;
		transactionType: "income" | "expense";
		externalId?: string | null;
	},
>(transactions: T[]): T[] {
	const seen = new Set<string>();

	return transactions.filter((transaction) => {
		if (transaction.externalId) return true;

		const fingerprint = buildImportTransactionFingerprint(transaction);
		if (seen.has(fingerprint)) return false;
		seen.add(fingerprint);
		return true;
	});
}

export function makeSyntheticExternalId(parts: string[]): string {
	return parts
		.map((p) => p.trim().toLowerCase())
		.join("|")
		.replace(/\s+/g, " ");
}

/**
 * Garante externalIds únicos dentro do arquivo.
 * Extratos (PDF/CSV) geram ID sintético por data+descrição+valor; compras
 * legítimas iguais no mesmo dia colidem e eram marcadas como "já cadastrado".
 */
export function uniquifyImportedExternalIds<
	T extends { externalId: string | null },
>(transactions: T[]): T[] {
	const seen = new Map<string, number>();

	return transactions.map((transaction) => {
		const externalId = transaction.externalId;
		if (!externalId) return transaction;

		const count = seen.get(externalId) ?? 0;
		seen.set(externalId, count + 1);
		if (count === 0) return transaction;

		return {
			...transaction,
			externalId: `${externalId}#${count + 1}`,
		};
	});
}

export function normalizeImportedText(value: string): string {
	return fixUtf8Mojibake(value).replace(/\s+/g, " ").trim();
}
