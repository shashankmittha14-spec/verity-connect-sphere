import { useRef, useState } from "react";
import { ImageUp, Loader2 } from "lucide-react";

const MAX_BYTES = 5 * 1024 * 1024;

export function ScreenshotUploader({
  onExtracted,
  disabled,
}: {
  onExtracted: (text: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      setError("Please choose a JPG or PNG image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is larger than 5MB — please use a smaller screenshot.");
      return;
    }

    setBusy(true);
    setProgress(0);
    // The image never leaves the browser: Tesseract.js runs OCR locally and we
    // discard the file object as soon as text is extracted.
    let objectUrl: string | null = null;
    try {
      const Tesseract = (await import("tesseract.js")).default;
      objectUrl = URL.createObjectURL(file);
      const { data } = await Tesseract.recognize(objectUrl, "eng+hin", {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
        },
      });
      const text = (data.text ?? "").replace(/\s*\n\s*/g, "\n").trim();
      if (text.length < 3) {
        setError(
          "Couldn't read text clearly from this image — try a clearer screenshot or paste the text manually.",
        );
        return;
      }
      onExtracted(text);
    } catch {
      setError(
        "Couldn't read text clearly from this image — try a clearer screenshot or paste the text manually.",
      );
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className={`flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition ${
          dragging ? "border-accent bg-accent/5" : "border-border bg-background"
        }`}
      >
        {busy ? (
          <>
            <Loader2 className="size-6 animate-spin text-accent" />
            <p className="text-sm font-medium">Reading text from image…</p>
            {progress > 0 && <p className="text-xs text-muted-foreground tabular-nums">{progress}%</p>}
          </>
        ) : (
          <>
            <ImageUp className="size-6 text-accent" />
            <p className="text-sm text-muted-foreground">
              Drag &amp; drop a screenshot here, or
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Choose image
            </button>
            <p className="text-xs text-muted-foreground">JPG or PNG, up to 5MB. Images are never uploaded or stored.</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          aria-label="Upload a screenshot to extract text"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>
      {error && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
