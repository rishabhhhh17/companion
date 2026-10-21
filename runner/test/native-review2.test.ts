// Second review round for the Go, Rust, Java, Kotlin, Swift and Xcode checks: finding tests wherever they are, the files a
// check asks about, and wrappers that look cached but would still download. Files are only written to temporary folders.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { detectNative } from "../src/proof/native.ts";
import { isNativeBinaryRunFile, isNativeRunFile, readRunFiles, runPrint } from "../src/proof/approvedruns.ts";
import { liveFiles } from "../src/proof/livefiles.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
function project(files: Record<string, string | Buffer>): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-nat2-")));
  made.push(d);
  for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
}
const ALL = { has: () => true, home: "/nonexistent-home" };
const GO_MOD = "module example.com/shop\n\ngo 1.22\n";
const POM = '<project><modelVersion>4.0.0</modelVersion><groupId>com.shop</groupId><artifactId>shop</artifactId><version>1.0</version></project>\n';

describe("tests are found wherever the project keeps them", () => {
  test("a Java test in a normal four part package, deeper than any old depth limit", () => {
    const d = detectNative(project({ "pom.xml": POM, "src/test/java/com/example/shop/service/impl/OrderTest.java": "class OrderTest {}" }), ALL)!;
    expect(d.tests?.command).toBe("mvn -B -q test");
  });
  test("a Java test in a folder named build, out or target below src/test", () => {
    for (const dir of ["build", "out", "target", "dist", "vendor"]) {
      const d = detectNative(project({ "pom.xml": POM, [`src/test/java/com/shop/${dir}/XTest.java`]: "class XTest {}" }), ALL)!;
      expect(d.tests, dir).not.toBeNull();
    }
  });
  test("many main files do not use up the room before src/test is reached", () => {
    const files: Record<string, string> = { "pom.xml": POM, "src/test/java/AppTest.java": "class AppTest {}" };
    for (let i = 0; i < 6500; i++) files[`src/main/java/gen/F${i}.java`] = "";
    expect(detectNative(project(files), ALL)!.tests).not.toBeNull();
  });
  test("a test in a module, and in an integrationTest source set", () => {
    expect(detectNative(project({ "pom.xml": POM, "services/api/src/test/java/ApiTest.java": "class ApiTest {}" }), ALL)!.tests).not.toBeNull();
    expect(detectNative(project({ "build.gradle": "plugins { id 'java' }\n", "src/integrationTest/java/OrderIT.java": "class OrderIT {}" }), ALL)!.tests).not.toBeNull();
    expect(detectNative(project({ "build.gradle.kts": "plugins { kotlin(\"jvm\") }\n", "src/jvmMain/test/Foo.kt": "class FooTest" }), ALL)!.tests).not.toBeNull();
  });
  test("main code only is still no tests", () => {
    expect(detectNative(project({ "pom.xml": POM, "src/main/java/a/b/c/d/e/f/g/h/App.java": "class App {}" }), ALL)!.tests).toBeNull();
    expect(detectNative(project({ "pom.xml": POM, "build/classes/test/XTest.java": "x" }), ALL)!.tests).toBeNull();
  });
  test("Go: a test in internal/build, and a test eight folders down", () => {
    expect(detectNative(project({ "go.mod": GO_MOD, "internal/build/pkg_test.go": "package build\n" }), ALL)!.tests?.command).toContain("go test ./...");
    expect(detectNative(project({ "go.mod": GO_MOD, "a/b/c/d/e/f/g/h/x_test.go": "package h\n" }), ALL)!.tests).not.toBeNull();
    expect(detectNative(project({ "go.mod": GO_MOD, "out/x_test.go": "package out\n" }), ALL)!.tests).not.toBeNull();
  });
  test("Go: a vendor folder's tests are not the project's", () => {
    expect(detectNative(project({ "go.mod": GO_MOD, "vendor/github.com/x/y/y_test.go": "package y\n" }), ALL)!.tests).toBeNull();
  });
  test("the room is counted for each folder searched, not for the whole project", () => {
    const files: Record<string, string> = { "go.mod": GO_MOD };
    for (let i = 0; i < 7000; i++) files[`aaa/f${i}.txt`] = "";
    files["zzz/last_test.go"] = "package zzz\n";
    expect(detectNative(project(files), ALL)!.tests).not.toBeNull();
  });
  test("Rust: a test in a crate deep in the workspace", () => {
    expect(detectNative(project({ "Cargo.toml": '[workspace]\nmembers = ["crates/*"]\n', "crates/a/b/c/d/e/f/src/lib.rs": "#[test]\nfn t() {}\n" }), ALL)!.tests).not.toBeNull();
  });
});

