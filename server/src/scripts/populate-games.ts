import "reflect-metadata";
import { AppDataSource } from "../data-source";
import { CollectionGame } from "../entity/CollectionGame";
import { Game } from "../entity/Game";
import { Parser } from "xml2js";
import dotenv from "dotenv";

dotenv.config();

const parser = new Parser();

async function populateGames() {
  const username = process.argv[2];

  if (!username) {
    console.error("❌ Error: Username is required");
    console.log("Usage: npm run populate-games <username>");
    console.log("Example: npm run populate-games James_Orr\n");
    process.exit(1);
  }

  console.log(`🚀 Starting game data population for user: ${username}\n`);

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

    // Get all games from user's collection
    console.log(`🔍 Looking up collection for user: ${username}...`);
    const collectionGames = await AppDataSource
      .getRepository(CollectionGame)
      .createQueryBuilder("collection_game")
      .where("collection_game.userName = :username", { username })
      .getMany();

    if (collectionGames.length === 0) {
      console.log("❌ No games found in collection for this user");
      console.log("💡 Run 'npm run populate-collection <username>' first\n");
      await AppDataSource.destroy();
      process.exit(0);
    }

    console.log(`✅ Found ${collectionGames.length} games in collection\n`);

    // Extract all bggIds from collection
    const bggIds = collectionGames.map((cg) => cg.bggId);

    // Check which games already exist in the database
    console.log("🔍 Checking which games already exist in database...");
    const existingGames = await AppDataSource
      .getRepository(Game)
      .createQueryBuilder("game")
      .where("game.bggId IN (:...ids)", { ids: bggIds })
      .getMany();

    const existingBggIds = new Set(existingGames.map((g) => g.bggId));
    const missingBggIds = bggIds.filter((id) => !existingBggIds.has(id));

    console.log(`✅ Found ${existingGames.length} games already in database`);
    console.log(`📥 Need to fetch ${missingBggIds.length} games from BGG\n`);

    if (missingBggIds.length === 0) {
      console.log("✨ All games already populated!");
      console.log("=".repeat(50) + "\n");
      await AppDataSource.destroy();
      process.exit(0);
    }

    // Batch missing IDs into groups of 20
    const batchSize = 20;
    const batches: number[][] = [];
    for (let i = 0; i < missingBggIds.length; i += batchSize) {
      batches.push(missingBggIds.slice(i, i + batchSize));
    }

    console.log(`📦 Processing ${batches.length} batches of games...\n`);

    // Fetch and parse each batch
    const newlyFetchedGames: Game[] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      if (!batch || batch.length === 0) {
        console.log(`[Batch ${batchIndex + 1}/${batches.length}] Empty batch, skipping...`);
        continue;
      }

      const requestUrl = `${process.env.BGG_BASE_URL}thing?id=${batch.join(",")}&stats=1`;

      console.log(
        `[Batch ${batchIndex + 1}/${batches.length}] Fetching ${batch.length} games...`
      );

      try {
        const bggResponse = await fetch(requestUrl, {
          headers: {
            Accept: "application/xml",
            Authorization: `Bearer ${process.env.BGG_API_KEY}`,
          },
        });

        if (!bggResponse.ok) {
          console.error(`   ❌ Failed to fetch batch: ${bggResponse.status}`);
          continue;
        }

        const xmlData = await bggResponse.text();

        // Parse XML to JSON
        await new Promise<void>((resolve, reject) => {
          parser.parseString(xmlData, async (err, result) => {
            if (err) {
              console.error("   ❌ Error parsing batch:", err.message);
              return resolve();
            }

            try {
              if (!result || !result.items || !result.items.item) {
                console.log("   ⚠️  No items in response");
                return resolve();
              }

              const items = result.items.item;

              // Process each game in the batch
              for (const gameData of items) {
                if (!gameData || !gameData.$ || !gameData.$.id) {
                  console.log("   ⚠️  Invalid game data, skipping");
                  continue;
                }

                try {
                  const gameEntity = new Game();
                  gameEntity.bggId = parseInt(gameData.$.id);
                  gameEntity.gameName = Array.isArray(gameData.name)
                    ? gameData.name.find((n: any) => n.$.type === "primary")?.$.value ||
                      gameData.name[0].$.value
                    : gameData.name.$.value;
                  gameEntity.bggLink = `https://boardgamegeek.com/boardgame/${gameData.$.id}`;
                  gameEntity.bggImageLink = gameData.image?.[0] || "";

                  await AppDataSource.manager.save(gameEntity);
                  newlyFetchedGames.push(gameEntity);
                } catch (e) {
                  console.error(
                    `   ⚠️  Error saving game ${gameData.$.id}:`,
                    e instanceof Error ? e.message : e
                  );
                }
              }

              console.log(`   ✅ Processed ${items.length} games`);
              resolve();
            } catch (e) {
              console.error(
                "   ❌ Error processing batch:",
                e instanceof Error ? e.message : e
              );
              resolve();
            }
          });
        });

        // Be nice to BGG API - add delay between batches
        if (batchIndex < batches.length - 1) {
          console.log("   ⏳ Waiting 1 second before next batch...\n");
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(
          "   ❌ Error fetching batch:",
          error instanceof Error ? error.message : error
        );
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("✨ Game data population complete!");
    console.log("=".repeat(50));
    console.log(`👤 Username: ${username}`);
    console.log(`📊 Total games in collection: ${collectionGames.length}`);
    console.log(`💾 Games already in database: ${existingGames.length}`);
    console.log(`📥 Newly fetched games: ${newlyFetchedGames.length}`);
    console.log(`✅ Total games now in database: ${existingGames.length + newlyFetchedGames.length}`);
    console.log("=".repeat(50) + "\n");

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error populating games:");
    console.error(error instanceof Error ? error.message : error);

    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    process.exit(1);
  }
}

// Run the script
populateGames();
