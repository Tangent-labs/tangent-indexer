import { execSync } from "child_process"
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

interface PackageJson {
  dependencies?: Record<string, string>
  [key: string]: any
}

try {
  // Read current package.json
  const packagePath = join(process.cwd(), "package.json")
  const pkg: PackageJson = JSON.parse(readFileSync(packagePath, "utf-8"))

  // check the dependency is  present in the package.json
  const currentDep = pkg.devDependencies?.["@tangent/prisma-schema-shared"]
  if (!currentDep) {
    console.error("Error: @tangent/prisma-schema-shared not found in dependencies")
    process.exit(1)
  }

  // get the current branch name.
  const match = currentDep.match(/#(.+)$/)
  const branch = match?.at(1) || "main"

  // remove the dependency ( from package.json , package-lock.json and node_modules)
  console.log("Removing @tangent/prisma-schema-shared")
  execSync(`npm remove @tangent/prisma-schema-shared`)

  // reinstall the dependency with the same branch
  pkg.devDependencies["@tangent/prisma-schema-shared"] = `github:Tangent-labs/prisma-schema-shared#${branch}`
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n")
  console.log("Installing @tangent/prisma-schema-shared")
  execSync(`npm install`)

  console.log("✓ Done!")
} catch (error) {
  console.error("Error:", error instanceof Error ? error.message : error)
  process.exit(1)
}
