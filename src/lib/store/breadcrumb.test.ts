import { useBreadcrumbStore } from "./breadcrumb";

describe("useBreadcrumbStore", () => {
	beforeEach(() => {
		// Reset store state before each test
		useBreadcrumbStore.setState({
			project: null,
			agent: null,
			environment: null,
			secretMenu: null,
			commitHash: "",
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
		const mockProject = { project_id: "proj-123", name: "Test Project" };

		useBreadcrumbStore.getState().setProject(mockProject);

		const store = useBreadcrumbStore.getState();
		expect(store.project).toEqual(mockProject);
	});

	it("should set agent", () => {
		const mockAgent = { agent_id: "agent-123", name: "Test Agent" };

		useBreadcrumbStore.getState().setAgent(mockAgent);

		const store = useBreadcrumbStore.getState();
		expect(store.agent).toEqual(mockAgent);
	});

	it("should set environment", () => {
		const mockEnvironment = {
			environment_id: "env-123",
			name: "Test Environment",
		};

		useBreadcrumbStore.getState().setEnvironment(mockEnvironment);

		const store = useBreadcrumbStore.getState();
		expect(store.environment).toEqual(mockEnvironment);
	});

	it("should set secret menu", () => {
		const mockSecretMenu = { menu_id: "menu-123" };

		useBreadcrumbStore.getState().setSecretMenu(mockSecretMenu);

		const store = useBreadcrumbStore.getState();
		expect(store.secretMenu).toEqual(mockSecretMenu);
	});

	it("should set commit hash", () => {
		const mockCommitHash = "abc123def456";

		useBreadcrumbStore.getState().setCommitHash(mockCommitHash);

		const store = useBreadcrumbStore.getState();
		expect(store.commitHash).toBe(mockCommitHash);
	});

	it("should clear all values except commit hash", () => {
		const store = useBreadcrumbStore.getState();
		store.setProject({ project_id: "proj-123" });
		store.setAgent({ agent_id: "agent-123" });
		store.setEnvironment({ environment_id: "env-123" });
		store.setSecretMenu({ menu_id: "menu-123" });
		store.setCommitHash("abc123");

		store.clearAll();

		const updatedStore = useBreadcrumbStore.getState();
		expect(updatedStore.project).toBeNull();
		expect(updatedStore.agent).toBeNull();
		expect(updatedStore.environment).toBeNull();
		expect(updatedStore.secretMenu).toBeNull();
		expect(updatedStore.commitHash).toBe("abc123"); // commitHash is not cleared by clearAll
	});

	it("should reset to initial state", () => {
		const store = useBreadcrumbStore.getState();
		store.setProject({ project_id: "proj-123" });
		store.setAgent({ agent_id: "agent-123" });
		store.setEnvironment({ environment_id: "env-123" });
		store.setSecretMenu({ menu_id: "menu-123" });
		store.setCommitHash("abc123");

		store.reset();

		const updatedStore = useBreadcrumbStore.getState();
		expect(updatedStore.project).toBeNull();
		expect(updatedStore.agent).toBeNull();
		expect(updatedStore.environment).toBeNull();
		expect(updatedStore.secretMenu).toBeNull();
		expect(updatedStore.commitHash).toBe("");
	});

	it("should handle setting null values", () => {
		const store = useBreadcrumbStore.getState();
		store.setProject({ project_id: "proj-123" });
		store.setProject(null);

		expect(store.project).toBeNull();
	});

	it("should preserve store state across multiple getState calls", () => {
		useBreadcrumbStore.getState().setProject({ project_id: "persistent-proj" });

		const store2 = useBreadcrumbStore.getState();
		expect(store2.project).toEqual({ project_id: "persistent-proj" });
	});

	it("should handle rapid successive updates", () => {
		const store = useBreadcrumbStore.getState();

		for (let i = 0; i < 10; i++) {
			store.setCommitHash(`commit-${i}`);
		}

		const finalStore = useBreadcrumbStore.getState();
		expect(finalStore.commitHash).toBe("commit-9");
	});

	it("should update only the specified field", () => {
		const mockProject = { project_id: "proj-123" };
		const mockAgent = { agent_id: "agent-123" };

		useBreadcrumbStore.getState().setProject(mockProject);
		useBreadcrumbStore.getState().setAgent(mockAgent);

		const store = useBreadcrumbStore.getState();
		expect(store.project).toEqual(mockProject);
		expect(store.agent).toEqual(mockAgent);

		useBreadcrumbStore.getState().setProject({ project_id: "proj-456" });

		const updatedStore = useBreadcrumbStore.getState();
		expect(updatedStore.project).toEqual({ project_id: "proj-456" });
		expect(updatedStore.agent).toEqual(mockAgent); // Should remain unchanged
	});
});
