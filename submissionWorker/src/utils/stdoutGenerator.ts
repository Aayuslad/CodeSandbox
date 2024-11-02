import { TestCaseType, FunctionStructureType } from "@aayushlad/code-champ-common";

export const stdoutGenerator = (functionStructure: FunctionStructureType, testCase: TestCaseType) => {
	const returnType = functionStructure.returnType;
	let stdout = "";
	if (returnType.category === "derived" && returnType.derivedType) {
		if (returnType.derivedType === "Array") {
			stdout = testCase?.output;
			if (stdout) {
				const values = stdout.split(",").map((item) => item.trim());
				stdout = `${values.join(" ")}`;
			} else {
				stdout = "";
			}
		}
	} else {
		stdout = `${testCase?.output}`;
	}

	return stdout;
};
