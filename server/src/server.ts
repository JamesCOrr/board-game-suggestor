import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import mysql from 'mysql2';
import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { User } from "./entity/User";
import { Parser } from "xml2js";
import { CollectionGame } from "./entity/CollectionGame";


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

    let jsonData;

    parser.parseString(xmlData, function (err, result) {
      response.set('Content-Type', 'application/json');
      jsonData = result;

      // TODO: Make game object shape
      jsonData.items.item.forEach(async (game: any) => {
        const collectionGame = new CollectionGame();
        collectionGame.bggId = game.$.objectid;
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
