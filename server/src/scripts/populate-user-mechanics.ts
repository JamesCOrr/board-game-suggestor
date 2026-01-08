import "reflect-metadata";
import { AppDataSource } from "../data-source";
import { CollectionGame } from "../entity/CollectionGame";
import { GameMechanic } from "../entity/GameMechanic";
import { UserMechanic } from "../entity/UserMechanic";
import dotenv from "dotenv";

dotenv.config();

async function populateUserMechanics() {
  const username = process.argv[2];

  if (!username) {
    console.error("❌ Error: Username is required");
    console.log("Usage: npm run populate-user-mechanics <username>");
    console.log("Example: npm run populate-user-mechanics James_Orr\n");
    process.exit(1);
  }

  console.log(`🚀 Starting user mechanics calculation for: ${username}\n`);

  try {
    // Initialize database connection
    console.log("📡 Connecting to database...");
    await AppDataSource.initialize();
    console.log("✅ Database connected\n");

    // Get all games in user's collection with ratings
    console.log(`🔍 Fetching collection for user: ${username}...`);
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

    // Get all mechanics for these games
    const bggIds = collectionGames.map((cg) => cg.bggId);
    console.log(`🔍 Fetching mechanics for ${bggIds.length} games...`);

    const gameMechanics = await AppDataSource
      .getRepository(GameMechanic)
      .createQueryBuilder("game_mechanic")
      .where("game_mechanic.gameBggId IN (:...ids)", { ids: bggIds })
      .getMany();

    if (gameMechanics.length === 0) {
      console.log("❌ No mechanics found for these games");
      console.log("💡 Run 'npm run populate-mechanics' first\n");
      await AppDataSource.destroy();
      process.exit(0);
    }

    console.log(`✅ Found ${gameMechanics.length} mechanic entries\n`);

    // Create a map of bggId -> userRating
    const ratingMap = new Map<number, number>();
    for (const game of collectionGames) {
      const rating = parseFloat(game.userRating);
      if (!isNaN(rating) && rating > 0) {
        ratingMap.set(game.bggId, rating);
      }
    }

    console.log(`📊 ${ratingMap.size} games have valid ratings\n`);

    // Group mechanics by mechanicName and calculate averages
    const mechanicRatings = new Map<string, number[]>();

    for (const mechanic of gameMechanics) {
      const rating = ratingMap.get(mechanic.gameBggId);
      if (rating !== undefined) {
        if (!mechanicRatings.has(mechanic.mechanicName)) {
          mechanicRatings.set(mechanic.mechanicName, []);
        }
        mechanicRatings.get(mechanic.mechanicName)!.push(rating);
      }
    }

    console.log(`🎯 Calculated ratings for ${mechanicRatings.size} unique mechanics\n`);
    console.log("💾 Saving user mechanic ratings...\n");

    let savedCount = 0;
    let errorCount = 0;

    for (const [mechanicName, ratings] of mechanicRatings.entries()) {
      try {
        const sum = ratings.reduce((acc, rating) => acc + rating, 0);
        const average = sum / ratings.length;

        const userMechanic = new UserMechanic();
        userMechanic.userName = username;
        userMechanic.mechanicName = mechanicName;
        userMechanic.averageRating = parseFloat(average.toFixed(2));
        userMechanic.gameCount = ratings.length;

        await AppDataSource.manager.save(userMechanic);
        savedCount++;

        if (savedCount % 10 === 0) {
          console.log(`   📦 Saved ${savedCount} mechanics...`);
        }
      } catch (e) {
        console.error(
          `   ⚠️  Error saving mechanic "${mechanicName}":`,
          e instanceof Error ? e.message : e
        );
        errorCount++;
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("✨ User mechanics calculation complete!");
    console.log("=".repeat(50));
    console.log(`👤 Username: ${username}`);
    console.log(`🎮 Total games in collection: ${collectionGames.length}`);
    console.log(`⭐ Games with ratings: ${ratingMap.size}`);
    console.log(`🎯 Unique mechanics found: ${mechanicRatings.size}`);
    console.log(`✅ Mechanics saved: ${savedCount}`);
    if (errorCount > 0) {
      console.log(`⚠️  Errors: ${errorCount}`);
    }
    console.log("=".repeat(50) + "\n");

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error calculating user mechanics:");
    console.error(error instanceof Error ? error.message : error);

    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    process.exit(1);
  }
}

// Run the script
populateUserMechanics();
