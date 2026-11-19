import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export type PageOrientation = 'portrait' | 'landscape';

let colorCanvasCtx: CanvasRenderingContext2D | null = null;
const colorCache = new Map<string, string>();

function getColorCtx(): CanvasRenderingContext2D | null {
  if (colorCanvasCtx) return colorCanvasCtx;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  colorCanvasCtx = canvas.getContext('2d', { willReadFrequently: true });
  return colorCanvasCtx;
}

/**
 * Converts any modern CSS color function (oklch, oklab, color-mix, lab, lch, color)
 * into a standard rgb(...) / rgba(...) string supported by html2canvas.
 */
function cssColorToRgba(expr: string): string {
  const cached = colorCache.get(expr);
  if (cached) return cached;

  const ctx = getColorCtx();
  if (!ctx) return '#0f172a';

  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillStyle = expr;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const out =
      a === 255
        ? `rgb(${r}, ${g}, ${b})`
        : `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
    colorCache.set(expr, out);
    return out;
  } catch {
    return '#0f172a';
  }
}

/**
 * Parenthesis-balanced scanner that replaces all CSS Color Level 4/5 functions
 * (which html2canvas cannot parse) inside arbitrary CSS stylesheets or inline styles.
 */
export function sanitizeCssColors(cssText: string): string {
  if (!cssText || !/(?:oklch|oklab|color-mix|lab|lch|color)\s*\(/i.test(cssText)) {
    return cssText;
  }

  const fnRegex = /\b(oklch|oklab|color-mix|lch|lab|color)\s*\(/gi;
  let result = '';
  let lastIndex = 0;

  while (true) {
    fnRegex.lastIndex = lastIndex;
    const match = fnRegex.exec(cssText);
    if (!match) {
      result += cssText.slice(lastIndex);
      break;
    }

    const start = match.index;
    result += cssText.slice(lastIndex, start);

    // Find balanced closing paren
    const openIdx = cssText.indexOf('(', start);
    let depth = 0;
    let end = openIdx;
    for (let i = openIdx; i < cssText.length; i++) {
      const ch = cssText[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    const expr = cssText.slice(start, end);
    // If expr contains CSS variables like var(--x), replace inner modern fns or fallback cleanly
    if (/var\s*\(/i.test(expr)) {
      result += 'rgba(15, 23, 42, 0.08)';
    } else {
      result += cssColorToRgba(expr);
    }
    lastIndex = end;
  }

  return result;
}

function collectSanitizedDocumentCss(): string {
  const chunks: string[] = [];
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i];
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (let j = 0; j < rules.length; j++) {
        chunks.push(rules[j].cssText);
      }
    } catch {
      // Skip cross-origin sheets such as Google Fonts (canvas still keeps system/loaded fonts)
    }
  }
  return sanitizeCssColors(chunks.join('\n'));
}

/**
 * Clones a live DOM element and materializes form control values (<input>, <select>, <textarea>)
 * so Word exports and Print views reflect the exact current user edits.
 */
export function captureHtmlSnapshot(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;

  const origInputs = element.querySelectorAll('input');
  const cloneInputs = clone.querySelectorAll('input');
  origInputs.forEach((inp, idx) => {
    const target = cloneInputs[idx];
    if (!target) return;
    if (inp.type === 'checkbox' || inp.type === 'radio') {
      const span = document.createElement('span');
      span.textContent = inp.checked ? '☑' : '☐';
      target.replaceWith(span);
    } else {
      const span = document.createElement('span');
      span.textContent = inp.value || '';
      target.replaceWith(span);
    }
  });

  const origSelects = element.querySelectorAll('select');
  const cloneSelects = clone.querySelectorAll('select');
  origSelects.forEach((sel, idx) => {
    const target = cloneSelects[idx];
    if (!target) return;
    const span = document.createElement('span');
    span.textContent = sel.options[sel.selectedIndex]?.text || sel.value || '';
    target.replaceWith(span);
  });

  const origTextareas = element.querySelectorAll('textarea');
  const cloneTextareas = clone.querySelectorAll('textarea');
  origTextareas.forEach((ta, idx) => {
    const target = cloneTextareas[idx];
    if (!target) return;
    const div = document.createElement('div');
    div.textContent = ta.value || '';
    target.replaceWith(div);
  });

  // Remove print:hidden elements
  clone.querySelectorAll('.no-print, .print\\:hidden').forEach((el) => el.remove());

  return clone.innerHTML;
}

/**
 * Generates an editable Microsoft Word (.doc) file from structured HTML content.
 * Supports A4 Portrait and A4 Landscape orientations.
 */
export function exportHtmlToWord(
  fileName: string,
  title: string,
  bodyHtml: string,
  options?: { orientation?: PageOrientation }
) {
  const safeName = fileName.endsWith('.doc') ? fileName : `${fileName}.doc`;
  const orientation = options?.orientation || 'portrait';
  const pageSizeCss =
    orientation === 'landscape'
      ? 'size: 29.7cm 21cm; mso-page-orientation: landscape; margin: 1.2cm 1.2cm 1.2cm 1.2cm;'
      : 'size: 21cm 29.7cm; mso-page-orientation: portrait; margin: 1.5cm 1.4cm 1.5cm 1.4cm;';

  const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40" lang="th">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page Section1 {
    ${pageSizeCss}
    mso-header-margin: 1cm;
    mso-footer-margin: 1cm;
  }
  div.Section1 { page: Section1; }
  body {
    font-family: 'TH SarabunPSK', 'Sarabun', sans-serif;
    font-size: 14pt;
    line-height: 1.35;
    color: #000000;
  }
  h1, h2, h3, h4 {
    font-family: 'TH SarabunPSK', 'Sarabun', sans-serif;
    margin: 4pt 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 6pt 0;
    font-size: 12pt;
  }
  th, td {
    border: 1px solid #333333;
    padding: 4pt 6pt;
    vertical-align: top;
  }
  th {
    background-color: #eef3fb;
    font-weight: bold;
  }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .text-left { text-align: left; }
  .font-bold { font-weight: bold; }
  .page-break { page-break-before: always; }
  .pdf-page { page-break-after: always; }
  .pdf-page:last-child { page-break-after: auto; }
</style>
</head>
<body>
  <div class="Section1">
    ${bodyHtml}
  </div>
</body>
</html>`;

  const blob = new Blob(['\ufeff', wordHtml], {
    type: 'application/msword;charset=utf-8',
  });
  triggerBlobDownload(blob, safeName);
  return blob;
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  if (!imgs.length) return;
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            if (img.naturalWidth === 0) img.style.display = 'none';
            resolve();
            return;
          }
          const timer = setTimeout(() => resolve(), 2500);
          img.addEventListener(
            'load',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
          img.addEventListener(
            'error',
            () => {
              clearTimeout(timer);
              img.style.display = 'none';
              resolve();
            },
            { once: true }
          );
        })
    )
  );
}

