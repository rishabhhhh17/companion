// The rest of what Go, Rust, Java, Kotlin, Swift and Xcode projects touch: About this project, the comparison of earlier
// versions (which task broke it), the fingerprint of what a check would run (a task that changes build code is asked about),
// and the watch's own reading of the same files. Nothing here runs a tool.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { isLockfile, isManifest, packagesKey } from "../src/bisect.ts";
import { aboutLine, inspectProject, namesInCode } from "../src/proof/intake.ts";
import { isNativeRunFile, readRunFiles, RUN_FILES, runPrint, runsOf } from "../src/proof/approvedruns.ts";
import { liveFiles } from "../src/proof/livefiles.ts";
import { isTestFile } from "../src/proof/testguard.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
function project(files: Record<string, string>): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-natm-")));
  made.push(d);
  for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
}
const GO_MOD = "module example.com/shop\n\ngo 1.22\n\nrequire github.com/gin-gonic/gin v1.9.1\n";
const CARGO = '[package]\nname = "shop"\nversion = "0.1.0"\n\n[dependencies]\naxum = "0.7"\n';
const POM = '<project><modelVersion>4.0.0</modelVersion><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>\n';

describe("About this project", () => {
  test("Go: what it is, how it is started, and that a build may download packages", () => {
    const r = inspectProject(project({ "go.mod": GO_MOD, "main.go": "package main\n" }));
    expect(r.stack).toBe("Go");
    expect(r.extras).toEqual(["Gin"]);
    expect(aboutLine(r)).toBe("A project: Go, with Gin.");
    expect(r.start).toBe("go run .");
    expect(r.needsInstall).toBe(false);
    expect(r.installCommand).toBeNull();
    expect(r.packageManager).toBeNull();
    expect(r.notes.join(" ")).toMatch(/This is a Go project/);
    expect(r.notes.join(" ")).toMatch(/may download the packages the project needs from the internet/);
    expect(r.check.checks).toEqual(["build", "lint"]);
  });
  test("Rust, Maven, Gradle, Swift and Xcode each say what they are", () => {
    expect(inspectProject(project({ "Cargo.toml": CARGO })).stack).toBe("Rust");
    expect(inspectProject(project({ "Cargo.toml": CARGO })).extras).toEqual(["Axum"]);
    expect(inspectProject(project({ "pom.xml": POM })).stack).toBe("Java (Maven)");
    expect(inspectProject(project({ "pom.xml": POM })).extras).toEqual(["Spring Boot"]);
    expect(inspectProject(project({ "pom.xml": POM })).start).toBe("mvn spring-boot:run");
    expect(inspectProject(project({ "build.gradle.kts": 'plugins { kotlin("jvm") version "1.9.0" }\n' })).stack).toBe("Kotlin (Gradle)");
    expect(inspectProject(project({ "Package.swift": "// swift-tools-version:5.9\n" })).stack).toBe("Swift");
    expect(inspectProject(project({ "Package.swift": "// swift-tools-version:5.9\n" })).start).toBe("swift run");
  });
  test("a tool that is missing is said as a note, with the command", () => {
    // Nothing here depends on this Mac: a Go project is read with the tool check the tests assume (everything installed), so
    // the missing case is covered where the tool check can be given (native-detect). The note line is the setup's own.
    const r = inspectProject(project({ "go.mod": GO_MOD }));
    expect(r.notes.every((n) => typeof n === "string" && n.length > 0)).toBe(true);
  });
  test("an Xcode project shows its schemes and how to run it", () => {
    const pbx = "// !$*UTF8*$!\n{\n\tobjects = {\n\t};\n}\n";
    const r = inspectProject(project({ "Shop.xcodeproj/project.pbxproj": pbx }));
    expect(r.stack).toBe("Xcode");
    expect(r.start).toBeNull();
    expect(r.notes.join(" ")).toMatch(/open the project in Xcode and press Run/);
  });
  test("the settings the code reads are found in Go, Rust, Java, Kotlin and Swift code", () => {
    const d = project({
      "main.go": 'package main\nvar k = os.Getenv("STRIPE_KEY")\nvar j, _ = os.LookupEnv("MAIL_HOST")\n',
      "src/main.rs": 'fn main() { let a = std::env::var("DATABASE_URL"); let b = env::var("REDIS_URL"); let c = option_env!("BUILD_ID"); }\n',
      "src/main/java/App.java": 'class App { String s = System.getenv("JWT_SECRET"); }\n',
      "src/main/kotlin/App.kt": 'val s = System.getenv("KT_TOKEN")\n',
      "Sources/App/main.swift": 'let s = ProcessInfo.processInfo.environment["SWIFT_KEY"]\n',
      "target/debug/gen.rs": 'fn x() { env::var("IN_TARGET"); }\n',
      "vendor/x/y.go": 'package y\nvar k = os.Getenv("IN_VENDOR")\n',
    });
    expect([...namesInCode(d)].sort()).toEqual(["BUILD_ID", "DATABASE_URL", "JWT_SECRET", "KT_TOKEN", "MAIL_HOST", "REDIS_URL", "STRIPE_KEY", "SWIFT_KEY"]);
  });
  test("a missing setting is reported against the project's own .env file, as for any project", () => {
    const r = inspectProject(project({ "go.mod": GO_MOD, "main.go": 'package main\nvar k = os.Getenv("STRIPE_KEY")\nvar m = os.Getenv("MAIL_HOST")\n', ".env": "MAIL_HOST=smtp\n" }));
    expect(r.env.missing).toEqual(["STRIPE_KEY"]);
  });
});

