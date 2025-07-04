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
  if (results.unusedFiles.length) {
    console.log(chalk.red("🔍 Unused Files:\n"));
    results.unusedFiles.forEach((f) => {
      console.log(chalk.yellow(f.replace(config.rootDir + "/", "")));
      if (config.delete) fs.unlinkSync(f);
    });
  } else {
    console.log(chalk.green("🎉 No unused files found!"));
  }

  if (config.output === "json") {
    fs.writeFileSync(
      "unused-files.json",
      JSON.stringify(results.unusedFiles, null, 2)
    );
    console.log(chalk.blue("\n📁 unused-files.json created"));
  }
};
