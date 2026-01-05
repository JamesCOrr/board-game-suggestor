import "reflect-metadata"
import { DataSource } from "typeorm"
import { User } from "./entity/User"
import { Game } from "./entity/Game"
import { GameMechanic } from "./entity/GameMechanic"
import { CollectionGame } from "./entity/CollectionGame"
import dotenv from "dotenv";

// Load environment variables BEFORE creating DataSource
dotenv.config();

export const AppDataSource = new DataSource({
    type: "mysql",
    host: process.env.MYSQL_HOST || "localhost",
    port: parseInt(process.env.MYSQL_PORT || "3306"),
    username: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "board_game_suggestor_dev_db",
    synchronize: true,
    dropSchema: true,
    logging: false,
    entities: [User, Game, GameMechanic, CollectionGame],
    migrations: [],
    subscribers: [],
})
