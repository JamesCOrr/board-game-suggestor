import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { User } from "./entity/User";
import { Parser } from "xml2js";
import { CollectionGame } from "./entity/CollectionGame";
import { Game } from "./entity/Game";

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

// WIP - TODO: Prevent requesting data for games that are already saved to database, request 20 ids at a time to reduce request count
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

    // Fetch detailed game data for each game in the collection
    const gameDetailsPromises = collectionGames.map(async (collectionGame) => {
      const requestUrl = `${process.env.BGG_BASE_URL}thing?id=${collectionGame.bggId}&stats=1`;

      try {
        const bggResponse = await fetch(requestUrl, {
          headers: {
            'Accept': 'application/xml',
            'Authorization': `Bearer ${process.env.BGG_API_KEY}`
          }
        });

        if (!bggResponse.ok) {
          console.error(`Failed to fetch game ${collectionGame.bggId}: ${bggResponse.status}`);
          return null;
        }

        const xmlData = await bggResponse.text();

        // Parse XML to JSON
        return new Promise((resolve, reject) => {
          parser.parseString(xmlData, async (err, result) => {
            if (err) {
              console.error(`Error parsing game ${collectionGame.bggId}:`, err);
              return resolve(null);
            }

            try {
              const gameData = result.items.item[0];

              // Save/update game in database
              const gameEntity = new Game();
              gameEntity.bggId = parseInt(gameData.$.id);
              gameEntity.gameName = Array.isArray(gameData.name)
                ? gameData.name.find((n: any) => n.$.type === 'primary')?.$.value || gameData.name[0].$.value
                : gameData.name.$.value;
              gameEntity.bggLink = `https://boardgamegeek.com/boardgame/${gameData.$.id}`;
              gameEntity.bggImageLink = gameData.image?.[0] || '';

              await AppDataSource.manager.save(gameEntity);

              // Return combined data
              resolve({
                bggId: gameEntity.bggId,
                gameName: gameEntity.gameName,
                bggImageLink: gameEntity.bggImageLink,
                userRating: collectionGame.userRating,
                yearPublished: gameData.yearpublished?.[0]?.$.value,
                minPlayers: gameData.minplayers?.[0]?.$.value,
                maxPlayers: gameData.maxplayers?.[0]?.$.value,
                playingTime: gameData.playingtime?.[0]?.$.value,
                minPlayTime: gameData.minplaytime?.[0]?.$.value,
                maxPlayTime: gameData.maxplaytime?.[0]?.$.value,
                minAge: gameData.minage?.[0]?.$.value,
                description: gameData.description?.[0],
                averageRating: gameData.statistics?.[0]?.ratings?.[0]?.average?.[0]?.$.value,
                bggRank: gameData.statistics?.[0]?.ratings?.[0]?.ranks?.[0]?.rank?.find((r: any) => r.$.id === '1')?.$.value
              });
            } catch (e) {
              console.error(`Error processing game ${collectionGame.bggId}:`, e);
              resolve(null);
            }
          });
        });
      } catch (error) {
        console.error(`Error fetching game ${collectionGame.bggId}:`, error);
        return null;
      }
    });

    // Wait for all game details to be fetched
    const allGameDetails = await Promise.all(gameDetailsPromises);

    // Filter out any failed fetches
    const successfulGames = allGameDetails.filter(game => game !== null);

    response.status(200).json({
      username,
      totalGames: successfulGames.length,
      games: successfulGames
    });

  } catch (error) {
    console.error('Error fetching games:', error);
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
