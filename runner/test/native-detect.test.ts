// Go, Rust, Java and Kotlin (Maven and Gradle), Swift packages and Xcode projects in the proof ladder: what each one has to
// check, the exact commands (pure, so they are tested as text), and what happens when the tool is not on this Mac. Nothing
// here runs a tool: files are written into temporary folders and only read.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { detectProject } from "../src/proof/detect.ts";
import { detectNative, goPlan, gradlePlan, mavenPlan, rustPlan, swiftPlan, xcodePlan } from "../src/proof/native.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
function project(files: Record<string, string>): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-nat-")));
  made.push(d);
  for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
}
// A home folder with nothing cached in it, so no result depends on which tools or caches this Mac has.
const emptyHome = () => project({ ".keep": "" });
const ALL = { has: () => true, home: "/nonexistent-home" };
const NONE = { has: () => false, home: "/nonexistent-home" };
const only = (...tools: string[]) => ({ has: (t: string) => tools.includes(t), home: "/nonexistent-home" });
const commands = (d: NonNullable<ReturnType<typeof detectNative>>) => [...d.checks.map((c) => c.command), d.tests?.command ?? ""].filter(Boolean);

const GO_MOD = "module example.com/shop\n\ngo 1.22\n";
const CARGO = '[package]\nname = "shop"\nversion = "0.1.0"\nedition = "2021"\n';
const POM = '<project><modelVersion>4.0.0</modelVersion><groupId>com.shop</groupId><artifactId>shop</artifactId><version>1.0</version></project>\n';

describe("which kind of project it is", () => {
  test("go.mod is Go, Cargo.toml is Rust, pom.xml is Maven, build.gradle is Gradle, Package.swift is Swift", () => {
    const eco = (files: Record<string, string>) => detectNative(project(files), ALL)?.setup.ecosystem;
    expect(eco({ "go.mod": GO_MOD })).toBe("go");
    expect(eco({ "Cargo.toml": CARGO })).toBe("rust");
    expect(eco({ "pom.xml": POM })).toBe("maven");
    expect(eco({ "build.gradle": "plugins { id 'java' }\n" })).toBe("gradle");
    expect(eco({ "build.gradle.kts": 'plugins { kotlin("jvm") version "1.9.0" }\n' })).toBe("gradle");
    expect(eco({ "settings.gradle.kts": 'rootProject.name = "shop"\n' })).toBe("gradle");
    expect(eco({ "Package.swift": "// swift-tools-version:5.9\n" })).toBe("swift");
  });
  test("a folder with none of them is not one of these", () => {
    expect(detectNative(project({ "notes.txt": "hello" }), ALL)).toBeNull();
    expect(detectNative(project({ "index.html": "<h1>hi</h1>" }), ALL)).toBeNull();
  });
  test("a folder with a package.json stays a Node project, exactly as before", () => {
    const det = detectProject(project({ "package.json": '{"scripts":{"build":"tsc"}}', "go.mod": GO_MOD }));
    expect(det.kind).toBe("node");
    expect(det.native).toBeUndefined();
  });
  test("a Python project with strong marks stays Python, even with a Cargo.toml next to it (a maturin project)", () => {
    const det = detectProject(project({ "pyproject.toml": '[project]\nname = "x"\n', "Cargo.toml": CARGO, "main.py": "" }));
    expect(det.kind).toBe("python");
    expect(det.native).toBeUndefined();
  });
  test("a stray helper script does not make a Go project a Python project", () => {
    const det = detectProject(project({ "go.mod": GO_MOD, "main.go": "package main\n", "tools.py": "print(1)\n" }));
    expect(det.kind).toBe("native");
    expect(det.native?.ecosystem).toBe("go");
  });
});

