// A small deterministic PDF with real text, three pages, metadata and a link.
export function annotationPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let i = 1; i <= 3; i++) {
    const content = `BT /F1 16 Tf 48 710 Td (Page ${i} first complete sentence. Another sentence follows.) Tj 0 -30 Td (A second paragraph contains measured evidence.) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R ${i === 1 ? "/Annots [10 0 R]" : ""} >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }
  objects.push(
    "<< /Type /Annot /Subtype /Link /Rect [48 650 170 670] /A << /S /URI /URI (https://example.org/evidence) >> >>",
    "<< /Title (Fixture multi-page evidence) /Author (Fixture Author) >>",
  );
  let output = "%PDF-1.4\n",
    offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(output));
    output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 11 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}