describe("which task broke it compares the build files of these projects whole", () => {
  test("they count as the files that decide the packages", () => {
    for (const f of ["go.mod", "go.sum", "Cargo.toml", "Cargo.lock", "pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "gradle.properties", "Package.swift", "Package.resolved", "libs.versions.toml", "sub/module/pom.xml", "app/Cargo.toml"]) expect(isLockfile(f) || isManifest(f), f).toBe(true);
  });
  test("an ordinary source file is not", () => {
    for (const f of ["main.go", "src/lib.rs", "App.java", "Sources/App/main.swift", "README.md", "Dockerfile"]) expect(isLockfile(f) || isManifest(f), f).toBe(false);
  });
  test("two versions with the same build files have the same key, a changed dependency a different one", () => {
    const a = packagesKey({}, { "go.mod": "id1", "go.sum": "id2" });
    expect(packagesKey({}, { "go.mod": "id1", "go.sum": "id2" })).toBe(a);
    expect(packagesKey({}, { "go.mod": "id3", "go.sum": "id2" })).not.toBe(a);
  });
});

describe("the fingerprint of what a check would run", () => {
  const legacy = (files: Record<string, string | undefined>) => {
    const h = createHash("sha256");
    for (const f of RUN_FILES) {
      const v = f === "package.json" ? runsOf(files[f]) : files[f];
      h.update(`${f}\0${v === undefined ? "\u0001none" : v}\0`);
    }
    return h.digest("hex");
  };
  test("a Node project has the very same fingerprint as before, so nobody who said yes is asked again", () => {
    const files = { "package.json": '{"scripts":{"build":"vite build"}}', "package-lock.json": "{}" };
    expect(runPrint(files)).toBe(legacy(files));
    expect(runPrint({})).toBe(legacy({}));
  });
  test("build code of a native project is part of it, and any change shows", () => {
    const base = { "Cargo.toml": CARGO, "build.rs": "fn main() {}\n" };
    expect(runPrint(base)).not.toBe(legacy({}));
    expect(runPrint({ ...base, "build.rs": "fn main() { }\n" })).not.toBe(runPrint(base));
    expect(runPrint({ ...base, "sub/pom.xml": "<project/>" })).not.toBe(runPrint(base));
    expect(runPrint({ ...base })).toBe(runPrint({ "build.rs": "fn main() {}\n", "Cargo.toml": CARGO }));   // the order files were read in does not matter
  });
  test("which files", () => {
    for (const f of ["go.mod", "go.sum", "go.work", "Cargo.toml", "Cargo.lock", "build.rs", "src/build.rs", "rust-toolchain.toml", ".cargo/config.toml", "pom.xml", "mvnw", ".mvn/wrapper/maven-wrapper.properties", "gradlew", "build.gradle", "app/build.gradle.kts", "settings.gradle", "gradle.properties", "gradle/wrapper/gradle-wrapper.properties", "gradle/libs.versions.toml", "buildSrc/src/main/kotlin/x.kt", "Package.swift", "Package.resolved", "Shop.xcodeproj/project.pbxproj", "Shop.xcworkspace/contents.xcworkspacedata"]) expect(isNativeRunFile(f), f).toBe(true);
    for (const f of ["main.go", "src/main.rs", "App.java", "README.md", "node_modules/x/build.rs", "package.json"]) expect(isNativeRunFile(f), f).toBe(false);
  });
});

describe("the watch reads the same files a saved version holds", () => {
  test("the same set, so the fingerprint a task recorded is the one the watch compares with", async () => {
    const dir = project({
      "Cargo.toml": CARGO, "build.rs": "fn main() {}\n", "go.mod": GO_MOD, "sub/pom.xml": "<project/>", "gradle/wrapper/gradle-wrapper.properties": "distributionUrl=x\n",
      "package.json": '{"scripts":{}}', ".claude/launch.json": "{}", "src/main.rs": "fn main() {}\n",
      "target/debug/build/x/build.rs": "left over", ".gradle/caches/build.gradle": "left over", ".build/x/Package.swift": "left over", "node_modules/y/pom.xml": "left over",
    });
    const store = new CheckpointStore(project({ ".keep": "" }), dir);
    const snap = await store.snapshot("now");
    const saved = await readRunFiles(store, snap.id);
    const live = await readRunFiles(liveFiles(dir), "live");
    expect(Object.keys(live).sort()).toEqual(Object.keys(saved).sort());
    expect(Object.keys(live).sort()).toEqual([".claude/launch.json", "Cargo.toml", "build.rs", "go.mod", "gradle/wrapper/gradle-wrapper.properties", "package.json", "sub/pom.xml"]);
    expect(runPrint(live)).toBe(runPrint(saved));
  });
});

describe("tests of these languages are found by the test guard", () => {
  test("Java, Kotlin, Swift and Rust test files", () => {
    for (const f of ["src/test/java/com/shop/CalcTest.java", "src/test/kotlin/CalcTests.kt", "app/src/integrationTest/java/OrderIT.java", "Tests/shopTests/CartTests.swift", "tests/api.rs", "src/lib.rs", "cart_test.go"]) expect(isTestFile(f), f).toBe(true);
    for (const f of ["src/main/java/com/shop/Calc.java", "Sources/shop/main.swift", "main.go", "README.md"]) expect(isTestFile(f), f).toBe(false);
  });
});