describe("Go", () => {
  test("build, vet and test, with no toolchain download and no git read, and the offline way without the proxy", () => {
    const plan = goPlan({ hasTests: true });
    expect(plan.checks.map((c) => [c.name, c.command, c.offline])).toEqual([
      ["build", "GOTOOLCHAIN=local go build -buildvcs=false ./...", "GOTOOLCHAIN=local GOPROXY=off go build -buildvcs=false ./..."],
      ["lint", "GOTOOLCHAIN=local go vet ./...", "GOTOOLCHAIN=local GOPROXY=off go vet ./..."],
    ]);
    expect(plan.tests).toEqual({ command: "GOTOOLCHAIN=local go test ./...", offline: "GOTOOLCHAIN=local GOPROXY=off go test ./...", tool: "go" });
    expect(goPlan({ hasTests: false }).tests).toBeNull();
  });
  test("tests are there only when the project has _test.go files", () => {
    expect(detectNative(project({ "go.mod": GO_MOD, "main.go": "package main\n" }), ALL)!.tests).toBeNull();
    expect(detectNative(project({ "go.mod": GO_MOD, "main.go": "package main\n", "pkg/util/util_test.go": "package util\n" }), ALL)!.tests?.command).toBe("GOTOOLCHAIN=local go test ./...");
  });
  test("vendored code and build output are not looked at for tests", () => {
    expect(detectNative(project({ "go.mod": GO_MOD, "vendor/x/x_test.go": "package x\n" }), ALL)!.tests).toBeNull();
  });
  test("a missing Go is a plain gap with the command to install it, and nothing to run", () => {
    const d = detectNative(project({ "go.mod": GO_MOD }), NONE)!;
    expect(d.checks).toEqual([]); expect(d.tests).toBeNull();
    expect(d.setup.missing).toMatch(/Go is not installed on this Mac/);
    expect(d.setup.missing).toMatch(/Companion does not install it/);
    expect(d.setup.missing).toContain("brew install go");
  });
  test("packages: a go.mod that requires something may download", () => {
    expect(detectNative(project({ "go.mod": GO_MOD }), ALL)!.setup.downloads).toBe(false);
    expect(detectNative(project({ "go.mod": GO_MOD + "\nrequire github.com/gin-gonic/gin v1.9.1\n" }), ALL)!.setup.downloads).toBe(true);
    expect(detectNative(project({ "go.mod": GO_MOD + "\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n)\n" }), ALL)!.setup.downloads).toBe(true);
  });
});

describe("Rust", () => {
  test("cargo check, clippy and test, with the toolchain never installed and --offline when no download is allowed", () => {
    const plan = rustPlan({ hasTests: true, clippy: true });
    expect(plan.checks.map((c) => [c.name, c.command, c.offline])).toEqual([
      ["typecheck", "RUSTUP_AUTO_INSTALL=0 cargo check --workspace --all-targets --color never", "RUSTUP_AUTO_INSTALL=0 cargo check --workspace --all-targets --color never --offline"],
      ["lint", "RUSTUP_AUTO_INSTALL=0 cargo clippy --workspace --all-targets --color never", "RUSTUP_AUTO_INSTALL=0 cargo clippy --workspace --all-targets --color never --offline"],
    ]);
    expect(plan.tests).toEqual({ command: "RUSTUP_AUTO_INSTALL=0 cargo test --workspace --color never", offline: "RUSTUP_AUTO_INSTALL=0 cargo test --workspace --color never --offline", tool: "cargo" });
  });
  test("clippy only when it is installed; its absence is a hint in About this project, not a gap", () => {
    const d = detectNative(project({ "Cargo.toml": CARGO, "src/main.rs": "fn main() {}\n" }), only("cargo"))!;
    expect(d.checks.map((c) => c.name)).toEqual(["typecheck"]);
    expect(d.setup.missing).toBeNull();
    expect(d.setup.hints.join(" ")).toMatch(/clippy/);
    expect(d.setup.hints.join(" ")).toContain("rustup component add clippy");
  });
  test("tests are there for a tests folder or a #[test] in the code", () => {
    expect(detectNative(project({ "Cargo.toml": CARGO, "src/main.rs": "fn main() {}\n" }), ALL)!.tests).toBeNull();
    expect(detectNative(project({ "Cargo.toml": CARGO, "src/lib.rs": "#[cfg(test)]\nmod t { #[test] fn a() {} }\n" }), ALL)!.tests?.tool).toBe("cargo");
    expect(detectNative(project({ "Cargo.toml": CARGO, "src/lib.rs": "", "tests/api.rs": "#[test] fn a() {}\n" }), ALL)!.tests?.tool).toBe("cargo");
  });
  test("a missing cargo is a plain gap with the command to install Rust", () => {
    const d = detectNative(project({ "Cargo.toml": CARGO }), NONE)!;
    expect(d.checks).toEqual([]);
    expect(d.setup.missing).toMatch(/Rust is not installed on this Mac/);
    expect(d.setup.missing).toContain("sh.rustup.rs");
  });
  test("packages: dependencies in Cargo.toml may download", () => {
    expect(detectNative(project({ "Cargo.toml": CARGO }), ALL)!.setup.downloads).toBe(false);
    expect(detectNative(project({ "Cargo.toml": CARGO + '\n[dependencies]\nserde = "1"\n' }), ALL)!.setup.downloads).toBe(true);
    expect(detectNative(project({ "Cargo.toml": CARGO + "\n[dependencies]\n" }), ALL)!.setup.downloads).toBe(false);
    expect(detectNative(project({ "Cargo.toml": CARGO + '\n[dev-dependencies]\ntempfile = "3"\n' }), ALL)!.setup.downloads).toBe(true);
  });
});

