type MetricPair = {
	current: number;
	previous: number;
	/**
	 * Previsão do período: inclui o que ainda não foi pago — recorrência do mês,
	 * compra em fatura aberta, boleto a vencer.
	 *
	 * Só receitas e despesas têm previsão; balanço e previsto já são acumulados.
	 */
	forecast?: number;
};

export type DashboardCardMetrics = {
	period: string;
	previousPeriod: string;
	receitas: MetricPair;
	despesas: MetricPair;
	balanco: MetricPair;
	previsto: MetricPair;
};
