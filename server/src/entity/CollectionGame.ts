import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryColumn } from "typeorm";

@Entity()
export class CollectionGame {
    @PrimaryColumn()
    bggId: number;

    @Column()
    gameName: string;

    @PrimaryColumn()
    userName: string;

    @Column()
    userRating: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
