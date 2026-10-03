const fs = require('fs');
const path = require('path');
const ts = require('typescript');
let files = 0;
let errors = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      files += 1;
      const source = fs.readFileSync(full, 'utf8');
      const result = ts.transpileModule(source, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        reportDiagnostics: true,
        fileName: full,
      });
      if (result.diagnostics?.length) {
        errors += result.diagnostics.length;
        console.error(`\n${full}`);
        for (const diagnostic of result.diagnostics) console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      }
    }
  }
}
walk(path.resolve(__dirname, '..', 'src'));
console.log(`GBOTtel: ${files} archivos TS/TSX analizados; ${errors} errores de sintaxis.`);
process.exitCode = errors ? 1 : 0;