/**
 * Renders a DOM element to a crisp multi-page A4 PDF Blob using html2canvas + jsPDF,
 * mounting an isolated off-screen stage to avoid modal/scroll 0x0 capture failures
 * and sanitizing Tailwind v4 oklch()/oklab() colors before rendering.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  fileName: string,
  options?: { download?: boolean; orientation?: PageOrientation }
): Promise<Blob> {
  if (!element) {
    throw new Error('ไม่พบเนื้อหาเอกสารสำหรับสร้าง PDF');
  }

  const safeName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  const orientation: PageOrientation = options?.orientation || 'portrait';

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    // ignore font readiness errors
  }

  const sanitizedCss = collectSanitizedDocumentCss();
  const snapshotHtml = captureHtmlSnapshot(element);
  if (!snapshotHtml.trim()) {
    throw new Error('ไม่มีข้อมูลเอกสารสำหรับสร้าง PDF');
  }

  const stageWidthPx = orientation === 'landscape' ? 1122 : 794;

  const createStageAtOrigin = (htmlContent: string) => {
    const node = document.createElement('div');
    node.setAttribute('data-pdf-stage', 'true');
    node.style.position = 'absolute';
    node.style.left = '0';
    node.style.top = '0';
    node.style.width = `${stageWidthPx}px`;
    node.style.backgroundColor = '#ffffff';
    node.style.color = '#000000';
    node.style.fontFamily = "'Sarabun', 'TH SarabunPSK', sans-serif";
    node.style.boxSizing = 'border-box';
    node.style.zIndex = '-9999';
    node.style.opacity = '0.001';
    node.style.pointerEvents = 'none';
    node.innerHTML = htmlContent;
    document.body.appendChild(node);
    return node;
  };

  const applyStageCss = (clonedDoc: Document, clonedEl: HTMLElement) => {
    clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      node.remove();
    });

    const styleEl = clonedDoc.createElement('style');
    styleEl.textContent = `
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        font-family: 'Sarabun', 'TH SarabunPSK', sans-serif;
      }
      ${sanitizedCss}
      .no-print, .print\\:hidden { display: none !important; }
      [data-pdf-stage="true"] {
        position: relative !important;
        left: 0 !important;
        top: 0 !important;
        opacity: 1 !important;
        z-index: 1 !important;
        width: ${stageWidthPx}px !important;
        background: #ffffff !important;
        color: #000000 !important;
      }
      .pdf-page {
        width: 100% !important;
        background: #ffffff !important;
        color: #000000 !important;
        margin: 0 !important;
        box-shadow: none !important;
      }
      .tabular-nums { font-variant-numeric: tabular-nums; }
    `;
    clonedDoc.head.appendChild(styleEl);

    clonedEl.querySelectorAll<HTMLElement>('[style]').forEach((node) => {
      const rawStyle = node.getAttribute('style');
      if (rawStyle && /(?:oklch|oklab|color-mix|lab|lch)\s*\(/i.test(rawStyle)) {
        node.setAttribute('style', sanitizeCssColors(rawStyle));
      }
    });
  };

  const probeContainer = document.createElement('div');
  probeContainer.innerHTML = snapshotHtml;
  const pageHtmlList = Array.from(probeContainer.querySelectorAll<HTMLElement>('.pdf-page')).map(
    (p) => p.outerHTML
  );

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = orientation === 'landscape' ? 7 : 8;
  const usableWidth = Math.max(10, pageWidth - margin * 2);
  const usableHeight = Math.max(10, pageHeight - margin * 2);

  if (pageHtmlList.length > 0) {
    let addedCount = 0;
    for (let i = 0; i < pageHtmlList.length; i++) {
      const stage = createStageAtOrigin(pageHtmlList[i]);
      try {
        await waitForImages(stage);
        const pageEl = (stage.firstElementChild as HTMLElement) || stage;
        const w = Math.max(pageEl.scrollWidth, pageEl.offsetWidth, stageWidthPx);
        const h = Math.max(pageEl.scrollHeight, pageEl.offsetHeight, 100);

        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          width: w,
          height: h,
          x: 0,
          y: 0,
          windowWidth: stageWidthPx,
          windowHeight: h,
          scrollX: 0,
          scrollY: 0,
          onclone: applyStageCss,
        });

        if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
          continue;
        }

        const ratio = Math.min(usableWidth / canvas.width, usableHeight / canvas.height);
        const drawW = Number((canvas.width * ratio).toFixed(3));
        const drawH = Number((canvas.height * ratio).toFixed(3));
        if (!Number.isFinite(drawW) || !Number.isFinite(drawH) || drawW <= 0 || drawH <= 0) {
          continue;
        }

        const drawX = Number(((pageWidth - drawW) / 2).toFixed(3));
        const drawY = margin;

        if (addedCount > 0) {
          pdf.addPage();
        }
        const imgData = canvas.toDataURL('image/jpeg', 0.96);
        pdf.addImage(imgData, 'JPEG', drawX, drawY, drawW, drawH);
        addedCount++;
      } finally {
        stage.remove();
      }
    }

    if (addedCount === 0) {
      throw new Error('ไม่สามารถประมวลผลหน้าเอกสารเป็น PDF ได้');
    }
  } else {
    const stage = createStageAtOrigin(snapshotHtml);
    try {
      await waitForImages(stage);
      const targetW = Math.max(stage.scrollWidth, stage.offsetWidth, stageWidthPx);
      const targetH = Math.max(stage.scrollHeight, stage.offsetHeight, 100);

      const canvas = await html2canvas(stage, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: targetW,
        height: targetH,
        x: 0,
        y: 0,
        windowWidth: stageWidthPx,
        windowHeight: targetH,
        scrollX: 0,
        scrollY: 0,
        onclone: applyStageCss,
      });

      if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
        throw new Error('ไม่สามารถจับภาพเอกสารเพื่อสร้าง PDF ได้ (ขนาดหน้าว่าง)');
      }

      const sliceHeightPx = Math.max(1, Math.floor((canvas.width * usableHeight) / usableWidth));
      let offsetY = 0;
      let pageIndex = 0;

      while (offsetY < canvas.height) {
        const chunkH = Math.min(sliceHeightPx, canvas.height - offsetY);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = chunkH;
        const ctx = sliceCanvas.getContext('2d');
        if (!ctx) break;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(canvas, 0, offsetY, canvas.width, chunkH, 0, 0, canvas.width, chunkH);

        const drawH = Number(((chunkH * usableWidth) / canvas.width).toFixed(3));
        if (!Number.isFinite(drawH) || drawH <= 0 || !Number.isFinite(usableWidth) || usableWidth <= 0) {
          break;
        }

        if (pageIndex > 0) {
          pdf.addPage();
        }
        const imgData = sliceCanvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', margin, margin, usableWidth, drawH);

        offsetY += chunkH;
        pageIndex++;
      }

      if (pageIndex === 0) {
        throw new Error('ไม่สามารถสร้างหน้า PDF จากเอกสารนี้ได้');
      }
    } finally {
      stage.remove();
    }
  }

  const blob = pdf.output('blob');
  if (options?.download !== false) {
    triggerBlobDownload(blob, safeName);
  }
  return blob;
}

export function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface PrintPreviewPayload {
  html: string;
  title: string;
  orientation: PageOrientation;
}

type PrintPreviewHandler = (payload: PrintPreviewPayload) => void;
let activePrintPreviewHandler: PrintPreviewHandler | null = null;

export function registerPrintPreviewHandler(handler: PrintPreviewHandler | null) {
  activePrintPreviewHandler = handler;
}

function stripNoPrintHtml(rawHtml: string): string {
  if (typeof document === 'undefined') return rawHtml;
  const box = document.createElement('div');
  box.innerHTML = rawHtml;
  box.querySelectorAll('.no-print, .print\\:hidden, script').forEach((el) => el.remove());
  return box.innerHTML;
}

export function runNativePortalPrint(
  html: string,
  orientation: PageOrientation = 'portrait',
  onBlocked?: () => void
): { triggered: boolean } {
  let pageStyle = document.getElementById('dynamic-print-page-style') as HTMLStyleElement | null;
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'dynamic-print-page-style';
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent =
    orientation === 'landscape'
      ? `@media print { @page { size: A4 landscape; margin: 1cm 1.1cm; } }`
      : `@media print { @page { size: A4 portrait; margin: 1.4cm 1.2cm; } }`;

  let portal = document.getElementById('app-print-portal');
  if (!portal) {
    portal = document.createElement('div');
    portal.id = 'app-print-portal';
    document.body.appendChild(portal);
  }
  portal.innerHTML = html;
  document.body.classList.add('is-printing-portal');

  let beforePrintFired = false;
  const onBeforePrint = () => {
    beforePrintFired = true;
  };
  const cleanup = () => {
    document.body.classList.remove('is-printing-portal');
    window.removeEventListener('beforeprint', onBeforePrint);
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', cleanup);

  try {
    window.print();
  } catch {
    cleanup();
    onBlocked?.();
    return { triggered: false };
  }

  if (!beforePrintFired) {
    setTimeout(() => {
      if (!beforePrintFired) {
        cleanup();
        onBlocked?.();
      }
    }, 80);
  }
  return { triggered: beforePrintFired };
}

/**
 * Prints sanitized HTML via the in-page #app-print-portal (iFrame-safe, no window.open)
 * and opens an in-app Print Preview & instant PDF/Word export modal whenever the
 * browser/iframe sandbox blocks window.print().
 */
export function printHtmlSection(
  htmlOrElement: string | HTMLElement,
  title = 'เอกสารราชการ',
  orientation: PageOrientation = 'portrait'
) {
  const html =
    typeof htmlOrElement === 'string'
      ? stripNoPrintHtml(htmlOrElement)
      : captureHtmlSnapshot(htmlOrElement);

  runNativePortalPrint(html, orientation, () => {
    activePrintPreviewHandler?.({ html, title, orientation });
  });
}
