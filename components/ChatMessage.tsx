
import React from 'react';
import { Message, Role } from '../types';

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === Role.USER;

  return (
    <div className={`flex w-full mb-8 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div 
        className={`max-w-[85%] md:max-w-[70%] px-4 py-3 rounded-2xl leading-relaxed text-sm md:text-base transition-all duration-300 ${
          isUser 
            ? 'bg-neutral-100 text-neutral-900 rounded-tr-none shadow-sm' 
            : 'bg-neutral-800 text-neutral-100 rounded-tl-none border border-neutral-700'
        }`}
      >
        <div className="whitespace-pre-wrap">
          {message.content}
        </div>
        <div className={`text-[10px] mt-2 opacity-40 uppercase tracking-widest ${isUser ? 'text-right' : 'text-left'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
};
