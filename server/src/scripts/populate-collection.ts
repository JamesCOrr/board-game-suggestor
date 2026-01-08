import "reflect-metadata";
import { AppDataSource } from "../data-source";
import { CollectionGame } from "../entity/CollectionGame";
import { Parser } from "xml2js";
import dotenv from "dotenv";

dotenv.config();

const parser = new Parser();

async function populateCollection() {
  const username = process.argv[2];

  if (!username) {
    console.error("❌ Error: Username is required");
    console.log("Usage: npm run populate-collection <username>");
    console.log("Example: npm run populate-collection James_Orr\n");
    process.exit(1);
  }

  console.log(`🚀 Starting collection import for user: ${username}\n`);

  try {
    // Check for required environment variables
    if (!process.env.BGG_BASE_URL) {
      console.error("❌ BGG_BASE_URL environment variable is not set");
      process.exit(1);
    }

    // Initialize database connection
    console.log("📡 Connecting to database...");
    await AppDataSource.initialize();
    console.log("✅ Database connected\n");

    // Fetch collection from BGG
    const requestUrl = `${process.env.BGG_BASE_URL}collection?username=${username}&stats=1`;
    console.log(`🔍 Fetching collection from BGG for user: ${username}...`);

    const bggResponse = await fetch(requestUrl, {
      headers: {
        Accept: "application/xml",
        Authorization: `Bearer ${process.env.BGG_API_KEY}`,
      },
    });

    if (!bggResponse.ok) {
      console.error(
        `❌ Failed to fetch collection from BoardGameGeek: ${bggResponse.status}`
      );
      await AppDataSource.destroy();
      process.exit(1);
    }

    const xmlData = await bggResponse.text();

    // Check if BGG is still loading the collection
    if (xmlData.includes('message="Your request for this collection has been accepted')) {
      console.log("⏳ Collection is being loaded by BoardGameGeek");
      console.log("💡 Please wait a few seconds and try again\n");
      await AppDataSource.destroy();
      process.exit(0);
    }

    console.log("✅ Collection data fetched from BGG\n");
    console.log("💾 Parsing and saving to database...\n");

    // Parse XML and save to database
    await new Promise<number>((resolve, reject) => {
      parser.parseString(xmlData, async (err, result) => {
        if (err) {
          console.error("❌ Error parsing XML:", err.message);
          return reject(err);
        }

        try {
          if (!result || !result.items || !result.items.item) {
            console.log("⚠️  No games found in collection");
            return resolve(0);
          }

          const items = result.items.item;
          let savedCount = 0;
          let errorCount = 0;

          for (const game of items) {
            try {
              if (!game || !game.$ || !game.name || !game.name[0]) {
                console.log("⚠️  Skipping invalid game data");
                errorCount++;
                continue;
              }

              const collectionGame = new CollectionGame();
              collectionGame.bggId = parseInt(game.$.objectid);
              collectionGame.gameName = game.name[0]._;
              collectionGame.userName = username;
              collectionGame.userRating = game.stats?.[0]?.rating?.[0]?.$?.value || "0";

              await AppDataSource.manager.save(collectionGame);
              savedCount++;

              if (savedCount % 10 === 0) {
                console.log(`   📦 Saved ${savedCount} games...`);
              }
            } catch (e) {
              console.error(
                `   ⚠️  Error saving game ${game.name?.[0]?._}:`,
                e instanceof Error ? e.message : e
              );
              errorCount++;
            }
          }

          console.log("\n" + "=".repeat(50));
          console.log("✨ Collection import complete!");
          console.log("=".repeat(50));
          console.log(`👤 Username: ${username}`);
          console.log(`✅ Games saved: ${savedCount}`);
          if (errorCount > 0) {
            console.log(`⚠️  Errors: ${errorCount}`);
          }
          console.log("=".repeat(50) + "\n");

          resolve(savedCount);
        } catch (e) {
          console.error("❌ Error processing collection:", e instanceof Error ? e.message : e);
          reject(e);
        }
      });
    });

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error importing collection:");
    console.error(error instanceof Error ? error.message : error);

    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    process.exit(1);
  }
}

// Run the script
populateCollection();
