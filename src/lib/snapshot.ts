import { toPng } from "html-to-image";

export async function captureAndShare(
  elementId: string,
  fileName: string,
  shareTitle: string = "Meta Ads Snapshot",
  subtitle?: string
) {
  const node = document.getElementById(elementId);
  if (!node) {
    throw new Error(`Element with id ${elementId} not found`);
  }

  // Save original styles
  const originalDisplay = node.style.display;
  const originalWidth = node.style.width;
  const originalMinWidth = node.style.minWidth;
  const originalOverflow = node.style.overflow;
  
  // Force shrink-wrap to measure actual content width
  node.style.display = "block";
  node.style.width = "max-content";
  node.style.minWidth = "max-content";
  node.style.overflow = "visible";

  // Now measure the exact width of the content
  let targetWidth = node.scrollWidth;
  
  // Account for any wide tables that might overflow
  const scrollableElements = node.querySelectorAll('.overflow-x-auto, table');
  scrollableElements.forEach(el => {
    if (el.scrollWidth > targetWidth) {
      targetWidth = el.scrollWidth;
    }
  });
  
  // Force exact width
  node.style.width = `${targetWidth}px`;
  node.style.minWidth = `${targetWidth}px`;

  const timestampDiv = document.createElement("div");
  timestampDiv.style.textAlign = "right";
  timestampDiv.style.fontSize = "12px";
  timestampDiv.style.color = "#64748b";
  timestampDiv.style.padding = "8px 16px";
  timestampDiv.style.fontFamily = "system-ui, sans-serif";
  timestampDiv.innerText = subtitle ? subtitle : `Captured on: ${new Date().toLocaleString()}`;
  node.insertBefore(timestampDiv, node.firstChild);

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
    
    node.removeChild(timestampDiv);
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
      try {
        await navigator.share({
          title: shareTitle,
          files: [file],
        });
        return "shared";
      } catch (shareError) {
        console.warn("navigator.share failed, falling back to clipboard/download", shareError);
      }
    }
    
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
  } catch (error) {
    if (node.contains(timestampDiv)) {
      node.removeChild(timestampDiv);
    }
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

export async function takeCombinedSnapshot(
  elementIds: string[],
  fileName: string,
  shareTitle: string = "Meta Ads Snapshot",
  subtitle?: string
) {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.backgroundColor = '#f8fafc';
  container.style.padding = '32px';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '24px';
  container.style.width = 'max-content';

  const timestampDiv = document.createElement("div");
  timestampDiv.style.textAlign = "right";
  timestampDiv.style.fontSize = "12px";
  timestampDiv.style.color = "#64748b";
  timestampDiv.style.padding = "0 8px";
  timestampDiv.style.fontFamily = "system-ui, sans-serif";
  timestampDiv.innerText = subtitle ? subtitle : `Captured on: ${new Date().toLocaleString()}`;
  container.appendChild(timestampDiv);

  for (const id of elementIds) {
    const el = document.getElementById(id);
    if (el) {
      const clone = el.cloneNode(true) as HTMLElement;
      
      const elementsWithSmClasses = clone.querySelectorAll('[class*="sm:"]');
      Array.from(elementsWithSmClasses).forEach((el: any) => {
        let newClass = el.className;
        if (newClass.includes('sm:table-row')) {
          newClass = newClass.replace(/\bflex\b/g, '');
          newClass = newClass.replace(/\bflex-col\b/g, '');
        }
        newClass = newClass.replace(/\bflex-col\b/g, '');
        newClass = newClass.replace(/\bp-4\b/g, '');
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
      });

      if (clone.className && typeof clone.className === 'string' && clone.className.includes('sm:')) {
        let newClass = clone.className;
        if (newClass.includes('sm:table-row')) {
          newClass = newClass.replace(/\bflex\b/g, '');
          newClass = newClass.replace(/\bflex-col\b/g, '');
        }
        newClass = newClass.replace(/\bflex-col\b/g, '');
        newClass = newClass.replace(/\bp-4\b/g, '');
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
        clone.className = newClass;
      }

      const scrollContainers = clone.querySelectorAll('.overflow-x-auto, .overflow-hidden');
      Array.from(scrollContainers).forEach((el: any) => {
        el.style.overflow = 'visible';
        el.style.overflowX = 'visible';
        el.style.width = 'max-content';
      });

      container.appendChild(clone);
    }
  }

  document.body.appendChild(container);

  try {
    // Calculate the actual width of the container after appending children
    const containerWidth = container.scrollWidth;

    const dataUrl = await toPng(container, {
      quality: 1,
      pixelRatio: 2,
      backgroundColor: "#f8fafc",
      width: containerWidth, // use dynamic width
      style: {
        transform: 'scale(1)',
        transformOrigin: 'top left',
        width: `${containerWidth}px`
      }
    });
    
    document.body.removeChild(container);

    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], `${fileName}.png`, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: shareTitle,
          files: [file],
        });
        return "shared";
      } catch (shareError) {
        console.warn("navigator.share failed, falling back to clipboard/download", shareError);
      }
    }
    
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": blob,
          }),
        ]);
        return "copied";
      }
    } catch (err) {}
    
    const link = document.createElement("a");
    link.download = `${fileName}.png`;
    link.href = dataUrl;
    link.click();
    return "downloaded";
  } catch (error) {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    console.error("Failed to generate combined snapshot", error);
    throw error;
  }
}

