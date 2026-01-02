import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, PrimaryColumn } from "typeorm";

@Entity()
export class User {
    @PrimaryColumn()
    userName: string;

    @CreateDateColumn()
    createdAt: Date; // Automatically set on entity insertion
    
    @UpdateDateColumn()
    updatedAt: Date;
}
