"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = void 0;
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const User_1 = require("./entity/User");
const Game_1 = require("./entity/Game");
const GameMechanic_1 = require("./entity/GameMechanic");
const CollectionGame_1 = require("./entity/CollectionGame");
const UserMechanic_1 = require("./entity/UserMechanic");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables BEFORE creating DataSource
dotenv_1.default.config();
exports.AppDataSource = new typeorm_1.DataSource({
    type: "mysql",
    host: process.env.MYSQL_HOST || "localhost",
    port: parseInt(process.env.MYSQL_PORT || "3306"),
    username: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "board_game_suggestor_dev_db",
    synchronize: true,
    dropSchema: false, // Schema recreated with composite keys - back to false to preserve data
    logging: false,
    entities: [User_1.User, Game_1.Game, GameMechanic_1.GameMechanic, CollectionGame_1.CollectionGame, UserMechanic_1.UserMechanic],
    migrations: [],
    subscribers: [],
});
//# sourceMappingURL=data-source.js.map