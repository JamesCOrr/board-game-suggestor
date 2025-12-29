import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";

// configures dotenv to work in your application
dotenv.config();
const app = express();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT;

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
    // Get username from URL params or use default
    const username = request.params.username || 'James_Orr';

    // Build BGG API URL
    const requestUrl = `${process.env.BGG_BASE_URL}collection?username=${username}&stats=1`;

    console.log(`Fetching collection for user: ${username}`);

    // Fetch from BoardGameGeek API
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

    // BGG returns XML, so we'll return it as text
    // You may want to parse this to JSON on the client or use an XML parser here
    const xmlData = await bggResponse.text();

    // Check if BGG is asking us to retry (they do this when data is being cached)
    if (xmlData.includes('message="Your request for this collection has been accepted')) {
      return response.status(202).json({
        message: 'Collection is being loaded by BoardGameGeek, please retry in a few seconds',
        retry: true
      });
    }

    // Return the XML data
    response.set('Content-Type', 'application/xml');
    response.send(xmlData);

  } catch (error) {
    console.error('Error fetching BGG collection:', error);
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
