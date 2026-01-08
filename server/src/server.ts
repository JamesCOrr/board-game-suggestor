import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { User } from "./entity/User";
import { Parser } from "xml2js";
import { CollectionGame } from "./entity/CollectionGame";
import { Game } from "./entity/Game";
import { GameMechanic } from "./entity/GameMechanic";

dotenv.config();
const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT;
const parser = new Parser();

AppDataSource.initialize().then(async () => {
    const user = new User()
    user.userName = "James_Orr"
    await AppDataSource.manager.save(user)
}).catch(error => console.log(error))


// Health check endpoint
app.get("/", (request: Request, response: Response) => {
  response.status(200).json({
    message: "Board Game Suggester API",
    status: "running",
    version: "1.0.0"
  });
});

// API Routes

// Get user's board game collection from BoardGameGeek
app.get("/api/user/collections/:username", async (request: Request, response: Response) => {
  try {
    const username = request.params.username || '';

    const requestUrl = `${process.env.BGG_BASE_URL}collection?username=${username}&stats=1`;

    const bggResponse = await fetch(requestUrl, {
      headers: {
        'Accept': 'application/xml',
        'Authorization': `Bearer ${process.env.BGG_API_KEY}`
      }
    });

    if (!bggResponse.ok) {
      return response.status(bggResponse.status).json({
        error: 'Failed to fetch collection from BoardGameGeek',
        status: bggResponse.status
      });
    }

    const xmlData = await bggResponse.text();

    if (xmlData.includes('message="Your request for this collection has been accepted')) {
      return response.status(202).json({
        message: 'Collection is being loaded by BoardGameGeek, please retry in a few seconds',
        retry: true
      });
    }


    parser.parseString(xmlData, function (err, result) {
      response.set('Content-Type', 'application/json');
      const jsonData = result;

      // TODO: Make game object shape
      jsonData.items.item.forEach(async (game: any) => {
        const collectionGame = new CollectionGame();
        collectionGame.bggId = game.$.objectid;
        collectionGame.gameName = game.name[0]._;
        collectionGame.userName = username;
        collectionGame.userRating = game.stats[0].rating[0].$.value;
        try {
          await AppDataSource.manager.save(collectionGame);
        } catch (e) {
          console.error(e);
        }
      });

      response.send(jsonData);
    });


    
  } catch (error) {
    console.error('Error fetching BGG collection:', error);
    response.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get("/api/games/:username", async (request: Request, response: Response) => {
  try {
    const username = request.params.username || '';

    if (username === '') {
      return response.status(400).json({
        error: 'Username is required'
      });
    }

    // Get all games from user's collection
    const collectionGames = await AppDataSource
      .getRepository(CollectionGame)
      .createQueryBuilder("collection_game")
      .where("collection_game.userName = :username", { username })
      .getMany();

    if (collectionGames.length === 0) {
      return response.status(404).json({
        error: 'No games found for this user',
        username
      });
    }

    // Extract all bggIds from collection
    const bggIds = collectionGames.map(cg => cg.bggId);

    // Check which games already exist in the database
    const existingGames = await AppDataSource
      .getRepository(Game)
      .createQueryBuilder("game")
      .where("game.bggId IN (:...ids)", { ids: bggIds })
      .getMany();

    const existingBggIds = new Set(existingGames.map(g => g.bggId));
    const missingBggIds = bggIds.filter(id => !existingBggIds.has(id));

    console.log(`Found ${existingGames.length} games in database, fetching ${missingBggIds.length} from BGG`);

    // Batch missing IDs into groups of 20
    const batchSize = 20;
    const batches: number[][] = [];
    for (let i = 0; i < missingBggIds.length; i += batchSize) {
      batches.push(missingBggIds.slice(i, i + batchSize));
    }

    // Fetch and parse each batch
    const newlyFetchedGames: Game[] = [];
    for (const batch of batches) {
      const requestUrl = `${process.env.BGG_BASE_URL}thing?id=${batch.join(',')}&stats=1`;

      try {
        const bggResponse = await fetch(requestUrl, {
          headers: {
            'Accept': 'application/xml',
            'Authorization': `Bearer ${process.env.BGG_API_KEY}`
          }
        });

        if (!bggResponse.ok) {
          console.error(`Failed to fetch batch: ${bggResponse.status}`);
          continue;
        }

        const xmlData = await bggResponse.text();

        // Parse XML to JSON
        await new Promise<void>((resolve, reject) => {
          parser.parseString(xmlData, async (err, result) => {
            if (err) {
              console.error('Error parsing batch:', err);
              return resolve();
            }

            try {
              const items = result.items.item;
              if (!items) {
                return resolve();
              }

              // Process each game in the batch
              for (const gameData of items) {
                const gameEntity = new Game();
                gameEntity.bggId = parseInt(gameData.$.id);
                gameEntity.gameName = Array.isArray(gameData.name)
                  ? gameData.name.find((n: any) => n.$.type === 'primary')?.$.value || gameData.name[0].$.value
                  : gameData.name.$.value;
                gameEntity.bggLink = `https://boardgamegeek.com/boardgame/${gameData.$.id}`;
                gameEntity.bggImageLink = gameData.image?.[0] || '';

                await AppDataSource.manager.save(gameEntity);
                newlyFetchedGames.push(gameEntity);
              }

              resolve();
            } catch (e) {
              console.error('Error processing batch:', e);
              resolve();
            }
          });
        });
      } catch (error) {
        console.error('Error fetching batch:', error);
      }
    }

    // Combine existing and newly fetched games
    const allGames = [...existingGames, ...newlyFetchedGames];

    // Create a map for quick lookup
    const gameMap = new Map(allGames.map(g => [g.bggId, g]));

    // Combine game data with user collection data
    const combinedGames = collectionGames.map(collectionGame => {
      const game = gameMap.get(collectionGame.bggId);
      if (!game) return null;

      return {
        bggId: game.bggId,
        gameName: game.gameName,
        bggLink: game.bggLink,
        bggImageLink: game.bggImageLink,
        userRating: collectionGame.userRating
      };
    }).filter(g => g !== null);

    response.status(200).json({
      username,
      totalGames: combinedGames.length,
      fromCache: existingGames.length,
      fromApi: newlyFetchedGames.length,
      games: combinedGames
    });

  } catch (error) {
    console.error('Error fetching games:', error);
    response.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Populate mechanics for games in the database
app.get("/api/populate-mechanics", async (request: Request, response: Response) => {
  try {
    // Get all games from the database
    const allGames = await AppDataSource
      .getRepository(Game)
      .createQueryBuilder("game")
      .leftJoinAndSelect("game.gameMechanics", "mechanics")
      .getMany();

    if (allGames.length === 0) {
      return response.status(404).json({
        error: 'No games found in database'
      });
    }

    // Filter games that don't have mechanics yet (optional - can be removed to refresh all)
    const gamesNeedingMechanics = allGames.filter(game => !game.gameMechanics || game.gameMechanics.length === 0);

    if (gamesNeedingMechanics.length === 0) {
      return response.status(200).json({
        message: 'All games already have mechanics populated',
        totalGames: allGames.length
      });
    }

    console.log(`Populating mechanics for ${gamesNeedingMechanics.length} games`);

    // Batch games into groups of 20
    const batchSize = 20;
    const batches: Game[][] = [];
    for (let i = 0; i < gamesNeedingMechanics.length; i += batchSize) {
      batches.push(gamesNeedingMechanics.slice(i, i + batchSize));
    }

    let totalMechanicsAdded = 0;
    let gamesProcessed = 0;

    // Process each batch
    for (const batch of batches) {
      const bggIds = batch.map(g => g.bggId).join(',');
      const requestUrl = `${process.env.BGG_BASE_URL}thing?id=${bggIds}&stats=1`;

      try {
        const bggResponse = await fetch(requestUrl, {
          headers: {
            'Accept': 'application/xml',
            'Authorization': `Bearer ${process.env.BGG_API_KEY}`
          }
        });

        if (!bggResponse.ok) {
          console.error(`Failed to fetch batch: ${bggResponse.status}`);
          continue;
        }

        const xmlData = await bggResponse.text();

        // Parse XML to JSON
        await new Promise<void>((resolve, reject) => {
          parser.parseString(xmlData, async (err, result) => {
            if (err) {
              console.error('Error parsing batch:', err);
              return resolve();
            }

            try {
              const items = result.items.item;
              if (!items) {
                return resolve();
              }

              // Process each game in the batch
              for (const gameData of items) {
                const bggId = parseInt(gameData.$.id);
                const game = batch.find(g => g.bggId === bggId);

                if (!game) continue;

                // Extract mechanics from the game data
                // Mechanics are in links with type="boardgamemechanic"
                const links = gameData.link || [];
                const mechanics = links.filter((link: any) => link.$.type === 'boardgamemechanic');

                // Save each mechanic
                for (const mechanic of mechanics) {
                  const gameMechanic = new GameMechanic();
                  gameMechanic.mechanicName = mechanic.$.value;
                  gameMechanic.gameBggId = game.bggId;
                  gameMechanic.game = game;

                  try {
                    await AppDataSource.manager.save(gameMechanic);
                    totalMechanicsAdded++;
                  } catch (e) {
                    console.error(`Error saving mechanic for game ${bggId}:`, e);
                  }
                }

                gamesProcessed++;
              }

              resolve();
            } catch (e) {
              console.error('Error processing batch:', e);
              resolve();
            }
          });
        });

        // Be nice to BGG API - add a small delay between batches
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error('Error fetching batch:', error);
      }
    }

    response.status(200).json({
      message: 'Mechanics population complete',
      gamesProcessed,
      totalMechanicsAdded,
      totalGamesInDb: allGames.length,
      gamesNeedingMechanics: gamesNeedingMechanics.length
    });

  } catch (error) {
    console.error('Error populating mechanics:', error);
    response.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get("/api/game/:id", async (request: Request, response: Response) => {
  try {
    const id = request.params.id;

    const requestUrl = `${process.env.BGG_BASE_URL}thing?id=${id}`;

    const bggResponse = await fetch(requestUrl, {
      headers: {
        'Accept': 'application/xml',
        'Authorization': `Bearer ${process.env.BGG_API_KEY}`
      }
    });

    if (!bggResponse.ok) {
      return response.status(bggResponse.status).json({
        error: 'Failed to fetch collection from BoardGameGeek',
        status: bggResponse.status
      });
    }

    const xmlData = await bggResponse.text();

    if (xmlData.includes('message="Your request for this collection has been accepted')) {
      return response.status(202).json({
        message: 'Item is being loaded by BoardGameGeek, please retry in a few seconds',
        retry: true
      });
    }

    // Return the XML data
    response.set('Content-Type', 'application/xml');
    response.send(xmlData);

  } catch (error) {
    console.error('Error fetching BGG item:', error);
    response.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});


// TODO: Get game suggestions based on preferences
app.post("/api/suggestions", (request: Request, response: Response) => {
  const { players, duration, complexity, category } = request.body;

  // TODO: Implement logic to fetch/filter games based on preferences
  // For now, return mock data
  response.json({
    message: "Game suggestions endpoint",
    preferences: {
      players,
      duration,
      complexity,
      category
    },
    suggestions: [
      {
        id: 1,
        name: "Sample Board Game",
        players: "2-4",
        duration: "60 minutes",
        complexity: "medium"
      }
    ]
  });
});

app.listen(PORT, () => { 
  console.log("Server running at PORT: ", PORT); 
}).on("error", (error: any) => {
  // gracefully handle error
  throw new Error(error.message);
});
