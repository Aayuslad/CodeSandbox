import axios from "axios";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { redisClient } from "../database/redisClient";
import {
	BatchTaskQueueProcessorFunction,
	CompileInContainerFunction,
	ExecuteCompiledCode,
	InitializeContainersFunction,
} from "../types/controllerFunctionTypes";
import { BatchResult, BatchSubmissionSchema } from "../types/zodSchemas";

const containerPool: Record<number, string> = {
	1: "", // Python
	2: "", // C++
	3: "", // Java
	4: "", // C
};

const initializeContainers: InitializeContainersFunction = async () => {
	try {
		const containerConfigs = [
			{ id: 1, image: "python:3.9-alpine" },
			{ id: 2, image: "gcc:latest" },
			{ id: 3, image: "openjdk:11-slim" },
			{ id: 4, image: "gcc:latest" },
		];

		await Promise.all(
			containerConfigs.map(async (config) => {
				const { stdout } = await execPromise(`docker run -d ${config.image} tail -f /dev/null`);
				containerPool[config.id] = stdout.trim();
			}),
		);

		console.log("Containers initialized:", containerPool);
	} catch (error) {
		console.error("Error initializing containers:", error);
		throw error;
	}
};

const compileInContainer: CompileInContainerFunction = async (languageId, code) => {
	const containerId = containerPool[languageId];
	if (!containerId) throw new Error(`No container found for language ID ${languageId}`);

	const compileCommands: Record<number, string> = {
		1: `docker exec -i ${containerId} sh -c 'echo "${code}" | base64 -d > Solution.py && python -m py_compile Solution.py && mv Solution.py myapp'`,
		2: `docker exec -i ${containerId} sh -c 'echo "${code}" | base64 -d > Solution.cpp && g++ Solution.cpp -o myapp'`,
		3: `docker exec -i ${containerId} sh -c 'echo "${code}" | base64 -d > Solution.java && javac Solution.java'`,
		4: `docker exec -i ${containerId} sh -c 'echo "${code}" | base64 -d > Solution.c && gcc Solution.c -o myapp'`,
	};

	const compileCommand = compileCommands[languageId];
	if (!compileCommand) throw new Error(`No compile command defined for language ID ${languageId}`);

	try {
		const start = Date.now();
		await execPromise(compileCommand);
		const end = Date.now();
		console.log(`Compilation time: ${end - start}ms`);
		return { containerId, compileStatus: "compiled successfully" };
	} catch (error) {
		console.log("Error compiling code:", error);
		//@ts-ignore
		return { containerId: "", compileStatus: "compilation error", compilationError: extractError(error.stderr) };
	}
};

const executeCompiledCode: ExecuteCompiledCode = async (id, languageId, containerId, inputs, tasks) => {
	const executeCommands: Record<number, (input: string) => string> = {
		1: (input: string) => `echo "${input}" | base64 -d | docker exec -i ${containerId} python myapp`,
		2: (input: string) => `echo "${input}" | base64 -d | docker exec -i ${containerId} ./myapp`,
		3: (input: string) => `echo "${input}" | base64 -d | docker exec -i ${containerId} java Solution`,
		4: (input: string) => `echo "${input}" | base64 -d | docker exec -i ${containerId} ./myapp`,
	};

	const executeCommand = executeCommands[languageId];
	if (!executeCommand) {
		throw new Error(`No execute command defined for language ID ${languageId}`);
	}

	let allTasksAccepted = true;

	for (let index = 0; index < inputs.length; index++) {
		const input = inputs[index];
		const existingResult = await redisClient.get(`batchResult:${id}`);
		let batchResult: BatchResult = existingResult ? JSON.parse(existingResult) : { status: "executing", tasks: [] };

		try {
			const command = executeCommand(input);
			const start = Date.now();
			const { stdout, stderr } = await execWithTimeout(command, containerId, languageId);
			const end = Date.now();
			console.log("Execution time:", end - start + "ms");

			const taskResult = {
				id: tasks[index].id,
				status: stderr ? "error" : "success",
				output: stderr || stdout.trim(),
				accepted: !stderr && stdout.trim() === tasks[index].expectedOutput,
				inputs: tasks[index].inputs || "",
				expectedOutput: tasks[index].expectedOutput,
			};

			batchResult.tasks.push(taskResult);
			await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));

			if (!taskResult.accepted) {
				allTasksAccepted = false;
				break;
			}
		} catch (error) {
			console.error("Runtime error:", error);

			//@ts-ignore
			if (error.message == "time limit exceeded") {
				const taskResult = {
					id: tasks[index].id,
					status: "error",
					output: "",
					accepted: false,
					inputs: tasks[index].inputs || "",
					expectedOutput: tasks[index].expectedOutput,
				};
				batchResult.tasks.push(taskResult);
				await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
				return { allTasksAccepted: false, executionStatus: "time limit exceeded" };
			}

			return { allTasksAccepted: false, executionStatus: "run time error" };
		}
	}

	return { allTasksAccepted, executionStatus: "completed" };
};

