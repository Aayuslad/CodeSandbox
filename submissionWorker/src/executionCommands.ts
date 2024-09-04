// use localfile system to store files
export const dockerCommands_01: { [key: string]: string } = {
	python: `echo "_CODE" | docker run --rm -i python:3.9 python`,
	cpp: `echo "_CODE" > code.cpp && docker run --rm -v "$PWD":/usr/src/myapp -w /usr/src/myapp gcc:latest g++ -o myapp code.cpp && ./myapp`,
	java: `echo "_CODE" > Main.java && docker run --rm -v "$PWD":/usr/src/myapp -w /usr/src/myapp openjdk:17 javac Main.java && java Main`,
	c: `echo "_CODE" > code.c && docker run --rm -v "$PWD":/usr/src/myapp -w /usr/src/myapp gcc:latest gcc -o myapp code.c && ./myapp`,
};

// use docker file system to store files
export const dockerCommands: { [key: string]: string } = {
	python: `echo "_CODE" | docker run --rm -i python:3.9 python`,
	cpp: `echo "_CODE" | docker run --rm -i gcc:latest sh -c 'g++ -x c++ -o myapp - && ./myapp'`,
	java: `echo "_CODE" | docker run --rm -i openjdk:17 sh -c 'javac -d . Main.java && java Main'`,
	c: `echo "_CODE" | docker run --rm -i gcc:latest sh -c 'gcc -x c -o myapp - && ./myapp'`,
};
