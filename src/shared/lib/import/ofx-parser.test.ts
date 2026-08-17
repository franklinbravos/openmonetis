import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOfx } from "./ofx-parser";
import { resolveInvoiceSourceTotal } from "./invoice-source-total";
import {
	displayInvoiceTotal,
	sumSignedAmountsForImportedTransactions,
} from "./invoice-total";

const ofxBankStatement = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKACCTFROM>
<BANKID>0001</BANKID>
<ACCTID>123456789</ACCTID>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260101000000[-3:BRT]</DTSTART>
<DTEND>20260131000000[-3:BRT]</DTEND>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260105000000[-3:BRT]</DTPOSTED>
<TRNAMT>-50.00</TRNAMT>
<FITID>0001-20260105-1</FITID>
<NAME>MERCADO</NAME>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20260110230000[-3:BRT]</DTPOSTED>
<TRNAMT>1200.50</TRNAMT>
<FITID>0001-20260110-2</FITID>
<MEMO>SALARIO</MEMO>
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

const ofxCreditCard = `<OFX>
<CREDITCARDMSGSRSV1>
<CCSTMTTRNRS>
<CCSTMTRS>
<CCACCTFROM>
<ACCTID>1111-2222</ACCTID>
</CCACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260107000000[-3:BRT]</DTPOSTED>
<TRNAMT>-99.90</TRNAMT>
<FITID>cc-20260107-1</FITID>
<NAME>IFOOD</NAME>
</STMTTRN>
</BANKTRANLIST>
</CCSTMTRS>
</CCSTMTTRNRS>
</CREDITCARDMSGSRSV1>
</OFX>`;

const ofxNubankCreditCard = `<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<FI>
<ORG>NU PAGAMENTOS S.A.</ORG>
</FI>
</SONRS>
</SIGNONMSGSRSV1>
<CREDITCARDMSGSRSV1>
<CCSTMTTRNRS>
<CCSTMTRS>
<CCACCTFROM>
<ACCTID>6732885b-566f-4181-9233-c00dbab3b072</ACCTID>
</CCACCTFROM>
<BANKTRANLIST>
<DTSTART>20260605000000[-3:BRT]</DTSTART>
<DTEND>20260705000000[-3:BRT]</DTEND>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260704000000[-3:BRT]</DTPOSTED>
<TRNAMT>-40.90</TRNAMT>
<FITID>spotify-fitid</FITID>
<MEMO>EBW*Spotify - NuPay</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20260612000000[-3:BRT]</DTPOSTED>
<TRNAMT>6262.35</TRNAMT>
<FITID>parcelamento-fitid</FITID>
<MEMO>Parcelamento de Fatura (12/Junho)</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20260612000000[-3:BRT]</DTPOSTED>
<TRNAMT>16.60</TRNAMT>
<FITID>juros-fitid</FITID>
<MEMO>Juros de pagamento parcial da fatura (rotativo)</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20260610000000[-3:BRT]</DTPOSTED>
<TRNAMT>1715.79</TRNAMT>
<FITID>pagamento-fitid</FITID>
<MEMO>Pagamento recebido</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260605000000[-3:BRT]</DTPOSTED>
<TRNAMT>-260.00</TRNAMT>
<FITID>parcela-fitid</FITID>
<MEMO>Fabio C Thomaziello - Parcela 10/10</MEMO>
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>-2109.50</BALAMT>
<DTASOF>20260705000000[-3:BRT]</DTASOF>
</LEDGERBAL>
</CCSTMTRS>
</CCSTMTTRNRS>
</CREDITCARDMSGSRSV1>
</OFX>`;

