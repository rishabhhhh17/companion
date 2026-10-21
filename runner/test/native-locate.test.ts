// Point at the problem for Go, Rust, Java, Kotlin and Swift: a failing check's output becomes the real failing file and line.
// The Rust and Swift samples are real output captured on this Mac (runner/test/fixtures/errors). The Go, Maven, javac, Kotlin
// and Gradle samples are written from the tools' documented output shapes, because those tools are not installed here; the
// rescue eval (evals/rescue-projects) runs the real ones on a Mac that has them.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { locateProblem } from "../src/proof/locate.ts";
import { readToolOutput } from "../src/proof/toolout.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
function project(files: Record<string, string>): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-natloc-")));
  made.push(d);
  for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
}
const lines = (n: number, at: Record<number, string>) => Array.from({ length: n }, (_, i) => at[i + 1] ?? `// line ${i + 1}`).join("\n") + "\n";
const fixture = (name: string, root: string) => readFileSync(join(import.meta.dir, "fixtures", "errors", `${name}.txt`), "utf8").replaceAll("{{ROOT}}", root);
const line = (p: ReturnType<typeof locateProblem>) => (p && p.kind === "line" ? { file: p.file, line: p.line, column: p.column, message: p.message } : p);

describe("Go", () => {
  const main = lines(12, { 9: "\tt := totl(1, 2)", 7: "\tx := []int{1, 2, 3}" });
  test("a compile error: file, line and column, in the compiler's own words", () => {
    const d = project({ "go.mod": "module example.com/shop\n", "main.go": main });
    const out = "# example.com/shop\n./main.go:9:7: undefined: totl\n";
    expect(line(locateProblem(out, d, "checks"))).toEqual({ file: "main.go", line: 9, column: 7, message: "undefined: totl" });
  });
  test("a package in a folder keeps its folder", () => {
    const d = project({ "go.mod": "module example.com/shop\n", "pkg/cart/cart.go": lines(14, { 12: "\treturn \"x\"" }) });
    const out = "# example.com/shop/pkg/cart\npkg/cart/cart.go:12:9: cannot use \"x\" (untyped string constant) as int value in return statement\n";
    expect(line(locateProblem(out, d, "checks"))).toEqual({ file: "pkg/cart/cart.go", line: 12, column: 9, message: 'cannot use "x" (untyped string constant) as int value in return statement' });
  });
  test("go vet: the first finding, with its words and not the package header", () => {
    const d = project({ "go.mod": "module example.com/shop\n", "main.go": lines(12, { 11: '\tfmt.Printf("%d", "x")' }) });
    const out = '# example.com/shop\n# [example.com/shop]\n./main.go:11:2: fmt.Printf format %d has arg "x" of wrong type string\n';
    expect(line(locateProblem(out, d, "checks"))).toMatchObject({ file: "main.go", line: 11, message: 'fmt.Printf format %d has arg "x" of wrong type string' });
  });
  test("vet: prefix on a type error", () => {
    const d = project({ "go.mod": "module example.com/shop\n", "main.go": main });
    expect(line(locateProblem("vet: ./main.go:9:7: undefined: totl\n", d, "checks"))).toMatchObject({ file: "main.go", line: 9, message: "undefined: totl" });
  });
  test("a failing test: the line of the check inside the test file, which Go names without a folder", () => {
    const d = project({ "go.mod": "module example.com/shop\n", "cart/cart_test.go": lines(12, { 9: "\tt.Errorf(\"Add(2, 2) = %d; want 4\", got)" }), "main.go": "package main\n" });
    const out = "--- FAIL: TestAdd (0.00s)\n    cart_test.go:9: Add(2, 2) = 5; want 4\nFAIL\nFAIL\texample.com/shop/cart\t0.002s\nFAIL\n";
    expect(line(locateProblem(out, d, "tests"))).toEqual({ file: "cart/cart_test.go", line: 9, column: undefined, message: "Add(2, 2) = 5; want 4" });
  });
  test("a file name that two folders share is not guessed", () => {
    const d = project({ "go.mod": "module x\n", "a/a_test.go": lines(12, {}), "b/a_test.go": lines(12, {}) });
    const p = locateProblem("--- FAIL: TestA (0.00s)\n    a_test.go:9: boom\nFAIL\n", d, "tests");
    expect(p?.kind).toBe("message");
  });
  test("a panic: the first frame in the project, with the panic's words", () => {
    const d = project({ "go.mod": "module x\n", "main.go": lines(12, { 7: "\tfmt.Println(x[5])" }) });
    const out = `panic: runtime error: index out of range [5] with length 3\n\ngoroutine 1 [running]:\nmain.main()\n\t${d}/main.go:7 +0x1d\nexit status 2\n`;
    expect(line(locateProblem(out, d, "start"))).toEqual({ file: "main.go", line: 7, column: undefined, message: "runtime error: index out of range [5] with length 3" });
  });
  test("a panic inside a test skips the standard library's frames", () => {
    const d = project({ "go.mod": "module x\n", "main.go": lines(30, { 21: "\treturn a[i]" }) });
    const out = `--- FAIL: TestX (0.00s)\npanic: runtime error: index out of range [3] with length 3 [recovered]\n\tpanic: runtime error: index out of range [3] with length 3\n\ngoroutine 6 [running]:\ntesting.tRunner.func1.2({0x1, 0x2})\n\t/usr/local/go/src/testing/testing.go:1631 +0x24a\nx.get(...)\n\t${d}/main.go:21 +0x15\nFAIL\tx\t0.003s\n`;
    expect(line(locateProblem(out, d, "tests"))).toMatchObject({ file: "main.go", line: 21 });
  });
  test("go.mod itself", () => {
    const d = project({ "go.mod": "module x\n\nfoo bar\n" });
    const out = `go: errors parsing go.mod:\n${d}/go.mod:3: unknown directive: foo\n`;
    expect(line(locateProblem(out, d, "checks"))).toEqual({ file: "go.mod", line: 3, column: undefined, message: "unknown directive: foo" });
  });
  test("an import no module provides is the import line, not a network problem", () => {
    const d = project({ "go.mod": "module x\n", "main.go": lines(6, { 4: '\t"github.com/x/y"' }) });
    const out = "main.go:4:2: no required module provides package github.com/x/y; to add it:\n\tgo get github.com/x/y\n";
    expect(line(locateProblem(out, d, "checks"))).toMatchObject({ file: "main.go", line: 4, column: 2 });
  });
  test("a file in vendor or in the module cache is never the person's", () => {
    const d = project({ "go.mod": "module x\n", "vendor/github.com/x/y/y.go": lines(20, {}), "main.go": lines(5, {}) });
    expect(locateProblem("vendor/github.com/x/y/y.go:10:2: something\n", d, "checks")?.kind).not.toBe("line");
  });
});