describe("Java and Kotlin with Maven", () => {
  test("compile and test with the system mvn, in batch mode, quiet, and -o when no download is allowed", () => {
    const plan = mavenPlan({ wrapper: null, hasTests: true });
    expect(plan.checks).toEqual([{ name: "build", command: "mvn -B -q compile", offline: "mvn -B -q -o compile", tool: "mvn" }]);
    expect(plan.tests).toEqual({ command: "mvn -B -q test", offline: "mvn -B -q -o test", tool: "mvn" });
  });
  test("the project's own mvnw comes first, run by sh so it needs no executable bit", () => {
    const plan = mavenPlan({ wrapper: { cached: true }, hasTests: true });
    expect(plan.checks[0].command).toBe("sh ./mvnw -B -q compile");
    expect(plan.checks[0].offline).toBe("sh ./mvnw -B -q -o compile");
  });
  test("a wrapper whose Maven is not cached would download it first, so there is no offline way, unless the Mac has its own mvn", () => {
    expect(mavenPlan({ wrapper: { cached: false }, hasTests: true, system: false }).checks[0].offline).toBeNull();
    expect(mavenPlan({ wrapper: { cached: false }, hasTests: true, system: true }).checks[0].offline).toBe("mvn -B -q -o compile");
  });
  test("detection finds mvnw, and whether the Maven it names is already on this Mac", () => {
    const files = { "pom.xml": POM, mvnw: "#!/bin/sh\n", ".mvn/wrapper/maven-wrapper.properties": "distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.6/apache-maven-3.9.6-bin.zip\n" };
    const home = project({ ".m2/wrapper/dists/apache-maven-3.9.6-bin/abc123/apache-maven-3.9.6/bin/mvn": "x" });
    const cached = detectNative(project(files), { has: (t) => t === "java", home })!;
    expect(cached.checks[0].command).toBe("sh ./mvnw -B -q compile");
    expect(cached.checks[0].offline).toBe("sh ./mvnw -B -q -o compile");
    const notCached = detectNative(project(files), { has: (t) => t === "java", home: emptyHome() })!;
    expect(notCached.checks[0].offline).toBeNull();
  });
  test("tests are there only when src/test has code", () => {
    expect(detectNative(project({ "pom.xml": POM, "src/main/java/App.java": "class App {}" }), ALL)!.tests).toBeNull();
    expect(detectNative(project({ "pom.xml": POM, "src/test/java/AppTest.java": "class AppTest {}" }), ALL)!.tests?.command).toBe("mvn -B -q test");
    expect(detectNative(project({ "pom.xml": POM, "app/src/test/kotlin/AppTest.kt": "class AppTest" }), ALL)!.tests?.command).toBe("mvn -B -q test");
  });
  test("without Java it is a plain gap; without Maven (and no mvnw) too", () => {
    const noJava = detectNative(project({ "pom.xml": POM }), only("mvn"))!;
    expect(noJava.checks).toEqual([]);
    expect(noJava.setup.missing).toMatch(/Java is not installed/);
    expect(noJava.setup.missing).toContain("brew install --cask temurin");
    const noMvn = detectNative(project({ "pom.xml": POM }), only("java"))!;
    expect(noMvn.setup.missing).toMatch(/Maven is not installed/);
    expect(noMvn.setup.missing).toContain("brew install maven");
    const wrapped = detectNative(project({ "pom.xml": POM, mvnw: "#!/bin/sh\n" }), only("java"))!;
    expect(wrapped.setup.missing).toBeNull();
  });
  test("a Maven project always may download (its plugins come from the internet the first time)", () => {
    expect(detectNative(project({ "pom.xml": POM }), ALL)!.setup.downloads).toBe(true);
  });
});

