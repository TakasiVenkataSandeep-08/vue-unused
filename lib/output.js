/**
 * @fileoverview This module handles the output of the analysis results.
 * It can format the list of unused files for display in the command line
 * or save the results to a JSON file, depending on the user's configuration.
 */
const fs = require("fs");
const path = require("path");

exports.outputResults = async (results, config) => {
  const chalk = (await import("chalk")).default;
  console.log(chalk.green("\n✅ Scan Complete!\n"));

  // Show bundle analysis info if available
  if (results.bundleAnalysis) {
    console.log(chalk.blue("📦 Bundle Analysis Enabled"));
    console.log(
      chalk.gray(
        `   Bundle directory: ${
          results.bundleAnalysis.bundleDir || "auto-detected"
        }`
      )
    );
    console.log(
      chalk.gray(
        `   Bundle files found: ${
          results.bundleAnalysis.bundleFiles?.length || 0
        }`
      )
    );
    console.log(
      chalk.gray(
        `   Source files in bundle: ${
          results.bundleAnalysis.sourceFiles?.length || 0
        }`
      )
    );
    console.log();
  }

  console.log(
    chalk.cyan(
      `📊 Summary: ${results.allFiles.length} files scanned, ${results.unusedFiles.length} unused.`
    )
  );

  // Show size impact if bundle analysis provided it
  if (results.bundleCorrelation?.sizeImpact) {
    const impact = results.bundleCorrelation.sizeImpact;
    if (impact.totalBytes > 0) {
      // Smart display: show MB only if >= 1 MB, otherwise just KB
      const preciseMB = impact.totalBytes / (1024 * 1024);
      const sizeDisplay =
        preciseMB >= 1
          ? `${impact.totalKB} KB (${impact.totalMB} MB)`
          : `${impact.totalKB} KB`;
      console.log(
        chalk.yellow(`💾 Potential bundle size savings: ${sizeDisplay}`)
      );
    }
  }

  console.log();

  let deletedFiles = [];
  if (results.unusedFiles.length) {
    console.log(chalk.red("🔍 Unused Files:\n"));
    results.unusedFiles.forEach((f) => {
      console.log(chalk.yellow(f.replace(config.rootDir + "/", "")));
      if (config.delete) {
        try {
          fs.unlinkSync(f);
          deletedFiles.push(f);
        } catch (err) {
          console.error(chalk.red(`Failed to delete ${f}: ${err.message}`));
        }
      }
    });
  } else {
    console.log(chalk.green("🎉 No unused files found!"));
  }

  // Add deletion summary if files were deleted
  if (config.delete && deletedFiles.length > 0) {
    console.log();
    console.log(
      chalk.green(
        `🗑️  Deletion Summary: ${deletedFiles.length} file${
          deletedFiles.length !== 1 ? "s" : ""
        } removed.`
      )
    );
    console.log(
      chalk.dim(
        "Deleted files:\n" +
          deletedFiles
            .map((f) => `  - ${f.replace(config.rootDir + "/", "")}`)
            .join("\n")
      )
    );
  }

  if (config.output === "json") {
    fs.writeFileSync(
      "unused-files.json",
      JSON.stringify(results.unusedFiles, null, 2)
    );
    console.log(chalk.blue("\n📁 unused-files.json created"));
  }
};

// Output dependency graph to dependency-graph.json (relative paths for readability)
exports.outputGraph = async (graph, config) => {
  const chalk = (await import("chalk")).default;
  const relativised = Object.fromEntries(
    Object.entries(graph).map(([k, deps]) => [
      k.replace(config.rootDir + "/", ""),
      deps.map((d) => d.replace(config.rootDir + "/", "")),
    ])
  );
  fs.writeFileSync(
    "dependency-graph.json",
    JSON.stringify(relativised, null, 2)
  );
  console.log(chalk.blue("\n📊 dependency-graph.json created"));
};
