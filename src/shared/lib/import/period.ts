import { dateToPeriod } from "@/shared/utils/period";

/**
 * Período de um lançamento importado.
 *
 * Fatura de cartão **tem** um período: todas as linhas do arquivo pertencem à
 * fatura que está sendo importada, mesmo as compras de dias diferentes. Extrato
 * de conta não tem: o recorte é arbitrário — uma semana, um mês, um ano — e cada
 * lançamento pertence ao mês da sua própria data.
 *
 * Carimbar o período do arquivo em toda linha de extrato foi o que arquivou 67
 * lançamentos de julho no mês de agosto na conta Nubank, fazendo o líquido do
 * mês divergir do extrato em R$ 2.669,23 sem nada avisar.
 */
export function resolveImportRowPeriod(input: {
	date: Date;
	invoicePeriod: string | null | undefined;
	isCardImport: boolean;
}): string {
	if (input.isCardImport && input.invoicePeriod) return input.invoicePeriod;
	return dateToPeriod(input.date);
}