export const batchTaskQueueProcessor: BatchTaskQueueProcessorFunction = async () => {
	await initializeContainers();

	while (redisClient.isOpen) {
		const batchTask = await redisClient.blPop("batch-task-execution-queue", 0);
		if (!batchTask) continue;

		const parsedBatchTask = BatchSubmissionSchema.safeParse(JSON.parse(batchTask.element));
		if (!parsedBatchTask.success) continue;

		const { id, submissionId, languageId, callbackUrl, code, tasks } = parsedBatchTask.data;
		console.log("Batch task received:", id);

		try {
			await updateBatchResult(id, "executing");

			const { containerId, compileStatus, compilationError } = await compileInContainer(languageId, code);
			if (compileStatus === "compilation error") {
				await updateBatchResult(id, "compilation error", [], compilationError);
				continue;
			}

			const { allTasksAccepted, executionStatus } = await executeCompiledCode(
				id,
				languageId,
				containerId,
				tasks.map((task) => task.stdin),
				tasks,
			);

			if (executionStatus !== "completed") {
				await updateBatchResult(id, executionStatus);
				continue;
			}

			const batchResult = await redisClient.get(`batchResult:${id}`);
			const parsedBatchResult: BatchResult = JSON.parse(batchResult as string);

			parsedBatchResult.status = allTasksAccepted ? "accepted" : "rejected";
			await redisClient.set(`batchResult:${id}`, JSON.stringify(parsedBatchResult));

			if (callbackUrl) {
				await sendCallback(callbackUrl, submissionId, allTasksAccepted);
			}
		} catch (error) {
			console.error("Error processing batch task:", error);

			if (callbackUrl) {
				await sendCallback(callbackUrl, submissionId, false);
			}
		}
	}
};

// ######## utils ########

const execPromise = promisify(exec);

async function execWithTimeout(
	command: string,
	containerId: string,
	languageId: number,
	timeout = 1000,
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const childProcess = spawn(command, { shell: true });

		let stdout = "";
		let stderr = "";
		let timedOut = false;

		childProcess.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		childProcess.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		childProcess.on("close", (code) => {
			if (timedOut) return;
			clearTimeout(timer);
			if (code !== 0) {
				reject(new Error(`Process exited with code ${code}`));
			} else {
				resolve({ stdout, stderr });
			}
		});

		// Set a timeout to kill the process if it runs longer than the specified time
		const timer = setTimeout(() => {
			timedOut = true;

			const killProcess = spawn(`docker exec ${containerId} pkill -f ${languageId === 3 ? "java" : "myapp"}`, {
				shell: true,
			});

			killProcess.on("close", () => {
				reject(new Error("time limit exceeded"));
			});
		}, timeout);

		childProcess.on("exit", () => {
			if (timedOut) return;
			clearTimeout(timer);
		});
	});
}

const sendCallback = async (callbackUrl: string, submissionId: string, accepted: boolean) => {
	try {
		await axios.post(callbackUrl, { submissionId, accepted });
	} catch (error) {
		console.error("Error sending callback:", error);
	}
};

const updateBatchResult = async (id: string, status: string, tasks: any[] = [], compilationError: string = ""): Promise<void> => {
	const key = `batchResult:${id}`;
	const result = { status, tasks, compilationError };

	if (tasks.length === 0) {
		const existingResult = await redisClient.get(key);
		if (existingResult) {
			const parsedResult = JSON.parse(existingResult);
			result.tasks = parsedResult.tasks || [];
		}
	}

	await redisClient.set(key, JSON.stringify(result));
};

const extractError = (log: string) => {
	const lines = log.split("\n");

	const errorMessage = lines
		.filter((line) => line.includes("error:"))
		.map((line) => line.split("error:")[1].trim())
		.join("\n");

	return errorMessage;
};
