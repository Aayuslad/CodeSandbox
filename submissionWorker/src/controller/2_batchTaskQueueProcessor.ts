// import { redisClient } from "../database/redisClient";
// import { exec } from "child_process";
// import { promisify } from "util";
// import { BatchSubmissionSchema } from "../types/zodSchemas";
// import axios from "axios";

// const execPromise = promisify(exec);

// // Container pool (one for each language)
// const containerPool: { [key: number]: string } = {
// 	1: "", // Python
// 	2: "", // C++
// 	3: "", // Java
// 	4: "", // C
// };

// // Initialize the containers for each language
// async function initializeContainers() {
// 	try {
// 		// Initialize Python container
// 		const { stdout: pythonContainerId } = await execPromise("docker run -d python:3.9 tail -f /dev/null");
// 		containerPool[1] = pythonContainerId.trim();

// 		// Initialize C++ container
// 		const { stdout: cppContainerId } = await execPromise("docker run -d gcc:latest tail -f /dev/null");
// 		containerPool[2] = cppContainerId.trim();

// 		// Initialize Java container
// 		const { stdout: javaContainerId } = await execPromise("docker run -d openjdk:latest tail -f /dev/null");
// 		containerPool[3] = javaContainerId.trim();

// 		// Initialize C container
// 		const { stdout: cContainerId } = await execPromise("docker run -d gcc:latest tail -f /dev/null");
// 		containerPool[4] = cContainerId.trim();

// 		console.log("Containers initialized:", containerPool);
// 	} catch (error) {
// 		console.error("Error initializing containers:", error);
// 		throw error;
// 	}
// }

// // Execute code inside a specific container based on language
// async function executeInContainer(languageId: number, code: string): Promise<{ stdout: string; stderr: string }> {
// 	const containerId = containerPool[languageId];
// 	if (!containerId) throw new Error(`No container found for language ID ${languageId}`);

// 	const command = {
// 		1: `echo "${code}" | base64 -d | docker exec -i ${containerId} python`, // Python
// 		2: `echo "${code}" | base64 -d | docker exec -i ${containerId} sh -c 'g++ -x c++ -o myapp - && ./myapp'`, // C++
// 		3: `echo "${code}" | base64 -d | docker exec -i ${containerId} sh -c 'javac -d . Solution.java && java Solution'`, // Java
// 		4: `echo "${code}" | base64 -d | docker exec -i ${containerId} sh -c 'gcc -x c -o myapp - && ./myapp'`, // C
// 	}[languageId];

// 	if (!command) throw new Error(`No command defined for language ID ${languageId}`);

// 	return execPromise(command);
// }

// export async function batchTaskQueueProcessor() {
// 	await initializeContainers(); // Initialize the container pool at the start

// 	while (redisClient.isOpen) {
// 		const batchTask = await redisClient.blPop("batch-task-execution-queue", 0);
// 		if (!batchTask) continue;

// 		const parcedBatchTask: BatchSubmissionSchema = JSON.parse(batchTask.element);
// 		console.log("batch task received:", parcedBatchTask.id);

// 		const parced = BatchSubmissionSchema.safeParse(parcedBatchTask);
// 		if (!parced.success) {
// 			console.error("Invalid batch task data:", parced.error);
// 			continue;
// 		}

// 		const { id, submissionId, languageId, callbackUrl, tasks } = parced.data;
// 		let allTasksAccepted = true;

// 		for (const task of tasks) {
// 			try {
// 				const startedAt = Date.now();
// 				const { stdout, stderr } = await executeInContainer(languageId, task.code);
// 				const endedAt = Date.now();

// 				console.log("Execution time:", endedAt - startedAt, " ms");
// 				console.log("output: ", stdout, stderr);

// 				const existingResult = await redisClient.get(`batchResult:${id}`);
// 				let batchResult = existingResult ? JSON.parse(existingResult) : { status: "executing", tasks: [] };

// 				if (stderr) {
// 					batchResult.tasks.push({
// 						id: task.id,
// 						status: "error",
// 						output: stderr,
// 						accepted: false,
// 						inputs: task.inputs,
// 						expectedOutput: task.expectedOutput,
// 					});
// 					await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
// 					allTasksAccepted = false;
// 				} else {
// 					const accepted = stdout === task.expectedOutput;
// 					batchResult.tasks.push({
// 						id: task.id,
// 						status: "success",
// 						output: stdout,
// 						accepted,
// 						inputs: task.inputs,
// 						expectedOutput: task.expectedOutput,
// 					});
// 					await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
// 					if (!accepted) {
// 						allTasksAccepted = false;
// 					}
// 				}
// 			} catch (error) {
// 				//@ts-ignore
// 				const errorOutput = error.stderr || error.message;
// 				const existingResult = await redisClient.get(`batchResult:${id}`);
// 				let batchResult = existingResult ? JSON.parse(existingResult) : { tasks: [] };

// 				batchResult.tasks.push({
// 					id: task.id,
// 					status: "error",
// 					output: errorOutput,
// 					accepted: false,
// 					inputs: task.inputs,
// 					expectedOutput: task.expectedOutput,
// 				});
// 				await redisClient.set(`batchResult:${id}`, JSON.stringify(batchResult));
// 				allTasksAccepted = false;
// 			}
// 		}

// 		const existingResult = await redisClient.get(`batchResult:${id}`);
// 		const parsedExistingResult = JSON.parse(existingResult as string);

// 		if (allTasksAccepted) {
// 			await redisClient.set(`batchResult:${id}`, JSON.stringify({ status: "accepted", tasks: parsedExistingResult.tasks }));
// 		} else {
// 			await redisClient.set(`batchResult:${id}`, JSON.stringify({ status: "rejected", tasks: parsedExistingResult.tasks }));
// 		}

// 		if (callbackUrl) {
// 			await axios.post(callbackUrl, {
// 				submissionId,
// 				accepted: allTasksAccepted,
// 			});
// 		}
// 	}
// }
