export type InitializeContainersFunction = () => Promise<void>;
export type CompileInContainerFunction = (
	languageId: number,
	code: string,
) => Promise<{ containerId: string; compileStatus: string; compilationError?: string }>;
export type ExecuteCompiledCode = (
	id: string,
	languageId: number,
	containerId: string,
	inputs: string[],
	tasks: {
		id: number;
		stdin: string;
		inputs?: string | undefined;
		expectedOutput?: string | undefined;
	}[],
) => Promise<{ allTasksAccepted: boolean; executionStatus: string }>;
export type BatchTaskQueueProcessorFunction = () => Promise<void>;
