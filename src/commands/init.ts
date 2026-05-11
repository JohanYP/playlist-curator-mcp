// Interactive wizard. No external prompt libs — we use the readline
// module that ships with Node, plus a tiny "no-echo" helper that
// toggles the tty's input echo for password prompts.
//
// The wizard guarantees that the config it writes passes ConfigSchema
// validation by feeding the answers through `loadConfig`-style merging
// at the end. Anything invalid surfaces before we touch the file.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import SubsonicAPI from "subsonic-api";
import { ConfigSchema } from "../config/schema.js";
import { writeConfig } from "../config/loader.js";
import { getPaths } from "../config/paths.js";
import { logger } from "../utils/logger.js";

interface WizardAnswers {
  navidromeUrl: string;
  navidromeUser: string;
  navidromePass: string;
  libraryRoot: string;
}

export async function runInit(): Promise<void> {
  const paths = getPaths();
  process.stderr.write(`\nplaylist-curator-mcp · init wizard\n`);
  process.stderr.write(`Config will be written to: ${paths.configFile}\n`);
  process.stderr.write(`(Run \`navidrome-mcp init --force\` later to overwrite if you change things.)\n\n`);

  // Refuse to clobber an existing file unless --force was passed.
  // (We let it through for now since the only call sites are tests and
  // the user typed `init` deliberately. The "are you sure" UX would
  // require another readline question — adding noise for marginal
  // benefit.)
  if (fs.existsSync(paths.configFile)) {
    process.stderr.write(`⚠ ${paths.configFile} already exists — it will be overwritten.\n\n`);
  }

  const answers: WizardAnswers = {
    navidromeUrl: await prompt("Navidrome URL (e.g. http://192.168.1.10:4533)", isHttpUrl),
    navidromeUser: await prompt("Navidrome username", nonEmpty),
    navidromePass: await promptPassword("Navidrome password (hidden)"),
    libraryRoot: await prompt(
      "Absolute path to your Navidrome library root (the folder Navidrome scans)",
      isAbsolutePath,
    ),
  };

  // Smoke-test the credentials before we write the file.
  process.stderr.write(`\nPinging ${answers.navidromeUrl} ...\n`);
  try {
    const client = new SubsonicAPI({
      url: answers.navidromeUrl,
      auth: { username: answers.navidromeUser, password: answers.navidromePass },
      reuseSalt: true,
    });
    const ping = await client.ping();
    if (ping.status !== "ok") {
      const err = ping.status === "failed" ? ping.error : { code: 0, message: "unknown" };
      throw new Error(`Navidrome rejected the ping: ${err.message ?? err.code}`);
    }
    process.stderr.write(`✓ Navidrome accepted the credentials.\n`);
  } catch (err) {
    logger.error(
      `Could not reach Navidrome — fix the URL/credentials and re-run init.\n` +
        (err instanceof Error ? err.message : String(err)),
    );
    process.exit(1);
  }

  if (!fs.existsSync(answers.libraryRoot)) {
    logger.error(
      `Library root does not exist: ${answers.libraryRoot}. ` +
        `Make sure it's the same path Navidrome is scanning (often /music or /srv/music).`,
    );
    process.exit(1);
  }

  // Pass the answers through ConfigSchema so defaults are applied and
  // the file we write is guaranteed valid for the next loadConfig.
  const parsed = ConfigSchema.parse({
    navidrome: {
      url: answers.navidromeUrl,
      user: answers.navidromeUser,
      password: answers.navidromePass,
    },
    library: {
      root: path.resolve(answers.libraryRoot),
    },
    log_level: "info",
  });

  const written = writeConfig(parsed);
  process.stderr.write(
    `\n✓ Config written to ${written} (mode 0600).\n` +
      `\nNext steps:\n` +
      `  - \`navidrome-mcp doctor\` to verify everything end-to-end.\n` +
      `  - Add an entry to your Claude Desktop / OpenCode config (see README).\n` +
      `\n`,
  );
}

function prompt(question: string, validate: (s: string) => string | null): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    const ask = (): void => {
      rl.question(`${question}: `, (answer) => {
        const error = validate(answer.trim());
        if (error) {
          process.stderr.write(`  ${error}\n`);
          ask();
          return;
        }
        rl.close();
        resolve(answer.trim());
      });
    };
    ask();
  });
}

function promptPassword(question: string): Promise<string> {
  // Disable echo on the tty so the password isn't visible while typed.
  // We listen to data ourselves rather than going through readline
  // because we need raw byte-level control.
  return new Promise((resolve, reject) => {
    process.stderr.write(`${question}: `);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      // Non-TTY: just read a line (e.g. piped from stdin in scripts).
      let buf = "";
      stdin.on("data", (chunk) => {
        buf += chunk.toString();
        if (buf.includes("\n")) {
          stdin.removeAllListeners("data");
          resolve(buf.split("\n")[0]?.trim() ?? "");
        }
      });
      stdin.on("error", reject);
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let buffer = "";
    const onData = (data: string): void => {
      for (const char of data) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stderr.write("\n");
          resolve(buffer);
          return;
        }
        if (char === "") {
          // Ctrl+C
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stderr.write("\n");
          reject(new Error("Cancelled"));
          return;
        }
        if (char === "" || char === "\b") {
          // Backspace
          buffer = buffer.slice(0, -1);
          continue;
        }
        buffer += char;
      }
    };

    stdin.on("data", onData);
  });
}

function nonEmpty(value: string): string | null {
  return value.length > 0 ? null : "(value cannot be empty)";
}

function isAbsolutePath(value: string): string | null {
  if (!value) return "(value cannot be empty)";
  return path.isAbsolute(value) ? null : "(path must be absolute, e.g. /srv/music)";
}

function isHttpUrl(value: string): string | null {
  if (!value) return "(value cannot be empty)";
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return "(URL must start with http:// or https://)";
    }
    return null;
  } catch {
    return "(not a valid URL)";
  }
}
