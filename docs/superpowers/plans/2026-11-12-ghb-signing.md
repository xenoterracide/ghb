<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# ghb signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ghb signing check|renew|export` watch and extend the CI signing key's expiry, and `ghb secrets` gains a `gpg:<fpr>` resolver that exports the armored key at sync time — no flatfile, no passphrase in argv, no short key IDs.

**Architecture:** One new package, `packages/ghb-signing`, in three layers: a pure `gpg --with-colons` parser, a runner-backed gpg module that owns every gpg argv, and three clipanion commands. `ghb-secrets-sync` gains the `gpg:` protocol and delegates the export to `ghb-signing`, so every gpg argv has one home. The passphrase travels on stdin (`--passphrase-fd 0`); when stdin is a TTY the loopback flags are omitted and gpg prompts through pinentry.

**Tech Stack:** TypeScript, clipanion, vitest, GnuPG 2.x through an injectable `CommandRunner`.

**Spec:** `docs/superpowers/specs/2026-11-12-ghb-signing-design.md`

**Status:** implemented — every task complete (2026-11-12).

## Global Constraints

- Conventional commits per `git-conventional-commits.yaml`; allowed types include `feat`, `fix`, `test`, `docs`, `refactor`.
- SPDX header on every new file, copied from a neighbor: `//`-comment `GPL-3.0-or-later` for `.ts`, HTML-comment `CC-BY-NC-SA-4.0` for `.md`.
- No secret in argv. The passphrase reaches gpg as the runner's `input` on fd 0; secret values reach `gh` and `gpg` only through `input`.
- Never write the armored secret key to a file. It goes to stdout or a GitHub secret.
- Full fingerprints only: 40 hex characters (64 for v5 keys). Short key IDs are rejected before gpg runs.
- Never extend expiry silently: `renew` prints before and after; `check` never modifies anything.
- gpg runs only through `runArgv` argv arrays with an injectable runner; never a shell string.
- eslint runs `strictTypeChecked` + `stylisticTypeChecked` on every file; `no-console` is off only for `**/commands/*.ts` and `**/cli.ts`.
- From repo root: targeted tests `pnpm vitest run packages/ghb-signing` (or `packages/ghb-secrets-sync`, `packages/ghb`), package typecheck `pnpm --filter @xenoterracide/ghb-signing typecheck`, full gate `pnpm check`.

## Review Focus

Input classes the spec implies but no existing test exercises; each is pinned to its owning task.

1. A key with no signing subkey — `check` exits 2 naming the key, never reports the primary's expiry or crashes. Test: Task 3.
2. `--key 8042ED9A` (short ID) — exit 1 with a fingerprint message, and the runner is never called. Tests: Tasks 3, 4, 5.
3. A subkey with no expiry (empty colon field 7) — `check` exits 0 printing `never expires`; the days math never sees `NaN`. Tests: Tasks 1, 3.
4. Several keys without `--key` — exit 2 listing every fingerprint; never a silent first pick. Test: Task 3.
5. gpg failing mid-sync for a `gpg:` entry (missing key, wrong passphrase) — the secret is skipped with a warning like `env:`/`file:`, never a crash, never an empty value pushed. Test: Task 6.

---

### Task 1: Scaffold `ghb-signing` and parse the colon format

**Files:**

