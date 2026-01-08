import { spawn } from "child_process";
import path from "path";

const username = process.argv[2];

if (!username) {
  console.error("❌ Error: Username is required");
  console.log("Usage: npm run populate-all <username>");
  console.log("Example: npm run populate-all James_Orr\n");
  process.exit(1);
}

console.log(`🚀 Starting full data population for user: ${username}\n`);
console.log("This will run the following scripts in order:");
console.log("  1. populate-collection");
console.log("  2. populate-games");
console.log("  3. populate-mechanics");
console.log("  4. populate-user-mechanics\n");
console.log("=".repeat(50) + "\n");

function runScript(scriptPath: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath, ...args], {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

async function populateAll(user: string) {
  const scriptsDir = path.join(process.cwd(), "dist", "scripts");

  try {
    // Step 1: Populate collection
    console.log("📋 Step 1/4: Populating collection...\n");
    await runScript(path.join(scriptsDir, "populate-collection.js"), [user]);
    console.log("\n");

    // Step 2: Populate games
    console.log("🎮 Step 2/4: Populating game details...\n");
    await runScript(path.join(scriptsDir, "populate-games.js"), [user]);
    console.log("\n");

    // Step 3: Populate mechanics
    console.log("⚙️  Step 3/4: Populating game mechanics...\n");
    await runScript(path.join(scriptsDir, "populate-mechanics.js"));
    console.log("\n");

    // Step 4: Populate user mechanics
    console.log("📊 Step 4/4: Calculating user mechanic ratings...\n");
    await runScript(path.join(scriptsDir, "populate-user-mechanics.js"), [user]);
    console.log("\n");

    console.log("=".repeat(50));
    console.log("🎉 All data population complete!");
    console.log("=".repeat(50));
    console.log(`✅ User ${user} is fully populated and ready to use\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n" + "=".repeat(50));
    console.error("❌ Population failed!");
    console.error("=".repeat(50));
    console.error(error instanceof Error ? error.message : error);
    console.error("\n");
    process.exit(1);
  }
}

populateAll(username);
