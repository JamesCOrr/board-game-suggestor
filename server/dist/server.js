"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
require("reflect-metadata");
const data_source_1 = require("./data-source");
const User_1 = require("./entity/User");
const xml2js_1 = require("xml2js");
const CollectionGame_1 = require("./entity/CollectionGame");
const Game_1 = require("./entity/Game");
const GameMechanic_1 = require("./entity/GameMechanic");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const PORT = process.env.PORT;
const parser = new xml2js_1.Parser();
data_source_1.AppDataSource.initialize().then(async () => {
    const user = new User_1.User();
    user.userName = "James_Orr";
    await data_source_1.AppDataSource.manager.save(user);
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
            jsonData.items.item.forEach(async (game) => {
                const collectionGame = new CollectionGame_1.CollectionGame();
                collectionGame.bggId = game.$.objectid;
                collectionGame.gameName = game.name[0]._;
                collectionGame.userName = username;
                collectionGame.userRating = game.stats[0].rating[0].$.value;
                try {
                    await data_source_1.AppDataSource.manager.save(collectionGame);
                }
                catch (e) {
                    console.error(e);
                }
            });
            response.send(jsonData);
        });
    }
    catch (error) {
        console.error('Error fetching BGG collection:', error);
        response.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
app.get("/api/games/:username", async (request, response) => {
    try {
        const username = request.params.username || '';
        if (username === '') {
            return response.status(400).json({
                error: 'Username is required'
            });
        }
        // Get all games from user's collection
        const collectionGames = await data_source_1.AppDataSource
            .getRepository(CollectionGame_1.CollectionGame)
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
        const existingGames = await data_source_1.AppDataSource
            .getRepository(Game_1.Game)
            .createQueryBuilder("game")
            .where("game.bggId IN (:...ids)", { ids: bggIds })
            .getMany();
        const existingBggIds = new Set(existingGames.map(g => g.bggId));
        const missingBggIds = bggIds.filter(id => !existingBggIds.has(id));
        console.log(`Found ${existingGames.length} games in database, fetching ${missingBggIds.length} from BGG`);
        // Batch missing IDs into groups of 20
        const batchSize = 20;
        const batches = [];
        for (let i = 0; i < missingBggIds.length; i += batchSize) {
            batches.push(missingBggIds.slice(i, i + batchSize));
        }
        // Fetch and parse each batch
        const newlyFetchedGames = [];
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
                await new Promise((resolve, reject) => {
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
                                const gameEntity = new Game_1.Game();
                                gameEntity.bggId = parseInt(gameData.$.id);
                                gameEntity.gameName = Array.isArray(gameData.name)
                                    ? gameData.name.find((n) => n.$.type === 'primary')?.$.value || gameData.name[0].$.value
                                    : gameData.name.$.value;
                                gameEntity.bggLink = `https://boardgamegeek.com/boardgame/${gameData.$.id}`;
                                gameEntity.bggImageLink = gameData.image?.[0] || '';
                                await data_source_1.AppDataSource.manager.save(gameEntity);
                                newlyFetchedGames.push(gameEntity);
                            }
                            resolve();
                        }
                        catch (e) {
                            console.error('Error processing batch:', e);
                            resolve();
                        }
                    });
                });
            }
            catch (error) {
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
            if (!game)
                return null;
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
    }
    catch (error) {
        console.error('Error fetching games:', error);
        response.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Populate mechanics for games in the database
app.get("/api/populate-mechanics", async (request, response) => {
    try {
        // Get all games from the database
        const allGames = await data_source_1.AppDataSource
            .getRepository(Game_1.Game)
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
        const batches = [];
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
                await new Promise((resolve, reject) => {
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
                                if (!game)
                                    continue;
                                // Extract mechanics from the game data
                                // Mechanics are in links with type="boardgamemechanic"
                                const links = gameData.link || [];
                                const mechanics = links.filter((link) => link.$.type === 'boardgamemechanic');
                                // Save each mechanic
                                for (const mechanic of mechanics) {
                                    const gameMechanic = new GameMechanic_1.GameMechanic();
                                    gameMechanic.mechanicName = mechanic.$.value;
                                    gameMechanic.gameBggId = game.bggId;
                                    gameMechanic.game = game;
                                    try {
                                        await data_source_1.AppDataSource.manager.save(gameMechanic);
                                        totalMechanicsAdded++;
                                    }
                                    catch (e) {
                                        console.error(`Error saving mechanic for game ${bggId}:`, e);
                                    }
                                }
                                gamesProcessed++;
                            }
                            resolve();
                        }
                        catch (e) {
                            console.error('Error processing batch:', e);
                            resolve();
                        }
                    });
                });
                // Be nice to BGG API - add a small delay between batches
                if (batches.indexOf(batch) < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            catch (error) {
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
    }
    catch (error) {
        console.error('Error populating mechanics:', error);
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