describe("Rust", () => {
  test("cargo check: the error's own place, and 'mismatched types', not the note that points at the function", () => {
    const d = project({ "Cargo.toml": "[package]\nname = \"shop\"\n", "src/main.rs": lines(10, { 6: '    let t: i32 = total(1, "two");', 1: "fn total(a: i32, b: i32) -> i32 {" }) });
    expect(line(locateProblem(fixture("rust-check-mismatch", d), d, "checks"))).toEqual({ file: "src/main.rs", line: 6, column: 27, message: "mismatched types" });
  });
  test("clippy: the error, not the warning printed before it", () => {
    const d = project({ "Cargo.toml": "[package]\nname = \"shop\"\n", "src/main.rs": lines(8, { 5: "    let x: u8 = 256;", 2: "    let v = vec![1, 2, 3];" }) });
    expect(line(locateProblem(fixture("rust-clippy-error", d), d, "checks"))).toEqual({ file: "src/main.rs", line: 5, column: 17, message: "literal out of range for `u8`" });
  });
  test("cargo test: the first failing assertion with both values", () => {
    const d = project({ "Cargo.toml": "[package]\nname = \"shop\"\n", "src/main.rs": lines(20, { 14: "        assert_eq!(total(2, 2), 5);", 19: "        let _ = v[3];" }) });
    expect(line(locateProblem(fixture("rust-test-failures", d), d, "tests"))).toEqual({ file: "src/main.rs", line: 14, column: 9, message: "assertion `left == right` failed (left: 4, right: 5)" });
  });
  test("a panic in the older words", () => {
    const d = project({ "src/main.rs": lines(8, { 4: "    println!(\"{}\", v[5]);" }) });
    const out = "thread 'main' panicked at 'index out of bounds: the len is 3 but the index is 5', src/main.rs:4:20\nnote: run with `RUST_BACKTRACE=1`\n";
    expect(line(locateProblem(out, d, "start"))).toMatchObject({ file: "src/main.rs", line: 4, message: "index out of bounds: the len is 3 but the index is 5" });
  });
  test("a place inside the registry or the target folder is never the person's", () => {
    const d = project({ "Cargo.toml": "[package]\nname = \"x\"\n", "src/main.rs": lines(4, {}), "target/debug/build/x/out/gen.rs": lines(20, {}) });
    const out = "error[E0425]: cannot find value `y` in this scope\n --> target/debug/build/x/out/gen.rs:10:5\n  |\n";
    expect(locateProblem(out, d, "checks")?.kind).not.toBe("line");
  });
  test("ruff's arrow is not read as Rust", () => {
    expect(readToolOutput("F401 [*] `os` imported but unused\n --> app.py:1:8\n")).toBeNull();
  });
});

