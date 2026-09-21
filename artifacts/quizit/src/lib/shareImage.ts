import { toBlob } from "html-to-image";

/** Renders `node` to a PNG and hands it to the native share sheet; where files can't be shared, downloads it instead. */
export async function shareNodeAsImage(
  node: HTMLElement,
  { filename, title, text }: { filename: string; title: string; text: string },
): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true });
  if (!blob) throw new Error("Couldn't render the image");
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // share sheet failed for another reason; fall through to the download
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
