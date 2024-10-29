import { TestCaseType, FunctionStructureType } from "@aayushlad/code-champ-common";

export const stdoGenerator = (functionStructure: FunctionStructureType, testCase: TestCaseType) => {
	const returnType = functionStructure.returnType;
	let stdout = "";
	if (returnType.category === "derived" && returnType.derivedType) {
		if (returnType.derivedType === "Array") {
			const stdin = testCase?.output;
			if (stdin) {
				const values = stdin.split(",").map((item) => item.trim());
				stdout = `${values.join(" ")}`;
			}
			stdout = "0";
		}
	} else {
		stdout = `${testCase?.output}`;
	}

	return stdout;
};
