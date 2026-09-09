export function downloadSource(format, source) {
  const url = URL.createObjectURL(new Blob([source], {type: format === 'latex' ? 'application/x-tex' : 'text/markdown'}));
  const link = document.createElement('a'); link.href = url; link.download = format === 'latex' ? 'research-writeup.tex' : 'research-writeup.md'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function exportRenderedPdf(result) {
  if (result.format === 'latex') {
    const response = await fetch(result.url);
    if (!response.ok) throw new Error('Could not download the PDF.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = 'research-writeup.pdf'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  } else if (window.methodflowDesktop?.exportMarkdownPdf) {
    const url = new URL(result.url, location.href);
    await window.methodflowDesktop.exportMarkdownPdf(url.pathname + url.search);
  } else {
    // Browser editions use the system print dialog's Save as PDF destination.
    const response = await fetch(result.url);
    if (!response.ok) throw new Error('Could not load the rendered document.');
    const documentHtml = new DOMParser().parseFromString(await response.text(), 'text/html');
    const base = new URL(result.url, location.href);
    for (const image of documentHtml.querySelectorAll('img[src]')) image.src = new URL(image.getAttribute('src'), base).href;
    const url = URL.createObjectURL(new Blob([documentHtml.documentElement.outerHTML], {type: 'text/html'}));
    const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;width:1px;height:1px;bottom:0;border:0'; frame.src = url;
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Document preview timed out. Try exporting again.')), 30000);
        frame.onload = () => { clearTimeout(timeout); resolve(); };
        frame.onerror = () => { clearTimeout(timeout); reject(new Error('Could not load the rendered document.')); };
        document.body.append(frame);
      });
      await frame.contentDocument.fonts.ready;
      frame.contentWindow.focus(); frame.contentWindow.print();
    } finally { setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 120000); }
  }
}
