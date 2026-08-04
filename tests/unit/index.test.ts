import { describe, expect, it } from "vitest";
import {
    parseBoolean,
    parseCliOpenMode,
    parseOpenMode,
    parseReturnMode
} from "../../src/index.js";

describe("parseBoolean", () => {
    describe("returns default when value is undefined or empty", () => {
        it("returns default true when undefined", () => {
            expect(parseBoolean(undefined, true)).toBe(true);
        });

        it("returns default false when undefined", () => {
            expect(parseBoolean(undefined, false)).toBe(false);
        });

        it("returns default when empty string", () => {
            expect(parseBoolean("", true)).toBe(true);
            expect(parseBoolean("", false)).toBe(false);
        });
    });

    describe("returns boolean value directly", () => {
        it("returns true", () => {
            expect(parseBoolean(true, false)).toBe(true);
        });

        it("returns false", () => {
            expect(parseBoolean(false, true)).toBe(false);
        });
    });

    describe("parses truthy string values", () => {
        it.each(["1", "true", "yes", "on"])("parses '%s' as true", (val) => {
            expect(parseBoolean(val, false)).toBe(true);
        });

        it.each(["TRUE", "True", "YES", "ON"])(
            "parses '%s' (case-insensitive) as true",
            (val) => {
                expect(parseBoolean(val, false)).toBe(true);
            }
        );
    });

    describe("parses falsy string values", () => {
        it.each(["0", "false", "no", "off"])("parses '%s' as false", (val) => {
            expect(parseBoolean(val, true)).toBe(false);
        });

        it.each(["FALSE", "False", "NO", "OFF"])(
            "parses '%s' (case-insensitive) as false",
            (val) => {
                expect(parseBoolean(val, true)).toBe(false);
            }
        );
    });

    describe("returns default for unknown values", () => {
        it("returns default true for random string", () => {
            expect(parseBoolean("maybe", true)).toBe(true);
        });

        it("returns default false for random string", () => {
            expect(parseBoolean("unknown", false)).toBe(false);
        });
    });

    describe("handles whitespace in string values", () => {
        it("trims whitespace", () => {
            expect(parseBoolean(" true ", false)).toBe(true);
            expect(parseBoolean(" false ", true)).toBe(false);
        });
    });
});

describe("parseReturnMode", () => {
    it('returns "path" for undefined', () => {
        expect(parseReturnMode(undefined)).toBe("path");
    });

    it('returns "path" for valid input', () => {
        expect(parseReturnMode("path")).toBe("path");
    });

    it('returns "content" for valid input', () => {
        expect(parseReturnMode("content")).toBe("content");
    });

    it('returns "both" for valid input', () => {
        expect(parseReturnMode("both")).toBe("both");
    });

    it('returns "path" as default for invalid input', () => {
        expect(parseReturnMode("invalid")).toBe("path");
    });

    it('returns "path" as default for empty string', () => {
        expect(parseReturnMode("")).toBe("path");
    });
});

describe("parseOpenMode", () => {
    describe("returns default when value is undefined or empty", () => {
        it('returns default "always" when undefined', () => {
            expect(parseOpenMode(undefined, "always")).toBe("always");
        });

        it('returns default "never" when undefined', () => {
            expect(parseOpenMode(undefined, "never")).toBe("never");
        });

        it("returns default when empty string", () => {
            expect(parseOpenMode("", "agent")).toBe("agent");
        });
    });

    describe('parses "always"', () => {
        it('parses "always" as "always"', () => {
            expect(parseOpenMode("always", "never")).toBe("always");
        });

        it('parses "ALWAYS" (case-insensitive) as "always"', () => {
            expect(parseOpenMode("ALWAYS", "never")).toBe("always");
        });
    });

    describe('parses "never"', () => {
        it('parses "never" as "never"', () => {
            expect(parseOpenMode("never", "always")).toBe("never");
        });

        it('parses "NEVER" (case-insensitive) as "never"', () => {
            expect(parseOpenMode("NEVER", "always")).toBe("never");
        });
    });

    describe('parses "agent"', () => {
        it('parses "agent" as "agent"', () => {
            expect(parseOpenMode("agent", "never")).toBe("agent");
        });

        it('parses "AGENT" (case-insensitive) as "agent"', () => {
            expect(parseOpenMode("AGENT", "never")).toBe("agent");
        });
    });

    describe("returns default for unknown values", () => {
        it('returns default "always" for random string', () => {
            expect(parseOpenMode("maybe", "always")).toBe("always");
        });

        it('returns default "never" for random string', () => {
            expect(parseOpenMode("unknown", "never")).toBe("never");
        });

        it('returns default for legacy "true" (no backward compat)', () => {
            expect(parseOpenMode("true", "never")).toBe("never");
        });

        it('returns default for legacy "false" (no backward compat)', () => {
            expect(parseOpenMode("false", "always")).toBe("always");
        });
    });

    describe("handles whitespace in string values", () => {
        it("trims whitespace", () => {
            expect(parseOpenMode(" always ", "never")).toBe("always");
            expect(parseOpenMode(" never ", "always")).toBe("never");
            expect(parseOpenMode(" agent ", "never")).toBe("agent");
        });
    });
});

describe("parseCliOpenMode", () => {
    it.each(["always", "never", "agent"] as const)("accepts '%s'", (mode) => {
        expect(parseCliOpenMode(mode)).toBe(mode);
    });

    it("accepts case-insensitive and trimmed values", () => {
        expect(parseCliOpenMode(" ALWAYS ")).toBe("always");
        expect(parseCliOpenMode("Never")).toBe("never");
        expect(parseCliOpenMode("AGENT")).toBe("agent");
    });

    it('defaults bare --open (empty / boolean / undefined) to "always"', () => {
        expect(parseCliOpenMode(undefined)).toBe("always");
        expect(parseCliOpenMode("")).toBe("always");
        expect(parseCliOpenMode(true)).toBe("always");
        expect(parseCliOpenMode(false)).toBe("always");
    });

    it("rejects invalid strings", () => {
        expect(parseCliOpenMode("maybe")).toBeUndefined();
        expect(parseCliOpenMode("true")).toBeUndefined();
        expect(parseCliOpenMode("1")).toBeUndefined();
    });
});
