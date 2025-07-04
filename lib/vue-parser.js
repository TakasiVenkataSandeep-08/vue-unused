/**
 * @fileoverview This module is responsible for parsing Vue Single-File Components (SFCs).
 * It extracts the content of `<script>` and `<template>` blocks and uses AST parsing
 * to identify imported components and their usage within the template. This is key
 * to the tool's accuracy in detecting unused components.
 */
const babelParser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

function parseVueFile(code, { version, compiler }) {
  let scriptContent = "";
  let templateContent = "";

  if (version === 2) {
    const sfc = compiler.parseComponent(code);
    scriptContent = sfc.script ? sfc.script.content : "";
    templateContent = sfc.template ? sfc.template.content : "";
  } else {
    const { descriptor } = compiler.parse(code);
    scriptContent = descriptor.script ? descriptor.script.content : "";
    templateContent = descriptor.template ? descriptor.template.content : "";
  }

  return { scriptContent, templateContent };
}

function getTemplateTags(templateContent) {
  const tags = new Set();
  const tagRegex = /<([A-Z][a-zA-Z0-9-]*)/g;
  let match;
  while ((match = tagRegex.exec(templateContent))) {
    tags.add(match[1]);
  }

  const isPropRegex = /:is="['"]([^'"]+)['"]/g;
  while ((match = isPropRegex.exec(templateContent))) {
    tags.add(match[1]);
  }

  return tags;
}

function getImportedComponents(scriptContent) {
  const components = new Map();
  if (!scriptContent.trim()) {
    return components;
  }

  try {
    const ast = babelParser.parse(scriptContent, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });

    traverse(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        path.node.specifiers.forEach((specifier) => {
          if (specifier.type === "ImportDefaultSpecifier") {
            const componentName = specifier.local.name;
            components.set(componentName, source);
          }
        });
      },
    });
  } catch (error) {
    if (process.env.VUE_UNUSED_VERBOSE) {
      console.error(`Failed to parse script content:`, error.message);
    }
  }

  return components;
}

function getUsedImportSources(templateTags, importedComponents) {
  const usedSources = new Set();

  const kebabCaseToPascalCase = (str) =>
    str.replace(/-(\w)/g, (_, c) => c.toUpperCase());

  for (const tag of templateTags) {
    const pascalTag = kebabCaseToPascalCase(tag);
    if (importedComponents.has(tag)) {
      usedSources.add(importedComponents.get(tag));
    } else if (importedComponents.has(pascalTag)) {
      usedSources.add(importedComponents.get(pascalTag));
    }
  }

  return Array.from(usedSources);
}

module.exports = {
  parseVueFile,
  getTemplateTags,
  getImportedComponents,
  getUsedImportSources,
};
