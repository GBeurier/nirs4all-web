import { Algorithm, Deflation, Solver } from "./types.js";
/** RAII wrapper around n4m_config_t. */
export declare class Config {
    private _ptr;
    private constructor();
    static create(): Config;
    get handle(): number;
    destroy(): void;
    setNComponents(k: number): void;
    setAlgorithm(a: Algorithm): void;
    setSolver(solver: Solver): void;
    setDeflation(d: Deflation): void;
    setCenterX(on: boolean): void;
    setCenterY(on: boolean): void;
    setStoreScores(on: boolean): void;
}
