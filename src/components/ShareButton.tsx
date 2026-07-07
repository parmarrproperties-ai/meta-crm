import { Share2, Loader2 } from "lucide-react";
import { captureAndShare } from "@/lib/snapshot";
import { useState } from "react";

export function ShareButton({
  elementId,
  fileName,
  title,
  subtitle,
}: {
  elementId: string;
  fileName: string;
  title: string;
  subtitle?: string;
}) {
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    setSharing(true);
    try {
      const result = await captureAndShare(elementId, fileName, title, subtitle);
      // Optional: add toast notification here based on result
    } catch (e) {
      console.error(e);
      alert("Failed to share snapshot.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={sharing}
      className={`p-1.5 rounded-md transition-colors ${
        sharing
          ? "text-slate-300 cursor-not-allowed"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      }`}
      title="Share as Image"
    >
      {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
    </button>
  );
}
