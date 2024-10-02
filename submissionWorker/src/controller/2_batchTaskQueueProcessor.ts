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
			{ id: 1, image: "python:3.9-alpine", installCommand: "apk add bash" },
			{ id: 2, image: "gcc:latest", installCommand: "apt-get update && apt-get install -y time" },
			{ id: 3, image: "openjdk:11-slim", installCommand: "apt-get update && apt-get install -y time" },
			{ id: 4, image: "gcc:latest", installCommand: "apt-get update && apt-get install -y time" },
		];

		await Promise.all(
			containerConfigs.map(async (config) => {
				const { stdout: containerId } = await execPromise(`docker run -d ${config.image} tail -f /dev/null`);
				const trimmedContainerId = containerId.trim();

				await execPromise(`docker exec -i ${trimmedContainerId} /bin/sh -c "${config.installCommand}"`);

				containerPool[config.id] = trimmedContainerId;
			}),
		);

		console.log("Containers initialized and time command installed:", containerPool);
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
	const executeCommands: Record<number, string[]> = {
		1: ["exec", "-i", containerId, "bash", "-c", `TIMEFORMAT='%3R'; time python myapp`], // Python
		2: ["exec", "-i", containerId, "bash", "-c", `TIMEFORMAT='%3R'; time ./myapp`], // Compiled C/C++
		3: ["exec", "-i", containerId, "bash", "-c", `TIMEFORMAT='%3R'; time java Solution`], // Java
		4: ["exec", "-i", containerId, "bash", "-c", `TIMEFORMAT='%3R'; time ./myapp`], // Another compiled app
	};

	const command = executeCommands[languageId];
	if (!command) {
		throw new Error(`No execute command defined for language ID ${languageId}`);
	}

	let allTasksAccepted = true;

	for (let index = 0; index < inputs.length; index++) {
		const input = inputs[index];
		const existingResult = await redisClient.get(`batchResult:${id}`);
		let batchResult: BatchResult = existingResult ? JSON.parse(existingResult) : { status: "executing", tasks: [] };

		try {
			const start = Date.now();
			const { stdout, stderr, executionTime } = await execWithTimeout(command, input, containerId, languageId);
			const end = Date.now();
			console.log("code Execution time:", executionTime + "s");
			console.log("total Execution time:", end - start + "ms");

			const taskResult = {
				id: tasks[index].id,
				status: stderr == "" ? "success" : "error",
				output: stderr == "" ? stdout.trim() : "run time error",
				accepted: stderr == "" && stdout.trim() === tasks[index].expectedOutput,
				inputs: tasks[index].inputs || "",
				expectedOutput: tasks[index].expectedOutput,
				executionTime: Math.floor(executionTime * 1000),
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
			if (error.message === "time limit exceeded") {
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
				if (callbackUrl) await sendCallback(callbackUrl, submissionId, "CompilationError");
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
				if (callbackUrl) {
					if (executionStatus === "time limit exceeded") {
						await sendCallback(callbackUrl, submissionId, "TimeLimitExceeded");
					} else if (executionStatus === "run time error") {
						await sendCallback(callbackUrl, submissionId, "RunTimeError");
					}
				}
				continue;
			}

			const batchResult = await redisClient.get(`batchResult:${id}`);
			const parsedBatchResult: BatchResult = JSON.parse(batchResult as string);

			parsedBatchResult.status = allTasksAccepted ? "accepted" : "rejected";
			await redisClient.set(`batchResult:${id}`, JSON.stringify(parsedBatchResult));

			if (callbackUrl) {
				await sendCallback(callbackUrl, submissionId, allTasksAccepted ? "Accepted" : "Rejected");
			}
		} catch (error) {
			console.error("Error processing batch task:", error);
		}
	}
};

// ######## utils ########

const execPromise = promisify(exec);

async function execWithTimeout(
	commandArgs: string[],
	input: string,
	containerId: string,
	languageId: number,
	timeout = 1500,
): Promise<{ stdout: string; stderr: string; executionTime: number }> {
	return new Promise((resolve, reject) => {
		// Spawn the Docker exec command with /usr/bin/time to measure execution time
		const childProcess = spawn("docker", commandArgs, { shell: false });

		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let executionTime = 0; // To store execution time

		childProcess.stdin.write(input);
		childProcess.stdin.end(); // Close stdin when done

		// Capture stdout and stderr data
		childProcess.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		childProcess.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		// On process close, resolve or reject based on the exit code
		childProcess.on("close", (code) => {
			if (timedOut) return;
			clearTimeout(timer);

			// The execution time will be in stderr because /usr/bin/time writes to stderr
			const timeMatch = stderr.match(/(\d+\.\d+)/);

			if (timeMatch) {
				executionTime = parseFloat(timeMatch[1]);
				stderr = stderr.replace(`${timeMatch[0]}`, "").trim();
			}

			if (code !== 0) {
				reject(new Error(`Process exited with code ${code}`));
			} else {
				resolve({ stdout, stderr, executionTime });
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

const sendCallback = async (callbackUrl: string, submissionId: string, status: string) => {
	try {
		await axios.post(callbackUrl, { submissionId, status });
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
