import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryColumn, OneToMany } from "typeorm";
import { GameMechanic } from "./GameMechanic";

@Entity()
export class Game {

    @PrimaryColumn()
    bggId: number;

    @Column()
    bggUrl: string;

    @OneToMany(() => GameMechanic, (gameMechanic) => gameMechanic.game)
    gameMechanics: GameMechanic[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

}
