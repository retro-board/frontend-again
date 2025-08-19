import { create } from "zustand";
import { devtools } from "zustand/middleware";

// Type definitions
interface Project {
	project_id: string;
	name?: string;
}

interface Agent {
	agent_id: string;
	name?: string;
}

interface Environment {
	environment_id: string;
	name?: string;
}

interface SecretMenu {
	menu_id: string;
}

// Store state interface
interface BreadcrumbState {
	// State
	project: Project | null;
	agent: Agent | null;
	environment: Environment | null;
	secretMenu: SecretMenu | null;
	commitHash: string;

	// Actions
	setProject: (project: Project | null) => void;
	setAgent: (agent: Agent | null) => void;
	setEnvironment: (environment: Environment | null) => void;
	setSecretMenu: (secretMenu: SecretMenu | null) => void;
	setCommitHash: (commitHash: string) => void;

	// Utility actions
	clearAll: () => void;
	reset: () => void;
}

// Initial state
const initialState = {
	project: null,
	agent: null,
	environment: null,
	secretMenu: null,
	commitHash: "",
};

// Create the store
export const useBreadcrumbStore = create<BreadcrumbState>()(
	devtools(
		(set) => ({
			// Initial state
			...initialState,

			// Actions
			setProject: (project) => set({ project }, false, "setProject"),

			setAgent: (agent) => set({ agent }, false, "setAgent"),

			setEnvironment: (environment) =>
				set({ environment }, false, "setEnvironment"),

			setSecretMenu: (secretMenu) =>
				set({ secretMenu }, false, "setSecretMenu"),

			setCommitHash: (commitHash) =>
				set({ commitHash }, false, "setCommitHash"),

			clearAll: () =>
				set(
					{
						project: null,
						agent: null,
						environment: null,
						secretMenu: null,
					},
					false,
					"clearAll",
				),

			reset: () => set(initialState, false, "reset"),
		}),
		{
			name: "breadcrumb-store", // Name for Redux DevTools
		},
	),
);

// Selector hooks for better performance (optional but recommended)
export const useProject = () => useBreadcrumbStore((state) => state.project);
export const useAgent = () => useBreadcrumbStore((state) => state.agent);
export const useEnvironment = () =>
	useBreadcrumbStore((state) => state.environment);
export const useSecretMenu = () =>
	useBreadcrumbStore((state) => state.secretMenu);
export const useCommitHash = () =>
	useBreadcrumbStore((state) => state.commitHash);

// Action selectors
export const useBreadcrumbActions = () =>
	useBreadcrumbStore((state) => ({
		setProject: state.setProject,
		setAgent: state.setAgent,
		setEnvironment: state.setEnvironment,
		setSecretMenu: state.setSecretMenu,
		setCommitHash: state.setCommitHash,
		clearAll: state.clearAll,
		reset: state.reset,
	}));
