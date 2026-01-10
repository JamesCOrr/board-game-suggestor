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
const UserMechanic_1 = require("./entity/UserMechanic");
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
data_source_1.AppDataSource.initialize();
// Health check endpoint
app.get("/", (request, response) => {
    response.status(200).json({
        message: "Board Game Suggester API",
        status: "running",
        version: "1.0.0"
    });
});
// API Routes
// Populate all data for a user (collection, games, mechanics, user mechanics)
app.get("/api/user/collection/:username", async (request, response) => {
    try {
        const username = request.params.username || '';
        if (!username) {
            return response.status(400).json({
                error: 'Username is required'
            });
        }
        // Step 0: Create or check for user entity
        const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
        let user = await userRepo.findOne({ where: { userName: username } });
        if (!user) {
            user = new User_1.User();
            user.userName = username;
            await userRepo.save(user);
        }
        // Step 1: Populate collection
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
        // Parse and save collection data
        const collectionResult = await new Promise((resolve, reject) => {
            parser.parseString(xmlData, async (err, result) => {
                if (err) {
                    return reject(err);
                }
                try {
                    if (!result || !result.items || !result.items.item) {
                        return resolve(0);
                    }
                    const items = result.items.item;
                    let savedCount = 0;
                    for (const game of items) {
                        try {
                            if (!game || !game.$ || !game.name || !game.name[0]) {
                                continue;
                            }
                            const collectionGame = new CollectionGame_1.CollectionGame();
                            collectionGame.bggId = parseInt(game.$.objectid);
                            collectionGame.gameName = game.name[0]._;
                            collectionGame.userName = username;
                            collectionGame.userRating = game.stats?.[0]?.rating?.[0]?.$?.value || "0";
                            await data_source_1.AppDataSource.manager.save(collectionGame);
                            savedCount++;
                        }
                        catch (e) {
                            // Skip if already exists or other error
                            continue;
                        }
                    }
                    resolve(savedCount);
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        // Step 2: Populate game metadata
        const collectionGames = await data_source_1.AppDataSource
            .getRepository(CollectionGame_1.CollectionGame)
            .createQueryBuilder("collection_game")
            .where("collection_game.userName = :username", { username })
            .getMany();
        if (collectionGames.length === 0) {
            return response.status(404).json({
                error: 'No games found in collection',
                username
            });
        }
        const bggIds = collectionGames.map(cg => cg.bggId);
        const existingGames = await data_source_1.AppDataSource
            .getRepository(Game_1.Game)
            .createQueryBuilder("game")
            .where("game.bggId IN (:...ids)", { ids: bggIds })
            .getMany();
        const existingBggIds = new Set(existingGames.map(g => g.bggId));
        const missingBggIds = bggIds.filter(id => !existingBggIds.has(id));
        // Fetch missing games in batches
        const batchSize = 20;
        const batches = [];
        for (let i = 0; i < missingBggIds.length; i += batchSize) {
            batches.push(missingBggIds.slice(i, i + batchSize));
        }
        const newlyFetchedGames = [];
        for (const batch of batches) {
            if (!batch || batch.length === 0)
                continue;
            const gameRequestUrl = `${process.env.BGG_BASE_URL}thing?id=${batch.join(",")}&stats=1`;
            try {
                const gameResponse = await fetch(gameRequestUrl, {
                    headers: {
                        'Accept': 'application/xml',
                        'Authorization': `Bearer ${process.env.BGG_API_KEY}`
                    }
                });
                if (!gameResponse.ok) {
                    continue;
                }
                const gameXmlData = await gameResponse.text();
                await new Promise((resolve, reject) => {
                    parser.parseString(gameXmlData, async (err, result) => {
                        if (err) {
                            return resolve();
                        }
                        try {
                            if (!result || !result.items || !result.items.item) {
                                return resolve();
                            }
                            const items = result.items.item;
                            for (const gameData of items) {
                                if (!gameData || !gameData.$ || !gameData.$.id) {
                                    continue;
                                }
                                try {
                                    const gameEntity = new Game_1.Game();
                                    gameEntity.bggId = parseInt(gameData.$.id);
                                    gameEntity.gameName = Array.isArray(gameData.name)
                                        ? gameData.name.find((n) => n.$.type === "primary")?.$.value || gameData.name[0].$.value
                                        : gameData.name.$.value;
                                    gameEntity.bggLink = `https://boardgamegeek.com/boardgame/${gameData.$.id}`;
                                    gameEntity.bggImageLink = gameData.image?.[0] || "";
                                    await data_source_1.AppDataSource.manager.save(gameEntity);
                                    newlyFetchedGames.push(gameEntity);
                                }
                                catch (e) {
                                    // Skip if error
                                    continue;
                                }
                            }
                            resolve();
                        }
                        catch (e) {
                            resolve();
                        }
                    });
                });
                // Small delay between batches
                if (batches.indexOf(batch) < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            catch (error) {
                // Continue with next batch
                continue;
            }
        }
        // Step 3: Populate mechanics for all games
        const allGames = await data_source_1.AppDataSource
            .getRepository(Game_1.Game)
            .createQueryBuilder("game")
            .leftJoinAndSelect("game.gameMechanics", "mechanics")
            .where("game.bggId IN (:...ids)", { ids: bggIds })
            .getMany();
        const gamesNeedingMechanics = allGames.filter(game => !game.gameMechanics || game.gameMechanics.length === 0);
        const mechanicBatches = [];
        for (let i = 0; i < gamesNeedingMechanics.length; i += batchSize) {
            mechanicBatches.push(gamesNeedingMechanics.slice(i, i + batchSize));
        }
        let totalMechanicsAdded = 0;
        for (const batch of mechanicBatches) {
            if (!batch || batch.length === 0)
                continue;
            const mechanicBggIds = batch.map(g => g.bggId).join(',');
            if (!mechanicBggIds)
                continue;
            const mechanicRequestUrl = `${process.env.BGG_BASE_URL}thing?id=${mechanicBggIds}&stats=1`;
            try {
                const mechanicResponse = await fetch(mechanicRequestUrl, {
                    headers: {
                        'Accept': 'application/xml',
                        'Authorization': `Bearer ${process.env.BGG_API_KEY}`
                    }
                });
                if (!mechanicResponse.ok) {
                    continue;
                }
                const mechanicXmlData = await mechanicResponse.text();
                await new Promise((resolve, reject) => {
                    parser.parseString(mechanicXmlData, async (err, result) => {
                        if (err) {
                            return resolve();
                        }
                        try {
                            if (!result || !result.items || !result.items.item) {
                                return resolve();
                            }
                            const items = result.items.item;
                            for (const gameData of items) {
                                if (!gameData || !gameData.$ || !gameData.$.id) {
                                    continue;
                                }
                                const bggId = parseInt(gameData.$.id);
                                const game = batch.find(g => g.bggId === bggId);
                                if (!game)
                                    continue;
                                const links = gameData.link || [];
                                const mechanics = links.filter((link) => link && link.$ && link.$.type === 'boardgamemechanic');
                                for (const mechanic of mechanics) {
                                    if (!mechanic || !mechanic.$ || !mechanic.$.value) {
                                        continue;
                                    }
                                    const gameMechanic = new GameMechanic_1.GameMechanic();
                                    gameMechanic.mechanicName = mechanic.$.value;
                                    gameMechanic.gameBggId = game.bggId;
                                    gameMechanic.game = game;
                                    try {
                                        await data_source_1.AppDataSource.manager.save(gameMechanic);
                                        totalMechanicsAdded++;
                                    }
                                    catch (e) {
                                        // Skip if already exists or other error
                                        continue;
                                    }
                                }
                            }
                            resolve();
                        }
                        catch (e) {
                            resolve();
                        }
                    });
                });
                if (mechanicBatches.indexOf(batch) < mechanicBatches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            catch (error) {
                continue;
            }
        }
        // Step 4: Populate user mechanics
        const gameMechanics = await data_source_1.AppDataSource
            .getRepository(GameMechanic_1.GameMechanic)
            .createQueryBuilder("game_mechanic")
            .where("game_mechanic.gameBggId IN (:...ids)", { ids: bggIds })
            .getMany();
        const ratingMap = new Map();
        for (const game of collectionGames) {
            const rating = parseFloat(game.userRating);
            if (!isNaN(rating) && rating > 0) {
                ratingMap.set(game.bggId, rating);
            }
        }
        const mechanicRatings = new Map();
        for (const mechanic of gameMechanics) {
            const rating = ratingMap.get(mechanic.gameBggId);
            if (rating !== undefined) {
                if (!mechanicRatings.has(mechanic.mechanicName)) {
                    mechanicRatings.set(mechanic.mechanicName, []);
                }
                mechanicRatings.get(mechanic.mechanicName).push(rating);
            }
        }
        let userMechanicsSaved = 0;
        for (const [mechanicName, ratings] of mechanicRatings.entries()) {
            try {
                const sum = ratings.reduce((acc, rating) => acc + rating, 0);
                const average = sum / ratings.length;
                const userMechanic = new UserMechanic_1.UserMechanic();
                userMechanic.userName = username;
                userMechanic.mechanicName = mechanicName;
                userMechanic.averageRating = parseFloat(average.toFixed(2));
                userMechanic.gameCount = ratings.length;
                await data_source_1.AppDataSource.manager.save(userMechanic);
                userMechanicsSaved++;
            }
            catch (e) {
                // Skip if already exists or other error
                continue;
            }
        }
        response.status(200).json({
            message: 'All data population complete',
            username,
            stats: {
                collectionGames: collectionResult,
                totalGamesInCollection: collectionGames.length,
                existingGames: existingGames.length,
                newlyFetchedGames: newlyFetchedGames.length,
                mechanicsAdded: totalMechanicsAdded,
                userMechanicsSaved: userMechanicsSaved
            }
        });
    }
    catch (error) {
        console.error('Error populating user data:', error);
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