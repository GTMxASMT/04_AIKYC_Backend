// UserChat.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  BeforeInsert,
} from "typeorm";
import { User } from "./User.entity";

// Simple message interface
interface ChatMessage {
  query: string;
  response: string;
  timestamp: Date;
}

@Entity("user_chats")
export class UserChat {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ nullable: false })
  userId!: string;

  @ManyToOne(() => User, (user) => user.chats, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "userId" })
  user!: User;

  @Column({ type: "json", nullable: true })
  messages!: ChatMessage[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  initializeMessages() {
    if (!this.messages) {
      this.messages = [];
    }
  }

  // Helper methods
  addMessage(query: string, response: string) {
    if (!this.messages) {
      this.messages = [];
    }

    this.messages.push({
      query,
      response,
      timestamp: new Date(),
    });
  }

  getMessageCount(): number {
    return this.messages?.length || 0;
  }

  getLastMessage(): ChatMessage | null {
    if (!this.messages || this.messages.length === 0) {
      return null;
    }
    return this.messages[this.messages.length - 1];
  }

  // Get messages in reverse order (newest first)
  getMessagesReverse(): ChatMessage[] {
    if (!this.messages) return [];
    return [...this.messages].reverse();
  }
}
