import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn } from "typeorm"

@Entity()
export class CollectionGame {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    bggId: number;

    @Column()
    userName: string;

    @Column()
    userRating: number;

    @CreateDateColumn()
    createdAt: Date; // Automatically set on entity insertion

    @UpdateDateColumn()
    updatedAt: Date; // Automatically updated every time the entity is saved

}
