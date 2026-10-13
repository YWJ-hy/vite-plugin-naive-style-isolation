import { runNodeTool } from "./build-tools.mjs";

const [specifier, ...args] = process.argv.slice(2);
if (!specifier) throw new Error("A Node tool specifier is required");
runNodeTool(specifier, args, { cwd: process.cwd() });
