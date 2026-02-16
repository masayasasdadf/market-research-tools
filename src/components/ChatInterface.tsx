'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage } from '@/types';
import AnalysisView from './AnalysisView';
import { v4 as uuidv4 } from 'uuid';

const EXAMPLE_QUERIES = [
  '福岡県で廃車買取の需要が高く、競合店の少ない出店に適したエリアをいくつか出してください',
  '福岡県で看板の設置に適している場所をいくつかピックアップして',
  '大阪府で中古車販売店の出店に最適なエリアを教えてください',
  '東京都で美容院の出店に適した場所を分析してください',
];

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    }
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: messageText,
    };

    const assistantId = uuidv4();
    const loadingMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isLoading: true,
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInput('');
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: `エラー: ${data.error}`, isLoading: false }
              : m
          )
        );
        return;
      }

      const analysis = data.result;
      const responseContent = analysis.summary || '分析結果を取得しました。';

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: responseContent, analysis, isLoading: false }
            : m
        )
      );
    } catch (error: any) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `通信エラーが発生しました: ${error.message}`, isLoading: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="mb-6">
              <div className="text-4xl mb-3">📊</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">市場調査AIアシスタント</h2>
              <p className="text-gray-500 max-w-md">
                出店候補地の分析や看板設置場所の提案など、市場調査に関する質問をどうぞ。
                データに基づいた分析結果をマップ付きでお届けします。
              </p>
            </div>
            <div className="w-full max-w-lg space-y-2">
              <p className="text-sm text-gray-400 mb-2">例:</p>
              {EXAMPLE_QUERIES.map((query, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(query)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm text-gray-700"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(message => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 shadow-sm'
              }`}
            >
              {message.isLoading ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm">分析中...</span>
                </div>
              ) : (
                <>
                  <div className={`markdown-body ${message.role === 'user' ? 'text-white' : 'text-gray-800'}`}>
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                  {message.analysis && <AnalysisView analysis={message.analysis} />}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="max-w-4xl mx-auto flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="市場調査の質問を入力してください..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl px-5 py-3 font-medium transition-colors"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
