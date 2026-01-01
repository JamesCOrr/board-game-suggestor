import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn, ManyToOne } from "typeorm";
import { Game } from "./Game";

@Entity()
export class GameMechanic {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    bggUrl: string;

    @ManyToOne(() => Game, (game) => game.gameMechanics)
    game: Game;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
