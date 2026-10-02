// Page-relative geometry is independent of browser selection, zoom and canvas lifetime.
export function validPdfGeometry(anchor) {
  return Number.isInteger(anchor?.page) && anchor.page > 0 &&
    typeof anchor.pdfFingerprint === "string" && anchor.pdfFingerprint.length > 0 && anchor.pdfFingerprint.length <= 200 &&
    Array.isArray(anchor.pdfRects) && anchor.pdfRects.length > 0 && anchor.pdfRects.length <= 256 &&
    anchor.pdfRects.every(r => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) &&
      r[0] >= 0 && r[1] >= 0 && r[2] > 0 && r[3] > 0 && r[0]+r[2] <= 1.000001 && r[1]+r[3] <= 1.000001);
}
export function normalizedPdfRects(rects, width, height) {
  if (!(width > 0 && height > 0)) return [];
  const result = [];
  for (const r of rects) {
    const x = Math.max(0, r.left / width), y = Math.max(0, r.top / height);
    const right = Math.min(1, (r.left + r.width) / width), bottom = Math.min(1, (r.top + r.height) / height);
    if (right <= x || bottom <= y) continue;
    const next = [x, y, right-x, bottom-y].map(v => Math.round(v * 1e6) / 1e6);
    if (next[2] > 0 && next[3] > 0 && !result.some(old => old.every((v,i) => v === next[i]))) result.push(next);
  }
  // Never silently truncate a selection.
  return result.length <= 256 ? result : [];
}
export function pdfHighlightRects(anchor, width, height, fingerprint) {
  if (!validPdfGeometry(anchor) || anchor.pdfFingerprint !== fingerprint) return [];
  return anchor.pdfRects.map(([x,y,w,h]) => ({left:x*width,top:y*height,width:w*width,height:h*height}));
}
