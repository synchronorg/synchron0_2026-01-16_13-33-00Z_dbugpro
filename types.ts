
export enum Role {
  USER = 'user',
  ASSISTANT = 'assistant'
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
}

export interface ChatState {
  messages: Message[];
  isTyping: boolean;
  error: string | null;
}
