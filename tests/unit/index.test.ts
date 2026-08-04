import { describe, expect, it } from "vitest";
import { parseBoolean, parseReturnMode } from "../../src/index.js";

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
