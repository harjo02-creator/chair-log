/** Data only leaves the device through these three functions, and only on a user tap (PRIV-5). */

export function downloadFile(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * DATA-6: on phones, open the share sheet so the file can go to Files / iCloud Drive / Google Drive.
 * Falls back to a download. Returns 'cancelled' if she closes the share sheet.
 */
export async function shareOrDownload(
  filename: string,
  content: string,
  mime: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && typeof navigator.canShare === 'function') {
    const file = new File([content], filename, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return 'cancelled';
      }
    }
  }
  downloadFile(filename, content, mime);
  return 'downloaded';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}
