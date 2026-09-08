/** Geometria do símbolo Ciclo — grid 48×48. */
export const LOGO_MARK = {
	viewBox: 48,
	stroke: {
		orbit: 1.75,
		dollarKnockout: 3.1,
	},
	colors: {
		orbit: "#5C6573",
		core: "#3556B1",
	},
	coreRadius: 9,
	orbitRadius: 18.5,
	/**
	 * Arco orbital (~96°). A ponta é desenhada pelo marker `orbit-arrow`.
	 * Repetido com rotação de 120°.
	 */
	orbitArc: "M8.75 13.55A18.5 18.5 0 0 1 34.85 10.15",
	/** Ponta em V aberta, alinhada à tangente do arco. */
	orbitArrowMarker: "M0,1.5 L8,5 L0,8.5",
	/** Cifrão recortado no disco sólido (máscara). */
	dollar: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
	dollarScale: 0.64,
	dollarOrigin: 12,
} as const;
