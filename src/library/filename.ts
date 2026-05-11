// FS-safe filename sanitization. Defense-in-depth on top of yt-dlp's
// own `--restrict-filenames`: we want the filenames we hand Navidrome
// to be portable across Linux / macOS / Windows.
//
// Rules:
//   - Replace any run of illegal-on-Windows characters or whitespace
//     with a single dash. ASCII letters, digits, dots, dashes and
//     underscores are preserved verbatim so file extensions (.mp3,
//     .ogg, .flac) survive intact.
//   - Collapse repeated dashes into single dashes.
//   - Trim leading/trailing dashes AND dots (Windows hates trailing
//     dots; leading dots make the file hidden on Unix).
//   - Cap length at 200 chars (universally safe across filesystems).
//   - Empty / collapsed-to-nothing strings become "untitled".

const BAD_OR_WS_RE = /[<>:"/\\|?*\s]+/g;
const REPEATED_DASH_RE = /-+/g;
const TRIM_RE = /^[-.]+|[-.]+$/g;
const MAX_LEN = 200;

export function sanitizeFilename(name: string): string {
  let out = name.replace(BAD_OR_WS_RE, "-");
  out = out.replace(REPEATED_DASH_RE, "-");
  out = out.replace(TRIM_RE, "");
  if (out.length > MAX_LEN) out = out.slice(0, MAX_LEN).replace(TRIM_RE, "");
  return out || "untitled";
}
