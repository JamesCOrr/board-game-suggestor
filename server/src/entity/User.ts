import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class User {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    userName: string;

    @CreateDateColumn()
    createdAt: Date; // Automatically set on entity insertion
    
    @UpdateDateColumn()
    updatedAt: Date; // Automatically updated every time the entity is saved
    
}