describe("Java and Kotlin", () => {
  const app = lines(12, { 5: "        int t = totl(1, 2);" });
  test("Maven's compile error: the bracketed line and column, and the symbol it could not find", () => {
    const d = project({ "pom.xml": "<project/>", "src/main/java/com/shop/App.java": app });
    const out = `[ERROR] COMPILATION ERROR : \n[ERROR] ${d}/src/main/java/com/shop/App.java:[5,17] cannot find symbol\n  symbol:   method totl(int,int)\n  location: class com.shop.App\n[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile (default-compile) on project shop: Compilation failure\n`;
    expect(line(locateProblem(out, d, "checks"))).toEqual({ file: "src/main/java/com/shop/App.java", line: 5, column: 17, message: "cannot find symbol: method totl(int,int)" });
  });
  test("Maven with the symbol on [ERROR] lines of its own", () => {
    const d = project({ "pom.xml": "<project/>", "src/main/java/App.java": app });
    const out = `[ERROR] ${d}/src/main/java/App.java:[5,17] cannot find symbol\n[ERROR]   symbol:   variable totl\n[ERROR]   location: class App\n`;
    expect(line(locateProblem(out, d, "checks"))).toMatchObject({ line: 5, message: "cannot find symbol: variable totl" });
  });
  test("javac through Gradle: file:line: error:", () => {
    const d = project({ "build.gradle": "", "src/main/java/App.java": app });
    const out = `${d}/src/main/java/App.java:5: error: cannot find symbol\n        int t = totl(1, 2);\n                ^\n  symbol:   method totl(int,int)\n  location: class App\n1 error\n\nFAILURE: Build failed with an exception.\n`;
    expect(line(locateProblem(out, d, "checks"))).toMatchObject({ file: "src/main/java/App.java", line: 5, message: "cannot find symbol: method totl(int,int)" });
  });
  test("a Kotlin error in the newer form", () => {
    const d = project({ "build.gradle.kts": "", "src/main/kotlin/App.kt": lines(8, { 4: "    val t = totl(1, 2)" }) });
    const out = `e: file://${d}/src/main/kotlin/App.kt:4:13 Unresolved reference: totl\n\nFAILURE: Build failed with an exception.\n`;
    expect(line(locateProblem(out, d, "checks"))).toEqual({ file: "src/main/kotlin/App.kt", line: 4, column: 13, message: "Unresolved reference: totl" });
  });
  test("a Kotlin error in the older form", () => {
    const d = project({ "build.gradle.kts": "", "src/main/kotlin/App.kt": lines(8, { 4: "    val t = totl(1, 2)" }) });
    const out = `e: ${d}/src/main/kotlin/App.kt: (4, 13): Unresolved reference: totl\n`;
    expect(line(locateProblem(out, d, "checks"))).toMatchObject({ file: "src/main/kotlin/App.kt", line: 4, column: 13, message: "Unresolved reference: totl" });
  });
  test("a failed JUnit test: the first frame in the project, found by its package, with the assertion's words", () => {
    const d = project({ "pom.xml": "<project/>", "src/test/java/com/shop/CalcTest.java": lines(14, { 10: "        assertEquals(4, calc.add(2, 2));" }), "src/main/java/com/shop/Calc.java": lines(6, {}) });
    const out = "[ERROR] Tests run: 1, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 0.05 s <<< FAILURE! - in com.shop.CalcTest\n[ERROR] addsUp  Time elapsed: 0.03 s  <<< FAILURE!\norg.opentest4j.AssertionFailedError: expected: <4> but was: <5>\n\tat org.junit.jupiter.api.AssertionFailureBuilder.build(AssertionFailureBuilder.java:151)\n\tat org.junit.jupiter.api.AssertEquals.failNotEqual(AssertEquals.java:197)\n\tat com.shop.CalcTest.addsUp(CalcTest.java:10)\n";
    expect(line(locateProblem(out, d, "tests"))).toEqual({ file: "src/test/java/com/shop/CalcTest.java", line: 10, column: undefined, message: "expected: <4> but was: <5>" });
  });
  test("a Gradle test failure, with Gradle's app// frame prefix", () => {
    const d = project({ "build.gradle": "", "src/test/java/com/shop/CalcTest.java": lines(14, { 10: "        assertEquals(4, 5);" }) });
    const out = "CalcTest > addsUp() FAILED\n    org.opentest4j.AssertionFailedError: expected: <4> but was: <5>\n        at app//org.junit.jupiter.api.AssertionFailureBuilder.build(AssertionFailureBuilder.java:151)\n        at app//com.shop.CalcTest.addsUp(CalcTest.java:10)\n";
    expect(line(locateProblem(out, d, "tests"))).toMatchObject({ file: "src/test/java/com/shop/CalcTest.java", line: 10, message: "expected: <4> but was: <5>" });
  });
  test("an exception in the app's own code names the exception", () => {
    const d = project({ "build.gradle": "", "src/main/java/com/shop/App.java": lines(20, { 12: "        String s = null; s.length();" }) });
    const out = "Exception in thread \"main\" java.lang.NullPointerException: Cannot invoke \"String.length()\" because \"s\" is null\n\tat com.shop.App.main(App.java:12)\n";
    expect(line(locateProblem(out, d, "start"))).toMatchObject({ file: "src/main/java/com/shop/App.java", line: 12, message: 'NullPointerException: Cannot invoke "String.length()" because "s" is null' });
  });
  test("a Kotlin test frame", () => {
    const d = project({ "build.gradle.kts": "", "src/test/kotlin/com/shop/CalcTest.kt": lines(14, { 9: "        assertEquals(4, 5)" }) });
    const out = "CalcTest > addsUp() FAILED\n    java.lang.AssertionError: expected:<4> but was:<5>\n        at app//com.shop.CalcTest.addsUp(CalcTest.kt:9)\n";
    expect(line(locateProblem(out, d, "tests"))).toMatchObject({ file: "src/test/kotlin/com/shop/CalcTest.kt", line: 9 });
  });
  test("a frame in a library whose file is not in the project is skipped", () => {
    const d = project({ "pom.xml": "<project/>", "src/main/java/com/shop/App.java": lines(20, { 8: "        run();" }) });
    const out = "java.lang.IllegalStateException: boom\n\tat org.springframework.boot.SpringApplication.run(SpringApplication.java:315)\n\tat com.shop.App.main(App.java:8)\n";
    expect(line(locateProblem(out, d, "start"))).toMatchObject({ file: "src/main/java/com/shop/App.java", line: 8, message: "IllegalStateException: boom" });
  });
  test("Node's stack frames are not read as Java", () => {
    expect(readToolOutput("TypeError: x is not a function\n    at foo (/app/src/a.js:3:5)\n")).toBeNull();
  });
});