describe("Java and Kotlin with Gradle", () => {
  const FLAGS = "--console=plain --no-daemon -Porg.gradle.java.installations.auto-download=false -Pkotlin.compiler.execution.strategy=in-process";
  test("build without the tests, then the tests, with no daemon left behind and no Java downloaded for a toolchain", () => {
    const plan = gradlePlan({ wrapper: null, hasTests: true });
    expect(plan.checks).toEqual([{ name: "build", command: `gradle build -x test -q ${FLAGS}`, offline: `gradle build -x test -q --offline ${FLAGS}`, tool: "gradle" }]);
    expect(plan.tests).toEqual({ command: `gradle test ${FLAGS}`, offline: `gradle test --offline ${FLAGS}`, tool: "gradle" });
  });
  test("gradlew comes first, run by sh; not cached means no offline way", () => {
    expect(gradlePlan({ wrapper: { cached: true }, hasTests: false }).checks[0].command).toBe(`sh ./gradlew build -x test -q ${FLAGS}`);
    expect(gradlePlan({ wrapper: { cached: false }, hasTests: false, system: false }).checks[0].offline).toBeNull();
    expect(gradlePlan({ wrapper: { cached: false }, hasTests: false, system: true }).checks[0].offline).toBe(`gradle build -x test -q --offline ${FLAGS}`);
  });
  test("detection reads gradle-wrapper.properties for the Gradle it needs", () => {
    const files = { "build.gradle": "plugins { id 'java' }\n", gradlew: "#!/bin/sh\n", "gradle/wrapper/gradle-wrapper.properties": "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.5-bin.zip\n", "src/test/java/AppTest.java": "class AppTest {}" };
    const home = project({ ".gradle/wrapper/dists/gradle-8.5-bin/xyz/gradle-8.5/bin/gradle": "x" });
    const d = detectNative(project(files), { has: (t) => t === "java", home })!;
    expect(d.checks[0].command).toContain("sh ./gradlew build");
    expect(d.checks[0].offline).toContain("--offline");
    expect(d.tests?.command).toContain("sh ./gradlew test");
    expect(detectNative(project(files), { has: (t) => t === "java", home: emptyHome() })!.checks[0].offline).toBeNull();
  });
  test("Kotlin is named when the project uses it", () => {
    expect(detectNative(project({ "build.gradle.kts": 'plugins { kotlin("jvm") version "1.9.0" }\n' }), ALL)!.setup.label).toBe("Kotlin (Gradle)");
    expect(detectNative(project({ "build.gradle": "plugins { id 'java' }\n" }), ALL)!.setup.label).toBe("Java (Gradle)");
  });
  test("an Android project needs the Android SDK, which is not checked: said plainly, nothing run", () => {
    const d = detectNative(project({ "build.gradle": "plugins { id 'com.android.application' }\n" }), ALL)!;
    expect(d.checks).toEqual([]); expect(d.tests).toBeNull();
    expect(d.setup.gaps.join(" ")).toMatch(/Android/);
    const nested = detectNative(project({ "settings.gradle": "include ':app'\n", "build.gradle": "// root\n", "app/build.gradle": "plugins { id 'com.android.application' }\n" }), ALL)!;
    expect(nested.checks).toEqual([]);
  });
  test("without Java or Gradle (and no gradlew) it is a plain gap", () => {
    expect(detectNative(project({ "build.gradle": "" }), only("gradle"))!.setup.missing).toMatch(/Java is not installed/);
    const g = detectNative(project({ "build.gradle": "" }), only("java"))!;
    expect(g.setup.missing).toMatch(/Gradle is not installed/);
    expect(g.setup.missing).toContain("brew install gradle");
  });
});

