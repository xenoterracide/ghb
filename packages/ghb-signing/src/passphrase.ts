// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

export async function readAll(input: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    input.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"));
    });
    input.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    input.on("error", (err: Error) => {
      reject(err);
    });
  });
}

export async function readPassphrase(stream: NodeJS.ReadableStream & { isTTY?: boolean }): Promise<string | undefined> {
  if (stream.isTTY === true) return undefined;
  return readAll(stream);
}
