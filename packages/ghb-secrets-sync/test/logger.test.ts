// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, setLogLevel } from "../src/logger.js";

// eslint-disable-next-line no-control-regex -- stripping the ANSI codes is the point
const stripAnsi = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, "");

afterEach(() => {
  vi.restoreAllMocks();
  setLogLevel("info");
});

describe("logger", () => {
  it("prints info with, without, and with empty fields", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logger.info("plain");
    logger.info("with fields", { key: "value" });
    logger.info("empty fields", {});

    const printed = stripAnsi(log.mock.calls.map((call) => call.join(" ")).join("\n"));
    expect(printed).toContain("INFO: plain");
    expect(printed).toContain('key="value"');
    expect(printed).toContain("INFO: empty fields");
    expect(printed).not.toContain("empty fields (");
  });
});

describe("logger", () => {
  it("prints debug only at debug level", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logger.debug({ file: "x" }, "hidden");
    expect(log).not.toHaveBeenCalled();

    setLogLevel("debug");
    logger.debug({ file: "x" }, "shown");
    expect(stripAnsi(log.mock.calls.map((call) => call.join(" ")).join(" "))).toContain("DEBUG: shown");
  });

  it("warns and errors through the right streams", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logger.warn("careful");
    logger.error("broken");

    expect(stripAnsi(warn.mock.calls.map((call) => call.join(" ")).join(" "))).toContain("WARN: careful");
    expect(stripAnsi(error.mock.calls.map((call) => call.join(" ")).join(" "))).toContain("ERROR: broken");
  });
});
