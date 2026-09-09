// Minimal valid PDFs let the real PDF parser check page count and retained text.
export function pdfFixture(pages) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const refs = [];
  pages.forEach((text) => {
    const pageId = objects.length + 1;
    refs.push(`${pageId} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    const stream = `BT /F1 12 Tf 50 740 Td (${text}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${refs.join(' ')}] >>`;
  let text = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(text.length); text += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  text += offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  return Buffer.from(`${text}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
