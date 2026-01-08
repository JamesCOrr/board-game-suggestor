import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { Game } from "./Game";

@Entity()
export class GameMechanic {

    @PrimaryColumn()
    mechanicName: string;

    @PrimaryColumn()
    gameBggId: number;

    @ManyToOne(() => Game, (game) => game.gameMechanics)
    @JoinColumn({ name: "gameBggId" })
    game: Game;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