describe("Swift packages", () => {
  test("swift build and swift test, and --disable-automatic-resolution when no download is allowed", () => {
    const plan = swiftPlan({ hasTests: true });
    expect(plan.checks).toEqual([{ name: "build", command: "swift build", offline: "swift build --disable-automatic-resolution", tool: "swift" }]);
    expect(plan.tests).toEqual({ command: "swift test", offline: "swift test --disable-automatic-resolution", tool: "swift" });
    expect(swiftPlan({ hasTests: false }).tests).toBeNull();
  });
  test("tests are there for a Tests folder with Swift in it or a testTarget", () => {
    const pkg = "// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package(name: \"x\")\n";
    expect(detectNative(project({ "Package.swift": pkg }), ALL)!.tests).toBeNull();
    expect(detectNative(project({ "Package.swift": pkg, "Tests/xTests/A.swift": "import XCTest\n" }), ALL)!.tests?.command).toBe("swift test");
    expect(detectNative(project({ "Package.swift": pkg + '.testTarget(name: "xTests")\n' }), ALL)!.tests?.command).toBe("swift test");
  });
  test("packages: a .package( line may download", () => {
    expect(detectNative(project({ "Package.swift": "let p = Package(name: \"x\")\n" }), ALL)!.setup.downloads).toBe(false);
    expect(detectNative(project({ "Package.swift": 'let p = Package(name: "x", dependencies: [.package(url: "https://github.com/vapor/vapor.git", from: "4.0.0")])\n' }), ALL)!.setup.downloads).toBe(true);
  });
  test("Vapor is named, and a server is never started on its own", () => {
    const d = detectNative(project({ "Package.swift": 'let p = Package(name: "x", dependencies: [.package(url: "https://github.com/vapor/vapor.git", from: "4.0.0")])\n' }), ALL)!;
    expect(d.setup.stackNote).toMatch(/Vapor/);
  });
  test("without Swift it is a plain gap that names the command line tools", () => {
    const d = detectNative(project({ "Package.swift": "" }), NONE)!;
    expect(d.setup.missing).toMatch(/Swift is not installed/);
    expect(d.setup.missing).toContain("xcode-select --install");
  });
});

// The smallest project.pbxproj that has what the reading needs, in the form Xcode writes it.
const pbx = (targets: { id: string; name: string; type: string; sdk?: string; platforms?: string; testHost?: boolean }[], extra = "") => {
  const cfgs = targets.map((t) => `\t\t${t.id.slice(0, 22)}C0 /* Debug */ = {\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = {\n${t.sdk ? `\t\t\t\tSDKROOT = ${t.sdk};\n` : ""}${t.platforms ? `\t\t\t\tSUPPORTED_PLATFORMS = "${t.platforms}";\n` : ""}${t.testHost ? '\t\t\t\tTEST_HOST = "$(BUILT_PRODUCTS_DIR)/App.app/Contents/MacOS/App";\n' : ""}\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";\n\t\t\t};\n\t\t\tname = Debug;\n\t\t};`).join("\n");
  const lists = targets.map((t) => `\t\t${t.id.slice(0, 22)}L0 /* Build configuration list for PBXNativeTarget "${t.name}" */ = {\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t${t.id.slice(0, 22)}C0 /* Debug */,\n\t\t\t);\n\t\t};`).join("\n");
  const objs = targets.map((t) => `\t\t${t.id} /* ${t.name} */ = {\n\t\t\tisa = PBXNativeTarget;\n\t\t\tbuildConfigurationList = ${t.id.slice(0, 22)}L0 /* Build configuration list for PBXNativeTarget "${t.name}" */;\n\t\t\tbuildPhases = (\n\t\t\t);\n\t\t\tname = ${t.name};\n\t\t\tproductName = ${t.name};\n\t\t\tproductType = "${t.type}";\n\t\t};`).join("\n");
  return `// !$*UTF8*$!\n{\n\tarchiveVersion = 1;\n\tobjects = {\n\n/* Begin PBXNativeTarget section */\n${objs}\n/* End PBXNativeTarget section */\n\n/* Begin XCBuildConfiguration section */\n${cfgs}\n/* End XCBuildConfiguration section */\n\n/* Begin XCConfigurationList section */\n${lists}\n/* End XCConfigurationList section */\n${extra}\n\t};\n\trootObject = ABCDEF012345678901234567 /* Project object */;\n}\n`;
};
const APP = "com.apple.product-type.application", UNIT = "com.apple.product-type.bundle.unit-test", UI = "com.apple.product-type.bundle.ui-testing";
const scheme = (name: string, build: string, tests: string[] = []) => `<?xml version="1.0" encoding="UTF-8"?>\n<Scheme LastUpgradeVersion="1500" version="1.7">\n   <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES">\n      <BuildActionEntries>\n         <BuildActionEntry buildForTesting="YES" buildForRunning="YES">\n            <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="X" BuildableName = "${build}.app" BlueprintName = "${build}" ReferencedContainer = "container:${name}.xcodeproj">\n            </BuildableReference>\n         </BuildActionEntry>\n      </BuildActionEntries>\n   </BuildAction>\n   <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB">\n      <Testables>\n${tests.map((t) => `         <TestableReference skipped = "NO">\n            <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="Y" BuildableName = "${t}.xctest" BlueprintName = "${t}" ReferencedContainer = "container:${name}.xcodeproj">\n            </BuildableReference>\n         </TestableReference>`).join("\n")}\n      </Testables>\n   </TestAction>\n</Scheme>\n`;