describe("a wrapper counts as cached only when it really would not download", () => {
  const MVN = { "pom.xml": POM, mvnw: "#!/bin/sh\n", ".mvn/wrapper/maven-wrapper.properties": "distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.6/apache-maven-3.9.6-bin.zip\nwrapperUrl=https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.1.1/maven-wrapper-3.1.1.jar\n" };
  const dist = { ".m2/wrapper/dists/apache-maven-3.9.6-bin/abc123/apache-maven-3.9.6/bin/mvn": "x" };
  test("Maven: a mvnw that names a wrapper jar it does not have downloads it, even offline", () => {
    const home = project(dist);
    expect(detectNative(project(MVN), { has: (t) => t === "java", home })!.checks[0].offline).toBeNull();
    expect(detectNative(project({ ...MVN, ".mvn/wrapper/maven-wrapper.jar": "jar" }), { has: (t) => t === "java", home })!.checks[0].offline).toBe("sh ./mvnw -B -q -o compile");
  });
  test("Maven: a wrapper with no jar to fetch only needs the distribution", () => {
    const files = { ...MVN, ".mvn/wrapper/maven-wrapper.properties": "distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.6/apache-maven-3.9.6-bin.zip\n" };
    expect(detectNative(project(files), { has: (t) => t === "java", home: project(dist) })!.checks[0].offline).toBe("sh ./mvnw -B -q -o compile");
  });
  test("Maven: an empty hash folder is a half finished download, not a cached Maven", () => {
    const home = project({ ".m2/wrapper/dists/apache-maven-3.9.6-bin/abc123/.keep": "" });
    expect(detectNative(project({ ...MVN, ".mvn/wrapper/maven-wrapper.jar": "jar" }), { has: (t) => t === "java", home })!.checks[0].offline).toBeNull();
  });
  const GRADLE = { "build.gradle": "plugins { id 'java' }\n", gradlew: "#!/bin/sh\n", "gradle/wrapper/gradle-wrapper.properties": "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.5-bin.zip\n" };
  test("Gradle: a hash folder with only a half downloaded zip is not cached; the .ok marker or the unpacked tool is", () => {
    const half = project({ ".gradle/wrapper/dists/gradle-8.5-bin/xyz/gradle-8.5-bin.zip.part": "x" });
    expect(detectNative(project(GRADLE), { has: (t) => t === "java", home: half })!.checks[0].offline).toBeNull();
    const empty = project({ ".gradle/wrapper/dists/gradle-8.5-bin/xyz/.keep": "" });
    expect(detectNative(project(GRADLE), { has: (t) => t === "java", home: empty })!.checks[0].offline).toBeNull();
    const ok = project({ ".gradle/wrapper/dists/gradle-8.5-bin/xyz/gradle-8.5-bin.zip.ok": "" });
    expect(detectNative(project(GRADLE), { has: (t) => t === "java", home: ok })!.checks[0].offline).toContain("--offline");
    const unpacked = project({ ".gradle/wrapper/dists/gradle-8.5-bin/xyz/gradle-8.5/bin/gradle": "x" });
    expect(detectNative(project(GRADLE), { has: (t) => t === "java", home: unpacked })!.checks[0].offline).toContain("--offline");
  });
});

