// SyncTeX scaled points -> PDF big points. The compiler provides source records;
// nearest-record lookup is a line-level approximation, not character mapping.
export function parseSyncTeX(text, sourceName = "main.tex") {
  const value = (name) =>
    Number(text.match(new RegExp("^" + name + ":([\\d.-]+)", "m"))?.[1] || 0);
  const scale =
    ((((value("Unit") || 1) * (value("Magnification") || 1000)) /
      1000 /
      65536) *
      72) /
    72.27;
  const offsetX = ((value("X Offset") / 65536) * 72) / 72.27,
    offsetY = ((value("Y Offset") / 65536) * 72) / 72.27;
  const inputs = new Map(
    [...text.matchAll(/^Input:(\d+):(.*)$/gm)].map((match) => [
      Number(match[1]),
      match[2].replaceAll("\\", "/"),
    ]),
  );
  const normalizedName = sourceName.replaceAll("\\", "/"),
    main = [...inputs].find(
      ([, name]) =>
        name === normalizedName || name.endsWith("/" + normalizedName),
    )?.[0];
  if (!main) throw Error("Compiler source map has no main manuscript.");
  let page = 0;
  const points = [];
  for (const line of text.split("\n")) {
    const sheet = line.match(/^\{(\d+)/);
    if (sheet) {
      page = Number(sheet[1]);
      continue;
    }
    const match = line.match(
      /^([gxhk$])(\d+),(\d+)(?:,-?\d+)?:(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/,
    );
    if (match && Number(match[2]) === main && page) {
      points.push({
        page,
        line: Number(match[3]),
        x: Number(match[4]) * scale + offsetX,
        y: Number(match[5]) * scale + offsetY,
        width: Number(match[6] || 0) * scale,
        height: Number(match[7] || 0) * scale,
        depth: Number(match[8] || 0) * scale,
        kind: match[1],
      });
    }
  }
  return points;
}

export function sourceAt(points, page, x, y) {
  if (!Number.isInteger(page) || page < 1 || ![x, y].every(Number.isFinite))
    throw Error("Invalid PDF position.");
  let best = null,
    distance = Infinity;
  for (const point of points) {
    if (point.page !== page) continue;
    const dx = Math.abs(point.x - x),
      dy = Math.abs(point.y - y),
      candidate = dy * dy * 4 + dx * dx;
    if (candidate < distance) {
      best = point;
      distance = candidate;
    }
  }
  return best
    ? { line: best.line, page, distance: Math.sqrt(distance) }
    : null;
}
