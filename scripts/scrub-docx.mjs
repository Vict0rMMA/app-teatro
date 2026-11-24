// Quita autor y "modificado por" de los metadatos de uno o varios .docx.
//   node scripts/scrub-docx.mjs archivo.docx [...]
import fs from "node:fs";
import PizZip from "pizzip";
import { pathToFileURL } from "node:url";

export function scrub(zip) {
  const core = zip.file("docProps/core.xml");
  if (core) {
    zip.file(
      "docProps/core.xml",
      core
        .asText()
        .replace(/<dc:creator>[^<]*<\/dc:creator>/, "<dc:creator>Planillas Teatro</dc:creator>")
        .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, "<cp:lastModifiedBy>Planillas Teatro</cp:lastModifiedBy>"),
    );
  }
  const app = zip.file("docProps/app.xml");
  if (app) zip.file("docProps/app.xml", app.asText().replace(/<Company>[^<]*<\/Company>/, "<Company></Company>"));
  return zip;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const f of process.argv.slice(2)) {
    const zip = scrub(new PizZip(fs.readFileSync(f)));
    fs.writeFileSync(f, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
    console.log("✔", f);
  }
}
