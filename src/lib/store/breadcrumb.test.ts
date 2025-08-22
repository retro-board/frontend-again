import { act } from "@testing-library/react";
import { useBreadcrumbStore } from "./breadcrumb";

describe("useBreadcrumbStore", () => {
	beforeEach(() => {
		// Reset store state before each test
		const store = useBreadcrumbStore.getState();
		act(() => {
			store.reset();
		});
	});

	it("should initialize with null values", () => {
		const store = useBreadcrumbStore.getState();
		expect(store.project).toBeNull();
		expect(store.agent).toBeNull();
		expect(store.environment).toBeNull();
		expect(store.secretMenu).toBeNull();
		expect(store.commitHash).toBe("");
	});

	it("should set project", () => {
		const store = useBreadcrumbStore.getState();
		const mockProject = { project_id: "proj-123", name: "Test Project" };

		act(() => {
			store.setProject(mockProject);
		});

		expect(store.project).toEqual(mockProject);
	});

	it("should set agent", () => {
		const store = useBreadcrumbStore.getState();
		const mockAgent = { agent_id: "agent-123", name: "Test Agent" };

		act(() => {
			store.setAgent(mockAgent);
		});

		expect(store.agent).toEqual(mockAgent);
	});

	it("should set environment", () => {
		const store = useBreadcrumbStore.getState();
		const mockEnvironment = {
			environment_id: "env-123",
			name: "Test Environment",
		};

		act(() => {
			store.setEnvironment(mockEnvironment);
		});

		expect(store.environment).toEqual(mockEnvironment);
	});

	it("should set secret menu", () => {
		const store = useBreadcrumbStore.getState();
		const mockSecretMenu = { menu_id: "menu-123" };

		act(() => {
			store.setSecretMenu(mockSecretMenu);
		});

		expect(store.secretMenu).toEqual(mockSecretMenu);
	});

	it("should set commit hash", () => {
		const store = useBreadcrumbStore.getState();
		const mockCommitHash = "abc123def456";

		act(() => {
			store.setCommitHash(mockCommitHash);
		});

		expect(store.commitHash).toBe(mockCommitHash);
	});

	it("should clear all values except commit hash", () => {
		const store = useBreadcrumbStore.getState();

		act(() => {
			store.setProject({ project_id: "proj-123" });
			store.setAgent({ agent_id: "agent-123" });
			store.setEnvironment({ environment_id: "env-123" });
			store.setSecretMenu({ menu_id: "menu-123" });
			store.setCommitHash("abc123");
			store.clearAll();
		});

		expect(store.project).toBeNull();
		expect(store.agent).toBeNull();
		expect(store.environment).toBeNull();
		expect(store.secretMenu).toBeNull();
		expect(store.commitHash).toBe("abc123"); // commitHash is not cleared by clearAll
	});

	it("should reset to initial state", () => {
		const store = useBreadcrumbStore.getState();

		act(() => {
			store.setProject({ project_id: "proj-123" });
			store.setAgent({ agent_id: "agent-123" });
			store.setEnvironment({ environment_id: "env-123" });
			store.setSecretMenu({ menu_id: "menu-123" });
			store.setCommitHash("abc123");
			store.reset();
		});

		expect(store.project).toBeNull();
		expect(store.agent).toBeNull();
		expect(store.environment).toBeNull();
		expect(store.secretMenu).toBeNull();
		expect(store.commitHash).toBe("");
	});

	it("should handle setting null values", () => {
		const store = useBreadcrumbStore.getState();

		act(() => {
			store.setProject({ project_id: "proj-123" });
			store.setProject(null);
		});

		expect(store.project).toBeNull();
	});

	it("should preserve store state across multiple getState calls", () => {
		const store1 = useBreadcrumbStore.getState();

		act(() => {
			store1.setProject({ project_id: "persistent-proj" });
		});

		const store2 = useBreadcrumbStore.getState();
		expect(store2.project).toEqual({ project_id: "persistent-proj" });
	});

	it("should handle rapid successive updates", () => {
		const store = useBreadcrumbStore.getState();

		act(() => {
			for (let i = 0; i < 10; i++) {
				store.setCommitHash(`commit-${i}`);
			}
		});

		expect(store.commitHash).toBe("commit-9");
	});

	it("should update only the specified field", () => {
		const store = useBreadcrumbStore.getState();
		const mockProject = { project_id: "proj-123" };
		const mockAgent = { agent_id: "agent-123" };

		act(() => {
			store.setProject(mockProject);
			store.setAgent(mockAgent);
		});

		expect(store.project).toEqual(mockProject);
		expect(store.agent).toEqual(mockAgent);

		act(() => {
			store.setProject({ project_id: "proj-456" });
		});

		expect(store.project).toEqual({ project_id: "proj-456" });
		expect(store.agent).toEqual(mockAgent); // Should remain unchanged
	});
});