describe("Swift", () => {
  test("swift build: the compiler's place and words, without the long command line after it", () => {
    const d = project({ "Package.swift": "// swift-tools-version:5.9\n", "Sources/shop/main.swift": lines(7, { 5: 'let t: Int = total(1, "two")' }) });
    expect(line(locateProblem(fixture("swift-build-error", d), d, "checks"))).toEqual({ file: "Sources/shop/main.swift", line: 5, column: 23, message: "cannot convert value of type 'String' to expected argument type 'Int'" });
  });
  test("Swift Testing: the issue's place, which Swift names by file only", () => {
    const d = project({ "Package.swift": "", "Tests/shopTests/CartTests.swift": lines(6, { 4: "    #expect(2 + 2 == 5)" }) });
    expect(line(locateProblem(fixture("swift-testing-issue", d), d, "tests"))).toEqual({ file: "Tests/shopTests/CartTests.swift", line: 4, column: 5, message: "Expectation failed: 2 + 2 == 5" });
  });
  test("XCTest: the failing assertion, without the Objective-C looking test name", () => {
    const d = project({ "Package.swift": "", "Tests/shopTests/CartTests.swift": lines(8, { 5: '        XCTAssertEqual(2 + 2, 5, "Total is wrong")' }) });
    const out = `${d}/Tests/shopTests/CartTests.swift:5: error: -[shopTests.CartTests testTotal] : XCTAssertEqual failed: ("4") is not equal to ("5") - Total is wrong\n`;
    expect(line(locateProblem(out, d, "tests"))).toMatchObject({ file: "Tests/shopTests/CartTests.swift", line: 5, message: 'XCTAssertEqual failed: ("4") is not equal to ("5") - Total is wrong' });
  });
  test("a crash: the file and line Swift prints", () => {
    const d = project({ "Sources/shop/main.swift": lines(8, { 4: "print(a[9])" }) });
    const out = `Fatal error: Index out of range: file ${d}/Sources/shop/main.swift, line 4\n`;
    expect(line(locateProblem(out, d, "start"))).toMatchObject({ file: "Sources/shop/main.swift", line: 4, message: "Index out of range" });
  });
  test("an error line that has the place first and no colon after the column", () => {
    const d = project({ "Package.swift": "", "Tests/shopTests/CartTests.swift": lines(4, { 1: "import XCTest" }) });
    const out = `error: ${d}/Tests/shopTests/CartTests.swift:1:8 unable to resolve module dependency: 'XCTest'\nerror: Build failed\n`;
    expect(line(locateProblem(out, d, "tests"))).toMatchObject({ file: "Tests/shopTests/CartTests.swift", line: 1, column: 8, message: "unable to resolve module dependency: 'XCTest'" });
  });
  test("xcodebuild's error line", () => {
    const d = project({ "Shop/ContentView.swift": lines(20, { 12: "        Text(missing)" }) });
    const out = `${d}/Shop/ContentView.swift:12:14: error: cannot find 'missing' in scope\n** BUILD FAILED **\n`;
    expect(line(locateProblem(out, d, "checks"))).toEqual({ file: "Shop/ContentView.swift", line: 12, column: 14, message: "cannot find 'missing' in scope" });
  });
});

describe("what is not changed", () => {
  test("TypeScript's output is read exactly as before", () => {
    const d = project({ "src/a.ts": lines(8, { 3: "const x: number = 'a';" }) });
    expect(line(locateProblem("src/a.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.\n", d, "checks"))).toMatchObject({ file: "src/a.ts", line: 3 });
  });
  test("a message only, when the tool's place is outside the project", () => {
    const d = project({ "go.mod": "module x\n", "main.go": "package main\n" });
    const p = locateProblem("# x\n/elsewhere/other/y.go:3:4: undefined: q\n", d, "checks");
    expect(p).toMatchObject({ kind: "message", message: "undefined: q" });
  });
});