describe("Xcode projects", () => {
  const mac = { id: "AAAAAAAAAAAAAAAAAAAAAAA1", name: "Shop", type: APP, sdk: "macosx" };
  test("a macOS scheme is built for the Mac only, signing off, with no archive, export or install", () => {
    const d = detectNative(project({ "Shop.xcodeproj/project.pbxproj": pbx([mac]), "Shop.xcodeproj/xcshareddata/xcschemes/Shop.xcscheme": scheme("Shop", "Shop") }), ALL)!;
    expect(d.setup.ecosystem).toBe("xcode");
    expect(d.checks).toHaveLength(1);
    expect(d.checks[0].command).toBe("xcodebuild -project 'Shop.xcodeproj' -scheme 'Shop' -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= -quiet build");
    expect(d.checks[0].offline).toBe("xcodebuild -project 'Shop.xcodeproj' -scheme 'Shop' -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= -disableAutomaticPackageResolution -quiet build");
    expect(d.tests).toBeNull();   // the scheme has no test action
    for (const c of commands(d)) expect(c).not.toMatch(/archive|exportArchive|-allowProvisioningUpdates|simulator|iphone|install/i);
  });
  test("tests are run only when the scheme has a test action with a test target that does not need the app", () => {
    const targets = [mac, { id: "BBBBBBBBBBBBBBBBBBBBBBB2", name: "ShopTests", type: UNIT, sdk: "macosx" }];
    const d = detectNative(project({ "Shop.xcodeproj/project.pbxproj": pbx(targets), "Shop.xcodeproj/xcshareddata/xcschemes/Shop.xcscheme": scheme("Shop", "Shop", ["ShopTests"]) }), ALL)!;
    expect(d.tests?.command).toBe("xcodebuild -project 'Shop.xcodeproj' -scheme 'Shop' -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= -quiet test");
    expect(d.tests?.offline).toContain("-disableAutomaticPackageResolution");
  });
  test("tests that run inside the app are not run (they would open it on this Mac): a plain gap", () => {
    const targets = [mac, { id: "BBBBBBBBBBBBBBBBBBBBBBB2", name: "ShopTests", type: UNIT, sdk: "macosx", testHost: true }];
    const d = detectNative(project({ "Shop.xcodeproj/project.pbxproj": pbx(targets), "Shop.xcodeproj/xcshareddata/xcschemes/Shop.xcscheme": scheme("Shop", "Shop", ["ShopTests"]) }), ALL)!;
    expect(d.tests).toBeNull();
    expect(d.checks).toHaveLength(1);
    expect(d.setup.gaps.join(" ")).toMatch(/inside the app|open it/);
  });
  test("UI tests are skipped by name; they drive the app on screen", () => {
    const targets = [mac, { id: "BBBBBBBBBBBBBBBBBBBBBBB2", name: "ShopTests", type: UNIT, sdk: "macosx" }, { id: "CCCCCCCCCCCCCCCCCCCCCCC3", name: "ShopUITests", type: UI, sdk: "macosx" }];
    const d = detectNative(project({ "Shop.xcodeproj/project.pbxproj": pbx(targets), "Shop.xcodeproj/xcshareddata/xcschemes/Shop.xcscheme": scheme("Shop", "Shop", ["ShopTests", "ShopUITests"]) }), ALL)!;
    expect(d.tests?.command).toContain("-skip-testing:'ShopUITests'");
  });
  test("an iPhone only project is not built: it needs a simulator, which Companion never uses", () => {
    const d = detectNative(project({ "Phone.xcodeproj/project.pbxproj": pbx([{ id: "AAAAAAAAAAAAAAAAAAAAAAA1", name: "Phone", type: APP, sdk: "iphoneos" }]), "Phone.xcodeproj/xcshareddata/xcschemes/Phone.xcscheme": scheme("Phone", "Phone") }), ALL)!;
    expect(d.checks).toEqual([]); expect(d.tests).toBeNull();
    expect(d.setup.gaps.join(" ")).toMatch(/iPhone|iPad/);
    expect(d.setup.gaps.join(" ")).toMatch(/simulator/);
  });
  test("a project for both: the Mac scheme is the one used", () => {
    const targets = [{ id: "AAAAAAAAAAAAAAAAAAAAAAA1", name: "Phone", type: APP, sdk: "iphoneos" }, { id: "BBBBBBBBBBBBBBBBBBBBBBB2", name: "Mac", type: APP, sdk: "macosx" }];
    const d = detectNative(project({ "Both.xcodeproj/project.pbxproj": pbx(targets), "Both.xcodeproj/xcshareddata/xcschemes/Phone.xcscheme": scheme("Both", "Phone"), "Both.xcodeproj/xcshareddata/xcschemes/Mac.xcscheme": scheme("Both", "Mac") }), ALL)!;
    expect(d.checks[0].command).toContain("-scheme 'Mac'");
    expect(d.setup.schemes.map((s) => [s.name, s.macos])).toEqual([["Mac", true], ["Phone", false]]);
  });
  test("a multiplatform target counts when macosx is among its supported platforms", () => {
    const d = detectNative(project({ "Multi.xcodeproj/project.pbxproj": pbx([{ id: "AAAAAAAAAAAAAAAAAAAAAAA1", name: "Multi", type: APP, sdk: "auto", platforms: "iphoneos iphonesimulator macosx xros" }]), "Multi.xcodeproj/xcshareddata/xcschemes/Multi.xcscheme": scheme("Multi", "Multi") }), ALL)!;
    expect(d.checks).toHaveLength(1);
  });
  test("a project with no saved schemes still gets its targets as schemes (Xcode makes them on its own)", () => {
    const d = detectNative(project({ "Shop.xcodeproj/project.pbxproj": pbx([mac]) }), ALL)!;
    expect(d.setup.schemes.map((s) => s.name)).toEqual(["Shop"]);
    expect(d.checks[0].command).toContain("-scheme 'Shop'");
  });
  test("a workspace is built with -workspace", () => {
    const d = detectNative(project({ "Shop.xcworkspace/contents.xcworkspacedata": '<?xml version="1.0"?>\n<Workspace version = "1.0">\n   <FileRef location = "group:Shop.xcodeproj">\n   </FileRef>\n   <FileRef location = "group:Pods/Pods.xcodeproj">\n   </FileRef>\n</Workspace>\n', "Shop.xcodeproj/project.pbxproj": pbx([mac]), "Shop.xcodeproj/xcshareddata/xcschemes/Shop.xcscheme": scheme("Shop", "Shop") }), ALL)!;
    expect(d.checks[0].command).toContain("xcodebuild -workspace 'Shop.xcworkspace' -scheme 'Shop'");
  });
  test("the schemes are shown to the person in About this project", () => {
    const d = detectNative(project({ "Shop.xcodeproj/project.pbxproj": pbx([mac]), "Shop.xcodeproj/xcshareddata/xcschemes/Shop.xcscheme": scheme("Shop", "Shop") }), ALL)!;
    expect(d.setup.hints.join(" ")).toMatch(/Schemes: Shop \(Mac\)/);
  });
  test("a scheme file written without spaces around = is read too", () => {
    const tight = scheme("Shop", "Shop").replace(/ = /g, "=");
    const d = detectNative(project({ "Shop.xcodeproj/project.pbxproj": pbx([mac]), "Shop.xcodeproj/xcshareddata/xcschemes/Shop.xcscheme": tight }), ALL)!;
    expect(d.checks).toHaveLength(1);
  });
  test("a scheme name with a quote in it is only ever a name", () => {
    const d = xcodePlan({ container: { kind: "project", name: "Shop.xcodeproj" }, scheme: "Shop'; rm -rf ~; '", testScheme: null, skipTesting: [], developerDir: null });
    expect(d.checks[0].command).toContain(`-scheme 'Shop'\\''; rm -rf ~; '\\'''`);
  });
  test("Xcode itself missing (only the command line tools) is a plain gap; an Xcode that is installed but not selected is used through DEVELOPER_DIR", () => {
    const files = { "Shop.xcodeproj/project.pbxproj": pbx([mac]), "Shop.xcodeproj/xcshareddata/xcschemes/Shop.xcscheme": scheme("Shop", "Shop") };
    const gap = detectNative(project(files), { has: (t) => t !== "xcodebuild", home: "/nonexistent-home" })!;
    expect(gap.checks).toEqual([]);
    expect(gap.setup.missing).toMatch(/Xcode is not installed/);
    expect(gap.setup.missing).toContain("App Store");
    const alt = detectNative(project(files), { has: (t) => t !== "xcodebuild", xcodeApp: "/Applications/Xcode.app/Contents/Developer", home: "/nonexistent-home" })!;
    expect(alt.setup.missing).toBeNull();
    expect(alt.checks[0].command.startsWith("DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer' xcodebuild ")).toBe(true);
  });
});