describe("parseOfx", () => {
	it("extrai conta e período do extrato", () => {
		const result = parseOfx(ofxBankStatement);
		expect(result.source).toBe("Desconhecido");
		expect(result.accountNumber).toBe("123456789");
		expect(result.period).toEqual({ from: "2026-01-01", to: "2026-01-31" });
		expect(result.isCreditCard).toBe(false);
	});

	it("converte datas OFX para YYYY-MM-DD", () => {
		const result = parseOfx(ofxBankStatement);
		expect(result.transactions[0]?.date).toBe("2026-01-05");
	});

	it("despesa vira expense com valor absoluto", () => {
		const result = parseOfx(ofxBankStatement);
		const expense = result.transactions[0];
		expect(expense?.transactionType).toBe("expense");
		expect(expense?.amount).toBe(50);
	});

	it("receita vira income com valor absoluto", () => {
		const result = parseOfx(ofxBankStatement);
		const income = result.transactions[1];
		expect(income?.transactionType).toBe("income");
		expect(income?.amount).toBe(1200.5);
	});

	it("usa MEMO como descrição preferencial", () => {
		const result = parseOfx(ofxBankStatement);
		expect(result.transactions[1]?.description).toBe("SALARIO");
	});

	it("usa NAME quando MEMO ausente", () => {
		const result = parseOfx(ofxBankStatement);
		expect(result.transactions[0]?.description).toBe("MERCADO");
	});

	it("preserva FITID como externalId", () => {
		const result = parseOfx(ofxBankStatement);
		expect(result.transactions[0]?.externalId).toBe("0001-20260105-1");
	});

	it("detecta cartão de crédito", () => {
		const result = parseOfx(ofxCreditCard);
		expect(result.isCreditCard).toBe(true);
		expect(result.transactions).toHaveLength(1);
		expect(result.transactions[0]?.transactionType).toBe("expense");
	});

	it("processa fatura de cartão Nubank OFX", () => {
		const result = parseOfx(ofxNubankCreditCard, {
			fileName: "Nubank_2026-07-12.ofx",
		});

		expect(result.source).toBe("Nubank");
		expect(result.isCreditCard).toBe(true);
		expect(result.period).toEqual({ from: "2026-06-05", to: "2026-07-05" });
		expect(result.invoice).toEqual({
			period: "2026-07",
			dueDate: "2026-07-12",
			isPaid: true,
			paymentDate: "2026-06-10",
			totalAmount: 2109.5,
			totalAmountSource: "ofx_ledger",
		});
		expect(result.transactions).toHaveLength(4);
		expect(
			result.transactions.some((transaction) =>
				/parcelamento de fatura/i.test(transaction.description),
			),
		).toBe(false);
		expect(
			result.transactions.find((transaction) =>
				/juros de pagamento parcial/i.test(transaction.description),
			)?.transactionType,
		).toBe("expense");
		expect(
			result.transactions.find((transaction) =>
				/^pagamento recebido$/i.test(transaction.description),
			)?.transactionType,
		).toBe("income");
		expect(
			result.transactions.find((transaction) =>
				/parcela 10\/10/i.test(transaction.description),
			)?.amount,
		).toBe(260);
	});

	it("lança erro para data OFX inválida", () => {
		const broken = ofxBankStatement.replace("20260101000000[-3:BRT]", "abc");
		expect(() => parseOfx(broken)).toThrow("Data OFX inválida");
	});

	it("importa extrato Nubank OFX de amostra local quando disponível", () => {
		const samplePath = join(
			process.cwd(),
			"samples/finance/extratos/NU_4721520103_01AGO2026_08AGO2026.ofx",
		);
		if (!existsSync(samplePath)) return;

		const result = parseOfx(readFileSync(samplePath, "utf8"));

		expect(result.source).toBe("NU PAGAMENTOS S.A.");
		expect(result.accountNumber).toBe("472152010-3");
		expect(result.period).toEqual({ from: "2026-08-01", to: "2026-08-08" });
		expect(result.isCreditCard).toBe(false);
		expect(result.transactions.length).toBe(24);
		expect(result.transactions[0]?.description).toContain("CARREFOUR");
		expect(
			result.transactions.some((t) => t.transactionType === "income"),
		).toBe(true);
	});

	it("importa fatura Nubank OFX de amostra local quando disponível", () => {
		const samplePath = join(
			process.cwd(),
			"samples/finance/faturas/Nubank_2026-07-12.ofx",
		);
		if (!existsSync(samplePath)) return;

		const result = parseOfx(readFileSync(samplePath, "utf8"), {
			fileName: "Nubank_2026-07-12.ofx",
		});

		expect(result.source).toBe("Nubank");
		expect(result.isCreditCard).toBe(true);
		expect(result.invoice?.period).toBe("2026-07");
		expect(result.invoice?.dueDate).toBe("2026-07-12");
		expect(result.invoice?.totalAmount).toBe(2109.5);
		expect(result.transactions.length).toBe(26);
		expect(
			result.transactions.some((transaction) =>
				/parcelamento de fatura/i.test(transaction.description),
			),
		).toBe(false);
		expect(
			result.transactions.some((transaction) =>
				/^pagamento recebido$/i.test(transaction.description),
			),
		).toBe(true);
	});

	it("usa LEDGERBAL como total da fatura, distinto da soma das linhas", () => {
		const result = parseOfx(ofxNubankCreditCard, {
			fileName: "Nubank_2026-07-12.ofx",
		});
		const sourceTotal = resolveInvoiceSourceTotal(result);
		const linesTotal = displayInvoiceTotal(
			sumSignedAmountsForImportedTransactions(result.transactions),
		);

		expect(sourceTotal?.source).toBe("ofx_ledger");
		expect(sourceTotal?.amount).toBe(2109.5);
		expect(linesTotal).not.toBe(sourceTotal?.amount);
	});
});
