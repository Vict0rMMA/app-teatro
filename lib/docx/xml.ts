export function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

export function encodeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Devuelve los rangos [start, end) de los elementos <tag>…</tag> de primer nivel, respetando anidamiento. */
export function findElements(xml: string, tag: string, from = 0, to = xml.length): Array<[number, number]> {
  const open = new RegExp(`<${tag}(?=[\\s>/])`, "g");
  const out: Array<[number, number]> = [];
  open.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = open.exec(xml)) && m.index < to) {
    const start = m.index;
    const tagEnd = xml.indexOf(">", start);
    if (xml[tagEnd - 1] === "/") {
      out.push([start, tagEnd + 1]);
      open.lastIndex = tagEnd + 1;
      continue;
    }
    let depth = 1;
    const scan = new RegExp(`<${tag}(?=[\\s>/])|</${tag}>`, "g");
    scan.lastIndex = tagEnd + 1;
    let s: RegExpExecArray | null;
    let end = -1;
    while ((s = scan.exec(xml))) {
      if (s[0].startsWith("</")) {
        depth--;
        if (depth === 0) {
          end = s.index + s[0].length;
          break;
        }
      } else {
        const e = xml.indexOf(">", s.index);
        if (xml[e - 1] !== "/") depth++;
      }
    }
    if (end < 0) break;
    out.push([start, end]);
    open.lastIndex = end;
  }
  return out;
}

export function elements(xml: string, tag: string): string[] {
  return findElements(xml, tag).map(([a, b]) => xml.slice(a, b));
}

/** Texto visible de un fragmento: une runs, convierte tabs/saltos en espacios. */
export function textOf(fragment: string): string {
  let out = "";
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>|<w:cr\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) out += m[1] !== undefined ? decodeXml(m[1]) : " ";
  return out;
}

/** Texto de un fragmento con un salto de línea por párrafo. */
export function paragraphsText(fragment: string): string {
  return elements(fragment, "w:p")
    .map(textOf)
    .join("\n");
}
