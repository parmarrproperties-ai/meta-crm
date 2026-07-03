import { toPng } from "html-to-image";

export async function captureAndShare(
  elementId: string,
  fileName: string,
  shareTitle: string = "Meta Ads Snapshot"
) {
  const node = document.getElementById(elementId);
  if (!node) {
    throw new Error(`Element with id ${elementId} not found`);
  }

  // Ensure element is visible during capture if it was hidden
  const originalDisplay = node.style.display;
  node.style.display = "block";

  try {
    const dataUrl = await toPng(node, {
      quality: 1,
      pixelRatio: 2,
      backgroundColor: "#f8fafc",
    });
    
    node.style.display = originalDisplay;

    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], `${fileName}.png`, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: shareTitle,
        files: [file],
      });
    } else {
      // Fallback: Copy to clipboard if supported
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({
              "image/png": blob,
            }),
          ]);
          return "copied";
        }
      } catch (err) {
        // Fallback: Download
      }

      // Download fallback
      const link = document.createElement("a");
      link.download = `${fileName}.png`;
      link.href = dataUrl;
      link.click();
      return "downloaded";
    }
    return "shared";
  } catch (error) {
    node.style.display = originalDisplay;
    console.error("Failed to generate snapshot", error);
    throw error;
  }
}
