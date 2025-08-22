import "@testing-library/jest-dom";

// Mock nanoid before any imports
jest.mock("nanoid", () => ({
	nanoid: jest.fn(() => `test-id-${Math.random().toString(36).substr(2, 9)}`),
}));

// Mock Clerk modules before any imports
jest.mock("@clerk/nextjs/server", () => ({
	auth: jest.fn(() => Promise.resolve({ userId: null })),
}));

jest.mock("@clerk/nextjs", () => ({
	useUser: jest.fn(() => ({ isLoaded: true, user: null })),
	useAuth: jest.fn(() => ({ isLoaded: true, userId: null })),
	useClerk: jest.fn(() => ({})),
	ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock next/navigation
jest.mock("next/navigation", () => ({
	useRouter: () => ({
		push: jest.fn(),
		replace: jest.fn(),
		back: jest.fn(),
		forward: jest.fn(),
		refresh: jest.fn(),
		prefetch: jest.fn(),
	}),
	usePathname: () => "/",
	useSearchParams: () => new URLSearchParams(),
}));

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
	observe: jest.fn(),
	unobserve: jest.fn(),
	disconnect: jest.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: jest.fn().mockImplementation((query) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: jest.fn(),
		removeListener: jest.fn(),
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
		dispatchEvent: jest.fn(),
	})),
});

// Mock fetch
global.fetch = jest.fn();

// Mock Next.js Request/Response
class MockHeaders {
	private headers: Map<string, string>;

	constructor(init?: HeadersInit) {
		this.headers = new Map();
		if (init) {
			if (init instanceof Headers) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(init as any).forEach((value: string, key: string) => {
					this.headers.set(key.toLowerCase(), value);
				});
			} else if (Array.isArray(init)) {
				init.forEach(([key, value]) => {
					this.headers.set(key.toLowerCase(), value);
				});
			} else {
				Object.entries(init).forEach(([key, value]) => {
					this.headers.set(key.toLowerCase(), value);
				});
			}
		}
	}

	get(name: string) {
		return this.headers.get(name.toLowerCase()) || null;
	}

	set(name: string, value: string) {
		this.headers.set(name.toLowerCase(), value);
	}

	has(name: string) {
		return this.headers.has(name.toLowerCase());
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	forEach(callbackfn: (value: string, key: string, parent: any) => void) {
		// biome-ignore lint/suspicious/useIterableCallbackReturn: This is a custom implementation
		this.headers.forEach((value, key) => callbackfn(value, key, this));
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.Headers = MockHeaders as any;

global.Request = jest.fn().mockImplementation((url, options = {}) => ({
	url,
	method: options.method || "GET",
	headers: new MockHeaders(options.headers),
	body: options.body,
	json: async () => JSON.parse(options.body || "{}"),
	text: async () => options.body || "",
	clone: function () {
		return this;
	},
	...options,
}));

// Mock Response.json static method
const MockResponse = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	json: (data: any, init?: ResponseInit) => {
		const body = JSON.stringify(data);
		return new Response(body, {
			...init,
			headers: {
				"content-type": "application/json",
				...(init?.headers || {}),
			},
		});
	},
};

// Mock global Response constructor
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).Response = jest
	.fn()
	.mockImplementation((body?: BodyInit | null, init?: ResponseInit) => {
		const status = init?.status || 200;
		const headers = new MockHeaders(init?.headers);

		// Set content-type if not provided
		if (!headers.has("content-type") && body) {
			headers.set("content-type", "text/plain");
		}

		return {
			status,
			statusText: init?.statusText || "OK",
			headers,
			body,
			json: async () => {
				if (typeof body === "string") {
					return JSON.parse(body);
				}
				return {};
			},
			text: async () => {
				if (typeof body === "string") {
					return body;
				}
				return "";
			},
			ok: status >= 200 && status < 300,
			redirected: false,
			type: "basic" as ResponseType,
			url: "",
			clone: function () {
				return this;
			},
			arrayBuffer: async () => new ArrayBuffer(0),
			blob: async () => new Blob(),
			formData: async () => new FormData(),
			bodyUsed: false,
		};
	});

// Add the static json method to Response
Object.assign(global.Response, MockResponse);

// Mock NextResponse specifically
jest.mock("next/server", () => {
	const actual = jest.requireActual("next/server");
	return {
		...actual,
		NextResponse: {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			json: (data: any, init?: ResponseInit) => {
				const body = JSON.stringify(data);
				return new Response(body, {
					...init,
					headers: {
						"content-type": "application/json",
						...(init?.headers || {}),
					},
				});
			},
		},
		NextRequest: jest.fn().mockImplementation((url, options = {}) => ({
			url: typeof url === "string" ? url : url.toString(),
			method: options.method || "GET",
			headers: new MockHeaders(options.headers),
			body: options.body,
			json: async () => JSON.parse(options.body || "{}"),
			text: async () => options.body || "",
			nextUrl: typeof url === "string" ? new URL(url) : url,
			cookies: {
				get: jest.fn(),
				set: jest.fn(),
				delete: jest.fn(),
			},
			geo: {},
			ip: undefined,
			clone: function () {
				return this;
			},
			...options,
		})),
	};
});

// Silence console warnings in tests
const originalConsoleWarn = console.warn;
beforeAll(() => {
	console.warn = jest.fn();
});

afterAll(() => {
	console.warn = originalConsoleWarn;
});