describe("what a check asks about when a task changes it", () => {
  test("wrapper jars, script plugins, init scripts, schemes, xcconfig files, SwiftPM plugins and Maven extensions", () => {
    for (const f of [
      ".mvn/extensions.xml", ".mvn/wrapper/MavenWrapperDownloader.java",
      "gradle/deps.gradle", "deps.gradle.kts", "init.gradle", "app/gradle/publish.gradle", "Shop.xcodeproj/xcshareddata/xcschemes/Shop.xcscheme", "Shop.xcodeproj/xcuserdata/me.xcuserdatad/xcschemes/Mine.xcscheme",
      "Config/Debug.xcconfig", "Plugins/Gen/plugin.swift", "app/Plugins/Gen/plugin.swift", "Package@swift-5.9.swift",
    ]) expect(isNativeRunFile(f), f).toBe(true);
    for (const f of ["gradle/wrapper/gradle-wrapper.jar", ".mvn/wrapper/maven-wrapper.jar", "app/gradle/wrapper/gradle-wrapper.jar"]) { expect(isNativeBinaryRunFile(f), f).toBe(true); expect(isNativeRunFile(f), f).toBe(false); }
    expect(isNativeBinaryRunFile("vendor/x/gradle-wrapper.jar")).toBe(false);
  });
  test("folders the person did not write are never asked about", () => {
    for (const f of ["vendor/x/go.mod", "vendor/github.com/y/Cargo.toml", "Pods/Pods.xcodeproj/project.pbxproj", "Carthage/Checkouts/x/Package.swift", "build/tmp/init.gradle", "target/x/build.rs", ".build/checkouts/x/Package.swift", ".gradle/x/build.gradle", "DerivedData/x/y.xcscheme", "node_modules/x/pom.xml"]) expect(isNativeRunFile(f), f).toBe(false);
  });
  test("a jar is fingerprinted by its bytes, from a saved version and from the folder as it is", async () => {
    const dir = project({ "gradle/wrapper/gradle-wrapper.jar": Buffer.from([0x50, 0x4b, 0xff, 0xfe, 1]), "build.gradle": "plugins {}\n" });
    const store = new CheckpointStore(project({ ".keep": "" }), dir);
    const snap = await store.snapshot("now");
    const saved = await readRunFiles(store, snap.id);
    const live = await readRunFiles(liveFiles(dir), "live");
    expect(Object.keys(saved)).toContain("gradle/wrapper/gradle-wrapper.jar");
    expect(runPrint(live)).toBe(runPrint(saved));
    // A different jar that is the same text once decoded as text is still a different fingerprint.
    const other = project({ "gradle/wrapper/gradle-wrapper.jar": Buffer.from([0x50, 0x4b, 0xfd, 0xfc, 1]), "build.gradle": "plugins {}\n" });
    const store2 = new CheckpointStore(project({ ".keep": "" }), other);
    const snap2 = await store2.snapshot("now");
    expect(runPrint(await readRunFiles(store2, snap2.id))).not.toBe(runPrint(saved));
    expect(runPrint(await readRunFiles(liveFiles(other), "live"))).not.toBe(runPrint(live));
  });
  test("the watch and a saved version agree when a vendor folder has build files in it", async () => {
    const dir = project({ "go.mod": GO_MOD, "vendor/x/go.mod": "module x\n", "Pods/Pods.xcodeproj/project.pbxproj": "{}", "Carthage/Checkouts/a/Package.swift": "//", "a/b/c/d/e/f/g/h/pom.xml": "<project/>" });
    const store = new CheckpointStore(project({ ".keep": "" }), dir);
    const snap = await store.snapshot("now");
    const saved = await readRunFiles(store, snap.id);
    const live = await readRunFiles(liveFiles(dir), "live");
    expect(Object.keys(live).sort()).toEqual(Object.keys(saved).sort());
    expect(Object.keys(live).sort()).toEqual(["a/b/c/d/e/f/g/h/pom.xml", "go.mod"]);
    expect(runPrint(live)).toBe(runPrint(saved));
  });
});