describe("what a project says about itself in About this project", () => {
  test("the note says plainly that a build may download packages, and that Companion tries without first", () => {
    const d = detectNative(project({ "pom.xml": POM }), ALL)!;
    expect(d.setup.note).toMatch(/may download/);
    expect(d.setup.note).toMatch(/internet/);
    expect(d.setup.note).toMatch(/install setting/);
  });
  test("how to run it is a suggestion for the person, never started by a check", () => {
    expect(detectNative(project({ "go.mod": GO_MOD }), ALL)!.setup.run).toBe("go run .");
    expect(detectNative(project({ "Cargo.toml": CARGO }), ALL)!.setup.run).toBe("cargo run");
    expect(detectNative(project({ "Package.swift": "" }), ALL)!.setup.run).toBe("swift run");
    expect(detectNative(project({ "pom.xml": POM.replace("</project>", "<parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>") }), ALL)!.setup.run).toBe("mvn spring-boot:run");
  });
  test("a web server framework is named but its server is not started on its own", () => {
    for (const files of <Record<string, string>[]>[{ "go.mod": GO_MOD + "\nrequire github.com/gin-gonic/gin v1.9.1\n" }, { "pom.xml": POM.replace("</project>", "<parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>") }, { "Cargo.toml": CARGO + '\n[dependencies]\naxum = "0.7"\n' }]) {
      const det = detectProject(project(files));
      expect(det.start).toBeNull();
      expect(det.native?.stackNote).toBeTruthy();
    }
  });
  test("only the project's own .claude/launch.json says how to start a server, and then it is used", () => {
    const det = detectProject(project({ "go.mod": GO_MOD, "main.go": "package main\n", ".claude/launch.json": JSON.stringify({ configurations: [{ runtimeExecutable: "go", runtimeArgs: ["run", "."], port: 8080 }] }) }));
    expect(det.start).toMatchObject({ kind: "server", command: "go run .", port: 8080, from: "launch" });
  });
  test("a plain index.html next to a Go or Rust project is not served on its own", () => {
    expect(detectProject(project({ "go.mod": GO_MOD, "index.html": "<h1>hi</h1>" })).start).toBeNull();
    expect(detectProject(project({ "Cargo.toml": CARGO, "dist/index.html": "<h1>hi</h1>" })).start).toBeNull();
  });
});

describe("through detectProject", () => {
  test("checks and tests come from the native plan, and the setup is kept for the ladder", () => {
    const det = detectProject(project({ "go.mod": GO_MOD, "main.go": "package main\n", "main_test.go": "package main\n" }), undefined, undefined, ALL);
    expect(det.kind).toBe("native");
    expect(det.packageManager).toBeNull();
    expect(det.checks.map((c) => c.name)).toEqual(["build", "lint"]);
    expect(det.checks[0].offline).toContain("GOPROXY=off");
    expect(det.tests?.tool).toBe("go");
    expect(det.native?.ecosystem).toBe("go");
  });
});
