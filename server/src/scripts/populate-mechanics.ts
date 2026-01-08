import "reflect-metadata";
import { AppDataSource } from "../data-source";
import { Game } from "../entity/Game";
import { GameMechanic } from "../entity/GameMechanic";
import { Parser } from "xml2js";
import dotenv from "dotenv";

dotenv.config();

const parser = new Parser();

async function populateMechanics() {
  console.log("🚀 Starting game mechanics population...\n");

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

    // Get all games from the database
    const allGames = await AppDataSource
      .getRepository(Game)
      .createQueryBuilder("game")
      .leftJoinAndSelect("game.gameMechanics", "mechanics")
      .getMany();

    if (allGames.length === 0) {
      console.log("❌ No games found in database");
      console.log("💡 Run the collection import first to populate games\n");
      await AppDataSource.destroy();
      process.exit(0);
    }

    console.log(`📊 Found ${allGames.length} total games in database`);

    // Filter games that don't have mechanics yet
    const gamesNeedingMechanics = allGames.filter(
      (game) => !game.gameMechanics || game.gameMechanics.length === 0
    );

    if (gamesNeedingMechanics.length === 0) {
      console.log("✅ All games already have mechanics populated!");
      await AppDataSource.destroy();
      process.exit(0);
    }

    console.log(`🔍 ${gamesNeedingMechanics.length} games need mechanics`);
    console.log(`📦 Processing in batches of 20...\n`);

    // Batch games into groups of 20
    const batchSize = 20;
    const batches: Game[][] = [];
    for (let i = 0; i < gamesNeedingMechanics.length; i += batchSize) {
      batches.push(gamesNeedingMechanics.slice(i, i + batchSize));
    }

    let totalMechanicsAdded = 0;
    let gamesProcessed = 0;

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      if (!batch || batch.length === 0) {
        console.log(`[Batch ${batchIndex + 1}/${batches.length}] Empty batch, skipping...`);
        continue;
      }

      const bggIds = batch.map((g) => g.bggId).join(",");

      if (!bggIds) {
        console.log(`[Batch ${batchIndex + 1}/${batches.length}] No valid BGG IDs, skipping...`);
        continue;
      }

      const requestUrl = `${process.env.BGG_BASE_URL}thing?id=${bggIds}&stats=1`;

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
          console.error(
            `   ❌ Failed to fetch batch: ${bggResponse.status}`
          );
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

                const bggId = parseInt(gameData.$.id);
                const game = batch.find((g) => g.bggId === bggId);

                if (!game) {
                  console.log(`   ⚠️  Game ${bggId} not found in batch, skipping`);
                  continue;
                }

                // Extract mechanics from the game data
                const links = gameData.link || [];
                const mechanics = links.filter(
                  (link: any) => link && link.$ && link.$.type === "boardgamemechanic"
                );

                // Save each mechanic
                for (const mechanic of mechanics) {
                  if (!mechanic || !mechanic.$ || !mechanic.$.value) {
                    console.log(`   ⚠️  Invalid mechanic data for game ${bggId}, skipping`);
                    continue;
                  }

                  const gameMechanic = new GameMechanic();
                  gameMechanic.mechanicName = mechanic.$.value;
                  gameMechanic.gameBggId = game.bggId;
                  gameMechanic.game = game;

                  try {
                    await AppDataSource.manager.save(gameMechanic);
                    totalMechanicsAdded++;
                  } catch (e) {
                    console.error(
                      `   ⚠️  Error saving mechanic for game ${bggId}:`,
                      e instanceof Error ? e.message : e
                    );
                  }
                }

                gamesProcessed++;
              }

              console.log(
                `   ✅ Processed ${items.length} games, added mechanics`
              );
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
    console.log("✨ Mechanics population complete!");
    console.log("=".repeat(50));
    console.log(`📊 Games processed: ${gamesProcessed}`);
    console.log(`🎯 Total mechanics added: ${totalMechanicsAdded}`);
    if (gamesProcessed > 0) {
      console.log(
        `📈 Average mechanics per game: ${(totalMechanicsAdded / gamesProcessed).toFixed(1)}`
      );
    }
    console.log("=".repeat(50) + "\n");

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error populating mechanics:");
    console.error(error instanceof Error ? error.message : error);

    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    process.exit(1);
  }
}

// Run the script
populateMechanics();
