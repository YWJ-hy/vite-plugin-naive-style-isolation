import path from "node:path";
import { runStandaloneAudit } from "./audit.js";
import { runDoctor } from "./doctor.js";
import { runMigrate } from "./migrate.js";

interface ParsedArguments {
  command?: string;
  root: string;
  namespace?: string;
  report?: string;
  write: boolean;
}

const readValue = (args: string[], index: number, option: string) => {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
};

const parseArguments = (args: string[]): ParsedArguments => {
  const parsed: ParsedArguments = {
    command: args[0],
    root: process.cwd(),
    write: false,
  };
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--write") parsed.write = true;
    else if (argument === "--root") parsed.root = readValue(args, index++, argument);
    else if (argument === "--namespace") parsed.namespace = readValue(args, index++, argument);
    else if (argument === "--report") parsed.report = readValue(args, index++, argument);
    else throw new Error(`Unknown option ${argument}`);
  }
  parsed.root = path.resolve(parsed.root);
  return parsed;
};

const help = `Usage: naive-style-isolation <doctor|migrate|audit> --namespace <class> [options]

Options:
  --root <directory>  Consumer project root (default: current directory)
  --report <file>     Audit report path relative to the consumer root
  --write             Apply a migration; migrate is dry-run by default`;

export const runCli = async (args: string[]) => {
  try {
    const parsed = parseArguments(args);
    if (!parsed.command || parsed.command === "help" || parsed.command === "--help") {
      console.log(help);
      return 0;
    }
    if (!parsed.namespace) throw new Error("--namespace is required");
    if (parsed.command === "doctor") {
      console.log(runDoctor({ root: parsed.root, namespace: parsed.namespace }));
      return 0;
    }
    if (parsed.command === "migrate") {
      console.log(
        runMigrate({ root: parsed.root, namespace: parsed.namespace, write: parsed.write }),
      );
      return 0;
    }
    if (parsed.command === "audit") {
      const result = await runStandaloneAudit({
        root: parsed.root,
        namespace: parsed.namespace,
        report: parsed.report,
      });
      console.log(`audit: passed\n${JSON.stringify(result)}`);
      return 0;
    }
    throw new Error(`Unknown command ${parsed.command}`);
  } catch (error) {
    const typed = error as Error & { exitCode?: number };
    console.error(typed.message);
    return typed.exitCode ?? 1;
  }
};
