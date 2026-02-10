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

    // Parse lcov records: enforce 100% line coverage, report branch coverage
    const records = lcov.split("end_of_record").filter((r) =>
      r.includes("SF:")
    );
    if (records.length === 0) {
      console.error("No coverage data found");
      Deno.exit(1);
    }

    const failures: string[] = [];
    const branchWarnings: string[] = [];

    for (const record of records) {
      const sfMatch = record.match(/SF:(.*)/);
      if (!sfMatch) continue;
      const file = sfMatch[1].replace(projectRoot + "/", "");

      // Line coverage: LH (lines hit) / LF (lines found)
      const lhMatch = record.match(/LH:(\d+)/);
      const lfMatch = record.match(/LF:(\d+)/);
      if (lhMatch && lfMatch) {
        const hit = parseInt(lhMatch[1]);
        const found = parseInt(lfMatch[1]);
        if (hit < found) {
          failures.push(`${file}: ${hit}/${found} lines covered`);
        }
      }

      // Branch coverage: BRH (branches hit) / BRF (branches found) — advisory
      const brhMatch = record.match(/BRH:(\d+)/);
      const brfMatch = record.match(/BRF:(\d+)/);
      if (brhMatch && brfMatch) {
        const hit = parseInt(brhMatch[1]);
        const found = parseInt(brfMatch[1]);
        if (hit < found) {
          branchWarnings.push(`${file}: ${hit}/${found} branches covered`);
        }
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
