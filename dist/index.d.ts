import type { Plugin } from "vite";
export interface NaiveStyleIsolationOptions {
    namespace: string;
    root?: string;
    strict?: boolean;
    auditReport?: string;
}
export default function naiveStyleIsolation(options: NaiveStyleIsolationOptions): Plugin;
