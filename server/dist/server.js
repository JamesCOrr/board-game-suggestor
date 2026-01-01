"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const mysql2_1 = __importDefault(require("mysql2"));
require("reflect-metadata");
const data_source_1 = require("./data-source");
const User_1 = require("./entity/User");
// configures dotenv to work in your application
dotenv_1.default.config();
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const PORT = process.env.PORT;
// Create the connection to database
const connection = mysql2_1.default.createConnection({
    host: `${process.env.MYSQL_HOST}`,
    user: `${process.env.MYSQL_USER}`,
    password: `${process.env.MYSQL_PASSWORD}`,
    database: `${process.env.MYSQL_DATABASE}`,
});
connection.query('SELECT * FROM `test`', function (err, results, fields) {
    console.log(results); // results contains rows returned by server
    console.log(fields); // fields contains extra meta data about results, if available
});
data_source_1.AppDataSource.initialize().then(async () => {
    console.log("Inserting a new user into the database...");
    const user = new User_1.User();
    user.userName = "James_Orr";
    await data_source_1.AppDataSource.manager.save(user);
    console.log("Saved a new user with id: " + user.id);
    console.log("Loading users from the database...");
    const users = await data_source_1.AppDataSource.manager.find(User_1.User);
    console.log("Loaded users: ", users);
    console.log("Here you can setup and run express / fastify / any other framework.");
}).catch(error => console.log(error));
// Health check endpoint
app.get("/", (request, response) => {
    response.status(200).json({
        message: "Board Game Suggester API",
        status: "running",
        version: "1.0.0"
    });
});
// API Routes
// Get user's board game collection from BoardGameGeek
app.get("/api/user/collections/:username", async (request, response) => {
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
    }
    catch (error) {
        console.error('Error fetching BGG collection:', error);
        response.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
app.get("/api/game/:id", async (request, response) => {
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
    }
    catch (error) {
        console.error('Error fetching BGG item:', error);
        response.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// TODO: Get game suggestions based on preferences
app.post("/api/suggestions", (request, response) => {
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
}).on("error", (error) => {
    // gracefully handle error
    throw new Error(error.message);
});
//# sourceMappingURL=server.js.map