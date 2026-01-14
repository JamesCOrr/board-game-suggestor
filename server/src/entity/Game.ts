import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryColumn, OneToMany } from "typeorm";
import { GameMechanic } from "./GameMechanic";

@Entity()
export class Game {

    @PrimaryColumn()
    bggId: number;

    @Column()
    gameName: string;

    @Column()
    bggLink: string;

    @Column()
    bggImageLink: string;

    @Column("decimal", { precision: 4, scale: 2, nullable: true })
    averageRating: number | null;

    @OneToMany(() => GameMechanic, (gameMechanic) => gameMechanic.game)
    gameMechanics: GameMechanic[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

}
