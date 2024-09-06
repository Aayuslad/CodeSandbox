export const old_dockerCommands: { [key: number]: string } = {
	1: `echo "_CODE" | docker run --rm -i python:3.9 python`,
	2: `echo "_CODE" | docker run --rm -i gcc:latest sh -c 'g++ -x c++ -o myapp - && ./myapp'`,
	3: `echo "_CODE" | docker run --rm -i openjdk:17 sh -c 'javac -d . Main.java && java Main'`,
	4: `echo "_CODE" | docker run --rm -i gcc:latest sh -c 'gcc -x c -o myapp - && ./myapp'`,
};

export const dockerCommands: { [key: number]: string } = {
	1: `echo "_CODE" | base64 -d | docker run --rm -i python:3.9 python`,
	2: `echo "_CODE" | base64 -d | docker run --rm -i gcc:latest sh -c 'g++ -x c++ -o myapp - && ./myapp'`,
	3: `echo "_CODE" | base64 -d | docker run --rm -i openjdk:17 sh -c 'javac -d . Main.java && java Main'`,
	4: `echo "_CODE" | base64 -d | docker run --rm -i gcc:latest sh -c 'gcc -x c -o myapp - && ./myapp'`,
};
