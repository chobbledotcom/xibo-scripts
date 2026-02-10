#!/usr/bin/env -S deno run --allow-all
/**
 * Test runner script
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Main: run tests */
const main = async (): Promise<void> => {
  // Set environment for tests
  Deno.env.set("ALLOWED_DOMAIN", "localhost");

  // Get test args (pass through any CLI args after --)
  const testArgs = Deno.args;
  const useCoverage = testArgs.includes("--coverage");

  const denoTestArgs = [
    "test",
    "--no-check",
    "--allow-net",
    "--allow-env",
    "--allow-read",
    "--allow-write",
    "--allow-run",
    "--allow-sys",
    "--allow-ffi",
    "--unstable-raw-imports",
  ];

  if (useCoverage) {
    denoTestArgs.push("--coverage=coverage");
  }

  denoTestArgs.push("test/");

  console.log("Running tests...");
  const testCmd = new Deno.Command(Deno.execPath(), {
    args: denoTestArgs,
    cwd: projectRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...Deno.env.toObject(),
      ALLOWED_DOMAIN: "localhost",
      DENO_TLS_CA_STORE: "system",
    },
  });

  const result = await testCmd.output();

  if (result.code !== 0) {
    Deno.exit(result.code);
  }

  if (useCoverage) {
    console.log("\nChecking coverage...");
    const coverageDir = join(projectRoot, "coverage");

    // Print human-readable table
    const tableCmd = new Deno.Command(Deno.execPath(), {
      args: ["coverage", coverageDir],
      cwd: projectRoot,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    await tableCmd.output();

    // Parse stable lcov format for enforcement
    const lcovCmd = new Deno.Command(Deno.execPath(), {
      args: ["coverage", coverageDir, "--lcov"],
      cwd: projectRoot,
      stdout: "piped",
      stderr: "inherit",
    });
    const lcovResult = await lcovCmd.output();
    const lcov = new TextDecoder().decode(lcovResult.stdout);

    // Parse lcov records: aggregate by file (Deno may emit multiple records
    // for the same file when dynamic imports are used), then enforce 100%
    // line coverage and report branch coverage.
    const records = lcov.split("end_of_record").filter((r) =>
      r.includes("SF:")
    );
    if (records.length === 0) {
      console.error("No coverage data found");
      Deno.exit(1);
    }

    // Aggregate DA (line) and BRDA (branch) data per file, taking max hits
    const fileLines = new Map<string, Map<number, number>>();
    const fileBranches = new Map<
      string,
      Map<string, number>
    >();

    for (const record of records) {
      const sfMatch = record.match(/SF:(.*)/);
      if (!sfMatch) continue;
      const file = sfMatch[1].replace(projectRoot + "/", "");

      // Skip test infrastructure and production-only init code
      if (file.includes("test-utils/") || file.includes("test-compat")) continue;
      if (file.endsWith("lib/db/client.ts")) continue;

      // Aggregate line hits: DA:lineNumber,hitCount
      if (!fileLines.has(file)) fileLines.set(file, new Map());
      const lines = fileLines.get(file)!;
      for (const m of record.matchAll(/DA:(\d+),(\d+)/g)) {
        const line = parseInt(m[1]);
        const hits = parseInt(m[2]);
        lines.set(line, Math.max(lines.get(line) ?? 0, hits));
      }

      // Aggregate branch hits: BRDA:line,block,branch,hits
      if (!fileBranches.has(file)) fileBranches.set(file, new Map());
      const branches = fileBranches.get(file)!;
      for (const m of record.matchAll(/BRDA:(\d+),(\d+),(\d+),(\d+)/g)) {
        const key = `${m[1]},${m[2]},${m[3]}`;
        const hits = parseInt(m[4]);
        branches.set(key, Math.max(branches.get(key) ?? 0, hits));
      }
    }

    const failures: string[] = [];
    const branchWarnings: string[] = [];

    for (const [file, lines] of fileLines) {
      const found = lines.size;
      let hit = 0;
      for (const count of lines.values()) {
        if (count > 0) hit++;
      }
      if (hit < found) {
        failures.push(`${file}: ${hit}/${found} lines covered`);
      }
    }

    for (const [file, branches] of fileBranches) {
      const found = branches.size;
      let hit = 0;
      for (const count of branches.values()) {
        if (count > 0) hit++;
      }
      if (hit < found) {
        branchWarnings.push(`${file}: ${hit}/${found} branches covered`);
      }
    }

    if (branchWarnings.length > 0) {
      console.log("\nBranch coverage gaps (advisory):");
      for (const w of branchWarnings) console.log(`  ${w}`);
    }

    if (failures.length > 0) {
      console.error("\nLine coverage is not 100%. Files below 100%:");
      for (const f of failures) console.error(`  ${f}`);
      console.error("\nTest quality rules:");
      console.error("  - 100% line coverage is required");
      console.error("  - Test outcomes not implementations");
      console.error("  - Test-only exports are forbidden");
      console.error("  - Tautological tests are forbidden");
      Deno.exit(1);
    }

    console.log("\nAll files have 100% line coverage");
  }

  Deno.exit(0);
};

main();