- Create: `packages/ghb-signing/package.json`
- Create: `packages/ghb-signing/tsconfig.json` (copy of `packages/ghb-secrets-sync/tsconfig.json`)
- Create: `packages/ghb-signing/vitest.config.ts` (copy of the sibling's)
- Create: `packages/ghb-signing/src/types.ts`
- Create: `packages/ghb-signing/src/colon.ts`
- Create: `packages/ghb-signing/src/index.ts`
- Modify: `vitest.config.ts` (root; add the project)
- Test: `packages/ghb-signing/test/colon.test.ts`

**Interfaces:**

- Consumes: nothing — pure functions, no runner.
- Produces (Tasks 2–6 import these exact names):

```ts
export interface SubKey {
  keyId: string; // colon field 5
  fingerprint: string; // fpr record, field 10
  capabilities: string; // colon field 12: e s c a
  createdAt: number; // colon field 6, unix seconds
  expiresAt: number | null; // colon field 7; null = never expires
}

export interface PublicKey {
  keyId: string;
  fingerprint: string;
  capabilities: string;
  createdAt: number;
  expiresAt: number | null;
  subkeys: SubKey[];
}

export type KeySelection =
  | { status: "ok"; key: PublicKey }
  | { status: "missing" }
  | { status: "ambiguous"; keys: PublicKey[] }
  | { status: "not-found" };

export function parseColonKeys(colonOutput: string): PublicKey[];
export function isValidFingerprint(value: string): boolean;
export function findSigningSubkey(key: PublicKey): SubKey | undefined;
export function selectKey(keys: PublicKey[], fingerprint?: string): KeySelection;
```

`types.ts` carries the package's own `CommandRunner`, identical in shape to `ghb-secrets-sync`'s (the two are structurally compatible, no shared import).

- [x] **Step 1: Scaffold the package**

`package.json` mirrors `packages/ghb-secrets-sync/package.json`: name `@xenoterracide/ghb-signing`, version `0.1.0`, license `GPL-3.0-or-later`, `main: src/index.ts`, the same `publishConfig`, `files`, clipanion dependency, devDependencies, engines, repository `directory`, and scripts — minus the `secrets-sync` script (Task 3 adds `signing`). Root `vitest.config.ts` gains the project `{ name: "ghb-signing", root: "./packages/ghb-signing", include: ["test/**/*.test.ts"] }`. Then `pnpm install --reporter=silent`.

- [x] **Step 2: Write the failing tests**

Real `gpg --list-keys --with-colons` output, captured from gpg 2.4.9 (an ed25519 `cert` primary plus an ed25519 `sign` subkey). Use it verbatim as the fixture:

```ts
const FIXTURE = `tru::1:1794537422:1826073421:3:1:5
pub:u:255:22:32BF5B09B5329853:1794537421:1826073421::u:::cSC:::::ed25519:::0:
fpr:::::::::E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853:
uid:u::::1794537421::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test <plan@example.invalid>::::::::::0:
sub:u:255:22:C3C46C6F2A3408CC:1794537422:1826073422:::::s:::::ed25519::
fpr:::::::::C17EB30E70FBD586F5794285C3C46C6F2A3408CC:`;
```

Cases:

```ts
it("parses one key with its signing subkey", () => {
  expect(parseColonKeys(FIXTURE)).toEqual([
    {
      keyId: "32BF5B09B5329853",
      fingerprint: "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853",
      capabilities: "cSC",
      createdAt: 1794537421,
      expiresAt: 1826073421,
      subkeys: [
        {
          keyId: "C3C46C6F2A3408CC",
          fingerprint: "C17EB30E70FBD586F5794285C3C46C6F2A3408CC",
          capabilities: "s",
          createdAt: 1794537422,
          expiresAt: 1826073422,
        },
      ],
    },
  ]);
});
```

- `reads an empty expiry as never`: the `sub` line with field 7 blank — `sub:u:255:22:C3C46C6F2A3408CC:1794537422::::::s:::::ed25519::` (note the extra colon; the empty expiry is still a field) — parses to `expiresAt: null`. Same for a `pub` line.
- `keeps each key's subkeys with it`: `FIXTURE` plus a second `pub`/`fpr`/`sub`/`fpr` set with different ids yields two `PublicKey` entries.
- `findSigningSubkey`: returns the `s`-capable subkey of the fixture key; returns `undefined` when the subkey's capabilities are `e`; picks the newer `createdAt` when two subkeys both carry `s`; matches `S` (uppercase) as sign.
- `isValidFingerprint`: the 40-hex fixture fingerprint is `true`, a 64-hex string is `true`, both lowercase; `32BF5B09B5329853` (key id) is `false`; non-hex characters are `false`.
- `selectKey`: `selectKey(keys)` with one key → `ok`; no keys → `missing`; two keys → `ambiguous` carrying both; `selectKey(keys, fixtureFpr.toLowerCase())` → `ok`; `selectKey(keys, <40-hex that matches nothing>)` → `not-found`.

- [x] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run packages/ghb-signing`
Expected: FAIL — `src/colon.ts` does not exist.

- [x] **Step 4: Implement `colon.ts` and `types.ts`**

Split on `:`; read fields by index: `[4]` key id, `[5]` creation, `[6]` expiry (`""` → `null`), `[11]` capabilities; the `fpr` record's `[9]` is the fingerprint of the `pub`/`sub` record it follows. Skip every other record type (`tru`, `uid`, …). `findSigningSubkey` matches `s` case-insensitively in capabilities and, among matches, returns the greatest `createdAt`. `selectKey` matches fingerprints case-insensitively.

- [x] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/ghb-signing`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add packages/ghb-signing vitest.config.ts
git commit -m "feat: scaffold ghb-signing with the gpg colon parser" \
  -m "- parse gpg --with-colons pub/sub/fpr records into PublicKey/SubKey
- selectKey and findSigningSubkey carry the fingerprint-only rules" \
  -m "Assisted-by: GLM:glm-5.3"
```

### Task 2: Wrap gpg behind a runner

**Files:**

- Create: `packages/ghb-signing/src/gpg.ts`
- Create: `packages/ghb-signing/src/passphrase.ts`
- Create: `packages/ghb-signing/test/gnupg.ts` (shared fixture helper, not a test)
- Modify: `packages/ghb-signing/src/index.ts`
- Test: `packages/ghb-signing/test/gpg.test.ts`, `packages/ghb-signing/test/passphrase.test.ts`

**Interfaces:**

- Consumes: Task 1's `PublicKey`, `parseColonKeys`, `CommandRunner`.
- Produces (Tasks 3–6):

```ts
export interface GpgOpts {
  runner?: CommandRunner;
  env?: Record<string, string>;
  passphrase?: string;
}

export function listKeys(opts?: GpgOpts): PublicKey[];
export function exportSecretKey(fingerprint: string, opts?: GpgOpts): string;
export function setExpiry(fingerprint: string, duration: string, subkeyFingerprint?: string, opts?: GpgOpts): void;

export function readAll(input: NodeJS.ReadableStream): Promise<string>;
export function readPassphrase(stream: NodeJS.ReadableStream & { isTTY?: boolean }): Promise<string | undefined>;

// test/gnupg.ts
export function createGnupgHome(): string;
export function generateSigningKey(
  home: string,
  passphrase: string,
  expiry?: string,
): { primaryFpr: string; subkeyFpr: string };
```

Argv, pinned (cmd is always `"gpg"`):

- `listKeys`: `["--list-keys", "--with-colons"]`; an empty keyring exits 0 and yields `[]`.
- `exportSecretKey`, passphrase present: `["--batch", "--pinentry-mode", "loopback", "--passphrase-fd", "0", "--armor", "--export-secret-keys", fingerprint]` with `input: passphrase`.
- `exportSecretKey`, passphrase `undefined` (TTY): `["--armor", "--export-secret-keys", fingerprint]`, no input — pinentry prompts.
- `setExpiry`: `--quick-set-expire <fingerprint> <duration>` with the same loopback prefix when a passphrase is present, `subkeyFingerprint` appended when given. One call moves only the primary; the subkey needs its own call.
- A thrown gpg error is wrapped like `github.ts` does: `` `Failed to export secret key ${fingerprint}: ${msg}` ``, `{ cause }`.

`readPassphrase`: a TTY stream resolves `undefined`; anything else resolves everything the stream yields, trailing newline kept — gpg strips it. An empty pipe resolves `""` and gpg fails loudly (`No passphrase given`, exit 2).

- [x] **Step 1: Write the failing tests**

`test/gnupg.ts`: `createGnupgHome` makes a temp dir under `tmpdir()`; `generateSigningKey` runs the two proven commands with the passphrase piped (`--quick-generate-key '<uid>' ed25519 cert <expiry>`, then `--quick-add-key <fpr> ed25519 sign <expiry>` with unique uids) and returns both fingerprints read from `fpr` records.

`test/passphrase.test.ts`:

```ts
it("reads a stream to eof", async () => {
  expect(await readAll(Readable.from(["ab", "cd"]))).toBe("abcd");
});

it("skips the tty stream and lets pinentry ask", async () => {
  const ttyLike = { isTTY: true } as unknown as NodeJS.ReadableStream & { isTTY?: boolean };
  expect(await readPassphrase(ttyLike)).toBeUndefined();
});

it("keeps the trailing newline; gpg strips it", async () => {
  expect(await readPassphrase(Readable.from(["pass\n"]))).toBe("pass\n");
});
```

`test/gpg.test.ts` — unit cases with a recording fake runner (records `cmd`, `args`, `opts`; returns queued responses):

- export with a passphrase: argv and `input` exactly as pinned above.
- export without: argv without the loopback prefix, no input.
- `setExpiry(fpr, "2y")` and `setExpiry(fpr, "2y", subFpr)`: both argv shapes.
- `listKeys` parses the fake's `FIXTURE` response (import it from Task 1's test or repeat the constant in this file).

Integration cases (real gpg, default runner, `env: { GNUPGHOME: home }`):

```ts
it("lists the generated key and its signing subkey", () => {
  const { primaryFpr, subkeyFpr } = generateSigningKey(home, PASS);
  const keys = listKeys({ env: { GNUPGHOME: home } });
  expect(keys[0].fingerprint).toBe(primaryFpr);
  expect(findSigningSubkey(keys[0]).fingerprint).toBe(subkeyFpr);
});
```

- `exports an armored key that still signs after import`: export with the passphrase; the output contains `BEGIN PGP PRIVATE KEY BLOCK`; import it into a second `createGnupgHome()`, detach-sign a blob, `gpg --verify` prints `Good signature`.
- `setExpiry moves the primary only, then the subkey`: `setExpiry(primaryFpr, "2y", undefined, …)`, assert via `listKeys` the primary moved and the subkey did not; then `setExpiry(primaryFpr, "2y", subkeyFpr, …)` and assert the subkey moved.
- `a wrong passphrase throws`: `exportSecretKey(primaryFpr, { …, passphrase: "wrong" })` throws, message contains `Failed to export secret key`.

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/ghb-signing`
Expected: FAIL — `src/gpg.ts`, `src/passphrase.ts` do not exist.

- [x] **Step 3: Implement `gpg.ts` and `passphrase.ts`**

`gpg.ts` owns a module-level default runner mirroring `github.ts`'s `createDefaultCommandRunner` (same `execFileSync` options: encoding, cwd, env merge, input, trimmed return). `readAll` concatenates the stream's chunks until end; declare both helpers `async` (`@typescript-eslint/promise-function-async` requires it). Export everything from `src/index.ts`.

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/ghb-signing && pnpm --filter @xenoterracide/ghb-signing typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/ghb-signing
git commit -m "feat: wrap gpg key operations behind a runner" \
  -m "- listKeys, exportSecretKey, setExpiry own every gpg argv
- the passphrase travels as input on fd 0; without one the loopback
  flags drop and pinentry prompts
- readPassphrase reads a piped stdin and skips a tty" \
  -m "Assisted-by: GLM:glm-5.3"
```

### Task 3: `ghb signing check`

**Files:**

- Create: `packages/ghb-signing/src/commands/check.ts`
- Create: `packages/ghb-signing/src/cli.ts`
- Modify: `packages/ghb-signing/src/index.ts`, `packages/ghb-signing/package.json` (add script `"signing": "tsx src/cli.ts"`)
- Test: `packages/ghb-signing/test/commands/check.test.ts`

**Interfaces:**

- Consumes: Task 1's `selectKey`, `findSigningSubkey`, `isValidFingerprint`; Task 2's `listKeys`, `CommandRunner`.
- Produces: `export class CheckCommand extends Command` with `static paths = [["signing", "check"]]`, `key = Option.String("--key,-k", …)`, `days = Option.String("--days,-d", "30", …)`, and `runner?: CommandRunner` (Task 7 registers it; its usage text is user-facing).

`src/cli.ts` mirrors `ghb-secrets-sync/src/cli.ts`: `binaryLabel: "signing"`, `binaryName: "signing"`, registers `CheckCommand`.

Behavior, pinned:

| Input                    | Stream and copy                                                                                                                     | Exit |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `--key` not 40/64 hex    | stderr: `Error: --key must be a full fingerprint; got "<value>"`                                                                    | 1    |
| `--days` not `/^\d+$/`   | stderr: `Error: --days must be a number; got "<value>"`                                                                             | 1    |
| keyring empty            | stderr: `Error: no keys in the keyring`                                                                                             | 2    |
| several keys, no `--key` | stderr: `Error: multiple keys in the keyring; pass --key with one of:` then one fingerprint per line                                | 2    |
| `--key` matches nothing  | stderr: `Error: key <fpr> not found`                                                                                                | 2    |
| no sign-capable subkey   | stderr: `Error: key <fpr> has no signing subkey`                                                                                    | 2    |
| subkey never expires     | stdout: `signing subkey <subFpr> never expires`                                                                                     | 0    |
| days left > window       | stdout: `signing subkey <subFpr> expires <date> (<n> days)`                                                                         | 0    |
| 0 ≤ days left ≤ window   | stderr: `Error: signing subkey <subFpr> expires <date> (<n> days; within <window>)` and `Run: ghb signing renew --key <primaryFpr>` | 1    |
| days left < 0            | stderr: `Error: signing subkey <subFpr> expired <date> (<-n> days ago)` and the same `Run:` line                                    | 1    |

`days = Math.floor((expiresAt - Math.floor(Date.now() / 1000)) / 86400)`; `<date>` is UTC `new Date(sec * 1000).toISOString().slice(0, 10)`. The window check is inclusive. `check` never takes a passphrase and never modifies anything.

- [x] **Step 1: Write the failing tests**

Fixture strings built at runtime — a helper in the test file:

```ts
function colon(subExpiresAt: number | null, subCapabilities = "s"): string;
```

emits the Task 1 fixture shape with the computed expiry (`null` writes the blank-field variant). Fake runner: returns the built string for `gpg --list-keys --with-colons` and throws on anything else; every `--key`/`--days` error case asserts the runner was never called. Cases, one per table row:

- healthy: `subExpiresAt` = now + 365d, `--days` default → exit 0, stdout matches `/signing subkey \w{40} expires \d{4}-\d{2}-\d{2} \(\d+ days\)/`.
- boundary inclusive: now + 30d + 1h → 30 days left → exit 1, stderr contains `within 30 days` and `Run: ghb signing renew --key <primaryFpr>`. (The extra hour keeps `Math.floor` stable while the test runs; `now + 30d` alone floors to 29 the moment a second passes.)
- boundary healthy: now + 31d + 1h → 31 days left → exit 0.
- expired: now − 5d + 1h → exit 1, stderr contains `expired` and `days ago`.
- never: `null` → exit 0, `never expires`.
- no signing subkey: `subCapabilities = "e"` → exit 2, `has no signing subkey`.
- short `--key 8042ED9A` → exit 1, fingerprint message.
- valid `--key` matching nothing → exit 2, `not found`.
- two keys, no `--key` → exit 2, both fingerprints printed.
- bad `--days` → exit 1.

Integration (real gpg; save, set, and restore `process.env.GNUPGHOME` as `sync.test.ts` restores `process.env`): a generated 1y key → exit 0; a generated 1d key → exit 1 with `within 30 days`.

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/ghb-signing`
Expected: FAIL — `commands/check.ts` does not exist.

- [x] **Step 3: Implement `check.ts` and `cli.ts`**

Follow the table. `console`/`process.stdout.write` per `get.ts`'s split: values to stdout, errors to stderr.

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/ghb-signing && pnpm --filter @xenoterracide/ghb-signing typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/ghb-signing
git commit -m "feat: add ghb signing check" \
  -m "- report the signing subkey expiry; the primary's expiry is not the
  CI failure, the subkey's is
- exit 1 inside the window (default 30 days) or after expiry, printing
  the renew command; exit 2 when the key or signing subkey is missing" \
  -m "Assisted-by: GLM:glm-5.3"
```

### Task 4: `ghb signing renew`

**Files:**

- Create: `packages/ghb-signing/src/commands/renew.ts`
- Modify: `packages/ghb-signing/src/cli.ts`, `packages/ghb-signing/src/index.ts`
- Test: `packages/ghb-signing/test/commands/renew.test.ts`

**Interfaces:**

- Consumes: Tasks 1–2 as `check`, plus `setExpiry` and `readPassphrase`.
- Produces: `export class RenewCommand extends Command`, `static paths = [["signing", "renew"]]`, `key = Option.String("--key,-k", …)`, `duration = Option.String("--duration", "1y", …)`, `runner?: CommandRunner`, `passphrase?: string` (test injection).

Behavior:

- `--key` and selection errors: same copies and exits as `check`.
- `--duration` must match `/^\d+[dwmy]$/`; `0` (never) is rejected — stderr `Error: --duration must be <n>d, <n>w, <n>m, or <n>y; got "<value>"`, exit 1, runner never called.
- Passphrase: `this.passphrase ?? await readPassphrase(process.stdin)`.
- Calls, in order: `listKeys` (before), `setExpiry(primaryFpr, duration, undefined, { runner, passphrase })`, `setExpiry(primaryFpr, duration, subkeyFpr, { runner, passphrase })`, `listKeys` (after).
- Output, stdout, exit 0:

```text
primary <primaryFpr> expires <date> (was <date|never>)
signing subkey <subFpr> expires <date> (was <date|never>)
Next: ghb secrets sync --env-file <env-file> --repo <owner/repo>  # push the renewed key to CI
Next: back up the key to Bitwarden
```

- A gpg failure mid-renew: stderr `Error: <message>`, exit 1.

- [x] **Step 1: Write the failing tests**

A sequence fake runner (queue of responses, records every call). Happy path: responses `[colonBefore, "", "", colonAfter]` where the after-fixture's expiries are the before's plus the duration; assert exit 0; call 1 argv is `--quick-set-expire <primaryFpr> 1y` with the loopback prefix and `input` = passphrase; call 2 appends the subkey fingerprint; call 3 is the second list; stdout contains `expires <after-date> (was <before-date>)` for both lines and both `Next:` lines. Error cases per the behavior list, each asserting the runner saw no calls when validation fails. Integration: generate 1y, `command.passphrase = PASS`, renew `--duration 2y`, then `listKeys` shows both expiries ≈ 2 years out.

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/ghb-signing`
Expected: FAIL.

- [x] **Step 3: Implement `renew.ts`**

As pinned. Print the before/after from the two listings — never assume the set-expire worked.

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/ghb-signing && pnpm --filter @xenoterracide/ghb-signing typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/ghb-signing
git commit -m "feat: add ghb signing renew" \
  -m "- extend the primary and the signing subkey with one command, then
  print both before/after expiries and the next steps
- the passphrase arrives on stdin or through pinentry, never argv" \
  -m "Assisted-by: GLM:glm-5.3"
```

### Task 5: `ghb signing export`

**Files:**

- Create: `packages/ghb-signing/src/commands/export.ts`
- Modify: `packages/ghb-signing/src/cli.ts`, `packages/ghb-signing/src/index.ts`
- Test: `packages/ghb-signing/test/commands/export.test.ts`

**Interfaces:**

- Consumes: Tasks 1–2; same selection rules as `check` (a sign subkey is not required — export ships the whole key).
- Produces: `export class ExportCommand extends Command`, `static paths = [["signing", "export"]]`, `key = Option.String("--key,-k", …)`, `runner?: CommandRunner`, `passphrase?: string`.

Behavior: select the primary key (same messages and exits), passphrase as in `renew`, then `exportSecretKey(primaryFpr, { runner, passphrase })`; write the armor to stdout plus a trailing newline and nothing else — the output is pipe-clean. A gpg failure: stderr `Error: <message>`, exit 1. `printf '%s' "$PASS" | ghb signing export > key.asc` is the intended use; the command never writes a file itself.

- [x] **Step 1: Write the failing tests**

Fake runner: returns `-----BEGIN PGP PRIVATE KEY BLOCK-----\n…armor…` for the export argv. Cases: piped export (argv with loopback prefix, `input` = passphrase, exit 0, stdout is exactly armor + `\n`); short `--key` → exit 1, runner never called; ambiguous keys → exit 2; runner throws → exit 1, stderr has `Error:`. Integration: generate a key, export with the passphrase, import into a fresh home, `listKeys` shows it.

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/ghb-signing`
Expected: FAIL.

- [x] **Step 3: Implement `export.ts`**

As pinned.

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/ghb-signing && pnpm --filter @xenoterracide/ghb-signing typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/ghb-signing
git commit -m "feat: add ghb signing export" \
  -m "- armored secret key to stdout only; never to a file
- passphrase on stdin when piped, pinentry on a tty" \
  -m "Assisted-by: GLM:glm-5.3"
```

### Task 6: `gpg:` resolver in `ghb secrets`

**Files:**

- Modify: `packages/ghb-secrets-sync/package.json` (dependency `"@xenoterracide/ghb-signing": "workspace:^"`, then `pnpm install --reporter=silent`)
- Modify: `packages/ghb-secrets-sync/src/types.ts`, `src/env.ts`, `src/commands/sync.ts`, `src/commands/get.ts`, `src/index.ts`
- Test: `packages/ghb-secrets-sync/test/env.test.ts`, `test/commands/sync.test.ts`, `test/commands/get.test.ts` (additions)

**Interfaces:**

- Consumes: `exportSecretKey`, `readPassphrase`, `isValidFingerprint` from `@xenoterracide/ghb-signing`.
- Produces:

```ts
// types.ts
export interface EnvEntry {
  type: "value" | "env" | "file" | "gpg";
  value: string;
}

// env.ts
export interface ResolveOpts {
  runner?: CommandRunner;
  passphrase?: string;
}
export function resolveSecretValue(
  name: string,
  envFileEntries?: Record<string, EnvEntry>,
  explicitValue?: string,
  opts?: ResolveOpts,
): string | undefined;
```

- `parseValue` case `gpg`: `isValidFingerprint(rest)` or `throw new UserError` — `` `gpg: value must be a full fingerprint; got "${rest}" for key "${key}"` `` — else `{ type: "gpg", value: rest }`. The unknown-protocol message becomes `Use env:, file:, val:, or gpg:` (the existing test's substring still passes).
- `resolveSecretValue` case `gpg`: `exportSecretKey(entry.value, { runner: opts?.runner, passphrase: opts?.passphrase })`; on throw, `logger.warn` — `` `Warning: Could not export GPG key for secret "${name}": ${msg}` `` — and return `undefined`, the same skip semantics as a missing env var or file.
- `sync.ts` and `get.ts`: `public passphrase?: string`; before resolving, `needsPassphrase` is any entry with `type === "gpg"`; `const passphrase = this.passphrase ?? (needsPassphrase ? await readPassphrase(process.stdin) : undefined)`; every `resolveSecretValue` call passes `{ runner: this.runner, passphrase }`. `GetCommand`'s sync `get()` becomes async.

- [x] **Step 1: Write the failing tests**

`env.test.ts`: `GPG_SIGNING_KEY=gpg:E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853` parses to `{ type: "gpg", value: … }`; `gpg:8042ED9A` throws `must be a full fingerprint`; the unknown-protocol message contains `gpg:`. `resolveSecretValue` with a recording fake runner: returns the runner's armor, argv is the piped export shape, `input` is `opts.passphrase`; when the runner throws, `console.warn` is spied (as the existing permissive-permissions test does) and the result is `undefined`.

`sync.test.ts`: env file with one `gpg:` entry and one `val:` entry, `cmd.passphrase = "pass"`, fake runner answering the `gpg … export-secret-keys <fpr>` argv with armor and `gh secret set …` with `""` → exit 0, and the recorded gpg call received `input: "pass"`. A second case: the gpg call throws → the run still exits 0 and the gpg secret is reported skipped, the `val:` secret still set.

`get.test.ts`: `gpg:` entry + fake runner + `cmd.passphrase` → exit 0, stdout is the armor.

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/ghb-secrets-sync`
Expected: the new cases fail; existing cases still pass.

- [x] **Step 3: Implement the resolver and wiring**

As pinned. `env.ts` imports from `@xenoterracide/ghb-signing`; the two packages' `CommandRunner` interfaces are structurally identical, so `opts.runner` passes straight through.

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/ghb-secrets-sync && pnpm --filter @xenoterracide/ghb-secrets-sync typecheck`
Expected: PASS, including every pre-existing case.

- [x] **Step 5: Commit**

```bash
git add packages/ghb-secrets-sync pnpm-lock.yaml
git commit -m "feat: resolve gpg: entries from the keyring at sync time" \
  -m "- gpg:<fpr> exports the armored secret key during sync, so CI holds
  the current key and the flatfile copy is unnecessary
- full fingerprints only; failures skip the secret with a warning like
  env: and file:" \
  -m "Assisted-by: GLM:glm-5.3"
```

### Task 7: Compose into `ghb`

**Files:**

- Modify: `packages/ghb/package.json` (dependency `"@xenoterracide/ghb-signing": "workspace:^"`, then `pnpm install --reporter=silent`)
- Modify: `packages/ghb/src/cli.ts`, `packages/ghb/test/cli.test.ts`, `packages/ghb/test/cli-bin.test.ts`
- Modify: `package.json` (root; script `"signing": "pnpm --filter @xenoterracide/ghb run ghb signing"`)

**Interfaces:**

- Consumes: `CheckCommand`, `RenewCommand`, `ExportCommand` from `@xenoterracide/ghb-signing`.
- Produces: the shipped `ghb signing …` surface.

- [x] **Step 1: Write the failing tests**

`cli.test.ts`: registered paths gain `ghb signing check`, `ghb signing renew`, `ghb signing export`; the count assertion becomes 8; the no-args help output contains all three. `cli-bin.test.ts`: the pack list gains `"ghb-signing"`; new cases:

```ts
it("binds signing check's --key instead of rejecting it", () => {
  const output = runExpectingFailure(bin, ["signing", "check", "--key", "8042ED9A"]);
  expect(output).toContain("must be a full fingerprint");
  expect(output).not.toContain("Unknown Syntax Error");
});

it("exports the armored key from a piped passphrase", () => {
  // generateSigningKey into a temp home (copy the helper or inline it);
  // run the bin with input PASS and env GNUPGHOME via execFileSync opts
  const output = runWithInput(bin, ["signing", "export"], { input: PASS, env: { …GNUPGHOME: home } });
  expect(output).toContain("BEGIN PGP PRIVATE KEY BLOCK");
});
```

`runWithInput` is a local helper: `execFileSync` with `input` and `env` — the file's existing `run` does not pass them.

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/ghb`
Expected: the new cases fail — the commands are not registered.

- [x] **Step 3: Wire the aggregator**

`cli.ts`: import and register the three commands after the secrets commands. Root `package.json` gains the `signing` script.

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/ghb && pnpm --filter @xenoterracide/ghb typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/ghb package.json pnpm-lock.yaml
git commit -m "feat: compose signing commands into ghb" \
  -m "the packed bin test now packs ghb-signing and proves a piped
passphrase reaches export through the real binary" \
  -m "Assisted-by: GLM:glm-5.3"
```

### Task 8: Documentation

**Files:**

- Create: `packages/ghb-signing/README.md`
- Modify: `README.md`, `AGENTS.md`, `CONTRIBUTING.md`
- Modify: `docs/superpowers/specs/2026-11-12-ghb-signing-design.md` (status `proposed` → `implemented`)

- [x] **Step 1: Write the docs**

`packages/ghb-signing/README.md`: the three commands with usage, exit codes, the stdin passphrase contract (`printf '%s' "$PASS" | ghb signing export > key.asc`), the `--key` full-fingerprint rule, `GNUPGHOME` respect, one line placing `ghb signing check` first in a release workflow, and one line scoping the key to the publishing repo — no topic fan-out. Root `README.md`: the usage block gains the three commands in the existing comment style, the secrets examples gain a `gpg:<fpr>` line and a note that `val:`/`file:` are deprecated for secret values, and the package README list gains `ghb-signing`. `AGENTS.md` and `CONTRIBUTING.md`: add the package to their lists with one line each.

- [x] **Step 2: Run the full gate**

Run: `pnpm check`
Expected: prettier, eslint, typecheck, and the whole suite with coverage all green.

- [x] **Step 3: Commit**

```bash
git add README.md AGENTS.md CONTRIBUTING.md docs/superpowers packages/ghb-signing/README.md
git commit -m "docs: document ghb signing" \
  -m "- package README with usage, exit codes, and the passphrase contract
- root README, AGENTS, and CONTRIBUTING list the new package" \
  -m "Assisted-by: GLM:glm-5.3"
```
