import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./User";

@Entity()
export class UserMechanic {

    @PrimaryColumn()
    userName: string;

    @PrimaryColumn()
    mechanicName: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "userName" })
    user: User;

    @Column("decimal", { precision: 3, scale: 2 })
    averageRating: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
