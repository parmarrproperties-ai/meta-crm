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

  // Find the maximum scroll width inside the node to ensure we capture everything
  let targetWidth = Math.max(1200, node.scrollWidth);
  const scrollableElements = node.querySelectorAll('.overflow-x-auto, table');
  scrollableElements.forEach(el => {
    if (el.scrollWidth > targetWidth) {
      targetWidth = el.scrollWidth;
    }
  });
  targetWidth += 32; // Add some padding

  // Temporarily force desktop-like width and disable overflow hiding for snapshot
  const originalDisplay = node.style.display;
  const originalWidth = node.style.width;
  const originalMinWidth = node.style.minWidth;
  const originalOverflow = node.style.overflow;
  
  node.style.display = "block";
  node.style.width = `${targetWidth}px`;
  node.style.minWidth = `${targetWidth}px`;
  node.style.overflow = "visible";

  // Also fix any nested scroll containers that might clip the table
  const scrollContainers = node.querySelectorAll('.overflow-x-auto, .overflow-hidden');
  const childStyles = Array.from(scrollContainers).map((el: any) => {
    const origOverflow = el.style.overflow;
    const origOverflowX = el.style.overflowX;
    const origWidth = el.style.width;
    el.style.overflow = 'visible';
    el.style.overflowX = 'visible';
    el.style.width = 'max-content';
    return { el, origOverflow, origOverflowX, origWidth };
  });

  // Force desktop layout for elements using sm: responsive classes
  const elementsWithSmClasses = node.querySelectorAll('[class*="sm:"]');
  const smOriginalClasses = Array.from(elementsWithSmClasses).map((el: any) => {
    const origClass = el.className;
    let newClass = origClass;
    
    // Completely strip mobile-first flex layout from table rows
    if (newClass.includes('sm:table-row')) {
      newClass = newClass.replace(/\bflex\b/g, '');
      newClass = newClass.replace(/\bflex-col\b/g, '');
    }
    
    // Strip mobile-first classes
    newClass = newClass.replace(/\bflex-col\b/g, '');
    newClass = newClass.replace(/\bp-4\b/g, '');
    
    // Apply desktop sm: classes
    newClass = newClass.replace(/\bsm:flex-row\b/g, 'flex-row');
    newClass = newClass.replace(/\bsm:items-center\b/g, 'items-center');
    newClass = newClass.replace(/\bsm:p-6\b/g, 'p-6');
    newClass = newClass.replace(/\bsm:hidden\b/g, 'hidden');
    newClass = newClass.replace(/\bsm:table-row\b/g, 'table-row');
    newClass = newClass.replace(/\bsm:table-cell\b/g, 'table-cell');
    newClass = newClass.replace(/\bsm:border-0\b/g, 'border-0');
    newClass = newClass.replace(/\bsm:text-left\b/g, 'text-left');
    newClass = newClass.replace(/\bsm:px-/g, 'px-');
    newClass = newClass.replace(/\bsm:py-/g, 'py-');
    newClass = newClass.replace(/\bsm:max-w-/g, 'max-w-');
    
    el.className = newClass;
    return { el, origClass };
  });

  try {
    const dataUrl = await toPng(node, {
      quality: 1,
      pixelRatio: 2,
      backgroundColor: "#f8fafc",
      width: targetWidth, // Force canvas width to match
      style: {
        transform: 'scale(1)',
        transformOrigin: 'top left',
        width: `${targetWidth}px`
      }
    });
    
    node.style.display = originalDisplay;
    node.style.width = originalWidth;
    node.style.minWidth = originalMinWidth;
    node.style.overflow = originalOverflow;
    childStyles.forEach(({ el, origOverflow, origOverflowX, origWidth }) => {
      el.style.overflow = origOverflow;
      el.style.overflowX = origOverflowX;
      el.style.width = origWidth;
    });
    smOriginalClasses.forEach(({ el, origClass }) => {
      el.className = origClass;
    });

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
    node.style.width = originalWidth;
    node.style.minWidth = originalMinWidth;
    node.style.overflow = originalOverflow;
    childStyles.forEach(({ el, origOverflow, origOverflowX, origWidth }) => {
      el.style.overflow = origOverflow;
      el.style.overflowX = origOverflowX;
      el.style.width = origWidth;
    });
    smOriginalClasses.forEach(({ el, origClass }) => {
      el.className = origClass;
    });
    console.error("Failed to generate snapshot", error);
    throw error;
  }
}

