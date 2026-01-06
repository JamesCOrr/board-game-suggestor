import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryColumn, OneToOne, PrimaryGeneratedColumn, JoinColumn } from "typeorm";
import { Game } from "./Game";

@Entity()
export class CollectionGame {
    
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    bggId: number;

    @Column()
    gameName: string;

    @Column()
    userName: string;

    @Column()
    userRating: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
