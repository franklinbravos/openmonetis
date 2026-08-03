type StatementLine = {
	amount: number;
	transactionType: "income" | "expense";
};

export function computeStatementTotal(lines: StatementLine[]): number {
	return lines.reduce((total, line) => {
		if (line.transactionType === "expense") {
			return total + line.amount;
		}

		return total - line.amount;
	}, 0);
}
