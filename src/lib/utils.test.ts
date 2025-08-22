import { cn } from "./utils";

describe("cn utility", () => {
	it("should merge class names correctly", () => {
		const result = cn("base-class", "additional-class");
		expect(result).toBe("base-class additional-class");
	});

	it("should handle conditional class names", () => {
		const condition = true;
		const result = cn("base-class", condition && "conditional-class");
		expect(result).toBe("base-class conditional-class");
	});

	it("should filter out falsy values", () => {
		const result = cn("base-class", false, null, undefined, "", "valid-class");
		expect(result).toBe("base-class valid-class");
	});

	it("should merge Tailwind classes correctly", () => {
		// tailwind-merge should handle conflicting classes
		const result = cn("px-2 py-1", "px-3");
		expect(result).toBe("py-1 px-3");
	});

	it("should handle arrays of classes", () => {
		const result = cn(["base-class", "array-class"], "additional-class");
		expect(result).toBe("base-class array-class additional-class");
	});

	it("should handle objects with boolean values", () => {
		const result = cn("base-class", {
			"active-class": true,
			"inactive-class": false,
			"another-active": true,
		});
		expect(result).toBe("base-class active-class another-active");
	});

	it("should handle empty input", () => {
		const result = cn();
		expect(result).toBe("");
	});

	it("should handle only falsy values", () => {
		const result = cn(false, null, undefined, "");
		expect(result).toBe("");
	});

	it("should preserve important Tailwind modifiers", () => {
		const result = cn("!px-2", "px-3");
		expect(result).toBe("!px-2");
	});

	it("should handle responsive Tailwind classes", () => {
		const result = cn("sm:px-2 md:px-4", "lg:px-6");
		expect(result).toBe("sm:px-2 md:px-4 lg:px-6");
	});

	it("should handle dark mode classes", () => {
		const result = cn("text-black dark:text-white", "bg-white dark:bg-black");
		expect(result).toBe("text-black dark:text-white bg-white dark:bg-black");
	});

	it("should handle complex nested arrays and objects", () => {
		const result = cn(
			"base",
			["array1", "array2"],
			{
				"object-true": true,
				"object-false": false,
			},
			[
				"nested-array",
				{
					"nested-object": true,
				},
			],
		);
		expect(result).toBe(
			"base array1 array2 object-true nested-array nested-object",
		);
	});

	it("should handle conflicting color classes", () => {
		const result = cn("text-red-500", "text-blue-500");
		expect(result).toBe("text-blue-500");
	});

	it("should handle conflicting size classes", () => {
		const result = cn("text-sm", "text-lg");
		expect(result).toBe("text-lg");
	});

	it("should preserve non-conflicting utility classes", () => {
		const result = cn("font-bold text-red-500", "text-blue-500 italic");
		expect(result).toBe("font-bold text-blue-500 italic");
	});

	it("should handle hover and focus states", () => {
		const result = cn(
			"hover:bg-red-500 focus:outline-none",
			"hover:bg-blue-500 focus:ring-2",
		);
		expect(result).toBe("focus:outline-none hover:bg-blue-500 focus:ring-2");
	});

	it("should handle arbitrary values in Tailwind", () => {
		const result = cn("w-[100px]", "w-[200px]");
		expect(result).toBe("w-[200px]");
	});

	it("should handle animation classes", () => {
		const result = cn("animate-spin", "animate-pulse");
		expect(result).toBe("animate-pulse");
	});

	it("should preserve transform classes", () => {
		const result = cn("translate-x-2 rotate-45", "scale-110");
		expect(result).toBe("translate-x-2 rotate-45 scale-110");
	});
});
