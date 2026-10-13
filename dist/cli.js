#!/usr/bin/env node
import { runCli } from "./internal/cli.js";
process.exitCode = await runCli(process.argv.slice(2));
