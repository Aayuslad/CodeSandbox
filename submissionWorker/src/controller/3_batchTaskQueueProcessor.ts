import { redisClient } from "../database/redisClient";
import { exec } from "child_process";
import { promisify } from "util";
import { BatchResult, BatchSubmissionSchema } from "../types/zodSchemas";
import axios from "axios";

const execPromise = promisify(exec);

// Container pool (one for each language)
const containerPool: { [key: number]: string } = {
	1: "", // Python
	2: "", // C++
	3: "", // Java
	4: "", // C
};

// Initialize the containers for each language
async function initializeContainers() {
	try {
		const { stdout: pythonContainerId } = await execPromise("docker run -d python:3.9 tail -f /dev/null");
		containerPool[1] = pythonContainerId.trim();

		const { stdout: cppContainerId } = await execPromise("docker run -d gcc:latest tail -f /dev/null");
		containerPool[2] = cppContainerId.trim();

		const { stdout: javaContainerId } = await execPromise("docker run -d openjdk:latest tail -f /dev/null");
		containerPool[3] = javaContainerId.trim();

		const { stdout: cContainerId } = await execPromise("docker run -d gcc:latest tail -f /dev/null");
		containerPool[4] = cContainerId.trim();

		console.log("Containers initialized:", containerPool);
	} catch (error) {
		console.error("Error initializing containers:", error);
		throw error;
	}
}

// Compile code inside a specific container based on language
async function compileInContainer(languageId: number, code: string): Promise<string> {
	const containerId = containerPool[languageId];
	if (!containerId) throw new Error(`No container found for language ID ${languageId}`);

	const compileCommand = {
		1: `docker exec -i ${containerId} sh -c 'echo "${code}" | base64 -d > Solution.py && python -m py_compile Solution.py'`, // Python
		2: `docker exec -i ${containerId} sh -c 'echo "${code}" | base64 -d > Solution.cpp && g++ Solution.cpp -o myapp'`, // C++
		3: `docker exec -i ${containerId} sh -c 'echo "${code}" | base64 -d > Solution.java && javac Solution.java'`, // Java
		4: `docker exec -i ${containerId} sh -c 'echo "${code}" | base64 -d > Solution.c && gcc Solution.c -o myapp'`, // C
	}[languageId];

	if (!compileCommand) throw new Error(`No compile command defined for language ID ${languageId}`);

	const start = Date.now();
	await execPromise(compileCommand); // Compile the code

	const end = Date.now();
	console.log(`Compile time: ${end - start} ms`);

	return containerId;
}

// Execute compiled code in the container with different inputs
async function executeCompiledCode(
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
): Promise<boolean> {
	const outputResults: string[] = [];

	const executeCommands: Record<number, (input: string) => string> = {
		1: (input: string) => `echo "${input}" | base64 -d | docker exec -i ${containerId} python Solution.py`, // Python
		2: (input: string) => `echo "${input}" | base64 -d | docker exec -i ${containerId} ./myapp`, // C++
		3: (input: string) => `echo "${input}" | base64 -d | docker exec -i ${containerId} java Solution`, // Java
		4: (input: string) => `echo "${input}" | base64 -d | docker exec -i ${containerId} ./myapp`, // C
	};

	const executeCommand = executeCommands[languageId];
	if (!executeCommand) {
		throw new Error(`No execute command defined for language ID ${languageId}`);
	}

	let index = 0;
	let allTasksAccepted = true;
	for (const input of inputs) {
		const existingResult = await redisClient.get(`batchResult:${id}`);
		let batchResult = existingResult ? JSON.parse(existingResult) : { status: "executing", tasks: [] };

		try {
			const command = executeCommand(input);
			const start = Date.now();
			const { stdout, stderr } = await execPromise(command); // Execute the compiled code with `stdin`
			const end = Date.now();
			console.log("Execution time:", end - start + "ms");
			outputResults.push(stdout.trim());

			if (stderr) {
				batchResult.tasks.push({
					id: tasks[index].id,
					status: "error",
					output: stderr,
					accepted: false,
					inputs: tasks[index].inputs,
					expectedOutput: tasks[index].expectedOutput,
				});
				await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
				allTasksAccepted = false;
			} else {
				const accepted = stdout === tasks[index].expectedOutput;
				batchResult.tasks.push({
					id: tasks[index].id,
					status: "success",
					output: stdout,
					accepted,
					inputs: tasks[index].inputs,
					expectedOutput: tasks[index].expectedOutput,
				});
				await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
				if (!accepted) {
					allTasksAccepted = false;
				}
			}
		} catch (error) {
			//@ts-ignore
			const errorOutput = error.stderr || error.message;
			const existingResult = await redisClient.get(`batchResult:${id}`);
			let batchResult = existingResult ? JSON.parse(existingResult) : { tasks: [] };

			batchResult.tasks.push({
				id: tasks[index].id,
				status: "error",
				output: errorOutput,
				accepted: false,
				inputs: tasks[index].inputs,
				expectedOutput: tasks[index].expectedOutput,
			});
			await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
			allTasksAccepted = false;
		}
		index++;
	}

	return allTasksAccepted;
}

export async function batchTaskQueueProcessor() {
	await initializeContainers();

	while (redisClient.isOpen) {
		const batchTask = await redisClient.blPop("batch-task-execution-queue", 0);
		if (!batchTask) continue;

		const parsedBatchTask: BatchSubmissionSchema = JSON.parse(batchTask.element);
		console.log("Batch task received:", parsedBatchTask.id);

		const parsed = BatchSubmissionSchema.safeParse(parsedBatchTask);
		if (!parsed.success) {
			console.error("Invalid batch task data:", parsed.error);
			continue;
		}

		const { id, submissionId, languageId, callbackUrl, code, tasks } = parsed.data;

		try {
			await redisClient.set(`batchResult:${id}`, JSON.stringify({ status: "executing", tasks: [] }));

			const containerId = await compileInContainer(languageId, code);
			const allTasksAccepted = await executeCompiledCode(
				id,
				languageId,
				containerId,
				tasks.map((task) => task.stdin),
				tasks,
			);

			const batchResult = await redisClient.get(`batchResult:${id}`);
			const parcedBatchResult: BatchResult = JSON.parse(batchResult as string);

			parcedBatchResult.status = allTasksAccepted ? "accepted" : "rejected";
			await redisClient.set(`batchResult:${id}`, JSON.stringify(parcedBatchResult));

			if (callbackUrl) {
				try {
					await axios.post(callbackUrl, {
						submissionId,
						accepted: parcedBatchResult.tasks.every((task) => task.status === "success"),
					});
				} catch {}
			}
		} catch (error) {
			const batchResult = { status: "error", tasks: [] };
			await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
			console.log("error:", error);

			try {
				if (callbackUrl) {
					await axios.post(callbackUrl, {
						submissionId,
						accepted: false,
					});
				}
			} catch {}
		}
	}
}
